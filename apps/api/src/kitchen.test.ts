import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Role } from '@mp/types';
import { checkoutResultSchema, kitchenBoardSchema, type CheckoutResult } from '@mp/validation';
import { createApp } from './app';
import type { Deps } from './deps';
import { renderOrderStatus } from './emails/order-status';
import { fakeMenuStore } from './menu-fixtures';
import {
  OPEN_NOW,
  SPECIAL_LINE,
  SPECIAL_LINE_TOTAL,
  fakeOrderDeps,
  itemId,
  type FakeOrders,
} from './order-fixtures';
import { createSimulatorProvider } from './payments';

function setup(options: Parameters<typeof fakeOrderDeps>[0] = {}) {
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
    cronSecret: null,
  };
  return { app: createApp(() => deps), fake };
}
type Ctx = ReturnType<typeof setup>;

const COOK = 'kitchen:cook-1';

function call(ctx: Ctx, method: string, path: string, body?: unknown, auth: string | null = COOK) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  return ctx.app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function paidOrder(ctx: Ctx, over: Record<string, unknown> = {}): Promise<CheckoutResult> {
  const res = await ctx.app.request('/v1/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      lines: [SPECIAL_LINE],
      fulfilment: 'collection',
      scheduledFor: null,
      customer: { name: 'Alice Example', email: 'alice@example.test', phone: '07700 900123' },
      notes: 'Ring the bell',
      tipPence: 0,
      allergenAcknowledged: true,
      expectedTotalPence: SPECIAL_LINE_TOTAL,
      paymentMethod: 'card',
      ...over,
    }),
  });
  expect(res.status).toBe(201);
  const order = checkoutResultSchema.parse(await res.json());
  const pay = await ctx.app.request(`/v1/dev/payments/${order.orderId}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Order-Token': order.orderToken! },
    body: JSON.stringify({ outcome: 'succeeded' }),
  });
  expect(pay.status).toBe(200);
  return order;
}

const statusOf = (fake: FakeOrders, id: string) => fake.orders.get(id)!.status;
const subjects = (fake: FakeOrders) => fake.emails.map((e) => e.subject);
const board = async (ctx: Ctx) =>
  kitchenBoardSchema.parse(await (await call(ctx, 'GET', '/v1/kitchen/orders')).json());

describe('kitchen routes: access', () => {
  it('refuse anonymous callers and customers on every route, and change nothing', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    const base = `/v1/kitchen/orders/${order.orderId}`;
    const routes: Array<[string, string, unknown?]> = [
      ['GET', '/v1/kitchen/orders'],
      ['POST', `${base}/accept`, { prepMinutes: 20 }],
      ['POST', `${base}/reject`, { reason: 'Too busy' }],
      ['POST', `${base}/status`, { to: 'READY' }],
      ['POST', `${base}/items/${itemId(1001, 0)}/done`, { done: true }],
      ['POST', `${base}/print`],
    ];
    for (const [method, path, body] of routes) {
      expect((await call(ctx, method, path, body, null)).status, `${method} ${path}`).toBe(401);
      const asCustomer = await call(ctx, method, path, body, 'customer:user-1');
      expect(asCustomer.status, `${method} ${path}`).toBe(403);
    }
    expect(statusOf(ctx.fake, order.orderId)).toBe('RECEIVED');
  });

  it('let kitchen staff, managers and admins in', async () => {
    const ctx = setup();
    for (const who of ['kitchen:c', 'manager:m', 'admin:a']) {
      expect((await call(ctx, 'GET', '/v1/kitchen/orders', undefined, who)).status).toBe(200);
    }
  });
});

describe('GET /v1/kitchen/orders', () => {
  it('shows paid orders with everything the kitchen needs, and never unpaid ones', async () => {
    const ctx = setup();
    const paid = await paidOrder(ctx);
    await ctx.app.request('/v1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({
        lines: [SPECIAL_LINE],
        fulfilment: 'collection',
        scheduledFor: null,
        customer: { name: 'Unpaid', email: 'u@example.test', phone: '07700 900999' },
        notes: '',
        tipPence: 0,
        allergenAcknowledged: true,
        expectedTotalPence: SPECIAL_LINE_TOTAL,
        paymentMethod: 'card',
      }),
    });

    const res = await call(ctx, 'GET', '/v1/kitchen/orders');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const data = kitchenBoardSchema.parse(await res.json());
    expect(data.serverTime).toBe(OPEN_NOW.toISOString());
    expect(data.orders.map((o) => o.id)).toEqual([paid.orderId]);
    expect(data.orders[0]).toMatchObject({
      status: 'RECEIVED',
      channel: 'web',
      fulfilment: 'collection',
      customerName: 'Alice Example',
      customerPhone: '07700 900123',
      notes: 'Ring the bell',
    });
    expect(data.orders[0]!.items[0]).toMatchObject({
      name: 'Maidstone Special',
      variantName: '15" Large',
      quantity: 1,
      done: false,
      allergensConfirmed: true,
      options: [{ groupName: 'Base', name: 'Thin' }],
    });
    expect(data.orders[0]!.items[0]!.allergens.map((a) => a.code)).toEqual(['gluten', 'milk']);
  });

  it('keeps finished orders for three hours, then drops them', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/reject`, { reason: 'Too busy' });
    expect((await board(ctx)).orders.map((o) => o.status)).toEqual(['REFUNDED']);
    ctx.fake.setNow(new Date(OPEN_NOW.getTime() + 4 * 3_600_000));
    expect((await board(ctx)).orders).toEqual([]);
  });
});

