import type { SupabaseClient } from '@supabase/supabase-js';
import type { DayHours, ZoneRule } from '@mp/pricing';
import type { OrderSummary, OrderView } from '@mp/validation';
import type { PaymentEvent } from './payments';

// Everything the order flow needs from the database. Faked in tests.
//
// The Supabase implementation uses the secret-key client: customers have no
// write access to these tables at all, so every write goes through the SQL
// functions in the orders migration, which enforce the state machine, the
// totals and exactly-once payment handling.

export interface ShopConfig {
  name: string;
  timezone: string;
  orderingPaused: boolean;
  pausedMessage: string;
  busyMode: boolean;
  busyExtraMinutes: number;
  collectionMinutes: number;
  deliveryMinutes: number;
  slotMinutes: number;
  maxScheduleDays: number;
  cashEnabled: boolean;
  tipsEnabled: boolean;
  hours: DayHours[];
  closures: string[];
  zones: ZoneRule[];
}

export interface NewOrder {
  userId: string | null;
  fulfilment: 'delivery' | 'collection';
  scheduledFor: string | null;
  estimatedReadyAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: { line1: string; line2: string; town: string; postcode: string } | null;
  deliveryZoneId: string | null;
  notes: string;
  subtotalPence: number;
  discountPence: number;
  deliveryFeePence: number;
  tipPence: number;
  vatPence: number;
  totalPence: number;
  allergenAcknowledged: boolean;
  idempotencyKey: string;
  items: Array<{
    itemId: string;
    name: string;
    variantName: string;
    quantity: number;
    unitPricePence: number;
    optionsPence: number;
    lineTotalPence: number;
    vatRateBp: number;
    notes: string;
    allergens: Array<{ code: string; mayContain: boolean }>;
    allergensConfirmed: boolean;
    options: Array<{ optionId: string; groupName: string; name: string; pricePence: number }>;
  }>;
}

/** An order plus the fields used to decide who may see it. */
export interface OrderRecord {
  view: OrderView;
  userId: string | null;
  customerEmail: string;
}

export interface PaymentRecord {
  provider: 'stripe' | 'simulator' | 'cash';
  ref: string;
  amountPence: number;
  status: string;
}

export interface Job {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
}

export type PaymentOutcome =
  | 'duplicate'
  | 'unknown_payment'
  | 'paid'
  | 'amount_mismatch'
  | 'needs_review'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'ignored';

export interface OrderStore {
  getShopConfig(): Promise<ShopConfig>;
  /** `created` is false when the idempotency key was already used. */
  createOrder(order: NewOrder): Promise<{ id: string; orderNumber: number; created: boolean }>;
  attachPayment(
    orderId: string,
    payment: { provider: 'stripe' | 'simulator'; ref: string; amountPence: number },
  ): Promise<void>;
  getPayment(orderId: string): Promise<PaymentRecord | null>;
  getOrder(id: string): Promise<OrderRecord | null>;
  listOrdersForUser(userId: string): Promise<OrderSummary[]>;
  /** Cancels an order that never reached payment. No-op if it is no longer unpaid. */
  cancelUnpaid(orderId: string, reason: string): Promise<void>;
  /** Applies a verified payment event exactly once. */
  recordPaymentEvent(event: PaymentEvent): Promise<PaymentOutcome>;
  /** Cancels unpaid orders past the time limit; returns payments to cancel with the provider. */
  expirePending(): Promise<Array<{ orderId: string; providerRef: string | null }>>;
  claimJobs(limit: number, kinds: string[]): Promise<Job[]>;
  finishJob(id: number, ok: boolean, error: string | null): Promise<void>;
}

interface SettingsRow {
  shop_name: string;
  timezone: string;
  ordering_paused: boolean;
  paused_message: string;
  busy_mode: boolean;
  busy_extra_minutes: number;
  collection_minutes: number;
  delivery_minutes: number;
  slot_minutes: number;
  max_schedule_days: number;
  cash_enabled: boolean;
  tips_enabled: boolean;
}

const ORDER_COLUMNS =
  'id, order_number, user_id, status, fulfilment, created_at, scheduled_for, estimated_ready_at, paid_at, ' +
  'customer_name, customer_email, address, notes, subtotal_pence, discount_pence, delivery_fee_pence, ' +
  'tip_pence, vat_pence, total_pence, ' +
  'order_items(name, variant_name, quantity, line_total_pence, notes, sort_order, ' +
  'order_item_options(name, price_pence, sort_order)), ' +
  'order_status_events(id, to_status, created_at)';

