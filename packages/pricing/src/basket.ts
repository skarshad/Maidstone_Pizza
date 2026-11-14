import type { AllergenRef, Menu } from '@mp/validation';
import { optionPrice } from './item';
import { assertPence, type Pence } from './money';

// Prices a whole basket. Pure: no I/O and no clock. The website runs it for an
// instant preview; the API runs the same function against the live menu at
// checkout, and only the API's result is ever stored or charged.

export const MAX_LINE_QUANTITY = 20;
export const MAX_BASKET_LINES = 40;
export const MAX_TIP_PENCE = 10_000;
/** Delivery is charged at the standard rate, like the food it carries. */
export const DELIVERY_VAT_RATE_BP = 2000;

export type Fulfilment = 'delivery' | 'collection';

export interface BasketLineInput {
  itemId: string;
  variantId: string;
  quantity: number;
  selections: Array<{ groupId: string; optionIds: string[] }>;
  notes?: string;
}

export interface DeliveryZonePricing {
  id: string;
  feePence: Pence;
  minOrderPence: Pence;
}

export interface PricingContext {
  fulfilment: Fulfilment;
  /**
   * The zone for the customer's postcode. `null` means the postcode is outside
   * every zone; `undefined` means no postcode has been given yet.
   */
  zone?: DeliveryZonePricing | null;
  tipPence: Pence;
}

export type BasketProblemCode =
  | 'empty'
  | 'too_many_lines'
  | 'item_unavailable'
  | 'item_sold_out'
  | 'size_unavailable'
  | 'option_unavailable'
  | 'option_sold_out'
  | 'selection_invalid'
  | 'quantity_invalid'
  | 'tip_invalid'
  | 'no_delivery_zone'
  | 'postcode_needed'
  | 'below_minimum';

export interface BasketProblem {
  code: BasketProblemCode;
  message: string;
  /** Index into the input lines, when the problem is about one line. */
  lineIndex?: number;
}

export interface PricedOption {
  optionId: string;
  groupId: string;
  groupName: string;
  name: string;
  /** What is charged for it, for one item (0 when within the free allowance). */
  pricePence: Pence;
}

export interface PricedLine {
  /** Index of this line in the input. */
  lineIndex: number;
  itemId: string;
  itemSlug: string;
  categorySlug: string;
  name: string;
  variantId: string;
  variantSlug: string;
  variantName: string;
  quantity: number;
  unitPricePence: Pence;
  optionsPence: Pence;
  lineTotalPence: Pence;
  vatRateBp: number;
  notes: string;
  allergens: AllergenRef[];
  allergensConfirmed: boolean;
  options: PricedOption[];
}

export interface PricedBasket {
  lines: PricedLine[];
  itemCount: number;
  subtotalPence: Pence;
  discountPence: Pence;
  deliveryFeePence: Pence;
  tipPence: Pence;
  /** VAT contained in the total. Prices are VAT-inclusive. */
  vatPence: Pence;
  totalPence: Pence;
  problems: BasketProblem[];
  /** True when the basket can be ordered exactly as it stands. */
  ok: boolean;
}

/** VAT inside a VAT-inclusive amount, for a rate in basis points (2000 = 20%). */
export function vatIncludedBp(grossPence: Pence, rateBp: number): Pence {
  assertPence(grossPence);
  return Math.round((grossPence * rateBp) / (10_000 + rateBp));
}