describe('accepting', () => {
  it('accepts an ASAP order, starts it cooking, sets the estimate and emails the customer', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    const res = await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/accept`, {
      prepMinutes: 25,
    });
    expect(res.status).toBe(200);
    const stored = ctx.fake.orders.get(order.orderId)!;
    expect(stored.status).toBe('PREPARING');
    expect(stored.events.map((e) => e.status)).toEqual([
      'PENDING_PAYMENT',
      'RECEIVED',
      'ACCEPTED',
      'PREPARING',
    ]);
    expect(stored.events.at(-1)!.actor).toBe('cook-1');
    expect(stored.estimatedReadyAt).toBe('2026-11-14T18:25:00.000Z');
    expect(subjects(ctx.fake)).toEqual([
      'Your Maidstone Pizza order #1001',
      'We are making your order #1001',
    ]);
    expect(ctx.fake.emails[1]!.text).toContain('6:25');
  });

  it('leaves an order booked for much later as accepted, keeping its booked time', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx, { scheduledFor: '2026-11-14T21:00:00Z' });
    await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/accept`, { prepMinutes: 20 });
    const stored = ctx.fake.orders.get(order.orderId)!;
    expect(stored.status).toBe('ACCEPTED');
    expect(stored.estimatedReadyAt).toBe('2026-11-14T21:00:00.000Z');

    const start = await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/status`, {
      to: 'PREPARING',
    });
    expect(start.status).toBe(200);
    expect(statusOf(ctx.fake, order.orderId)).toBe('PREPARING');
  });

  it('refuses a second accept, an unknown order and a silly preparation time', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    const path = `/v1/kitchen/orders/${order.orderId}/accept`;
    for (const prepMinutes of [0, -5, 500, 12.5]) {
      expect((await call(ctx, 'POST', path, { prepMinutes })).status).toBe(400);
    }
    expect((await call(ctx, 'POST', path, { prepMinutes: 20 })).status).toBe(200);
    const again = await call(ctx, 'POST', path, { prepMinutes: 20 });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'invalid_transition' } });
    const missing = await call(ctx, 'POST', `/v1/kitchen/orders/${randomUUID()}/accept`, {
      prepMinutes: 20,
    });
    expect(missing.status).toBe(404);
  });
});

describe('rejecting', () => {
  it('rejects with a reason, refunds in full and tells the customer', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    const res = await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/reject`, {
      reason: 'Out of dough',
    });
    expect(await res.json()).toEqual({ ok: true, refund: 'done' });
    const stored = ctx.fake.orders.get(order.orderId)!;
    expect(stored.rejectReason).toBe('Out of dough');
    expect(stored.events.map((e) => e.status).slice(-2)).toEqual(['REJECTED', 'REFUNDED']);
    expect([...ctx.fake.payments.values()][0]!.status).toBe('refunded');
    const email = ctx.fake.emails.at(-1)!;
    expect(email.subject).toBe('Sorry, we could not accept your order #1001');
    expect(email.text).toContain('Out of dough');
    expect(email.text).toContain('refunded in full');
  });

  it('queues the refund for a manager when it cannot be made automatically', async () => {
    const broken = {
      ...createSimulatorProvider({ secret: 'test-simulator-secret', now: () => OPEN_NOW }),
      refundPayment: async () => {
        throw new Error('provider is down');
      },
    };
    const ctx = setup({ payments: broken });
    const order = await paidOrder(ctx);
    const res = await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/reject`, {
      reason: 'Out of dough',
    });
    // The order is still rejected: a refund problem must not leave it on the board.
    expect(await res.json()).toEqual({ ok: true, refund: 'needs_review' });
    expect(statusOf(ctx.fake, order.orderId)).toBe('REJECTED');
    const review = ctx.fake.jobs.find((j) => j.kind === 'payment_review');
    expect(review?.payload).toMatchObject({
      order_id: order.orderId,
      reason: 'refund_failed_after_reject',
    });
    // Review jobs wait for a person; the automatic runner must leave them alone.
    expect(review?.status).toBe('pending');
  });

  it('needs a reason, and cannot reject an order that is already being made', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    const path = `/v1/kitchen/orders/${order.orderId}/reject`;
    expect((await call(ctx, 'POST', path, { reason: ' ' })).status).toBe(400);
    expect((await call(ctx, 'POST', path, {})).status).toBe(400);
    await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/accept`, { prepMinutes: 20 });
    expect((await call(ctx, 'POST', path, { reason: 'Changed my mind' })).status).toBe(409);
    expect(statusOf(ctx.fake, order.orderId)).toBe('PREPARING');
  });
});

