import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  findZone,
  isBookableSlot,
  parsePostcode,
  priceBasket,
  shopStatus,
  type PricedBasket,
  type ShopHours,
} from '@mp/pricing';
import type {
  CheckoutInput,
  CheckoutResult,
  DeliveryCheckResult,
  Menu,
  PriceBasketInput,
  ShopInfo,
} from '@mp/validation';
import type { AuthUser } from './deps';
import { renderOrderConfirmation } from './emails/order-confirmation';
import type { EmailSender } from './email';
import type { OrderStore, ShopConfig } from './order-store';
import type { PaymentProvider } from './payments';

// The order flow: shop status, basket pricing, checkout and follow-up jobs.
// Functions here take their dependencies as arguments so they can be tested
// without a database, Stripe or a clock.

export interface OrderDeps {
  orders: OrderStore;
  /** Null when no payment provider is configured: checkout is then refused. */
  payments: PaymentProvider | null;
  email: EmailSender;
  getMenu(): Promise<Menu>;
  now(): Date;
  /** Public address of the customer website, without a trailing slash. */
  siteUrl: string;
  /** Signs guest order links. */
  tokenSecret: string;
}

/** A failure the customer can act on. Mapped to a 4xx by the routes. */
export class CheckoutError extends Error {
  readonly code: string;
  readonly status: 400 | 409 | 503;
  readonly basket?: PricedBasket;

  constructor(status: 400 | 409 | 503, code: string, message: string, basket?: PricedBasket) {
    super(message);
    this.status = status;
    this.code = code;
    this.basket = basket;
  }
}

// ---- guest order links ------------------------------------------------------

/**
 * The token that lets someone without an account view one order. Derived from
 * the order id with a server-side secret, so it can be rebuilt for the
 * confirmation email and never needs to be stored.
 */
export function orderToken(secret: string, orderId: string): string {
  return createHmac('sha256', secret).update(`order-view:${orderId}`).digest('base64url');
}

