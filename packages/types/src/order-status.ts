export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COLLECTED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Fulfilment = 'delivery' | 'collection';

/**
 * Single source of truth for the order lifecycle. The Postgres guard trigger
 * (added with the orders tables in Phase 3) mirrors this table; a test keeps
 * the two identical.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED', 'REFUNDED'],
  PREPARING: ['READY', 'CANCELLED', 'REFUNDED'],
  READY: ['OUT_FOR_DELIVERY', 'COLLECTED', 'CANCELLED', 'REFUNDED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
  COLLECTED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  REJECTED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfilment?: Fulfilment,
): boolean {
  if (!ORDER_TRANSITIONS[from].includes(to)) return false;
  if (to === 'OUT_FOR_DELIVERY' && fulfilment === 'collection') return false;
  if (to === 'COLLECTED' && fulfilment === 'delivery') return false;
  return true;
}
