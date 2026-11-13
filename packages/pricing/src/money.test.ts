import { describe, expect, it } from 'vitest';
import { assertPence, formatPence, parsePounds, penceToInput, vatIncluded } from './money';

describe('parsePounds', () => {
  it('reads typed prices exactly', () => {
    expect(parsePounds('14.99')).toBe(1499);
    expect(parsePounds('£14.99')).toBe(1499);
    expect(parsePounds(' 15 ')).toBe(1500);
    expect(parsePounds('0.4')).toBe(40);
    expect(parsePounds('0.07')).toBe(7);
    expect(parsePounds('19.99')).toBe(1999);
  });

  it('rejects anything that is not a price', () => {
    for (const bad of ['', 'abc', '-1', '1.999', '1,50', '1e3', '.5']) {
      expect(parsePounds(bad)).toBeNull();
    }
  });

  it('round-trips with penceToInput', () => {
    for (const p of [0, 7, 40, 999, 1499, 100000]) expect(parsePounds(penceToInput(p))).toBe(p);
  });
});

describe('money', () => {
  it('formats pence as GBP', () => {
    expect(formatPence(1499)).toBe('£14.99');
    expect(formatPence(0)).toBe('£0.00');
  });

  it('rejects fractional pence', () => {
    expect(() => assertPence(14.99)).toThrow();
  });

  it('extracts VAT from a gross amount', () => {
    expect(vatIncluded(1200, 20)).toBe(200);
    expect(vatIncluded(1499, 20)).toBe(250);
    expect(vatIncluded(1499, 0)).toBe(0);
  });
});