describe('moving an order along', () => {
  const move = (ctx: Ctx, id: string, to: string) =>
    call(ctx, 'POST', `/v1/kitchen/orders/${id}/status`, { to });

  it('walks a collection order to completed and emails when it is ready', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/accept`, { prepMinutes: 20 });
    for (const to of ['READY', 'COLLECTED', 'COMPLETED']) {
      expect((await move(ctx, order.orderId, to)).status, to).toBe(200);
    }
    expect(statusOf(ctx.fake, order.orderId)).toBe('COMPLETED');
    expect(subjects(ctx.fake).slice(2)).toEqual(['Your order #1001 is ready to collect']);
  });

  it('walks a delivery order out for delivery and emails then, not at ready', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx, {
      fulfilment: 'delivery',
      address: { line1: '1 High St', line2: '', town: 'Maidstone', postcode: 'ME14 1AA' },
      expectedTotalPence: SPECIAL_LINE_TOTAL + 250,
    });
    await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/accept`, { prepMinutes: 20 });
    await move(ctx, order.orderId, 'READY');
    expect(subjects(ctx.fake)).toHaveLength(2);
    await move(ctx, order.orderId, 'OUT_FOR_DELIVERY');
    expect(subjects(ctx.fake).at(-1)).toBe('Your order #1001 is on its way');
    expect((await move(ctx, order.orderId, 'COMPLETED')).status).toBe(200);
  });

  it('refuses skipping steps, the wrong ending for the order type, and non-kitchen targets', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    // Not accepted yet.
    expect((await move(ctx, order.orderId, 'READY')).status).toBe(409);
    await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/accept`, { prepMinutes: 20 });
    expect((await move(ctx, order.orderId, 'COMPLETED')).status).toBe(409);
    await move(ctx, order.orderId, 'READY');
    // A collection order cannot go out for delivery.
    expect((await move(ctx, order.orderId, 'OUT_FOR_DELIVERY')).status).toBe(409);
    for (const to of ['RECEIVED', 'REFUNDED', 'CANCELLED', 'PENDING_PAYMENT', 'nonsense']) {
      expect((await move(ctx, order.orderId, to)).status, to).toBe(400);
    }
    expect(statusOf(ctx.fake, order.orderId)).toBe('READY');
  });

  it('still moves the order when the customer email cannot be sent', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    ctx.fake.failNextEmail();
    const res = await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/accept`, {
      prepMinutes: 20,
    });
    expect(res.status).toBe(200);
    expect(statusOf(ctx.fake, order.orderId)).toBe('PREPARING');
    expect(
      ctx.fake.jobs.some((j) => j.kind === 'order_status_email' && j.status === 'pending'),
    ).toBe(true);
  });
});

