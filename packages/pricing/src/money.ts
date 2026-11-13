/** All money in the platform is integer pence. */
export type Pence = number;

export function assertPence(value: number): Pence {
  if (!Number.isInteger(value)) throw new Error(`Money must be integer pence, got ${value}`);
  return value;
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function formatPence(value: Pence): string {
  return gbp.format(assertPence(value) / 100);
}

/**
 * Reads a typed price such as "14.99", "£14.99" or "15" as integer pence.
 * Works on the text, never through a float. Returns null if it is not a price.
 */
export function parsePounds(input: string): Pence | null {
  const match = /^£?\s*(\d{1,5})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** "14.99" for an input box (no currency sign). */
export function penceToInput(value: Pence): string {
  assertPence(value);
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

/** VAT contained in a VAT-inclusive amount, rounded to the nearest penny. */
export function vatIncluded(grossPence: Pence, ratePercent: number): Pence {
  assertPence(grossPence);
  return Math.round((grossPence * ratePercent) / (100 + ratePercent));
}
