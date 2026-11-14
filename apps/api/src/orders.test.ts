import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Role } from '@mp/types';
import {
  checkoutResultSchema,
  orderViewSchema,
  pricedBasketSchema,
  serverEnvSchema,
  shopInfoSchema,
  type CheckoutResult,
  type OrderView,
} from '@mp/validation';
import { createApp } from './app';
import { isValidOrderToken, orderToken } from './checkout';
import { choosePayments, type Deps } from './deps';
import { createLogSender, createResendSender } from './email';
import { renderOrderConfirmation } from './emails/order-confirmation';
import { fakeMenuStore } from './menu-fixtures';
import {
  OPEN_NOW,
  SPECIAL_LINE,
  SPECIAL_LINE_TOTAL,
  TOKEN_SECRET,
  fakeOrderDeps,
  orderableMenu,
  type FakeOrders,
} from './order-fixtures';
import { createSimulatorProvider, type SimulatorProvider } from './payments';

function setup(
  options: Parameters<typeof fakeOrderDeps>[0] = {},
  cronSecret: string | null = null,
) {
  const fake = fakeOrderDeps(options);
  const deps: Deps = {
    corsOrigins: ['https://shop.test'],
    verifyToken: async (token) => {
      const match = /^(customer|kitchen|manager|admin):(.+)$/.exec(token);
      return match
        ? { id: match[2]!, email: `${match[2]}@example.test`, role: match[1] as Role }
        : null;
    },
    pingDatabase: async () => true,
    menu: fakeMenuStore(),
    order: fake.deps,
    cronSecret,
  };
  return { app: createApp(() => deps), fake };
}

const customer = { name: 'Alice Example', email: 'Alice@Example.test', phone: '07700 900123' };
const address = { line1: '1 High Street', line2: '', town: 'Maidstone', postcode: 'me14 1aa' };

function checkoutBody(over: Record<string, unknown> = {}) {
  return {
    lines: [SPECIAL_LINE],
    fulfilment: 'collection',
    scheduledFor: null,
    customer,
    notes: '',
    tipPence: 0,
    allergenAcknowledged: true,
    expectedTotalPence: SPECIAL_LINE_TOTAL,
    paymentMethod: 'card',
    ...over,
  };
}

interface PostOptions {
  key?: string | null;
  auth?: string;
  headers?: Record<string, string>;
}

function post(
  app: ReturnType<typeof setup>['app'],
  path: string,
  body: unknown,
  o: PostOptions = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...o.headers };
  if (o.key !== null) headers['Idempotency-Key'] = o.key ?? randomUUID();
  if (o.auth) headers.Authorization = `Bearer ${o.auth}`;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function placeOrder(
  ctx: ReturnType<typeof setup>,
  over: Record<string, unknown> = {},
  o: PostOptions = {},
): Promise<CheckoutResult> {
  const res = await post(ctx.app, '/v1/checkout', checkoutBody(over), o);
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return checkoutResultSchema.parse(await res.json());
}

const statusOf = (fake: FakeOrders, id: string) => fake.orders.get(id)!.status;

function simulate(ctx: ReturnType<typeof setup>, order: CheckoutResult, outcome = 'succeeded') {
  return post(
    ctx.app,
    `/v1/dev/payments/${order.orderId}/simulate`,
    { outcome },
    { key: null, headers: { 'X-Order-Token': order.orderToken! } },
  );
}

// ---- shop, delivery, basket ---------------------------------------------------

