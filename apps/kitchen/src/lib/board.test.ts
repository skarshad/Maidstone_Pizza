import { describe, expect, it } from 'vitest';
import type { KitchenOrder } from '@mp/validation';
import {
  allergenFlags,
  columnOf,
  countdown,
  historyOf,
  needsAlarm,
  nextAction,
  ticketsFor,
  urgency,
  waiting,
} from './board';

const NOW = new Date('2026-11-14T18:00:00Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function order(over: Partial<KitchenOrder> = {}): KitchenOrder {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    orderNumber: 1001,
    status: 'RECEIVED',
    channel: 'web',
    fulfilment: 'collection',
    createdAt: at(-2),
    paidAt: at(-1),
    scheduledFor: null,
    estimatedReadyAt: at(20),
    updatedAt: at(-1),
    customerName: 'Alice',
    customerPhone: '07700 900123',
    address: null,
    notes: '',
    rejectReason: null,
    items: [],
    ...over,
  };
}

describe('columnOf', () => {
  it('puts each status in its column, and finished orders in none', () => {
    const column = (status: KitchenOrder['status']) => columnOf(order({ status }));
    expect(column('RECEIVED')).toBe('new');
    expect(column('ACCEPTED')).toBe('preparing');
    expect(column('PREPARING')).toBe('preparing');
    expect(column('READY')).toBe('ready');
    expect(column('OUT_FOR_DELIVERY')).toBe('out');
    for (const status of ['COMPLETED', 'REJECTED', 'CANCELLED', 'REFUNDED'] as const) {
      expect(column(status)).toBeNull();
    }
  });
});

describe('nextAction', () => {
  it('offers one forward step per status', () => {
    const next = (over: Partial<KitchenOrder>) => nextAction(order(over));
    expect(next({ status: 'RECEIVED' })).toBeNull(); // accept or reject instead
    expect(next({ status: 'ACCEPTED' })).toEqual({
      label: 'Start preparing',
      moves: ['PREPARING'],
    });
    expect(next({ status: 'PREPARING' })).toEqual({ label: 'Ready', moves: ['READY'] });
    expect(next({ status: 'OUT_FOR_DELIVERY' })).toEqual({
      label: 'Delivered',
      moves: ['COMPLETED'],
    });
    expect(next({ status: 'COMPLETED' })).toBeNull();
  });

  it('sends a ready delivery out, and finishes a ready collection in one tap', () => {
    expect(nextAction(order({ status: 'READY', fulfilment: 'delivery' }))).toEqual({
      label: 'Out for delivery',
      moves: ['OUT_FOR_DELIVERY'],
    });
    expect(nextAction(order({ status: 'READY', fulfilment: 'collection' }))).toEqual({
      label: 'Collected',
      moves: ['COLLECTED', 'COMPLETED'],
    });
  });
});

describe('urgency', () => {
  it('escalates a new order the longer it waits to be accepted', () => {
    const waited = (minutes: number) => urgency(order({ paidAt: at(-minutes) }), NOW);
    expect(waited(0)).toBe('ok');
    expect(waited(1)).toBe('ok');
    expect(waited(2)).toBe('soon');
    expect(waited(5)).toBe('late');
  });

  it('escalates an order being prepared as its due time approaches and passes', () => {
    const due = (minutes: number) =>
      urgency(order({ status: 'PREPARING', estimatedReadyAt: at(minutes) }), NOW);
    expect(due(20)).toBe('ok');
    expect(due(5)).toBe('soon');
    expect(due(0)).toBe('soon');
    expect(due(-1)).toBe('late');
  });

  it('only nags about ready and out orders once they are well overdue', () => {
    expect(urgency(order({ status: 'READY', estimatedReadyAt: at(-10) }), NOW)).toBe('ok');
    expect(urgency(order({ status: 'READY', estimatedReadyAt: at(-16) }), NOW)).toBe('late');
    expect(urgency(order({ status: 'COMPLETED', estimatedReadyAt: at(-600) }), NOW)).toBe('ok');
  });
});

describe('countdown and waiting', () => {
  it('describes time to the due time', () => {
    const label = (minutes: number) => countdown(order({ estimatedReadyAt: at(minutes) }), NOW);
    expect(label(12)).toBe('in 12 min');
    expect(label(0)).toBe('due now');
    expect(label(-8)).toBe('8 min late');
    expect(label(180)).toBe('in 3 h');
  });

  it('describes how long a new order has waited', () => {
    expect(waiting(order({ paidAt: at(0) }), NOW)).toBe('just in');
    expect(waiting(order({ paidAt: at(-3) }), NOW)).toBe('waiting 3 min');
    // A clock slightly behind the server must not show a negative wait.
    expect(waiting(order({ paidAt: at(1) }), NOW)).toBe('just in');
  });
});

describe('ticketsFor and historyOf', () => {
  const orders = [
    order({ id: 'a', orderNumber: 1, status: 'RECEIVED', paidAt: at(-1) }),
    order({ id: 'b', orderNumber: 2, status: 'RECEIVED', paidAt: at(-4) }),
    order({ id: 'c', orderNumber: 3, status: 'PREPARING', estimatedReadyAt: at(30) }),
    order({ id: 'd', orderNumber: 4, status: 'ACCEPTED', estimatedReadyAt: at(10) }),
    order({ id: 'e', orderNumber: 5, status: 'COMPLETED', updatedAt: at(-20) }),
    order({ id: 'f', orderNumber: 6, status: 'REFUNDED', updatedAt: at(-5) }),
  ];

  it('shows new orders oldest first and the rest by due time', () => {
    expect(ticketsFor(orders, 'new').map((o) => o.id)).toEqual(['b', 'a']);
    expect(ticketsFor(orders, 'preparing').map((o) => o.id)).toEqual(['d', 'c']);
    expect(ticketsFor(orders, 'ready')).toEqual([]);
  });

  it('lists finished orders most recent first', () => {
    expect(historyOf(orders).map((o) => o.id)).toEqual(['f', 'e']);
  });

  it('sounds the alarm only while an order is waiting to be accepted', () => {
    expect(needsAlarm(orders)).toBe(true);
    expect(needsAlarm(orders.filter((o) => o.status !== 'RECEIVED'))).toBe(false);
    expect(needsAlarm([])).toBe(false);
  });
});

describe('allergenFlags', () => {
  const item = (over: Partial<KitchenOrder['items'][number]>) => ({
    id: 'i',
    name: 'Pizza',
    variantName: 'Large',
    quantity: 1,
    notes: '',
    done: false,
    allergens: [],
    allergensConfirmed: true,
    options: [],
    ...over,
  });

  it('splits contains from may-contain', () => {
    expect(
      allergenFlags(
        item({
          allergens: [
            { code: 'gluten', mayContain: false },
            { code: 'nuts', mayContain: true },
          ],
        }),
      ),
    ).toEqual({ contains: ['gluten'], mayContain: ['nuts'] });
  });

  it('shows nothing when there are none or they are unconfirmed', () => {
    expect(allergenFlags(item({}))).toBeNull();
    expect(
      allergenFlags(
        item({ allergensConfirmed: false, allergens: [{ code: 'milk', mayContain: false }] }),
      ),
    ).toBeNull();
  });
});