export function isValidOrderToken(secret: string, orderId: string, given: string | undefined) {
  if (!given) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(orderToken(secret, orderId), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function trackingUrl(deps: Pick<OrderDeps, 'siteUrl' | 'tokenSecret'>, orderId: string) {
  return `${deps.siteUrl}/orders/${orderId}?t=${orderToken(deps.tokenSecret, orderId)}`;
}

// ---- shop status ------------------------------------------------------------

function hoursOf(config: ShopConfig): ShopHours {
  return {
    timezone: config.timezone,
    hours: config.hours,
    closures: config.closures,
    orderingPaused: config.orderingPaused,
  };
}

function prepMinutes(config: ShopConfig, fulfilment: 'delivery' | 'collection'): number {
  const base = fulfilment === 'delivery' ? config.deliveryMinutes : config.collectionMinutes;
  return base + (config.busyMode ? config.busyExtraMinutes : 0);
}

export function buildShopInfo(
  config: ShopConfig,
  now: Date,
  payments: PaymentProvider | null,
): ShopInfo {
  const status = shopStatus(hoursOf(config), now);
  return {
    name: config.name,
    timezone: config.timezone,
    isOpen: status.isOpen,
    paused: status.paused,
    pausedMessage: config.pausedMessage,
    closesAt: status.closesAt?.toISOString() ?? null,
    nextOpensAt: status.nextOpensAt?.toISOString() ?? null,
    busy: config.busyMode,
    collectionMinutes: prepMinutes(config, 'collection'),
    deliveryMinutes: prepMinutes(config, 'delivery'),
    slotMinutes: config.slotMinutes,
    maxScheduleDays: config.maxScheduleDays,
    tipsEnabled: config.tipsEnabled,
    cashEnabled: config.cashEnabled,
    hours: config.hours,
    closures: config.closures,
    zones: config.zones
      .filter((z) => z.isActive)
      .map(({ id, name, postcodePrefixes, feePence, minOrderPence }) => ({
        id,
        name,
        postcodePrefixes,
        feePence,
        minOrderPence,
      })),
    payments: {
      provider: payments?.name ?? 'unavailable',
      publishableKey: payments?.publishableKey ?? null,
    },
  };
}

export function checkDelivery(config: ShopConfig, postcode: string): DeliveryCheckResult {
  const parsed = parsePostcode(postcode);
  if (!parsed) return { valid: false, postcode: null, deliverable: false, zone: null };
  const zone = findZone(config.zones, parsed.formatted);
  return {
    valid: true,
    postcode: parsed.formatted,
    deliverable: zone !== null,
    zone: zone
      ? { id: zone.id, name: zone.name, feePence: zone.feePence, minOrderPence: zone.minOrderPence }
      : null,
  };
}

function zoneFor(config: ShopConfig, fulfilment: string, postcode: string | undefined) {
  if (fulfilment !== 'delivery' || postcode === undefined) return undefined;
  const zone = findZone(config.zones, postcode);
  return zone ? { id: zone.id, feePence: zone.feePence, minOrderPence: zone.minOrderPence } : null;
}

export async function priceForCustomer(
  deps: OrderDeps,
  input: PriceBasketInput,
): Promise<PricedBasket> {
  const [config, menu] = await Promise.all([deps.orders.getShopConfig(), deps.getMenu()]);
  return priceBasket(input.lines, menu, {
    fulfilment: input.fulfilment,
    zone: zoneFor(config, input.fulfilment, input.postcode),
    tipPence: config.tipsEnabled ? input.tipPence : 0,
  });
}

// ---- checkout ---------------------------------------------------------------

/**
 * Places an order and starts its payment. The order is created as
 * PENDING_PAYMENT; only the payment webhook can move it on.
 *
 * Nothing in `input` is trusted for money: the basket is re-priced here from
 * the live menu, and the result must equal the total the customer was shown.
 */
export async function placeOrder(
  deps: OrderDeps,
  input: CheckoutInput,
  user: AuthUser | null,
  idempotencyKey: string,
): Promise<CheckoutResult> {
  const provider = deps.payments;
  if (!provider) {
    throw new CheckoutError(503, 'payments_unavailable', 'Online payment is not available yet.');
  }

  const now = deps.now();
  const [config, menu] = await Promise.all([deps.orders.getShopConfig(), deps.getMenu()]);
  const hours = hoursOf(config);
  const status = shopStatus(hours, now);
  const lead = prepMinutes(config, input.fulfilment);

  if (config.orderingPaused) {
    throw new CheckoutError(
      409,
      'shop_paused',
      config.pausedMessage || 'We are not taking orders right now. Please try again later.',
    );
  }

  let scheduledFor: Date | null = null;
  if (input.scheduledFor) {
    scheduledFor = new Date(input.scheduledFor);
    const bookable = isBookableSlot(hours, now, scheduledFor, {
      leadMinutes: lead,
      slotMinutes: config.slotMinutes,
      maxDays: config.maxScheduleDays,
    });
    if (!bookable) {
      throw new CheckoutError(
        409,
        'slot_unavailable',
        'That time is no longer available. Please choose another.',
      );
    }
  } else if (!status.isOpen) {
    throw new CheckoutError(
      409,
      'shop_closed',
      'We are closed right now. You can schedule your order for when we are open.',
    );
  }

  let address = null;
  if (input.fulfilment === 'delivery') {
    const parsed = parsePostcode(input.address?.postcode ?? '');
    if (!input.address || !parsed) {
      throw new CheckoutError(400, 'postcode_invalid', 'Enter a full, valid UK postcode.');
    }
    address = {
      line1: input.address.line1,
      line2: input.address.line2,
      town: input.address.town,
      postcode: parsed.formatted,
    };
  }

  const zone = zoneFor(config, input.fulfilment, address?.postcode);
  const priced = priceBasket(input.lines, menu, {
    fulfilment: input.fulfilment,
    zone,
    tipPence: config.tipsEnabled ? input.tipPence : 0,
  });
  if (!priced.ok) {
    throw new CheckoutError(409, 'basket_invalid', priced.problems[0]!.message, priced);
  }
  if (priced.totalPence !== input.expectedTotalPence) {
    throw new CheckoutError(
      409,
      'price_changed',
      'Some prices have changed since you opened your basket. Please check the new total.',
      priced,
    );
  }

  const estimatedReadyAt = scheduledFor ?? new Date(now.getTime() + lead * 60_000);

  const order = await deps.orders.createOrder({
    userId: user?.id ?? null,
    fulfilment: input.fulfilment,
    scheduledFor: scheduledFor?.toISOString() ?? null,
    estimatedReadyAt: estimatedReadyAt.toISOString(),
    customerName: input.customer.name,
    customerEmail: input.customer.email,
    customerPhone: input.customer.phone,
    address,
    deliveryZoneId: zone?.id ?? null,
    notes: input.notes,
    subtotalPence: priced.subtotalPence,
    discountPence: priced.discountPence,
    deliveryFeePence: priced.deliveryFeePence,
    tipPence: priced.tipPence,
    vatPence: priced.vatPence,
    totalPence: priced.totalPence,
    allergenAcknowledged: input.allergenAcknowledged,
    idempotencyKey,
    items: priced.lines.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      variantName: line.variantName,
      quantity: line.quantity,
      unitPricePence: line.unitPricePence,
      optionsPence: line.optionsPence,
      lineTotalPence: line.lineTotalPence,
      vatRateBp: line.vatRateBp,
      notes: line.notes,
      allergens: line.allergens,
      allergensConfirmed: line.allergensConfirmed,
      options: line.options.map((o) => ({
        optionId: o.optionId,
        groupName: o.groupName,
        name: o.name,
        pricePence: o.pricePence,
      })),
    })),
  });

  // A repeat of the same request (double click, retry) returns the first order.
  // Charge what THAT order says, not whatever this request happened to carry.
  let amountPence = priced.totalPence;
  if (!order.created) {
    const existing = await deps.orders.getOrder(order.id);
    if (!existing || existing.view.status !== 'PENDING_PAYMENT') {
      throw new CheckoutError(
        409,
        'already_placed',
        'This order has already been placed. Please check your order page.',
      );
    }
    amountPence = existing.view.totalPence;
  }

  let payment;
  try {
    payment = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountPence,
      // One payment per order, however many times checkout is retried.
      idempotencyKey: `order-${order.id}`,
    });
  } catch (error) {
    await deps.orders.cancelUnpaid(order.id, 'payment could not be started').catch(() => {});
    throw error;
  }
  await deps.orders.attachPayment(order.id, {
    provider: provider.name,
    ref: payment.ref,
    amountPence,
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderToken: orderToken(deps.tokenSecret, order.id),
    totalPence: amountPence,
    payment: {
      provider: provider.name,
      clientSecret: payment.clientSecret,
      publishableKey: provider.publishableKey,
    },
  };
}

