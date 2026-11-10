// Delivery-platform adapters (OrderChannelAdapter, mock, Uber Eats, Just Eat, Deliveroo) land in Phase 7.
export const ORDER_CHANNELS = [
  'web',
  'app',
  'phone',
  'uber_eats',
  'just_eat',
  'deliveroo',
] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];
