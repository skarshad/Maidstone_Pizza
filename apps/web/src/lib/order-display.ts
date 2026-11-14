import type { OrderView } from '@mp/validation';

type Status = OrderView['status'];

/** A time in the shop's timezone, for example "6:45 pm". */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** "Today 6:45 pm", "Tomorrow 5:00 pm" or "Mon 16 Nov 5:00 pm", in the shop's timezone. */
export function formatWhen(iso: string, timeZone: string, now: Date): string {
  const day = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);
  const target = new Date(iso);
  const time = formatTime(iso, timeZone);
  if (day(target) === day(now)) return `Today ${time}`;
  if (day(target) === day(new Date(now.getTime() + 86_400_000))) return `Tomorrow ${time}`;
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(target);
  return `${date} ${time}`;
}

export const STATUS_LABEL: Record<Status, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  RECEIVED: 'Order received',
  ACCEPTED: 'Accepted by the kitchen',
  PREPARING: 'Being prepared',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  COLLECTED: 'Collected',
  COMPLETED: 'Completed',
  REJECTED: 'Not accepted',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** The steps a customer sees for a normal order, in order. */
export function progressSteps(fulfilment: OrderView['fulfilment']): Status[] {
  return fulfilment === 'delivery'
    ? ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
    : ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'COMPLETED'];
}

export const isFinished = (status: Status) =>
  status === 'COMPLETED' ||
  status === 'REJECTED' ||
  status === 'CANCELLED' ||
  status === 'REFUNDED';

export function headline(order: OrderView): string {
  switch (order.status) {
    case 'PENDING_PAYMENT':
      return 'Almost there: pay to place your order';
    case 'RECEIVED':
      return 'Thanks! We have your order';
    case 'ACCEPTED':
      return 'The kitchen has accepted your order';
    case 'PREPARING':
      return 'Your order is being prepared';
    case 'READY':
      return order.fulfilment === 'delivery'
        ? 'Your order is ready and waiting for a driver'
        : 'Your order is ready to collect';
    case 'OUT_FOR_DELIVERY':
      return 'Your order is on its way';
    case 'COLLECTED':
    case 'COMPLETED':
      return 'Enjoy your meal';
    case 'REJECTED':
      return 'Sorry, we could not accept this order';
    case 'CANCELLED':
      return 'This order was cancelled';
    case 'REFUNDED':
      return 'This order was refunded';
  }
}
