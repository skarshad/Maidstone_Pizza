import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  adminMenuSchema,
  categoryPatchSchema,
  itemAvailabilitySchema,
  menuSchema,
  saveMenuItemSchema,
  saveMenuOptionSchema,
} from '@mp/validation';
import { errorBody, type AppEnv } from '../auth';
import { StoreError } from '../menu-store';

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const json = <T extends z.ZodType>(schema: T) => ({ 'application/json': { schema } });
const errors = {
  400: { description: 'Invalid request', content: json(ErrorSchema) },
  401: { description: 'Not signed in', content: json(ErrorSchema) },
  403: { description: 'Not allowed', content: json(ErrorSchema) },
  404: { description: 'Not found', content: json(ErrorSchema) },
  409: { description: 'Conflict', content: json(ErrorSchema) },
};
const idParam = z.object({ id: z.string().uuid() });
const IdSchema = z.object({ id: z.string() });
const OkSchema = z.object({ ok: z.literal(true) });
const staff = { tags: ['Admin: menu'], security: [{ bearerAuth: [] }] };

const STATUS = { not_found: 404, conflict: 409, invalid: 400, forbidden: 403 } as const;

const publicMenuRoute = createRoute({
  method: 'get',
  path: '/v1/menu',
  tags: ['Public'],
  summary: 'The published menu: categories, items, sizes, options and allergens',
  responses: { 200: { description: 'Menu', content: json(menuSchema) } },
});

const adminMenuRoute = createRoute({
  method: 'get',
  path: '/v1/admin/menu',
  ...staff,
  summary: 'The whole menu, including unpublished items',
  responses: { 200: { description: 'Menu', content: json(adminMenuSchema) }, ...errors },
});

const createItemRoute = createRoute({
  method: 'post',
  path: '/v1/admin/menu/items',
  ...staff,
  summary: 'Create a menu item',
  request: { body: { required: true, content: json(saveMenuItemSchema) } },
  responses: { 201: { description: 'Created', content: json(IdSchema) }, ...errors },
});

const updateItemRoute = createRoute({
  method: 'put',
  path: '/v1/admin/menu/items/{id}',
  ...staff,
  summary: 'Replace a menu item, its sizes, option groups, allergens and tags',
  request: { params: idParam, body: { required: true, content: json(saveMenuItemSchema) } },
  responses: { 200: { description: 'Saved', content: json(IdSchema) }, ...errors },
});

const availabilityRoute = createRoute({
  method: 'patch',
  path: '/v1/admin/menu/items/{id}/availability',
  ...staff,
  summary: 'Publish, hide or mark an item sold out',
  request: { params: idParam, body: { required: true, content: json(itemAvailabilitySchema) } },
  responses: { 200: { description: 'Saved', content: json(OkSchema) }, ...errors },
});

const deleteItemRoute = createRoute({
  method: 'delete',
  path: '/v1/admin/menu/items/{id}',
  ...staff,
  summary: 'Delete a menu item',
  request: { params: idParam },
  responses: { 200: { description: 'Deleted', content: json(OkSchema) }, ...errors },
});

const saveOptionRoute = createRoute({
  method: 'put',
  path: '/v1/admin/menu/options/{id}',
  ...staff,
  summary: 'Update an option (base, crust or topping), its prices and allergens',
  request: { params: idParam, body: { required: true, content: json(saveMenuOptionSchema) } },
  responses: { 200: { description: 'Saved', content: json(OkSchema) }, ...errors },
});

const categoryRoute = createRoute({
  method: 'patch',
  path: '/v1/admin/menu/categories/{id}',
  ...staff,
  summary: 'Rename, reorder, publish or hide a category',
  request: { params: idParam, body: { required: true, content: json(categoryPatchSchema) } },
  responses: { 200: { description: 'Saved', content: json(OkSchema) }, ...errors },
});

/**
 * Mounts the menu routes. `/v1/admin/*` is already behind requireRole('manager')
 * in app.ts; these handlers additionally act as the calling user in the
 * database, so RLS applies too.
 */
export function registerMenuRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(publicMenuRoute, async (c) => {
    const menu = await c.get('deps').menu.getPublicMenu();
    // Shared caches may hold the menu briefly; sold-out changes show within a minute.
    c.header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return c.json(menu, 200);
  });

  // Runs a store call and maps the failures a caller can cause to 4xx responses.
  async function attempt<T>(work: () => Promise<T>) {
    try {
      return { ok: true as const, value: await work() };
    } catch (error) {
      if (error instanceof StoreError) return { ok: false as const, error };
      throw error;
    }
  }

  app.openapi(adminMenuRoute, async (c) => {
    const menu = await c.get('deps').menu.getAdminMenu(c.get('token')!);
    c.header('Cache-Control', 'no-store');
    return c.json(menu, 200);
  });

  app.openapi(createItemRoute, async (c) => {
    const result = await attempt(() =>
      c.get('deps').menu.saveItem(c.get('token')!, null, c.req.valid('json')),
    );
    if (!result.ok) {
      return c.json(errorBody(result.error.code, result.error.message), STATUS[result.error.code]);
    }
    return c.json({ id: result.value }, 201);
  });

  app.openapi(updateItemRoute, async (c) => {
    const result = await attempt(() =>
      c.get('deps').menu.saveItem(c.get('token')!, c.req.valid('param').id, c.req.valid('json')),
    );
    if (!result.ok) {
      return c.json(errorBody(result.error.code, result.error.message), STATUS[result.error.code]);
    }
    return c.json({ id: result.value }, 200);
  });

  app.openapi(availabilityRoute, async (c) => {
    const result = await attempt(() =>
      c
        .get('deps')
        .menu.setItemAvailability(c.get('token')!, c.req.valid('param').id, c.req.valid('json')),
    );
    if (!result.ok) {
      return c.json(errorBody(result.error.code, result.error.message), STATUS[result.error.code]);
    }
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(deleteItemRoute, async (c) => {
    const result = await attempt(() =>
      c.get('deps').menu.deleteItem(c.get('token')!, c.req.valid('param').id),
    );
    if (!result.ok) {
      return c.json(errorBody(result.error.code, result.error.message), STATUS[result.error.code]);
    }
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(saveOptionRoute, async (c) => {
    const result = await attempt(() =>
      c.get('deps').menu.saveOption(c.get('token')!, c.req.valid('param').id, c.req.valid('json')),
    );
    if (!result.ok) {
      return c.json(errorBody(result.error.code, result.error.message), STATUS[result.error.code]);
    }
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(categoryRoute, async (c) => {
    const result = await attempt(() =>
      c
        .get('deps')
        .menu.updateCategory(c.get('token')!, c.req.valid('param').id, c.req.valid('json')),
    );
    if (!result.ok) {
      return c.json(errorBody(result.error.code, result.error.message), STATUS[result.error.code]);
    }
    return c.json({ ok: true as const }, 200);
  });
}