describe('GET /v1/shop', () => {
  it('reports open, hours, zones and how payments are taken', async () => {
    const res = await setup().app.request('/v1/shop');
    expect(res.status).toBe(200);
    const shop = shopInfoSchema.parse(await res.json());
    expect(shop).toMatchObject({
      isOpen: true,
      closesAt: '2026-11-14T23:00:00.000Z',
      collectionMinutes: 20,
      deliveryMinutes: 45,
      payments: { provider: 'simulator', publishableKey: null },
    });
    expect(shop.zones[0]).toMatchObject({ feePence: 250, minOrderPence: 1200 });
  });

  it('adds busy-mode minutes and reports closed out of hours', async () => {
    const ctx = setup({ config: { busyMode: true, busyExtraMinutes: 15 } });
    ctx.fake.setNow(new Date('2026-11-14T10:00:00Z'));
    const shop = shopInfoSchema.parse(await (await ctx.app.request('/v1/shop')).json());
    expect(shop).toMatchObject({
      isOpen: false,
      nextOpensAt: '2026-11-14T16:00:00.000Z',
      collectionMinutes: 35,
      deliveryMinutes: 60,
    });
  });

  it('says payments are unavailable when no provider is configured', async () => {
    const res = await setup({ payments: null }).app.request('/v1/shop');
    expect(shopInfoSchema.parse(await res.json()).payments.provider).toBe('unavailable');
  });
});

describe('POST /v1/delivery/check', () => {
  const check = async (postcode: string) =>
    (await post(setup().app, '/v1/delivery/check', { postcode }, { key: null })).json();

  it('finds the zone for a postcode however it is typed', async () => {
    expect(await check('me15 6xx')).toMatchObject({
      valid: true,
      postcode: 'ME15 6XX',
      deliverable: true,
      zone: { feePence: 250, minOrderPence: 1200 },
    });
  });

  it('says no outside the delivery area and flags an invalid postcode', async () => {
    expect(await check('TN1 1AA')).toMatchObject({ valid: true, deliverable: false, zone: null });
    expect(await check('hello')).toMatchObject({ valid: false, deliverable: false });
  });
});

describe('POST /v1/basket/price', () => {
  it('prices from the server menu, with delivery fee and VAT', async () => {
    const res = await post(
      setup().app,
      '/v1/basket/price',
      { lines: [SPECIAL_LINE], fulfilment: 'delivery', postcode: 'ME14 1AA', tipPence: 100 },
      { key: null },
    );
    const basket = pricedBasketSchema.parse(await res.json());
    expect(basket).toMatchObject({
      ok: true,
      subtotalPence: SPECIAL_LINE_TOTAL,
      deliveryFeePence: 250,
      tipPence: 100,
      totalPence: SPECIAL_LINE_TOTAL + 350,
    });
  });
});

// ---- checkout -------------------------------------------------------------------

