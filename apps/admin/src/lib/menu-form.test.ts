import { describe, expect, it } from 'vitest';
import { endOfTradingDay, slugify } from './menu-form';

describe('slugify', () => {
  it('makes URL-safe names', () => {
    expect(slugify('Ham & Mushroom')).toBe('ham-and-mushroom');
    expect(slugify("Ben & Jerry's Phish Food 465ml ")).toBe('ben-and-jerrys-phish-food-465ml');
    expect(slugify('  BBQ-Original!  ')).toBe('bbq-original');
  });
});

describe('endOfTradingDay', () => {
  it('ends at the next 5am, even after midnight', () => {
    const evening = new Date(2026, 10, 13, 21, 30);
    expect(new Date(endOfTradingDay(evening))).toEqual(new Date(2026, 10, 14, 5, 0));
    const afterMidnight = new Date(2026, 10, 14, 0, 30);
    expect(new Date(endOfTradingDay(afterMidnight))).toEqual(new Date(2026, 10, 14, 5, 0));
    const morning = new Date(2026, 10, 14, 9, 0);
    expect(new Date(endOfTradingDay(morning))).toEqual(new Date(2026, 10, 15, 5, 0));
  });
});
