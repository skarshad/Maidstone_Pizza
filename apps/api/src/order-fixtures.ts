import { randomUUID } from 'node:crypto';
import { canTransition } from '@mp/types';
import type { KitchenOrder, Menu, OrderView } from '@mp/validation';
import type { OrderDeps } from './checkout';
import type { EmailMessage } from './email';
import { assemblePublicMenu } from './menu-assemble';
import { IDS, menuRows, variantId } from './menu-fixtures';
import type {
  Job,
  NewOrder,
  OrderRecord,
  OrderStore,
  PaymentOutcome,
  PaymentRecord,
  ShopConfig,
} from './order-store';
import { ACTIVE_KITCHEN_STATUSES, OrderActionError } from './order-store';
import { createSimulatorProvider, type PaymentEvent, type PaymentProvider } from './payments';

// In-memory stand-ins for the database, payments and email. Not used at runtime.
// The fake store mirrors the rules of the SQL functions closely enough to test
// the API's own logic; the SQL itself is tested by supabase/tests/003_orders.

/** Saturday 14 November 2026, 6pm in Maidstone: the shop (4pm to 11pm) is open. */
export const OPEN_NOW = new Date('2026-11-14T18:00:00Z');
export const TOKEN_SECRET = 'test-token-secret';
export const ZONE_ID = '77777777-7777-4777-8777-777777777777';

export function shopConfig(over: Partial<ShopConfig> = {}): ShopConfig {
  return {
    name: 'Maidstone Pizza',
    timezone: 'Europe/London',
    orderingPaused: false,
    pausedMessage: '',
    busyMode: false,
    busyExtraMinutes: 15,
    collectionMinutes: 20,
    deliveryMinutes: 45,
    slotMinutes: 15,
    maxScheduleDays: 2,
    cashEnabled: false,
    tipsEnabled: true,
    hours: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      opens: '16:00',
      closes: '23:00',
      isClosed: false,
    })),
    closures: [],
    zones: [
      {
        id: ZONE_ID,
        name: 'Maidstone',
        postcodePrefixes: ['ME14', 'ME15', 'ME16'],
        feePence: 250,
        minOrderPence: 1200,
        isActive: true,
        sortOrder: 0,
      },
    ],
    ...over,
  };
}

/** The fixture menu with the special on sale (the menu fixture marks it sold out). */
export function orderableMenu(): Menu {
  const rows = menuRows();
  rows.items[0]!.sold_out_until = null;
  rows.optionGroups[0]!.options[1]!.sold_out_until = null;
  return assemblePublicMenu(rows, OPEN_NOW, (path) => `https://cdn.test/${path}`);
}

/** One large Maidstone Special on a thin base: £18.99 + 50p for the base at large. */
export const SPECIAL_LINE = {
  itemId: IDS.special,
  variantId: variantId(1, 2),
  quantity: 1,
  selections: [{ groupId: IDS.base, optionIds: [IDS.thin] }],
  notes: '',
};
export const SPECIAL_LINE_TOTAL = 1899 + 50;

/** A stable id for the nth item of an order in the fake store. */
export const itemId = (orderNumber: number, index: number) =>
  `66666666-6666-4666-8666-${String(orderNumber * 100 + index).padStart(12, '0')}`;

interface StoredOrder {
  id: string;
  orderNumber: number;
  status: OrderView['status'];
  createdAt: Date;
  paidAt: Date | null;
  input: NewOrder;
  events: Array<{ status: OrderView['status']; at: string; actor?: string }>;
  estimatedReadyAt: string;
  updatedAt: Date;
  rejectReason: string | null;
  doneItems: Set<number>;
}

export interface FakeOrders {
  deps: OrderDeps;
  store: OrderStore;
  orders: Map<string, StoredOrder>;
  payments: Map<string, PaymentRecord & { orderId: string }>;
  jobs: Array<Job & { status: 'pending' | 'done' | 'failed' }>;
  emails: EmailMessage[];
  config: ShopConfig;
  /** Move the clock. */
  setNow(date: Date): void;
  /** Replace the menu the API prices against. */
  setMenu(menu: Menu): void;
  /** Make the next email send fail. */
  failNextEmail(): void;
}