describe('POST /v1/checkout', () => {
  it('creates an unpaid order and starts its payment', async () => {
    const ctx = setup();
    const result = await placeOrder(ctx);
    expect(result).toMatchObject({
      orderNumber: 1001,
      totalPence: SPECIAL_LINE_TOTAL,
      payment: { provider: 'simulator' },
    });
    expect(statusOf(ctx.fake, result.orderId)).toBe('PENDING_PAYMENT');
    expect(ctx.fake.payments.size).toBe(1);
    expect(ctx.fake.emails).toEqual([]);
    expect(isValidOrderToken(TOKEN_SECRET, result.orderId, result.orderToken!)).toBe(true);
  });

  it('stores the server price and snapshots, ignoring any prices the browser sends', async () => {
    const ctx = setup();
    const tampered = { ...SPECIAL_LINE, pricePence: 1, unitPricePence: 1, lineTotalPence: 1 };
    const result = await placeOrder(ctx, { lines: [tampered], totalPence: 1, subtotalPence: 1 });
    const stored = ctx.fake.orders.get(result.orderId)!.input;
    expect(stored.totalPence).toBe(SPECIAL_LINE_TOTAL);
    expect(stored.items[0]).toMatchObject({
      name: 'Maidstone Special',
      variantName: '15" Large',
      unitPricePence: 1899,
      optionsPence: 50,
      vatRateBp: 2000,
      allergensConfirmed: true,
    });
    expect(stored.items[0]!.allergens.map((a) => a.code)).toEqual(['gluten', 'milk']);
    expect(stored.customerEmail).toBe('alice@example.test');
  });

  it('refuses when the total the customer saw is not the real total', async () => {
    const ctx = setup();
    const res = await post(ctx.app, '/v1/checkout', checkoutBody({ expectedTotalPence: 100 }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string }; basket: { totalPence: number } };
    expect(body.error.code).toBe('price_changed');
    expect(body.basket.totalPence).toBe(SPECIAL_LINE_TOTAL);
    expect(ctx.fake.orders.size).toBe(0);
  });

  it('refuses when a price changed between basket and checkout', async () => {
    const ctx = setup();
    const menu = orderableMenu();
    menu.categories[0]!.items[0]!.variants[1]!.pricePence = 2099;
    ctx.fake.setMenu(menu);
    const res = await post(ctx.app, '/v1/checkout', checkoutBody());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('price_changed');
  });

  it('needs an Idempotency-Key and returns the same order when it is repeated', async () => {
    const ctx = setup();
    const missing = await post(ctx.app, '/v1/checkout', checkoutBody(), { key: null });
    expect(missing.status).toBe(400);

    const key = randomUUID();
    const first = await placeOrder(ctx, {}, { key });
    const second = await placeOrder(ctx, {}, { key });
    expect(second.orderId).toBe(first.orderId);
    expect(ctx.fake.orders.size).toBe(1);
    expect(ctx.fake.payments.size).toBe(1);
  });

  it('charges the original order total when a repeated key carries a different basket', async () => {
    const ctx = setup();
    const key = randomUUID();
    await placeOrder(ctx, {}, { key });
    const bigger = { ...SPECIAL_LINE, quantity: 3 };
    const repeat = await placeOrder(
      ctx,
      { lines: [bigger], expectedTotalPence: SPECIAL_LINE_TOTAL * 3 },
      { key },
    );
    expect(repeat.totalPence).toBe(SPECIAL_LINE_TOTAL);
    expect([...ctx.fake.payments.values()][0]!.amountPence).toBe(SPECIAL_LINE_TOTAL);
  });

  it('will not restart payment for an order that is already paid', async () => {
    const ctx = setup();
    const key = randomUUID();
    const order = await placeOrder(ctx, {}, { key });
    await simulate(ctx, order);
    const res = await post(ctx.app, '/v1/checkout', checkoutBody(), { key });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('already_placed');
  });

  it('links the order to the signed-in customer, and leaves guests unlinked', async () => {
    const ctx = setup();
    const mine = await placeOrder(ctx, {}, { auth: 'customer:user-1' });
    const guest = await placeOrder(ctx);
    expect(ctx.fake.orders.get(mine.orderId)!.input.userId).toBe('user-1');
    expect(ctx.fake.orders.get(guest.orderId)!.input.userId).toBeNull();
  });

  it('takes a delivery order inside a zone, with the fee, tip and a tidy postcode', async () => {
    const ctx = setup();
    const result = await placeOrder(ctx, {
      fulfilment: 'delivery',
      address,
      tipPence: 200,
      expectedTotalPence: SPECIAL_LINE_TOTAL + 250 + 200,
    });
    const stored = ctx.fake.orders.get(result.orderId)!.input;
    expect(stored).toMatchObject({
      deliveryFeePence: 250,
      tipPence: 200,
      address: { postcode: 'ME14 1AA' },
    });
    // 45 minutes from 18:00.
    expect(stored.estimatedReadyAt).toBe('2026-11-14T18:45:00.000Z');
  });

  it.each([
    [
      'outside the delivery area',
      { address: { ...address, postcode: 'TN1 1AA' } },
      409,
      'basket_invalid',
    ],
    [
      'an invalid postcode',
      { address: { ...address, postcode: 'ME14 1A' } },
      400,
      'postcode_invalid',
    ],
    ['no address', { address: undefined }, 400, 'invalid'],
  ])('refuses delivery with %s', async (_name, over, status, code) => {
    const ctx = setup();
    const res = await post(
      ctx.app,
      '/v1/checkout',
      checkoutBody({
        ...{ fulfilment: 'delivery', address, expectedTotalPence: SPECIAL_LINE_TOTAL + 250 },
        ...over,
      }),
    );
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
    expect(ctx.fake.orders.size).toBe(0);
  });

  it('refuses delivery below the minimum order', async () => {
    const ctx = setup({ config: { zones: [] } });
    ctx.fake.config.zones.push({
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Pricey',
      postcodePrefixes: ['ME14'],
      feePence: 250,
      minOrderPence: 5000,
      isActive: true,
      sortOrder: 0,
    });
    const res = await post(
      ctx.app,
      '/v1/checkout',
      checkoutBody({
        fulfilment: 'delivery',
        address,
        expectedTotalPence: SPECIAL_LINE_TOTAL + 250,
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain('minimum order');
  });

  it('refuses an ASAP order when closed, but takes a valid scheduled one', async () => {
    const ctx = setup();
    ctx.fake.setNow(new Date('2026-11-14T10:00:00Z'));
    const asap = await post(ctx.app, '/v1/checkout', checkoutBody());
    expect(asap.status).toBe(409);
    expect(((await asap.json()) as { error: { code: string } }).error.code).toBe('shop_closed');

    const result = await placeOrder(ctx, { scheduledFor: '2026-11-14T19:00:00Z' });
    const stored = ctx.fake.orders.get(result.orderId)!.input;
    expect(stored.scheduledFor).toBe('2026-11-14T19:00:00.000Z');
    expect(stored.estimatedReadyAt).toBe('2026-11-14T19:00:00.000Z');
  });

  it.each([
    ['off the slot grid', '2026-11-14T19:07:00Z'],
    ['after closing', '2026-11-14T23:30:00Z'],
    ['too soon to cook', '2026-11-14T18:05:00Z'],
    ['in the past', '2026-11-13T19:00:00Z'],
    ['too far ahead', '2026-11-20T19:00:00Z'],
  ])('refuses a scheduled time that is %s', async (_name, scheduledFor) => {
    const res = await post(setup().app, '/v1/checkout', checkoutBody({ scheduledFor }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('slot_unavailable');
  });

  it('refuses everything while ordering is paused', async () => {
    const ctx = setup({
      config: { orderingPaused: true, pausedMessage: 'Oven fault, back soon.' },
    });
    const res = await post(ctx.app, '/v1/checkout', checkoutBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: 'shop_paused', message: 'Oven fault, back soon.' },
    });
  });

  it.each([
    ['the allergen notice is not acknowledged', { allergenAcknowledged: false }],
    ['the basket is empty', { lines: [] }],
    ['the email is invalid', { customer: { ...customer, email: 'nope' } }],
    ['the phone is invalid', { customer: { ...customer, phone: 'call me' } }],
    ['cash is requested', { paymentMethod: 'cash' }],
    ['a quantity is fractional', { lines: [{ ...SPECIAL_LINE, quantity: 1.5 }] }],
  ])('rejects the request when %s', async (_name, over) => {
    const ctx = setup();
    const res = await post(ctx.app, '/v1/checkout', checkoutBody(over));
    expect(res.status).toBe(400);
    expect(ctx.fake.orders.size).toBe(0);
  });

  it('refuses a basket with a sold-out or unknown item', async () => {
    const ctx = setup();
    const menu = orderableMenu();
    menu.categories[0]!.items[0]!.soldOut = true;
    ctx.fake.setMenu(menu);
    const res = await post(ctx.app, '/v1/checkout', checkoutBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'basket_invalid' } });
  });

  it('refuses checkout when no payment provider is configured', async () => {
    const res = await post(setup({ payments: null }).app, '/v1/checkout', checkoutBody());
    expect(res.status).toBe(503);
  });

  it('cancels the order if the payment cannot be started', async () => {
    const broken = {
      ...createSimulatorProvider({ secret: 's' }),
      createPayment: async () => {
        throw new Error('stripe is down');
      },
    };
    const ctx = setup({ payments: broken });
    const res = await post(ctx.app, '/v1/checkout', checkoutBody());
    expect(res.status).toBe(500);
    expect([...ctx.fake.orders.values()][0]!.status).toBe('CANCELLED');
  });
});

// ---- payment webhook --------------------------------------------------------------

describe('payment webhook', () => {
  const provider = (ctx: ReturnType<typeof setup>) => ctx.fake.deps.payments as SimulatorProvider;
  const refOf = (ctx: ReturnType<typeof setup>) => [...ctx.fake.payments.keys()][0]!;
  const webhook = (ctx: ReturnType<typeof setup>, body: string, signature?: string) =>
    ctx.app.request('/v1/webhooks/stripe', {
      method: 'POST',
      headers: signature ? { 'Stripe-Signature': signature } : {},
      body,
    });
  const success = (ctx: ReturnType<typeof setup>, amountPence = SPECIAL_LINE_TOTAL) =>
    provider(ctx).signedWebhook({
      type: 'payment_intent.succeeded',
      providerRef: refOf(ctx),
      amountPence,
    });

  it('marks the order paid and sends one confirmation email', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const signed = success(ctx);
    const res = await webhook(ctx, signed.body, signed.signature);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: 'paid' });
    expect(statusOf(ctx.fake, order.orderId)).toBe('RECEIVED');
    expect(ctx.fake.emails).toHaveLength(1);
    expect(ctx.fake.emails[0]).toMatchObject({
      to: 'alice@example.test',
      subject: 'Your Maidstone Pizza order #1001',
      idempotencyKey: `order-confirmation-${order.orderId}`,
    });
    expect(ctx.fake.emails[0]!.text).toContain(
      `https://shop.test/orders/${order.orderId}?t=${order.orderToken}`,
    );
  });

  it('ignores the same event delivered twice', async () => {
    const ctx = setup();
    await placeOrder(ctx);
    const signed = success(ctx);
    await webhook(ctx, signed.body, signed.signature);
    const again = await webhook(ctx, signed.body, signed.signature);
    expect(await again.json()).toEqual({ received: true, outcome: 'duplicate' });
    expect(ctx.fake.emails).toHaveLength(1);
  });

  it('rejects a missing, wrong or tampered signature and changes nothing', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const signed = success(ctx);
    const forged = createSimulatorProvider({ secret: 'attacker' }).signedWebhook({
      type: 'payment_intent.succeeded',
      providerRef: refOf(ctx),
      amountPence: SPECIAL_LINE_TOTAL,
    });
    const attempts = [
      await webhook(ctx, signed.body),
      await webhook(ctx, signed.body, 't=1,v1=deadbeef'),
      await webhook(ctx, forged.body, forged.signature),
      await webhook(
        ctx,
        signed.body.replace('"amountPence":1949', '"amountPence":1'),
        signed.signature,
      ),
    ];
    expect(attempts.map((r) => r.status)).toEqual([400, 400, 400, 400]);
    expect(statusOf(ctx.fake, order.orderId)).toBe('PENDING_PAYMENT');
    expect(ctx.fake.emails).toEqual([]);
  });

  it('rejects a genuine signature that is more than five minutes old', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const old = provider(ctx).signedWebhook(
      {
        type: 'payment_intent.succeeded',
        providerRef: refOf(ctx),
        amountPence: SPECIAL_LINE_TOTAL,
      },
      new Date(OPEN_NOW.getTime() - 6 * 60_000),
    );
    expect((await webhook(ctx, old.body, old.signature)).status).toBe(400);
    expect(statusOf(ctx.fake, order.orderId)).toBe('PENDING_PAYMENT');
  });

  it('does not mark an order paid when the amount is wrong', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const signed = success(ctx, 1);
    const res = await webhook(ctx, signed.body, signed.signature);
    expect(await res.json()).toMatchObject({ outcome: 'amount_mismatch' });
    expect(statusOf(ctx.fake, order.orderId)).toBe('PENDING_PAYMENT');
  });

  it('leaves the order unpaid after a failed payment, so the customer can retry', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const failed = provider(ctx).signedWebhook({
      type: 'payment_intent.payment_failed',
      providerRef: refOf(ctx),
    });
    const res = await webhook(ctx, failed.body, failed.signature);
    expect(await res.json()).toMatchObject({ outcome: 'failed' });
    expect(statusOf(ctx.fake, order.orderId)).toBe('PENDING_PAYMENT');
  });

  it('keeps the email queued when sending fails, and the job runner sends it later', async () => {
    const ctx = setup({}, 'cron-secret');
    const order = await placeOrder(ctx);
    ctx.fake.failNextEmail();
    const signed = success(ctx);
    const res = await webhook(ctx, signed.body, signed.signature);
    // The payment is still recorded: an email problem must not fail the webhook.
    expect(res.status).toBe(200);
    expect(statusOf(ctx.fake, order.orderId)).toBe('RECEIVED');
    expect(ctx.fake.emails).toEqual([]);

    const run = await ctx.app.request('/v1/cron/jobs', {
      headers: { Authorization: 'Bearer cron-secret' },
    });
    expect(await run.json()).toEqual({ done: 1, failed: 0 });
    expect(ctx.fake.emails).toHaveLength(1);
  });

  it('answers 503 when payments are not configured', async () => {
    const res = await setup({ payments: null }).app.request('/v1/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(503);
  });
});