interface OrderRow {
  id: string;
  order_number: number;
  user_id: string | null;
  status: OrderView['status'];
  fulfilment: OrderView['fulfilment'];
  created_at: string;
  scheduled_for: string | null;
  estimated_ready_at: string;
  paid_at: string | null;
  customer_name: string;
  customer_email: string;
  address: { line1?: string; line2?: string; town?: string; postcode?: string } | null;
  notes: string;
  subtotal_pence: number;
  discount_pence: number;
  delivery_fee_pence: number;
  tip_pence: number;
  vat_pence: number;
  total_pence: number;
  order_items: Array<{
    name: string;
    variant_name: string;
    quantity: number;
    line_total_pence: number;
    notes: string;
    sort_order: number;
    order_item_options: Array<{ name: string; price_pence: number; sort_order: number }>;
  }>;
  order_status_events: Array<{ id: number; to_status: OrderView['status']; created_at: string }>;
}

export function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    userId: row.user_id,
    customerEmail: row.customer_email,
    view: {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      fulfilment: row.fulfilment,
      createdAt: row.created_at,
      scheduledFor: row.scheduled_for,
      estimatedReadyAt: row.estimated_ready_at,
      paidAt: row.paid_at,
      customerName: row.customer_name,
      address: row.address
        ? {
            line1: row.address.line1 ?? '',
            line2: row.address.line2 ?? '',
            town: row.address.town ?? '',
            postcode: row.address.postcode ?? '',
          }
        : null,
      notes: row.notes,
      items: [...row.order_items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({
          name: item.name,
          variantName: item.variant_name,
          quantity: item.quantity,
          lineTotalPence: item.line_total_pence,
          notes: item.notes,
          options: [...item.order_item_options]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((o) => ({ name: o.name, pricePence: o.price_pence })),
        })),
      subtotalPence: row.subtotal_pence,
      discountPence: row.discount_pence,
      deliveryFeePence: row.delivery_fee_pence,
      tipPence: row.tip_pence,
      vatPence: row.vat_pence,
      totalPence: row.total_pence,
      timeline: [...row.order_status_events]
        .sort((a, b) => a.id - b.id)
        .map((e) => ({ status: e.to_status, at: e.created_at })),
    },
  };
}

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    throw new Error(`database error ${result.error.code ?? ''}: ${result.error.message}`);
  }
  return result.data;
}

