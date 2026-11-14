import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { hasRole } from '@mp/types';
import {
  checkoutResultSchema,
  checkoutSchema,
  deliveryCheckResultSchema,
  deliveryCheckSchema,
  orderSummarySchema,
  orderViewSchema,
  priceBasketSchema,
  pricedBasketSchema,
  shopInfoSchema,
} from '@mp/validation';
import { errorBody, type AppEnv } from '../auth';
import {
  CheckoutError,
  buildShopInfo,
  checkDelivery,
  expirePendingOrders,
  isValidOrderToken,
  placeOrder,
  priceForCustomer,
  processJobs,
} from '../checkout';
import { WebhookSignatureError, type SimulatorProvider } from '../payments';

const ErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  // Present on price_changed and basket_invalid, so the page can show the new basket.
  basket: pricedBasketSchema.optional(),
});
const json = <T extends z.ZodType>(schema: T) => ({ 'application/json': { schema } });
const fail = (description: string) => ({ description, content: json(ErrorSchema) });
const idParam = z.object({ id: z.string().uuid() });

const shopRoute = createRoute({
  method: 'get',
  path: '/v1/shop',
  tags: ['Public'],
  summary: 'Open or closed, opening hours, delivery zones and how payments are taken',
  responses: { 200: { description: 'Shop', content: json(shopInfoSchema) } },
});

const deliveryCheckRoute = createRoute({
  method: 'post',
  path: '/v1/delivery/check',
  tags: ['Public'],
  summary: 'Whether a postcode is in a delivery zone, with its fee and minimum order',
  request: { body: { required: true, content: json(deliveryCheckSchema) } },
  responses: {
    200: { description: 'Result', content: json(deliveryCheckResultSchema) },
    400: fail('Invalid request'),
  },
});

const priceRoute = createRoute({
  method: 'post',
  path: '/v1/basket/price',
  tags: ['Basket and checkout'],
  summary: 'Price a basket from the live menu',
  request: { body: { required: true, content: json(priceBasketSchema) } },
  responses: {
    200: { description: 'Priced basket', content: json(pricedBasketSchema) },
    400: fail('Invalid request'),
  },
});

const checkoutRoute = createRoute({
  method: 'post',
  path: '/v1/checkout',
  tags: ['Basket and checkout'],
  summary: 'Place an order (PENDING_PAYMENT) and start its payment',
  description:
    'Send a fresh UUID in the Idempotency-Key header; repeating the request with the same key returns the same order.',
  request: {
    headers: z.object({ 'idempotency-key': z.string().uuid() }),
    body: { required: true, content: json(checkoutSchema) },
  },
  responses: {
    201: { description: 'Order created', content: json(checkoutResultSchema) },
    400: fail('Invalid request'),
    409: fail('The basket, price or time is no longer valid'),
    503: fail('Payments are not configured'),
  },
});

const orderRoute = createRoute({
  method: 'get',
  path: '/v1/orders/{id}',
  tags: ['Basket and checkout'],
  summary: 'One order, for its owner, staff, or anyone holding its X-Order-Token',
  request: { params: idParam },
  responses: {
    200: { description: 'Order', content: json(orderViewSchema) },
    400: fail('Invalid request'),
    404: fail('Not found'),
  },
});

