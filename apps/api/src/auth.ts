import { createMiddleware } from 'hono/factory';
import { hasRole, type Role } from '@mp/types';
import type { AuthUser, Deps } from './deps';

export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    /** The verified access token, kept so the API can act as this user in the database. */
    token: string | null;
    deps: Deps;
  };
};

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

/** Resolves the caller from the Bearer token. Does not reject anonymous requests. */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const user = token ? await c.get('deps').verifyToken(token) : null;
  c.set('user', user);
  c.set('token', user ? token : null);
  await next();
});

/** Rejects callers below `minimum`. Use on every non-public route. */
export function requireRole(minimum: Role) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json(errorBody('unauthenticated', 'Sign in to continue.'), 401);
    if (!hasRole(user.role, minimum)) {
      return c.json(errorBody('forbidden', 'You do not have access to this.'), 403);
    }
    await next();
  });
}