/** `admin` must be the secret-key client. It never leaves this service. */
export function createOrderStore(admin: SupabaseClient): OrderStore {
  return {
    async getShopConfig() {
      const [settings, hours, closures, zones] = await Promise.all([
        admin.from('shop_settings').select('*').single(),
        admin.from('opening_hours').select('weekday, opens, closes, is_closed'),
        admin.from('holiday_closures').select('closed_on'),
        admin
          .from('delivery_zones')
          .select('id, name, postcode_prefixes, fee_pence, min_order_pence, is_active, sort_order'),
      ]);
      const s = check(settings) as SettingsRow;
      return {
        name: s.shop_name,
        timezone: s.timezone,
        orderingPaused: s.ordering_paused,
        pausedMessage: s.paused_message,
        busyMode: s.busy_mode,
        busyExtraMinutes: s.busy_extra_minutes,
        collectionMinutes: s.collection_minutes,
        deliveryMinutes: s.delivery_minutes,
        slotMinutes: s.slot_minutes,
        maxScheduleDays: s.max_schedule_days,
        cashEnabled: s.cash_enabled,
        tipsEnabled: s.tips_enabled,
        hours: (check(hours) ?? []).map((h) => ({
          weekday: h.weekday as number,
          opens: String(h.opens).slice(0, 5),
          closes: String(h.closes).slice(0, 5),
          isClosed: h.is_closed as boolean,
        })),
        closures: (check(closures) ?? []).map((c) => String(c.closed_on)),
        zones: (check(zones) ?? []).map((z) => ({
          id: z.id as string,
          name: z.name as string,
          postcodePrefixes: z.postcode_prefixes as string[],
          feePence: z.fee_pence as number,
          minOrderPence: z.min_order_pence as number,
          isActive: z.is_active as boolean,
          sortOrder: z.sort_order as number,
        })),
      };
    },

    async createOrder(order) {
      const result = check(
        await admin.rpc('create_order', {
          p: {
            user_id: order.userId,
            channel: 'web',
            fulfilment: order.fulfilment,
            scheduled_for: order.scheduledFor,
            estimated_ready_at: order.estimatedReadyAt,
            customer_name: order.customerName,
            customer_email: order.customerEmail,
            customer_phone: order.customerPhone,
            address: order.address,
            delivery_zone_id: order.deliveryZoneId,
            notes: order.notes,
            subtotal_pence: order.subtotalPence,
            discount_pence: order.discountPence,
            delivery_fee_pence: order.deliveryFeePence,
            tip_pence: order.tipPence,
            vat_pence: order.vatPence,
            total_pence: order.totalPence,
            payment_method: 'card',
            allergen_acknowledged: order.allergenAcknowledged,
            idempotency_key: order.idempotencyKey,
            items: order.items.map((item) => ({
              item_id: item.itemId,
              name: item.name,
              variant_name: item.variantName,
              quantity: item.quantity,
              unit_price_pence: item.unitPricePence,
              options_pence: item.optionsPence,
              line_total_pence: item.lineTotalPence,
              vat_rate_bp: item.vatRateBp,
              notes: item.notes,
              allergens: item.allergens,
              allergens_confirmed: item.allergensConfirmed,
              options: item.options.map((o) => ({
                option_id: o.optionId,
                group_name: o.groupName,
                name: o.name,
                price_pence: o.pricePence,
              })),
            })),
          },
        }),
      ) as { id: string; order_number: number; created: boolean };
      return { id: result.id, orderNumber: result.order_number, created: result.created };
    },

    async attachPayment(orderId, payment) {
      // A retried checkout reaches here twice with the same reference.
      check(
        await admin.from('payments').upsert(
          {
            order_id: orderId,
            provider: payment.provider,
            provider_ref: payment.ref,
            amount_pence: payment.amountPence,
          },
          { onConflict: 'provider_ref', ignoreDuplicates: true },
        ),
      );
    },

    async getPayment(orderId) {
      const rows = check(
        await admin
          .from('payments')
          .select('provider, provider_ref, amount_pence, status')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false })
          .limit(1),
      );
      const row = rows?.[0];
      return row
        ? {
            provider: row.provider as PaymentRecord['provider'],
            ref: row.provider_ref as string,
            amountPence: row.amount_pence as number,
            status: row.status as string,
          }
        : null;
    },

    async getOrder(id) {
      const row = check(
        await admin.from('orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle(),
      );
      return row ? toOrderRecord(row as unknown as OrderRow) : null;
    },

    async listOrdersForUser(userId) {
      const rows = check(
        await admin
          .from('orders')
          .select(
            'id, order_number, status, fulfilment, created_at, total_pence, order_items(quantity)',
          )
          .eq('user_id', userId)
          .neq('status', 'PENDING_PAYMENT')
          .order('created_at', { ascending: false })
          .limit(50),
      );
      return (rows ?? []).map((row) => ({
        id: row.id as string,
        orderNumber: row.order_number as number,
        status: row.status as OrderSummary['status'],
        fulfilment: row.fulfilment as OrderSummary['fulfilment'],
        createdAt: row.created_at as string,
        totalPence: row.total_pence as number,
        itemCount: ((row.order_items as Array<{ quantity: number }>) ?? []).reduce(
          (sum, i) => sum + i.quantity,
          0,
        ),
      }));
    },

    async cancelUnpaid(orderId, reason) {
      const { error } = await admin.rpc('transition_order', {
        p_order_id: orderId,
        p_to: 'CANCELLED',
        p_actor_id: null,
        p_actor_role: 'system',
        p_reason: reason,
      });
      // 23514: the guard refused because the order is no longer unpaid. Fine.
      if (error && error.code !== '23514') {
        throw new Error(`database error ${error.code ?? ''}: ${error.message}`);
      }
    },

    async recordPaymentEvent(event) {
      return check(
        await admin.rpc('record_payment_event', {
          p: {
            event_id: event.eventId,
            type: event.type,
            provider_ref: event.providerRef,
            amount_pence: event.amountPence ?? null,
            refunded_pence: event.refundedPence ?? null,
          },
        }),
      ) as PaymentOutcome;
    },

    async expirePending() {
      const rows = check(await admin.rpc('expire_pending_orders')) as Array<{
        order_id: string;
        provider_ref: string | null;
      }>;
      return (rows ?? []).map((r) => ({ orderId: r.order_id, providerRef: r.provider_ref }));
    },

    async claimJobs(limit, kinds) {
      const rows = check(
        await admin.rpc('claim_jobs', { p_limit: limit, p_kinds: kinds }),
      ) as Array<{
        id: number;
        kind: string;
        payload: Record<string, unknown>;
      }>;
      return (rows ?? []).map((r) => ({ id: r.id, kind: r.kind, payload: r.payload }));
    },

    async finishJob(id, ok, error) {
      check(await admin.rpc('finish_job', { p_id: id, p_ok: ok, p_error: error }));
    },
  };
}