// ---- background work ----------------------------------------------------------

/** Job kinds this service can do on its own. `payment_review` waits for staff (Phase 6). */
export const AUTOMATIC_JOB_KINDS = ['order_confirmation_email'];

/** Runs due jobs. Safe to call from several places at once: each job is claimed by one caller. */
export async function processJobs(
  deps: OrderDeps,
  limit = 10,
): Promise<{ done: number; failed: number }> {
  const jobs = await deps.orders.claimJobs(limit, AUTOMATIC_JOB_KINDS);
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      if (job.kind === 'order_confirmation_email') {
        const orderId = String(job.payload.order_id);
        const order = await deps.orders.getOrder(orderId);
        if (!order) throw new Error('order not found');
        const config = await deps.orders.getShopConfig();
        const email = renderOrderConfirmation(order.view, {
          trackingUrl: trackingUrl(deps, orderId),
          shopName: config.name,
          timezone: config.timezone,
        });
        await deps.email.send({
          to: order.customerEmail,
          ...email,
          idempotencyKey: `order-confirmation-${orderId}`,
        });
      }
      await deps.orders.finishJob(job.id, true, null);
      done++;
    } catch (error) {
      failed++;
      await deps.orders
        .finishJob(job.id, false, error instanceof Error ? error.message : 'unknown error')
        .catch(() => {});
    }
  }
  return { done, failed };
}

/** Cancels unpaid orders past the time limit, here and with the payment provider. */
export async function expirePendingOrders(deps: OrderDeps): Promise<number> {
  const expired = await deps.orders.expirePending();
  for (const { providerRef } of expired) {
    if (providerRef && deps.payments) {
      await deps.payments.cancelPayment(providerRef).catch(() => {});
    }
  }
  return expired.length;
}
