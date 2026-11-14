import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  kitchenAcceptSchema,
  kitchenBoardSchema,
  kitchenItemDoneSchema,
  kitchenRejectSchema,
  kitchenStatusSchema,
} from '@mp/validation';
import { errorBody, type AppEnv } from '../auth';
import { acceptOrder, kitchenBoard, moveOrder, noPrinter, rejectOrder } from '../kitchen';
import { OrderActionError } from '../order-store';

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const json = <T extends z.ZodType>(schema: T) => ({ 'application/json': { schema } });
const fail = (description: string) => ({ description, content: json(ErrorSchema) });
const errors = {
  400: fail('Invalid request'),
  401: fail('Not signed in'),
  403: fail('Not allowed'),
  404: fail('Not found'),
  409: fail('The order has already moved on'),
};
const idParam = z.object({ id: z.string().uuid() });
const OkSchema = z.object({ ok: z.literal(true) });
const kitchen = { tags: ['Kitchen'], security: [{ bearerAuth: [] }] };
const STATUS = { not_found: 404, invalid_transition: 409, invalid: 400 } as const;

const boardRoute = createRoute({
  method: 'get',
  path: '/v1/kitchen/orders',
  ...kitchen,
  summary: 'Every order the kitchen is working on, plus recently finished ones',
  responses: { 200: { description: 'Board', content: json(kitchenBoardSchema) }, ...errors },
});

const acceptRoute = createRoute({
  method: 'post',
  path: '/v1/kitchen/orders/{id}/accept',
  ...kitchen,
  summary: 'Accept a new order with a preparation time',
  request: { params: idParam, body: { required: true, content: json(kitchenAcceptSchema) } },
  responses: { 200: { description: 'Accepted', content: json(OkSchema) }, ...errors },
});

const rejectRoute = createRoute({
  method: 'post',
  path: '/v1/kitchen/orders/{id}/reject',
  ...kitchen,
  summary: 'Reject a new order with a reason; the payment is refunded',
  request: { params: idParam, body: { required: true, content: json(kitchenRejectSchema) } },
  responses: {
    200: {
      description: 'Rejected',
      content: json(
        z.object({
          ok: z.literal(true),
          refund: z.enum(['done', 'pending', 'needs_review', 'none']),
        }),
      ),
    },
    ...errors,
  },
});

const statusRoute = createRoute({
  method: 'post',
  path: '/v1/kitchen/orders/{id}/status',
  ...kitchen,
  summary: 'Move an accepted order to its next step',
  request: { params: idParam, body: { required: true, content: json(kitchenStatusSchema) } },
  responses: { 200: { description: 'Moved', content: json(OkSchema) }, ...errors },
});

const itemDoneRoute = createRoute({
  method: 'post',
  path: '/v1/kitchen/orders/{id}/items/{itemId}/done',
  ...kitchen,
  summary: 'Tick or untick one item on a ticket',
  request: {
    params: z.object({ id: z.string().uuid(), itemId: z.string().uuid() }),
    body: { required: true, content: json(kitchenItemDoneSchema) },
  },
  responses: { 200: { description: 'Saved', content: json(OkSchema) }, ...errors },
});

const printRoute = createRoute({
  method: 'post',
  path: '/v1/kitchen/orders/{id}/print',
  ...kitchen,
  summary: 'Print a ticket (no printer is connected yet)',
  request: { params: idParam },
  responses: {
    200: { description: 'Printed', content: json(OkSchema) },
    ...errors,
    501: fail('No printer connected'),
  },
});

/**
 * Mounts the kitchen routes. `/v1/kitchen/*` is already behind
 * requireRole('kitchen') in app.ts, so `c.get('user')` is always staff here.
 */
export function registerKitchenRoutes(app: OpenAPIHono<AppEnv>) {
  async function attempt(work: () => Promise<unknown>) {
    try {
      await work();
      return null;
    } catch (error) {
      if (error instanceof OrderActionError) return error;
      throw error;
    }
  }

  app.openapi(boardRoute, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await kitchenBoard(c.get('deps').order), 200);
  });

  app.openapi(acceptRoute, async (c) => {
    const failure = await attempt(() =>
      acceptOrder(
        c.get('deps').order,
        c.req.valid('param').id,
        c.req.valid('json').prepMinutes,
        c.get('user')!,
      ),
    );
    if (failure) return c.json(errorBody(failure.code, failure.message), STATUS[failure.code]);
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(rejectRoute, async (c) => {
    let refund: 'done' | 'pending' | 'needs_review' | 'none' = 'none';
    const failure = await attempt(async () => {
      const result = await rejectOrder(
        c.get('deps').order,
        c.req.valid('param').id,
        c.req.valid('json').reason,
        c.get('user')!,
      );
      refund = result.refund;
    });
    if (failure) return c.json(errorBody(failure.code, failure.message), STATUS[failure.code]);
    return c.json({ ok: true as const, refund }, 200);
  });

  app.openapi(statusRoute, async (c) => {
    const failure = await attempt(() =>
      moveOrder(
        c.get('deps').order,
        c.req.valid('param').id,
        c.req.valid('json').to,
        c.get('user')!,
      ),
    );
    if (failure) return c.json(errorBody(failure.code, failure.message), STATUS[failure.code]);
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(itemDoneRoute, async (c) => {
    const { id, itemId } = c.req.valid('param');
    const found = await c
      .get('deps')
      .order.orders.setItemDone(id, itemId, c.req.valid('json').done);
    if (!found) return c.json(errorBody('not_found', 'Item not found.'), 404);
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(printRoute, async (c) => {
    if (!noPrinter.available) {
      return c.json(errorBody('no_printer', 'No ticket printer is connected.'), 501);
    }
    return c.json({ ok: true as const }, 200);
  });
}