export function priceBasket(
  input: BasketLineInput[],
  menu: Menu,
  context: PricingContext,
): PricedBasket {
  const problems: BasketProblem[] = [];
  const lines: PricedLine[] = [];

  if (input.length === 0) problems.push({ code: 'empty', message: 'Your basket is empty.' });
  if (input.length > MAX_BASKET_LINES) {
    problems.push({ code: 'too_many_lines', message: 'There are too many lines in this basket.' });
  }

  input.slice(0, MAX_BASKET_LINES).forEach((line, lineIndex) => {
    const fail = (code: BasketProblemCode, message: string) => {
      problems.push({ code, message, lineIndex });
    };

    const category = menu.categories.find((c) => c.items.some((i) => i.id === line.itemId));
    const item = category?.items.find((i) => i.id === line.itemId);
    if (!category || !item) {
      return fail('item_unavailable', 'An item in your basket is no longer on the menu.');
    }
    if (item.soldOut) return fail('item_sold_out', `${item.name} is sold out.`);

    const variant = item.variants.find((v) => v.id === line.variantId);
    if (!variant) return fail('size_unavailable', `That size of ${item.name} is not available.`);

    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_LINE_QUANTITY
    ) {
      return fail('quantity_invalid', `Choose between 1 and ${MAX_LINE_QUANTITY} of ${item.name}.`);
    }

    const options: PricedOption[] = [];
    const seenGroups = new Set<string>();
    for (const selection of line.selections) {
      if (seenGroups.has(selection.groupId)) {
        return fail('selection_invalid', `The choices for ${item.name} are not valid.`);
      }
      seenGroups.add(selection.groupId);
    }

    // Any selection for a group this item does not offer is an error, not ignored.
    const offered = new Set(item.optionGroups.map((g) => g.groupId));
    if (line.selections.some((s) => !offered.has(s.groupId) && s.optionIds.length > 0)) {
      return fail('option_unavailable', `A choice for ${item.name} is no longer available.`);
    }

    for (const ref of item.optionGroups) {
      const group = menu.optionGroups.find((g) => g.id === ref.groupId);
      const chosenIds = line.selections.find((s) => s.groupId === ref.groupId)?.optionIds ?? [];
      if (!group) {
        if (chosenIds.length > 0) {
          return fail('option_unavailable', `A choice for ${item.name} is no longer available.`);
        }
        continue;
      }
      if (new Set(chosenIds).size !== chosenIds.length) {
        return fail('selection_invalid', `The choices for ${item.name} are not valid.`);
      }
      const chosen = [];
      for (const id of chosenIds) {
        const option = group.options.find((o) => o.id === id);
        if (!option) {
          return fail('option_unavailable', `A choice for ${item.name} is no longer available.`);
        }
        if (option.soldOut) return fail('option_sold_out', `${option.name} is sold out.`);
        chosen.push(option);
      }
      const maxSelect = ref.maxSelect ?? group.maxSelect;
      if (chosen.length < group.minSelect || (maxSelect !== null && chosen.length > maxSelect)) {
        return fail(
          'selection_invalid',
          `Please check the ${group.name} choices for ${item.name}.`,
        );
      }

      // The cheapest chosen options are the free ones (see priceItem).
      const freeIds = new Set(
        [...chosen]
          .sort((a, b) => optionPrice(a, variant.slug) - optionPrice(b, variant.slug))
          .slice(0, Math.max(0, ref.freeSelect))
          .map((o) => o.id),
      );
      for (const option of chosen) {
        options.push({
          optionId: option.id,
          groupId: group.id,
          groupName: group.name,
          name: option.name,
          pricePence: freeIds.has(option.id) ? 0 : optionPrice(option, variant.slug),
        });
      }
    }

    const unitPricePence = assertPence(variant.pricePence);
    const optionsPence = options.reduce((sum, o) => sum + o.pricePence, 0);
    lines.push({
      lineIndex,
      itemId: item.id,
      itemSlug: item.slug,
      categorySlug: category.slug,
      name: item.name,
      variantId: variant.id,
      variantSlug: variant.slug,
      variantName: variant.name,
      quantity: line.quantity,
      unitPricePence,
      optionsPence,
      lineTotalPence: (unitPricePence + optionsPence) * line.quantity,
      vatRateBp: item.vatRateBp,
      notes: (line.notes ?? '').trim().slice(0, 200),
      allergens: item.allergens,
      allergensConfirmed: item.allergensConfirmed,
      options,
    });
  });

  const subtotalPence = lines.reduce((sum, l) => sum + l.lineTotalPence, 0);

  let deliveryFeePence = 0;
  if (context.fulfilment === 'delivery') {
    if (context.zone === null) {
      problems.push({
        code: 'no_delivery_zone',
        message: 'Sorry, we do not deliver to that postcode. You can still order for collection.',
      });
    } else if (context.zone === undefined) {
      problems.push({ code: 'postcode_needed', message: 'Enter your postcode to check delivery.' });
    } else {
      deliveryFeePence = assertPence(context.zone.feePence);
      if (lines.length > 0 && subtotalPence < context.zone.minOrderPence) {
        problems.push({
          code: 'below_minimum',
          message: `The minimum order for delivery is £${(context.zone.minOrderPence / 100).toFixed(2)}.`,
        });
      }
    }
  }

  // Tips are for delivery only.
  let tipPence = 0;
  if (context.fulfilment === 'delivery') {
    if (
      !Number.isInteger(context.tipPence) ||
      context.tipPence < 0 ||
      context.tipPence > MAX_TIP_PENCE
    ) {
      problems.push({ code: 'tip_invalid', message: 'That tip amount is not valid.' });
    } else {
      tipPence = context.tipPence;
    }
  }

  // VAT is worked out per line at its own rate, then delivery. Tips carry no VAT.
  const vatPence =
    lines.reduce((sum, l) => sum + vatIncludedBp(l.lineTotalPence, l.vatRateBp), 0) +
    vatIncludedBp(deliveryFeePence, DELIVERY_VAT_RATE_BP);

  const discountPence = 0; // Promotions arrive in Phase 5.
  return {
    lines,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotalPence,
    discountPence,
    deliveryFeePence,
    tipPence,
    vatPence,
    totalPence: subtotalPence - discountPence + deliveryFeePence + tipPence,
    problems,
    ok: problems.length === 0,
  };
}