const myOrdersRoute = createRoute({
  method: 'get',
  path: '/v1/me/orders',
  tags: ['Account'],
  summary: "The signed-in customer's past orders",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Orders', content: json(z.array(orderSummarySchema)) },
    401: fail('Not signed in'),
  },
});

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function registerOrderRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(shopRoute, async (c) => {
    const { order } = c.get('deps');
    const config = await order.orders.getShopConfig();
    c.header('Cache-Control', 'no-store');
    return c.json(buildShopInfo(config, order.now(), order.payments), 200);
  });

  app.openapi(deliveryCheckRoute, async (c) => {
    const config = await c.get('deps').order.orders.getShopConfig();
    return c.json(checkDelivery(config, c.req.valid('json').postcode), 200);
  });

  app.openapi(priceRoute, async (c) => {
    return c.json(await priceForCustomer(c.get('deps').order, c.req.valid('json')), 200);
  });

  app.openapi(checkoutRoute, async (c) => {
    const { order } = c.get('deps');
    try {
      const result = await placeOrder(
        order,
        c.req.valid('json'),
        c.get('user'),
        c.req.valid('header')['idempotency-key'],
      );
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof CheckoutError) {
        return c.json(
          { ...errorBody(error.code, error.message), basket: error.basket },
          error.status,
        );
      }
      throw error;
    }
  });

  app.openapi(orderRoute, async (c) => {
    const { order } = c.get('deps');
    const { id } = c.req.valid('param');
    const record = await order.orders.getOrder(id);
    const user = c.get('user');
    const allowed =
      record !== null &&
      ((user !== null && record.userId === user.id) ||
        (user !== null && hasRole(user.role, 'kitchen')) ||
        isValidOrderToken(order.tokenSecret, id, c.req.header('X-Order-Token')));
    // The same answer whether the order does not exist or is someone else's.
    if (!record || !allowed) return c.json(errorBody('not_found', 'Order not found.'), 404);
    c.header('Cache-Control', 'no-store');
    return c.json(record.view, 200);
  });

  app.openapi(myOrdersRoute, async (c) => {
    const user = c.get('user')!; // /v1/me/* is behind requireRole('customer')
    return c.json(await c.get('deps').order.orders.listOrdersForUser(user.id), 200);
  });

  // ---- payment webhook ------------------------------------------------------
  // Not in the OpenAPI document: it is called by the payment provider only.

  async function handleWebhook(
    deps: AppEnv['Variables']['deps'],
    rawBody: string,
    signature: string | null,
  ): Promise<{ status: 200 | 400 | 503; body: Record<string, unknown> }> {
    const { order } = deps;
    if (!order.payments) {
      return {
        status: 503,
        body: errorBody('payments_unavailable', 'Payments are not configured.'),
      };
    }
    let event;
    try {
      event = await order.payments.parseWebhook(rawBody, signature);
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        return { status: 400, body: errorBody('bad_signature', 'Signature check failed.') };
      }
      throw error;
    }
    if (!event) return { status: 200, body: { received: true, outcome: 'ignored' } };

    // If this throws, the provider gets a 500 and retries. The event is applied
    // in one transaction, so a retry cannot apply it twice.
    const outcome = await order.orders.recordPaymentEvent(event);

    if (outcome === 'paid') {
      // Send the confirmation straight away; if this fails the job stays queued.
      await processJobs(order).catch(() => {});
    }
    return { status: 200, body: { received: true, outcome } };
  }

  app.post('/v1/webhooks/stripe', async (c) => {
    // The signature covers the exact bytes sent, so read the body unparsed.
    const rawBody = await c.req.text();
    const result = await handleWebhook(
      c.get('deps'),
      rawBody,
      c.req.header('Stripe-Signature') ?? null,
    );
    return c.json(result.body, result.status);
  });

  // ---- payment simulator (never in production) --------------------------------

  app.post('/v1/dev/payments/:orderId/simulate', async (c) => {
    const deps = c.get('deps');
    const provider = deps.order.payments;
    if (provider?.name !== 'simulator') return c.json(errorBody('not_found', 'Not found.'), 404);

    const orderId = c.req.param('orderId');
    // Only someone who can see the order may pretend to pay for it.
    if (!isValidOrderToken(deps.order.tokenSecret, orderId, c.req.header('X-Order-Token'))) {
      return c.json(errorBody('not_found', 'Not found.'), 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as { outcome?: string };
    const payment = await deps.order.orders.getPayment(orderId);
    if (!payment) return c.json(errorBody('not_found', 'Not found.'), 404);

    const signed = (provider as SimulatorProvider).signedWebhook(
      body.outcome === 'failed'
        ? { type: 'payment_intent.payment_failed', providerRef: payment.ref }
        : {
            type: 'payment_intent.succeeded',
            providerRef: payment.ref,
            amountPence: payment.amountPence,
          },
    );
    // Through the same verified-webhook path as a real payment.
    const result = await handleWebhook(deps, signed.body, signed.signature);
    return c.json(result.body, result.status);
  });

  // ---- scheduled work ---------------------------------------------------------
  // Vercel Cron calls these with GET and "Authorization: Bearer <CRON_SECRET>".

  const cron =
    (work: (deps: AppEnv['Variables']['deps']) => Promise<Record<string, unknown>>) =>
    async (c: Context<AppEnv>) => {
      const deps = c.get('deps');
      const given = c.req.header('Authorization') ?? '';
      if (!deps.cronSecret) {
        return c.json(errorBody('not_configured', 'CRON_SECRET is not set.'), 503);
      }
      if (!safeEqual(given, `Bearer ${deps.cronSecret}`)) {
        return c.json(errorBody('unauthenticated', 'Not allowed.'), 401);
      }
      return c.json(await work(deps), 200);
    };

  const expire = cron(async (deps) => ({ expired: await expirePendingOrders(deps.order) }));
  const jobs = cron(async (deps) => ({ ...(await processJobs(deps.order, 25)) }));
  app.get('/v1/cron/expire-pending', expire);
  app.post('/v1/cron/expire-pending', expire);
  app.get('/v1/cron/jobs', jobs);
  app.post('/v1/cron/jobs', jobs);
}