describe('payment simulator endpoint', () => {
  it('pays an order through the verified webhook path, for whoever holds its token', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const res = await simulate(ctx, order);
    expect(await res.json()).toEqual({ received: true, outcome: 'paid' });
    expect(statusOf(ctx.fake, order.orderId)).toBe('RECEIVED');
  });

  it('refuses without the order token', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const none = await post(
      ctx.app,
      `/v1/dev/payments/${order.orderId}/simulate`,
      {},
      { key: null },
    );
    const wrong = await post(
      ctx.app,
      `/v1/dev/payments/${order.orderId}/simulate`,
      {},
      { key: null, headers: { 'X-Order-Token': 'guess' } },
    );
    expect([none.status, wrong.status]).toEqual([404, 404]);
    expect(statusOf(ctx.fake, order.orderId)).toBe('PENDING_PAYMENT');
  });

  it('does not exist unless the simulator is the active provider', async () => {
    const stripeLike = { ...createSimulatorProvider({ secret: 's' }), name: 'stripe' as const };
    const ctx = setup({ payments: stripeLike });
    const order = await placeOrder(ctx);
    expect((await simulate(ctx, order)).status).toBe(404);
    expect(statusOf(ctx.fake, order.orderId)).toBe('PENDING_PAYMENT');
  });
});

