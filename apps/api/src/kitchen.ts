import type { KitchenBoard, KitchenOrder } from '@mp/validation';
import { processJobs, type OrderDeps } from './checkout';
import type { AuthUser } from './deps';
import type { Actor } from './order-store';

// What the kitchen screen can do. The routes check the staff role; the
// database's guard trigger has the final say on which moves are legal.

/** Finished tickets stay on the board's history for this long. */
const HISTORY_HOURS = 3;
/** A booked order starts cooking this many minutes (plus prep time) before it is due. */
const START_EARLY_MINUTES = 10;

const actorOf = (user: AuthUser): Actor => ({ id: user.id, role: user.role });

/** Queues a customer email and tries to send it now. Never fails the kitchen's action. */
async function notify(deps: OrderDeps, payload: Record<string, unknown>) {
  try {
    await deps.orders.enqueueJob('order_status_email', payload);
    await processJobs(deps);
  } catch {
    // The job, if queued, is retried by the scheduled job runner.
  }
}

export async function kitchenBoard(deps: OrderDeps): Promise<KitchenBoard> {
  const now = deps.now();
  const orders = await deps.orders.listKitchenOrders(
    new Date(now.getTime() - HISTORY_HOURS * 3_600_000),
  );
  return { serverTime: now.toISOString(), orders };
}

/**
 * Accepts a new order with a preparation time. Cooking starts straight away
 * unless the order is booked for later, in which case it waits as "accepted".
 */
export async function acceptOrder(
  deps: OrderDeps,
  orderId: string,
  prepMinutes: number,
  user: AuthUser,
): Promise<void> {
  const actor = actorOf(user);
  await deps.orders.acceptOrder(orderId, prepMinutes, actor);

  const order = await deps.orders.getOrder(orderId);
  const bookedFor = order?.view.scheduledFor ? new Date(order.view.scheduledFor).getTime() : null;
  const startNow =
    bookedFor === null ||
    bookedFor - deps.now().getTime() <= (prepMinutes + START_EARLY_MINUTES) * 60_000;
  if (startNow) {
    await deps.orders.transitionOrder(orderId, 'PREPARING', actor, 'started on accept');
  }
  await notify(deps, { order_id: orderId, status: 'ACCEPTED' });
}

/**
 * Rejects a new order and refunds it in full. If the refund cannot be made
 * automatically, it is queued for a manager so the customer is not forgotten.
 */
export async function rejectOrder(
  deps: OrderDeps,
  orderId: string,
  reason: string,
  user: AuthUser,
): Promise<{ refund: 'done' | 'pending' | 'needs_review' | 'none' }> {
  await deps.orders.rejectOrder(orderId, reason, actorOf(user));

  let refund: 'done' | 'pending' | 'needs_review' | 'none' = 'none';
  const payment = await deps.orders.getPayment(orderId);
  if (payment && payment.status === 'succeeded') {
    try {
      if (!deps.payments || deps.payments.name !== payment.provider) {
        throw new Error('the provider that took this payment is not configured');
      }
      const event = await deps.payments.refundPayment({
        ref: payment.ref,
        amountPence: payment.amountPence,
        idempotencyKey: `reject-refund-${orderId}`,
      });
      if (event) {
        await deps.orders.recordPaymentEvent(event);
        refund = 'done';
      } else {
        // Stripe confirms through its charge.refunded webhook.
        refund = 'pending';
      }
    } catch (error) {
      refund = 'needs_review';
      await deps.orders
        .enqueueJob('payment_review', {
          order_id: orderId,
          reason: 'refund_failed_after_reject',
          detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        })
        .catch(() => {});
    }
  }

  await notify(deps, { order_id: orderId, status: 'REJECTED', reason });
  return { refund };
}

export type KitchenNextStatus =
  'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COLLECTED' | 'COMPLETED';

export async function moveOrder(
  deps: OrderDeps,
  orderId: string,
  to: KitchenNextStatus,
  user: AuthUser,
): Promise<void> {
  await deps.orders.transitionOrder(orderId, to, actorOf(user), 'kitchen screen');

  if (to === 'OUT_FOR_DELIVERY') {
    await notify(deps, { order_id: orderId, status: 'OUT_FOR_DELIVERY' });
  } else if (to === 'READY') {
    const order = await deps.orders.getOrder(orderId);
    if (order?.view.fulfilment === 'collection') {
      await notify(deps, { order_id: orderId, status: 'READY' });
    }
  }
}

// ---- ticket printing ------------------------------------------------------------

/**
 * A kitchen ticket printer. Nothing is connected yet; a network (ESC/POS) or
 * print-service implementation can be added here without touching the screen.
 */
export interface TicketPrinter {
  readonly name: string;
  /** False when no printer is connected. */
  readonly available: boolean;
  print(order: KitchenOrder): Promise<void>;
}

export const noPrinter: TicketPrinter = {
  name: 'none',
  available: false,
  async print() {
    // TODO(credentials): add an ESC/POS network or print-service implementation
    // once the shop has a printer and its connection details.
  },
};
