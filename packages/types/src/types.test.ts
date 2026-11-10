import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, ORDER_TRANSITIONS, canTransition } from './order-status';
import { hasRole, isRole } from './roles';

describe('order state machine', () => {
  it('follows the happy path for delivery', () => {
    const path = [
      'PENDING_PAYMENT',
      'RECEIVED',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'COMPLETED',
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!, 'delivery')).toBe(true);
    }
  });

  it('routes by fulfilment after READY', () => {
    expect(canTransition('READY', 'COLLECTED', 'collection')).toBe(true);
    expect(canTransition('READY', 'OUT_FOR_DELIVERY', 'collection')).toBe(false);
    expect(canTransition('READY', 'COLLECTED', 'delivery')).toBe(false);
  });

  it('never skips payment or goes backwards', () => {
    expect(canTransition('PENDING_PAYMENT', 'ACCEPTED')).toBe(false);
    expect(canTransition('PREPARING', 'RECEIVED')).toBe(false);
    expect(canTransition('COMPLETED', 'PREPARING')).toBe(false);
  });

  it('treats REFUNDED as terminal and only targets known statuses', () => {
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
    for (const targets of Object.values(ORDER_TRANSITIONS)) {
      for (const t of targets) expect(ORDER_STATUSES).toContain(t);
    }
  });
});

describe('roles', () => {
  it('ranks roles', () => {
    expect(hasRole('admin', 'manager')).toBe(true);
    expect(hasRole('kitchen', 'manager')).toBe(false);
    expect(hasRole('customer', 'kitchen')).toBe(false);
    expect(hasRole(null, 'customer')).toBe(false);
  });

  it('validates role strings', () => {
    expect(isRole('kitchen')).toBe(true);
    expect(isRole('superuser')).toBe(false);
  });
});