describe('choosePayments', () => {
  const env = (over: Record<string, string>) =>
    serverEnvSchema.parse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      SUPABASE_SECRET_KEY: 'server-secret',
      CORS_ORIGINS: 'http://localhost:3000',
      ...over,
    });
  const stripe = {
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
  };

  it('uses Stripe when all three Stripe values are set', () => {
    const provider = choosePayments(env(stripe), { vercelEnv: 'production' });
    expect(provider).toMatchObject({ name: 'stripe', publishableKey: 'pk_test_x' });
  });

  it('uses the simulator only when switched on, and never in production', () => {
    const on = env({ PAYMENTS_SIMULATOR: 'true' });
    expect(choosePayments(on, {})?.name).toBe('simulator');
    expect(choosePayments(on, { vercelEnv: 'preview' })?.name).toBe('simulator');
    expect(choosePayments(on, { vercelEnv: 'production' })).toBeNull();
    expect(choosePayments(env({}), {})).toBeNull();
  });

  it('does not fall back to half-configured Stripe', () => {
    expect(choosePayments(env({ STRIPE_SECRET_KEY: 'sk_test_x' }), {})).toBeNull();
  });
});

// ---- viewing orders -----------------------------------------------------------------

describe('GET /v1/orders/{id}', () => {
  const get = (ctx: ReturnType<typeof setup>, id: string, headers: Record<string, string> = {}) =>
    ctx.app.request(`/v1/orders/${id}`, { headers });

  it('shows the order to its token holder, without contact details', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const res = await get(ctx, order.orderId, { 'X-Order-Token': order.orderToken! });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    const view: OrderView = orderViewSchema.parse(JSON.parse(text));
    expect(view).toMatchObject({
      status: 'PENDING_PAYMENT',
      totalPence: SPECIAL_LINE_TOTAL,
      customerName: 'Alice Example',
    });
    expect(view.items[0]).toMatchObject({ name: 'Maidstone Special', quantity: 1 });
    expect(text).not.toContain('alice@example.test');
    expect(text).not.toContain('07700');
  });

  it("is not found without a token, with a wrong token, or with another order's token", async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    const other = await placeOrder(ctx);
    const results = [
      await get(ctx, order.orderId),
      await get(ctx, order.orderId, { 'X-Order-Token': 'wrong' }),
      await get(ctx, order.orderId, { 'X-Order-Token': other.orderToken! }),
      await get(ctx, randomUUID(), { 'X-Order-Token': order.orderToken! }),
    ];
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404]);
  });

  it('shows an account order to its owner and to staff, but not to another customer', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx, {}, { auth: 'customer:user-1' });
    const as = (auth: string) => get(ctx, order.orderId, { Authorization: `Bearer ${auth}` });
    expect((await as('customer:user-1')).status).toBe(200);
    expect((await as('kitchen:cook-1')).status).toBe(200);
    expect((await as('customer:user-2')).status).toBe(404);
  });

  it('shows the status timeline once paid', async () => {
    const ctx = setup();
    const order = await placeOrder(ctx);
    await simulate(ctx, order);
    const res = await get(ctx, order.orderId, { 'X-Order-Token': order.orderToken! });
    const view = orderViewSchema.parse(await res.json());
    expect(view.timeline.map((t) => t.status)).toEqual(['PENDING_PAYMENT', 'RECEIVED']);
    expect(view.paidAt).not.toBeNull();
  });
});

