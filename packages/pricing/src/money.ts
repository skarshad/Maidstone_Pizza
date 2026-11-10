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

/** VAT contained in a VAT-inclusive amount, rounded to the nearest penny. */
export function vatIncluded(grossPence: Pence, ratePercent: number): Pence {
  assertPence(grossPence);
  return Math.round((grossPence * ratePercent) / (100 + ratePercent));
}
