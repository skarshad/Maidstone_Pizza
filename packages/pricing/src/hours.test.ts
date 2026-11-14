import { describe, expect, it } from 'vitest';
import {
  isBookableSlot,
  localDate,
  scheduleSlots,
  shopStatus,
  zonedTimeToUtc,
  type ShopHours,
} from './hours';
import { findZone, parsePostcode } from './postcode';

const everyDay = (opens: string, closes: string) =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens, closes, isClosed: false }));

const shop = (over: Partial<ShopHours> = {}): ShopHours => ({
  timezone: 'Europe/London',
  hours: everyDay('16:00', '23:00'),
  closures: [],
  orderingPaused: false,
  ...over,
});

const slotOptions = { leadMinutes: 20, slotMinutes: 15, maxDays: 0 };

describe('zonedTimeToUtc', () => {
  it('handles winter (GMT) and summer (BST)', () => {
    expect(zonedTimeToUtc(2026, 11, 14, 16, 0, 'Europe/London').toISOString()).toBe(
      '2026-11-14T16:00:00.000Z',
    );
    expect(zonedTimeToUtc(2026, 7, 14, 16, 0, 'Europe/London').toISOString()).toBe(
      '2026-07-14T15:00:00.000Z',
    );
  });

  it('is right on the days the clocks change', () => {
    // Clocks go forward 29 March 2026, back 25 October 2026.
    expect(zonedTimeToUtc(2026, 3, 29, 16, 0, 'Europe/London').toISOString()).toBe(
      '2026-03-29T15:00:00.000Z',
    );
    expect(zonedTimeToUtc(2026, 10, 25, 16, 0, 'Europe/London').toISOString()).toBe(
      '2026-10-25T16:00:00.000Z',
    );
  });

  it('reports the local date either side of midnight in summer', () => {
    expect(localDate(new Date('2026-07-14T22:59:00Z'), 'Europe/London')).toBe('2026-07-14');
    expect(localDate(new Date('2026-07-14T23:01:00Z'), 'Europe/London')).toBe('2026-07-15');
  });
});