describe('GET /v1/me/orders', () => {
  it('needs a signed-in customer and lists only their own paid orders', async () => {
    const ctx = setup();
    const paid = await placeOrder(ctx, {}, { auth: 'customer:user-1' });
    await simulate(ctx, paid);
    await placeOrder(ctx, {}, { auth: 'customer:user-1' }); // unpaid
    const theirs = await placeOrder(ctx, {}, { auth: 'customer:user-2' });
    await simulate(ctx, theirs);

    expect((await ctx.app.request('/v1/me/orders')).status).toBe(401);
    const res = await ctx.app.request('/v1/me/orders', {
      headers: { Authorization: 'Bearer customer:user-1' },
    });
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((o) => o.id)).toEqual([paid.orderId]);
  });
});

// ---- scheduled work -------------------------------------------------------------------

describe('scheduled endpoints', () => {
  it('are off without CRON_SECRET and refuse a wrong secret', async () => {
    const off = await setup().app.request('/v1/cron/jobs');
    expect(off.status).toBe(503);
    const ctx = setup({}, 'cron-secret');
    for (const headers of [
      {},
      { Authorization: 'Bearer wrong' },
      { Authorization: 'cron-secret' },
    ]) {
      expect((await ctx.app.request('/v1/cron/expire-pending', { headers })).status).toBe(401);
    }
  });

  it('cancel unpaid orders after the time limit, and leave paid ones alone', async () => {
    const ctx = setup({}, 'cron-secret');
    const unpaid = await placeOrder(ctx);
    const paid = await placeOrder(ctx);
    await simulate(ctx, paid);
    ctx.fake.setNow(new Date(OPEN_NOW.getTime() + 31 * 60_000));
    const res = await ctx.app.request('/v1/cron/expire-pending', {
      method: 'POST',
      headers: { Authorization: 'Bearer cron-secret' },
    });
    expect(await res.json()).toEqual({ expired: 1 });
    expect(statusOf(ctx.fake, unpaid.orderId)).toBe('CANCELLED');
    expect(statusOf(ctx.fake, paid.orderId)).toBe('RECEIVED');
  });
});

