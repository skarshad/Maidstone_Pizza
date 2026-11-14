import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { ROLES } from '@mp/types';
import { authenticate, errorBody, requireRole, type AppEnv } from './auth';
import type { Deps } from './deps';
import { registerMenuRoutes } from './routes/menu';
import { registerOrderRoutes } from './routes/orders';

const ErrorSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .openapi('Error');

const HealthSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    database: z.enum(['ok', 'down']),
    time: z.string(),
  })
  .openapi('Health');

const MeSchema = z
  .object({ id: z.string(), email: z.string().nullable(), role: z.enum(ROLES) })
  .openapi('Me');

const healthRoute = createRoute({
  method: 'get',
  path: '/v1/health',
  tags: ['Public'],
  summary: 'Service and database health',
  responses: {
    200: { description: 'Healthy', content: { 'application/json': { schema: HealthSchema } } },
    503: { description: 'Degraded', content: { 'application/json': { schema: HealthSchema } } },
  },
});

const meRoute = createRoute({
  method: 'get',
  path: '/v1/me',
  tags: ['Account'],
  summary: 'The signed-in user and their role',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Current user', content: { 'application/json': { schema: MeSchema } } },
    401: { description: 'Not signed in', content: { 'application/json': { schema: ErrorSchema } } },
  },
});

/** Builds the API. `getDeps` is lazy so a bad env fails requests, not module load. */
export function createApp(getDeps: () => Deps) {
  const app = new OpenAPIHono<AppEnv>({
    // Request bodies and params that fail their schema.
    defaultHook: (result, c) => {
      if (result.success) return;
      const first = result.error.issues[0];
      const where = first?.path.length ? first.path.join('.') + ': ' : '';
      return c.json(errorBody('invalid', where + (first?.message ?? 'Invalid request.')), 400);
    },
  });
  let deps: Deps | undefined;

  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    deps ??= getDeps();
    c.set('deps', deps);
    await next();
  });
  app.use('*', (c, next) =>
    cors({
      origin: c.get('deps').corsOrigins,
      allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Order-Token'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    })(c, next),
  );
  app.use('/v1/*', authenticate);

  // Role gates for route groups added in later phases. Declared now so no
  // admin or kitchen route can ever be mounted without a check.
  app.use('/v1/me', requireRole('customer'));
  app.use('/v1/me/*', requireRole('customer'));
  app.use('/v1/kitchen/*', requireRole('kitchen'));
  app.use('/v1/admin/*', requireRole('manager'));

  app.openapi(healthRoute, async (c) => {
    const up = await c
      .get('deps')
      .pingDatabase()
      .catch(() => false);
    return c.json(
      {
        status: up ? ('ok' as const) : ('degraded' as const),
        database: up ? ('ok' as const) : ('down' as const),
        time: new Date().toISOString(),
      },
      up ? 200 : 503,
    );
  });

  app.openapi(meRoute, (c) => {
    const user = c.get('user')!; // guaranteed by requireRole above
    return c.json({ id: user.id, email: user.email, role: user.role }, 200);
  });

  registerMenuRoutes(app);
  registerOrderRoutes(app);

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Supabase access token',
  });
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { title: 'Maidstone Pizza API', version: '0.3.0' },
  });
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));

  app.notFound((c) => c.json(errorBody('not_found', 'Not found.'), 404));
  app.onError((err, c) => {
    // Log the detail server-side; never echo internals to the client.
    console.error(JSON.stringify({ level: 'error', path: c.req.path, message: err.message }));
    return c.json(errorBody('internal', 'Something went wrong.'), 500);
  });

  return app;
}
