import { assertPence, type Pence } from './money';

// Pricing for one configured menu item (size + chosen options). Pure: no I/O,
// no clock. The same function runs in the browser preview and, from Phase 3,
// in the API at checkout, where the server result is the only one charged.

export interface PriceableOption {
  id: string;
  /** Price when `prices` has no entry for the chosen size. */
  pricePence: Pence;
  /** Price by variant slug. */
  prices: Record<string, Pence>;
}

export interface GroupRule {
  groupId: string;
  minSelect: number;
  /** null = no upper limit. */
  maxSelect: number | null;
  /** How many selections are included in the item price. */
  freeSelect: number;
}

export interface GroupSelection extends GroupRule {
  selected: PriceableOption[];
}

export interface ItemPrice {
  basePence: Pence;
  optionsPence: Pence;
  totalPence: Pence;
}

export function optionPrice(option: PriceableOption, variantSlug: string): Pence {
  return assertPence(option.prices[variantSlug] ?? option.pricePence);
}

/**
 * Price of one item. Where a group includes free selections, the cheapest
 * chosen options are the free ones, so the result does not depend on the order
 * the customer ticked them in.
 */
export function priceItem(
  variant: { slug: string; pricePence: Pence },
  groups: GroupSelection[],
): ItemPrice {
  const basePence = assertPence(variant.pricePence);
  let optionsPence = 0;
  for (const group of groups) {
    const prices = group.selected.map((o) => optionPrice(o, variant.slug)).sort((a, b) => a - b);
    optionsPence += prices.slice(Math.max(0, group.freeSelect)).reduce((sum, p) => sum + p, 0);
  }
  return { basePence, optionsPence, totalPence: basePence + optionsPence };
}

export type SelectionProblem =
  | { groupId: string; kind: 'too_few'; required: number }
  | { groupId: string; kind: 'too_many'; allowed: number }
  | { groupId: string; kind: 'duplicate' };

/** Checks each group's min/max rules. An empty array means the selection is valid. */
export function checkSelection(groups: GroupSelection[]): SelectionProblem[] {
  const problems: SelectionProblem[] = [];
  for (const group of groups) {
    const count = group.selected.length;
    if (new Set(group.selected.map((o) => o.id)).size !== count) {
      problems.push({ groupId: group.groupId, kind: 'duplicate' });
    }
    if (count < group.minSelect) {
      problems.push({ groupId: group.groupId, kind: 'too_few', required: group.minSelect });
    }
    if (group.maxSelect !== null && count > group.maxSelect) {
      problems.push({ groupId: group.groupId, kind: 'too_many', allowed: group.maxSelect });
    }
  }
  return problems;
}