describe('shopStatus', () => {
  it('is closed before opening and says when it opens', () => {
    const status = shopStatus(shop(), new Date('2026-11-14T12:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.nextOpensAt?.toISOString()).toBe('2026-11-14T16:00:00.000Z');
  });

  it('is open during hours and says when it closes', () => {
    const status = shopStatus(shop(), new Date('2026-11-14T18:30:00Z'));
    expect(status.isOpen).toBe(true);
    expect(status.closesAt?.toISOString()).toBe('2026-11-14T23:00:00.000Z');
    expect(status.nextOpensAt).toBeNull();
  });

  it('closes exactly at closing time and points to tomorrow', () => {
    const status = shopStatus(shop(), new Date('2026-11-14T23:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.nextOpensAt?.toISOString()).toBe('2026-11-15T16:00:00.000Z');
  });

  it('uses local time in summer', () => {
    // 15:30 UTC is 16:30 in London in July.
    expect(shopStatus(shop(), new Date('2026-07-14T15:30:00Z')).isOpen).toBe(true);
    expect(shopStatus(shop(), new Date('2026-07-14T14:30:00Z')).isOpen).toBe(false);
  });

  it('stays open past midnight when closing time is after midnight', () => {
    const late = shop({ hours: everyDay('17:00', '01:00') });
    expect(shopStatus(late, new Date('2026-11-15T00:30:00Z')).isOpen).toBe(true);
    expect(shopStatus(late, new Date('2026-11-15T01:00:00Z')).isOpen).toBe(false);
  });

  it('respects a closed weekday and a holiday closure', () => {
    // 14 November 2026 is a Saturday (weekday 6).
    const closedSaturday = shop({
      hours: everyDay('16:00', '23:00').map((h) =>
        h.weekday === 6 ? { ...h, isClosed: true } : h,
      ),
    });
    const now = new Date('2026-11-14T18:30:00Z');
    expect(shopStatus(closedSaturday, now).isOpen).toBe(false);
    expect(shopStatus(closedSaturday, now).nextOpensAt?.toISOString()).toBe(
      '2026-11-15T16:00:00.000Z',
    );
    expect(shopStatus(shop({ closures: ['2026-11-14'] }), now).isOpen).toBe(false);
  });

  it('is not open while ordering is paused, even during hours', () => {
    const status = shopStatus(shop({ orderingPaused: true }), new Date('2026-11-14T18:30:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.paused).toBe(true);
    expect(status.closesAt).not.toBeNull();
  });
});

describe('scheduleSlots', () => {
  it('starts one preparation time after opening when the shop is not open yet', () => {
    const slots = scheduleSlots(shop(), new Date('2026-11-14T12:00:00Z'), slotOptions);
    expect(slots[0]!.toISOString()).toBe('2026-11-14T16:30:00.000Z');
    expect(slots.at(-1)!.toISOString()).toBe('2026-11-14T23:00:00.000Z');
  });

  it('starts one preparation time from now when open, on the slot grid', () => {
    const slots = scheduleSlots(shop(), new Date('2026-11-14T18:07:00Z'), slotOptions);
    expect(slots[0]!.toISOString()).toBe('2026-11-14T18:30:00.000Z');
    expect(slots[1]!.toISOString()).toBe('2026-11-14T18:45:00.000Z');
  });

  it('offers nothing today once it is too late, and tomorrow when allowed', () => {
    const now = new Date('2026-11-14T22:50:00Z');
    expect(scheduleSlots(shop(), now, slotOptions)).toEqual([]);
    const tomorrow = scheduleSlots(shop(), now, { ...slotOptions, maxDays: 1 });
    expect(tomorrow[0]!.toISOString()).toBe('2026-11-15T16:30:00.000Z');
  });

  it('accepts only exact bookable slots', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const ok = (iso: string) => isBookableSlot(shop(), now, new Date(iso), slotOptions);
    expect(ok('2026-11-14T19:00:00Z')).toBe(true);
    expect(ok('2026-11-14T19:07:00Z')).toBe(false); // off the grid
    expect(ok('2026-11-14T16:00:00Z')).toBe(false); // no time to cook
    expect(ok('2026-11-14T23:15:00Z')).toBe(false); // after closing
    expect(ok('2026-11-15T19:00:00Z')).toBe(false); // too far ahead
    expect(ok('2026-11-13T19:00:00Z')).toBe(false); // in the past
  });

  it('offers no slots on a closure day', () => {
    const closed = shop({ closures: ['2026-11-14'] });
    expect(scheduleSlots(closed, new Date('2026-11-14T12:00:00Z'), slotOptions)).toEqual([]);
  });
});

describe('postcodes and zones', () => {
  it('reads postcodes however they are typed', () => {
    expect(parsePostcode('me14 1aa')).toEqual({
      outward: 'ME14',
      inward: '1AA',
      formatted: 'ME14 1AA',
    });
    expect(parsePostcode('ME141AA')?.formatted).toBe('ME14 1AA');
    expect(parsePostcode(' sw1a-2aa ')?.outward).toBe('SW1A');
    expect(parsePostcode('M1 1AE')?.outward).toBe('M1');
  });

  it('rejects things that are not full postcodes', () => {
    for (const bad of ['', 'ME14', 'hello', '12345', 'ME14 1A', 'ME14 1AAA']) {
      expect(parsePostcode(bad)).toBeNull();
    }
  });

  const zones = [
    {
      id: 'far',
      name: 'Outer',
      postcodePrefixes: ['ME17', 'ME1'],
      feePence: 400,
      minOrderPence: 2000,
      isActive: true,
      sortOrder: 2,
    },
    {
      id: 'town',
      name: 'Maidstone',
      postcodePrefixes: ['ME14', 'ME15', 'ME16'],
      feePence: 250,
      minOrderPence: 1200,
      isActive: true,
      sortOrder: 1,
    },
    {
      id: 'off',
      name: 'Paused',
      postcodePrefixes: ['ME20'],
      feePence: 0,
      minOrderPence: 0,
      isActive: false,
      sortOrder: 0,
    },
  ];

  it('matches on the whole outward code, not a prefix of it', () => {
    expect(findZone(zones, 'ME15 6XX')?.id).toBe('town');
    expect(findZone(zones, 'ME1 1AA')?.id).toBe('far');
    // ME14 must not be caught by the "ME1" rule.
    expect(findZone(zones, 'ME14 1AA')?.id).toBe('town');
    expect(findZone(zones, 'ME17 1AA')?.id).toBe('far');
  });

  it('returns null outside every zone, for inactive zones and for bad postcodes', () => {
    expect(findZone(zones, 'TN1 1AA')).toBeNull();
    expect(findZone(zones, 'ME20 1AA')).toBeNull();
    expect(findZone(zones, 'nonsense')).toBeNull();
  });
});