// ---- tokens and email -------------------------------------------------------------------

describe('order tokens', () => {
  it('are stable per order, differ between orders and secrets, and reject near misses', () => {
    const a = orderToken('secret', 'order-a');
    expect(orderToken('secret', 'order-a')).toBe(a);
    expect(orderToken('secret', 'order-b')).not.toBe(a);
    expect(orderToken('other', 'order-a')).not.toBe(a);
    expect(isValidOrderToken('secret', 'order-a', a)).toBe(true);
    expect(isValidOrderToken('secret', 'order-a', a.slice(0, -1))).toBe(false);
    expect(isValidOrderToken('secret', 'order-a', undefined)).toBe(false);
    expect(isValidOrderToken('secret', 'order-a', '')).toBe(false);
  });
});

describe('order confirmation email', () => {
  const order: OrderView = {
    id: '00000000-0000-4000-8000-000000000001',
    orderNumber: 1042,
    status: 'RECEIVED',
    fulfilment: 'delivery',
    createdAt: '2026-11-14T18:00:00Z',
    scheduledFor: null,
    estimatedReadyAt: '2026-11-14T18:45:00Z',
    paidAt: '2026-11-14T18:01:00Z',
    customerName: 'Al <script>alert(1)</script>',
    address: { line1: '1 High St', line2: '', town: 'Maidstone', postcode: 'ME14 1AA' },
    notes: '',
    items: [
      {
        name: 'Ham & Mushroom',
        variantName: '12" Medium',
        quantity: 2,
        lineTotalPence: 2798,
        notes: 'Well done <b>please</b>',
        options: [{ name: 'Deep Pan', pricePence: 0 }],
      },
    ],
    subtotalPence: 2798,
    discountPence: 0,
    deliveryFeePence: 250,
    tipPence: 100,
    vatPence: 508,
    totalPence: 3148,
    timeline: [],
  };
  const email = renderOrderConfirmation(order, {
    trackingUrl: 'https://shop.test/orders/abc?t=tok',
    shopName: 'Maidstone Pizza',
    timezone: 'Europe/London',
  });

  it('carries the order number, items, totals, VAT and tracking link', () => {
    expect(email.subject).toBe('Your Maidstone Pizza order #1042');
    for (const part of [email.text, email.html]) {
      expect(part).toContain('1042');
      expect(part).toContain('£31.48');
      expect(part).toContain('£5.08');
      expect(part).toContain('£2.50');
      expect(part).toContain('https://shop.test/orders/abc?t=tok');
    }
    expect(email.text).toContain('2 x Ham & Mushroom (12" Medium)  £27.98');
    expect(email.text).toContain('6:45');
    expect(email.text).toContain('ME14 1AA');
  });

  it('escapes customer-entered text in the HTML', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>please</b>');
    expect(email.html).toContain('Al &lt;script&gt;');
    expect(email.html).toContain('Ham &amp; Mushroom');
  });
});

describe('email senders', () => {
  const message = {
    to: 'alice@example.test',
    subject: 'Hello',
    html: '<p>secret body</p>',
    text: 'secret body',
    idempotencyKey: 'key-1',
  };

  it('sends through Resend with the documented request', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sender = createResendSender({
      apiKey: 'test-key',
      from: 'Shop <orders@shop.test>',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{"id":"1"}', { status: 200 });
      }) as typeof fetch,
    });
    await sender.send(message);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      from: 'Shop <orders@shop.test>',
      to: ['alice@example.test'],
      subject: 'Hello',
      html: '<p>secret body</p>',
      text: 'secret body',
    });
  });

  it('fails loudly when Resend refuses, so the job is retried', async () => {
    const sender = createResendSender({
      apiKey: 'k',
      from: 'f',
      fetch: (async () => new Response('nope', { status: 422 })) as typeof fetch,
    });
    await expect(sender.send(message)).rejects.toThrow('HTTP 422');
  });

  it('logs without the address or the body when no provider is configured', async () => {
    const lines: string[] = [];
    await createLogSender((line) => lines.push(line)).send(message);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a***@example.test');
    expect(lines[0]).not.toContain('alice@');
    expect(lines[0]).not.toContain('secret body');
  });
});
