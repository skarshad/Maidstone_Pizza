import type { KitchenOrder } from '@mp/validation';

// Pure rules for the kitchen board: which column a ticket sits in, how late it
// is, and what the next tap does. No I/O, so it is tested without a browser.

export type Column = 'new' | 'preparing' | 'ready' | 'out';

export const COLUMNS: Array<{ key: Column; title: string }> = [
  { key: 'new', title: 'New' },
  { key: 'preparing', title: 'Preparing' },
  { key: 'ready', title: 'Ready' },
  { key: 'out', title: 'Out for delivery' },
];

/** The column for a live ticket, or null when it belongs in the history. */
export function columnOf(order: KitchenOrder): Column | null {
  switch (order.status) {
    case 'RECEIVED':
      return 'new';
    case 'ACCEPTED':
    case 'PREPARING':
      return 'preparing';
    case 'READY':
      return 'ready';
    case 'OUT_FOR_DELIVERY':
    case 'COLLECTED':
      return 'out';
    default:
      return null;
  }
}

export type NextStatus = 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COLLECTED' | 'COMPLETED';

/** The single forward action for a ticket, as one or two status moves. */
export function nextAction(order: KitchenOrder): { label: string; moves: NextStatus[] } | null {
  switch (order.status) {
    case 'ACCEPTED':
      return { label: 'Start preparing', moves: ['PREPARING'] };
    case 'PREPARING':
      return { label: 'Ready', moves: ['READY'] };
    case 'READY':
      return order.fulfilment === 'delivery'
        ? { label: 'Out for delivery', moves: ['OUT_FOR_DELIVERY'] }
        : // Handing it over finishes a collection order: one tap, two recorded steps.
          { label: 'Collected', moves: ['COLLECTED', 'COMPLETED'] };
    case 'OUT_FOR_DELIVERY':
      return { label: 'Delivered', moves: ['COMPLETED'] };
    case 'COLLECTED':
      return { label: 'Done', moves: ['COMPLETED'] };
    default:
      return null;
  }
}

export type Urgency = 'ok' | 'soon' | 'late';

const minutesBetween = (fromMs: number, toMs: number) => Math.round((toMs - fromMs) / 60_000);

/**
 * How urgent a ticket is.
 * - New: how long it has waited to be accepted (amber at 2 minutes, red at 5).
 * - Preparing: time left until it is due (amber inside 5 minutes, red when past).
 * - Ready and out: red once 15 minutes past due, as a nudge to move it on.
 */
export function urgency(order: KitchenOrder, now: Date): Urgency {
  const nowMs = now.getTime();
  const due = new Date(order.estimatedReadyAt).getTime();
  switch (columnOf(order)) {
    case 'new': {
      const waited = minutesBetween(new Date(order.paidAt ?? order.createdAt).getTime(), nowMs);
      return waited >= 5 ? 'late' : waited >= 2 ? 'soon' : 'ok';
    }
    case 'preparing': {
      const left = (due - nowMs) / 60_000;
      return left < 0 ? 'late' : left <= 5 ? 'soon' : 'ok';
    }
    case 'ready':
    case 'out':
      return nowMs - due > 15 * 60_000 ? 'late' : 'ok';
    default:
      return 'ok';
  }
}

/** "in 12 min", "due now" or "8 min late". */
export function countdown(order: KitchenOrder, now: Date): string {
  const minutes = minutesBetween(now.getTime(), new Date(order.estimatedReadyAt).getTime());
  if (minutes > 90) return `in ${Math.round(minutes / 60)} h`;
  if (minutes > 0) return `in ${minutes} min`;
  if (minutes === 0) return 'due now';
  return `${-minutes} min late`;
}

/** "waiting 3 min" for a ticket not yet accepted. */
export function waiting(order: KitchenOrder, now: Date): string {
  const minutes = Math.max(
    0,
    minutesBetween(new Date(order.paidAt ?? order.createdAt).getTime(), now.getTime()),
  );
  return minutes === 0 ? 'just in' : `waiting ${minutes} min`;
}

export function timeOfDay(iso: string, timeZone = 'Europe/London'): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** Tickets for one column: new ones oldest first, the rest by when they are due. */
export function ticketsFor(orders: KitchenOrder[], column: Column): KitchenOrder[] {
  const key = (o: KitchenOrder) =>
    column === 'new' ? (o.paidAt ?? o.createdAt) : o.estimatedReadyAt;
  return orders
    .filter((o) => columnOf(o) === column)
    .sort((a, b) => key(a).localeCompare(key(b)) || a.orderNumber - b.orderNumber);
}

/** Finished tickets, most recent first. */
export function historyOf(orders: KitchenOrder[]): KitchenOrder[] {
  return orders
    .filter((o) => columnOf(o) === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The alarm sounds for as long as any order is waiting to be accepted. */
export const needsAlarm = (orders: KitchenOrder[]) => orders.some((o) => o.status === 'RECEIVED');

export const CHANNEL_LABEL: Record<KitchenOrder['channel'], string> = {
  web: 'Website',
  app: 'App',
  phone: 'Phone',
  uber_eats: 'Uber Eats',
  just_eat: 'Just Eat',
  deliveroo: 'Deliveroo',
};

export const FINISHED_LABEL: Partial<Record<KitchenOrder['status'], string>> = {
  COMPLETED: 'Completed',
  COLLECTED: 'Collected',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** Allergens the kitchen must see on an item: those it contains, then may-contain. */
export function allergenFlags(
  item: KitchenOrder['items'][number],
): { contains: string[]; mayContain: string[] } | null {
  if (!item.allergensConfirmed || item.allergens.length === 0) return null;
  return {
    contains: item.allergens.filter((a) => !a.mayContain).map((a) => a.code),
    mayContain: item.allergens.filter((a) => a.mayContain).map((a) => a.code),
  };
}

export const PREP_CHOICES = [10, 15, 20, 30, 45, 60];
export const REJECT_REASONS = [
  'Too busy right now',
  'An item is unavailable',
  'Closing soon',
  'Cannot deliver to this address',
];