describe('ticking items and printing', () => {
  it('ticks and unticks an item, and refuses an item from another order', async () => {
    const ctx = setup();
    const first = await paidOrder(ctx);
    const second = await paidOrder(ctx);
    const done = (orderId: string, item: string, value: boolean) =>
      call(ctx, 'POST', `/v1/kitchen/orders/${orderId}/items/${item}/done`, { done: value });

    expect((await done(first.orderId, itemId(1001, 0), true)).status).toBe(200);
    expect((await board(ctx)).orders.find((o) => o.id === first.orderId)!.items[0]!.done).toBe(
      true,
    );
    expect((await done(first.orderId, itemId(1001, 0), false)).status).toBe(200);
    expect((await board(ctx)).orders.find((o) => o.id === first.orderId)!.items[0]!.done).toBe(
      false,
    );
    // Order 1002's item through order 1001.
    expect((await done(first.orderId, itemId(1002, 0), true)).status).toBe(404);
    expect((await board(ctx)).orders.find((o) => o.id === second.orderId)!.items[0]!.done).toBe(
      false,
    );
  });

  it('says plainly that no printer is connected', async () => {
    const ctx = setup();
    const order = await paidOrder(ctx);
    const res = await call(ctx, 'POST', `/v1/kitchen/orders/${order.orderId}/print`);
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ error: { code: 'no_printer' } });
  });
});

describe('order status email', () => {
  it('escapes the kitchen-typed reason and the customer name', () => {
    const email = renderOrderStatus(
      {
        id: '00000000-0000-4000-8000-000000000001',
        orderNumber: 7,
        status: 'REJECTED',
        fulfilment: 'collection',
        createdAt: '2026-11-14T18:00:00Z',
        scheduledFor: null,
        estimatedReadyAt: '2026-11-14T18:20:00Z',
        paidAt: '2026-11-14T18:01:00Z',
        customerName: '<b>Al</b>',
        address: null,
        notes: '',
        items: [],
        subtotalPence: 999,
        discountPence: 0,
        deliveryFeePence: 0,
        tipPence: 0,
        vatPence: 167,
        totalPence: 999,
        timeline: [],
      },
      'REJECTED',
      {
        trackingUrl: 'https://shop.test/orders/x?t=y',
        shopName: 'Maidstone Pizza',
        timezone: 'Europe/London',
        reason: 'Oven <broken>',
      },
    );
    expect(email.html).not.toContain('<b>Al</b>');
    expect(email.html).not.toContain('<broken>');
    expect(email.html).toContain('Oven &lt;broken&gt;');
    expect(email.text).toContain('Reason: Oven <broken>');
  });
});
