import { describe, expect, it } from 'vitest';
import { assertPence, formatPence, vatIncluded } from './money';

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