export function fakeOrderDeps(
  options: { payments?: PaymentProvider | null; config?: Partial<ShopConfig> } = {},
): FakeOrders {
  let now = OPEN_NOW;
  let menu = orderableMenu();
  let emailShouldFail = false;
  const config = shopConfig(options.config);
  const orders = new Map<string, StoredOrder>();
  const byKey = new Map<string, string>();
  const payments = new Map<string, PaymentRecord & { orderId: string }>();
  const seenEvents = new Set<string>();
  const jobs: FakeOrders['jobs'] = [];
  const emails: EmailMessage[] = [];
  let nextNumber = 1001;
  let nextJob = 1;

  const move = (order: StoredOrder, status: OrderView['status'], actor?: string) => {
    order.status = status;
    order.updatedAt = now;
    order.events.push({ status, at: now.toISOString(), actor });
  };

  /** Mirrors the database guard: only moves the state machine allows. */
  const guarded = (orderId: string, to: OrderView['status']): StoredOrder => {
    const order = orders.get(orderId);
    if (!order) throw new OrderActionError('not_found', 'Order not found.');
    if (!canTransition(order.status, to, order.input.fulfilment)) {
      throw new OrderActionError('invalid_transition', 'That order has already moved on.');
    }
    return order;
  };

  const toRecord = (order: StoredOrder): OrderRecord => ({
    userId: order.input.userId,
    customerEmail: order.input.customerEmail,
    view: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      fulfilment: order.input.fulfilment,
      createdAt: order.createdAt.toISOString(),
      scheduledFor: order.input.scheduledFor,
      estimatedReadyAt: order.estimatedReadyAt,
      paidAt: order.paidAt?.toISOString() ?? null,
      customerName: order.input.customerName,
      address: order.input.address,
      notes: order.input.notes,
      items: order.input.items.map((item) => ({
        name: item.name,
        variantName: item.variantName,
        quantity: item.quantity,
        lineTotalPence: item.lineTotalPence,
        notes: item.notes,
        options: item.options.map((o) => ({ name: o.name, pricePence: o.pricePence })),
      })),
      subtotalPence: order.input.subtotalPence,
      discountPence: order.input.discountPence,
      deliveryFeePence: order.input.deliveryFeePence,
      tipPence: order.input.tipPence,
      vatPence: order.input.vatPence,
      totalPence: order.input.totalPence,
      timeline: order.events.map(({ status, at }) => ({ status, at })),
    },
  });

  const store: OrderStore = {
    getShopConfig: async () => config,

    async createOrder(input) {
      const existing = byKey.get(input.idempotencyKey);
      if (existing) {
        const order = orders.get(existing)!;
        return { id: order.id, orderNumber: order.orderNumber, created: false };
      }
      const order: StoredOrder = {
        id: randomUUID(),
        orderNumber: nextNumber++,
        status: 'PENDING_PAYMENT',
        createdAt: now,
        paidAt: null,
        input,
        events: [{ status: 'PENDING_PAYMENT', at: now.toISOString() }],
        estimatedReadyAt: input.estimatedReadyAt,
        updatedAt: now,
        rejectReason: null,
        doneItems: new Set(),
      };
      orders.set(order.id, order);
      byKey.set(input.idempotencyKey, order.id);
      return { id: order.id, orderNumber: order.orderNumber, created: true };
    },

    async attachPayment(orderId, payment) {
      if (!payments.has(payment.ref)) {
        payments.set(payment.ref, { ...payment, orderId, status: 'pending' });
      }
    },

    async getPayment(orderId) {
      return [...payments.values()].find((p) => p.orderId === orderId) ?? null;
    },

    getOrder: async (id) => {
      const order = orders.get(id);
      return order ? toRecord(order) : null;
    },

    listOrdersForUser: async (userId) =>
      [...orders.values()]
        .filter((o) => o.input.userId === userId && o.status !== 'PENDING_PAYMENT')
        .map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          fulfilment: o.input.fulfilment,
          createdAt: o.createdAt.toISOString(),
          totalPence: o.input.totalPence,
          itemCount: o.input.items.reduce((n, i) => n + i.quantity, 0),
        })),

    async cancelUnpaid(orderId) {
      const order = orders.get(orderId);
      if (order?.status === 'PENDING_PAYMENT') move(order, 'CANCELLED');
    },

    async recordPaymentEvent(event: PaymentEvent): Promise<PaymentOutcome> {
      if (seenEvents.has(event.eventId)) return 'duplicate';
      seenEvents.add(event.eventId);
      const payment = payments.get(event.providerRef);
      if (!payment) return 'unknown_payment';
      const order = orders.get(payment.orderId)!;

      if (event.type === 'payment_intent.succeeded') {
        if (event.amountPence !== order.input.totalPence) {
          payment.status = 'amount_mismatch';
          return 'amount_mismatch';
        }
        payment.status = 'succeeded';
        if (order.status !== 'PENDING_PAYMENT') return 'needs_review';
        move(order, 'RECEIVED');
        order.paidAt = now;
        jobs.push({
          id: nextJob++,
          kind: 'order_confirmation_email',
          payload: { order_id: order.id },
          status: 'pending',
        });
        return 'paid';
      }
      if (event.type === 'charge.refunded') {
        payment.status = 'refunded';
        if (canTransition(order.status, 'REFUNDED')) move(order, 'REFUNDED');
        return 'refunded';
      }
      if (event.type === 'payment_intent.payment_failed') {
        if (payment.status === 'pending') payment.status = 'failed';
        return 'failed';
      }
      return 'ignored';
    },

    async expirePending() {
      const expired = [];
      for (const order of orders.values()) {
        if (
          order.status === 'PENDING_PAYMENT' &&
          now.getTime() - order.createdAt.getTime() > 30 * 60_000
        ) {
          move(order, 'CANCELLED');
          const payment = [...payments.values()].find((p) => p.orderId === order.id);
          expired.push({ orderId: order.id, providerRef: payment?.ref ?? null });
        }
      }
      return expired;
    },

    async claimJobs(limit, kinds) {
      return jobs.filter((j) => j.status === 'pending' && kinds.includes(j.kind)).slice(0, limit);
    },

    async enqueueJob(kind, payload) {
      jobs.push({ id: nextJob++, kind, payload, status: 'pending' });
    },

    async listKitchenOrders(finishedSince) {
      const active: readonly string[] = ACTIVE_KITCHEN_STATUSES;
      return [...orders.values()]
        .filter(
          (o) =>
            active.includes(o.status) ||
            (o.paidAt !== null && o.status !== 'PENDING_PAYMENT' && o.updatedAt >= finishedSince),
        )
        .map((o): KitchenOrder => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          channel: 'web',
          fulfilment: o.input.fulfilment,
          createdAt: o.createdAt.toISOString(),
          paidAt: o.paidAt?.toISOString() ?? null,
          scheduledFor: o.input.scheduledFor,
          estimatedReadyAt: o.estimatedReadyAt,
          updatedAt: o.updatedAt.toISOString(),
          customerName: o.input.customerName,
          customerPhone: o.input.customerPhone,
          address: o.input.address,
          notes: o.input.notes,
          rejectReason: o.rejectReason,
          items: o.input.items.map((item, index) => ({
            id: itemId(o.orderNumber, index),
            name: item.name,
            variantName: item.variantName,
            quantity: item.quantity,
            notes: item.notes,
            done: o.doneItems.has(index),
            allergens: item.allergens,
            allergensConfirmed: item.allergensConfirmed,
            options: item.options.map((opt) => ({ groupName: opt.groupName, name: opt.name })),
          })),
        }));
    },

    async acceptOrder(orderId, prepMinutes, actor) {
      const order = guarded(orderId, 'ACCEPTED');
      move(order, 'ACCEPTED', actor.id ?? undefined);
      order.estimatedReadyAt =
        order.input.scheduledFor ?? new Date(now.getTime() + prepMinutes * 60_000).toISOString();
    },

    async rejectOrder(orderId, reason, actor) {
      const order = guarded(orderId, 'REJECTED');
      move(order, 'REJECTED', actor.id ?? undefined);
      order.rejectReason = reason;
    },

    async transitionOrder(orderId, to, actor) {
      move(guarded(orderId, to), to, actor.id ?? undefined);
    },

    async setItemDone(orderId, id, done) {
      const order = orders.get(orderId);
      const index = order?.input.items.findIndex((_, i) => itemId(order.orderNumber, i) === id);
      if (!order || index === undefined || index < 0) return false;
      if (done) order.doneItems.add(index);
      else order.doneItems.delete(index);
      return true;
    },

    async finishJob(id, ok) {
      const job = jobs.find((j) => j.id === id);
      if (job && ok) job.status = 'done';
    },
  };

  const deps: OrderDeps = {
    orders: store,
    payments:
      options.payments === undefined
        ? createSimulatorProvider({ secret: 'test-simulator-secret', now: () => now })
        : options.payments,
    email: {
      name: 'log',
      async send(message) {
        if (emailShouldFail) {
          emailShouldFail = false;
          throw new Error('email provider is down');
        }
        emails.push(message);
      },
    },
    getMenu: async () => menu,
    now: () => now,
    siteUrl: 'https://shop.test',
    tokenSecret: TOKEN_SECRET,
  };

  return {
    deps,
    store,
    orders,
    payments,
    jobs,
    emails,
    config,
    setNow: (date) => {
      now = date;
    },
    setMenu: (next) => {
      menu = next;
    },
    failNextEmail: () => {
      emailShouldFail = true;
    },
  };
}
