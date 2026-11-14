import { describe, expect, it } from 'vitest';
import {
  promotionRulesSchema,
  type Promotion,
  type PromotionConditions,
  type PromotionReward,
} from '@mp/validation';
import {
  allocate,
  evaluatePromotions,
  isScheduledNow,
  localClock,
  type PromoLine,
  type PromotionContext,
} from './promotions';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PIZZAS = id(1);
const SIDES = id(2);
const DRINKS = id(3);

/** Saturday 14 November 2026, 6pm in London. */
const NOW = new Date('2026-11-14T18:00:00Z');

let nextLine = 0;
function line(over: Partial<PromoLine> & { price: number }): PromoLine {
  const { price, ...rest } = over;
  return {
    lineIndex: nextLine++,
    itemId: id(100 + nextLine),
    categoryId: PIZZAS,
    variantSlug: 'medium',
    quantity: 1,
    unitPricePence: price,
    optionsPence: 0,
    ...rest,
  };
}
const basket = (...lines: PromoLine[]) => {
  nextLine = 0;
  return lines.map((l, lineIndex) => ({ ...l, lineIndex }));
};

let nextPromo = 0;
function promo(
  reward: PromotionReward,
  over: Partial<Omit<Promotion, 'rules'>> & { conditions?: Partial<PromotionConditions> } = {},
): Promotion {
  const { conditions, ...rest } = over;
  nextPromo++;
  return {
    id: id(900 + nextPromo),
    name: `Promo ${nextPromo}`,
    description: '',
    priority: 0,
    stackingGroup: 'default',
    exclusive: false,
    autoApply: true,
    banner: { show: false, headline: '', body: '' },
    rules: promotionRulesSchema.parse({ conditions: conditions ?? {}, reward, usage: {} }),
    ...rest,
  };
}

const ctx = (over: Partial<PromotionContext> = {}): PromotionContext => ({
  now: NOW,
  timezone: 'Europe/London',
  fulfilment: 'collection',
  channel: 'web',
  deliveryFeePence: 0,
  ...over,
});

const order = { kind: 'order' as const };
const pizzas = { kind: 'categories' as const, categoryIds: [PIZZAS] };
const sides = { kind: 'categories' as const, categoryIds: [SIDES] };
const run = (lines: PromoLine[], promotions: Promotion[], context = ctx()) =>
  evaluatePromotions(lines, promotions, context);
const discounts = (result: ReturnType<typeof run>) => Object.fromEntries(result.lineDiscounts);

describe('allocate', () => {
  it('splits exactly, in whole pence', () => {
    expect(allocate(100, [500, 500, 500])).toEqual([34, 33, 33]);
    // A share never exceeds its own weight: an item cannot be discounted below zero.
    expect(allocate(100, [1, 1, 1])).toEqual([1, 1, 1]);
    expect(allocate(1, [500, 500])).toEqual([1, 0]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(10, [])).toEqual([]);
    for (const [total, weights] of [
      [333, [1499, 1699, 99]],
      [1, [1, 1, 1, 1]],
      [2500, [1899, 1899, 449, 449, 99]],
    ] as const) {
      const shares = allocate(total, [...weights]);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      shares.forEach((share, i) => expect(share).toBeLessThanOrEqual(weights[i]!));
    }
  });
});

describe('percentage and amount off', () => {
  it('takes a percentage off the whole order', () => {
    const result = run(basket(line({ price: 1499 }), line({ price: 449, categoryId: SIDES })), [
      promo({ type: 'percent_off', percent: 10, scope: order, maxDiscountPence: null }),
    ]);
    expect(result.discountPence).toBe(195); // 10% of 19.48
    expect(Object.values(discounts(result)).reduce((a, b) => a + b, 0)).toBe(195);
  });

  it('limits a percentage to a category and respects a cap', () => {
    const lines = basket(line({ price: 2000 }), line({ price: 1000, categoryId: SIDES }));
    const scoped = run(lines, [
      promo({ type: 'percent_off', percent: 50, scope: pizzas, maxDiscountPence: null }),
    ]);
    expect(discounts(scoped)).toEqual({ 0: 1000 });
    const capped = run(lines, [
      promo({ type: 'percent_off', percent: 50, scope: pizzas, maxDiscountPence: 300 }),
    ]);
    expect(capped.discountPence).toBe(300);
  });

  it('includes extra toppings in a percentage, and multiplies by quantity', () => {
    const result = run(basket(line({ price: 1000, optionsPence: 200, quantity: 3 })), [
      promo({ type: 'percent_off', percent: 50, scope: order, maxDiscountPence: null }),
    ]);
    expect(result.discountPence).toBe(1800);
  });

  it('takes a fixed amount off, never more than the items cost', () => {
    const lines = basket(line({ price: 300, categoryId: SIDES }), line({ price: 1500 }));
    expect(
      run(lines, [promo({ type: 'amount_off', amountPence: 500, scope: order })]).discountPence,
    ).toBe(500);
    const overSides = run(lines, [promo({ type: 'amount_off', amountPence: 500, scope: sides })]);
    expect(overSides.discountPence).toBe(300);
    expect(discounts(overSides)).toEqual({ 0: 300 });
  });

  it('applies item-specific offers only to those items', () => {
    const lines = basket(
      line({ price: 1000, itemId: id(50) }),
      line({ price: 1000, itemId: id(51) }),
    );
    const result = run(lines, [
      promo({ type: 'amount_off', amountPence: 200, scope: { kind: 'items', itemIds: [id(51)] } }),
    ]);
    expect(discounts(result)).toEqual({ 1: 200 });
  });
});

describe('buy X get Y', () => {
  const bogof = promo({ type: 'buy_x_get_y', buy: 1, get: 1, discountPercent: 100, scope: pizzas });

  it('makes the cheaper of two free', () => {
    const result = run(basket(line({ price: 1899 }), line({ price: 1499 })), [bogof]);
    expect(discounts(result)).toEqual({ 1: 1499 });
  });

  it('does nothing with only one, and pairs up four as dear-with-dear', () => {
    expect(run(basket(line({ price: 1899 })), [bogof]).discountPence).toBe(0);
    const four = run(
      basket(
        line({ price: 2000 }),
        line({ price: 1800 }),
        line({ price: 1200 }),
        line({ price: 1000 }),
      ),
      [bogof],
    );
    // Sorted dearest first, in pairs: (2000, 1800) and (1200, 1000).
    expect(four.discountPence).toBe(1800 + 1000);
  });

  it('leaves the odd one out at full price, and ignores other categories', () => {
    const result = run(
      basket(line({ price: 1500, quantity: 3 }), line({ price: 400, categoryId: SIDES })),
      [bogof],
    );
    expect(result.discountPence).toBe(1500);
  });

  it('supports "3 for 2" and "second one half price"', () => {
    const threeForTwo = promo({
      type: 'buy_x_get_y',
      buy: 2,
      get: 1,
      discountPercent: 100,
      scope: pizzas,
    });
    expect(run(basket(line({ price: 1000, quantity: 3 })), [threeForTwo]).discountPence).toBe(1000);
    const halfPrice = promo({
      type: 'buy_x_get_y',
      buy: 1,
      get: 1,
      discountPercent: 50,
      scope: pizzas,
    });
    expect(
      run(basket(line({ price: 1500 }), line({ price: 1001 })), [halfPrice]).discountPence,
    ).toBe(501);
  });
});

describe('fixed-price bundles', () => {
  const deal = promo({
    type: 'bundle_price',
    pricePence: 2500,
    slots: [
      { label: 'Pizzas', scope: pizzas, quantity: 2, variantSlugs: [] },
      { label: 'Sides', scope: sides, quantity: 2, variantSlugs: [] },
    ],
  });

  it('charges the bundle price for a complete set', () => {
    const lines = basket(
      line({ price: 1699 }),
      line({ price: 1499 }),
      line({ price: 449, categoryId: SIDES }),
      line({ price: 349, categoryId: SIDES }),
    );
    const result = run(lines, [deal]);
    expect(result.discountPence).toBe(1699 + 1499 + 449 + 349 - 2500);
  });

  it('does not apply to an incomplete set', () => {
    const lines = basket(
      line({ price: 1699 }),
      line({ price: 1499 }),
      line({ price: 449, categoryId: SIDES }),
    );
    expect(run(lines, [deal]).discountPence).toBe(0);
  });

  it('never makes the basket dearer than the menu price', () => {
    const lines = basket(
      line({ price: 500 }),
      line({ price: 500 }),
      line({ price: 100, categoryId: SIDES }),
      line({ price: 100, categoryId: SIDES }),
    );
    expect(run(lines, [deal]).discountPence).toBe(0);
  });

  it('still charges extra toppings on bundled items', () => {
    const lines = basket(
      line({ price: 1699, optionsPence: 400 }),
      line({ price: 1499 }),
      line({ price: 449, categoryId: SIDES }),
      line({ price: 349, categoryId: SIDES }),
    );
    // Same saving as without toppings: the toppings are not part of the deal.
    expect(run(lines, [deal]).discountPence).toBe(1496);
  });

  it('applies twice when there are two full sets, using the dearest items first', () => {
    const lines = basket(
      line({ price: 1800, quantity: 4 }),
      line({ price: 400, categoryId: SIDES, quantity: 4 }),
      line({ price: 1000 }),
    );
    const result = run(lines, [deal]);
    expect(result.discountPence).toBe(2 * (2 * 1800 + 2 * 400 - 2500));
    expect(discounts(result)[2]).toBeUndefined(); // the fifth, cheaper pizza is not in a set
  });

  it('can require a size', () => {
    const mediums = promo({
      type: 'bundle_price',
      pricePence: 2000,
      slots: [{ label: 'Medium pizzas', scope: pizzas, quantity: 2, variantSlugs: ['medium'] }],
    });
    const mixed = basket(line({ price: 1699 }), line({ price: 1899, variantSlug: 'large' }));
    expect(run(mixed, [mediums]).discountPence).toBe(0);
    const twoMedium = basket(line({ price: 1699 }), line({ price: 1699 }));
    expect(run(twoMedium, [mediums]).discountPence).toBe(1398);
  });
});

describe('free item and free delivery', () => {
  it('makes the cheapest matching item free once the spend is reached', () => {
    const freeSide = promo(
      { type: 'free_item', scope: sides, quantity: 1 },
      { conditions: { minSubtotalPence: 2000 } },
    );
    const enough = basket(
      line({ price: 1899 }),
      line({ price: 449, categoryId: SIDES }),
      line({ price: 299, categoryId: SIDES }),
    );
    expect(discounts(run(enough, [freeSide]))).toEqual({ 2: 299 });
    const notEnough = basket(line({ price: 999 }), line({ price: 299, categoryId: SIDES }));
    expect(run(notEnough, [freeSide]).discountPence).toBe(0);
  });

  it('gives free delivery only on delivery orders that have a fee', () => {
    const free = promo({ type: 'free_delivery' }, { conditions: { minSubtotalPence: 2500 } });
    const lines = basket(line({ price: 3000 }));
    const delivered = run(lines, [free], ctx({ fulfilment: 'delivery', deliveryFeePence: 250 }));
    expect(delivered).toMatchObject({ freeDelivery: true, discountPence: 0 });
    expect(delivered.applied[0]).toMatchObject({ freeDelivery: true, discountPence: 0 });
    expect(run(lines, [free]).applied).toEqual([]);
    expect(
      run(
        basket(line({ price: 2000 })),
        [free],
        ctx({ fulfilment: 'delivery', deliveryFeePence: 250 }),
      ).freeDelivery,
    ).toBe(false);
  });
});

describe('who and when', () => {
  const tenOff = (conditions: Partial<PromotionConditions>, over = {}) =>
    promo(
      { type: 'percent_off', percent: 10, scope: order, maxDiscountPence: null },
      { conditions, ...over },
    );
  const lines = () => basket(line({ price: 2000 }));
  const applies = (p: Promotion, context = ctx()) =>
    run(lines(), [p], context).discountPence === 200;

  it('respects start and end dates', () => {
    expect(applies(tenOff({ startsAt: '2026-11-15T00:00:00Z' }))).toBe(false);
    expect(
      applies(tenOff({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z' })),
    ).toBe(true);
    expect(applies(tenOff({ endsAt: '2026-11-14T18:00:00Z' }))).toBe(false); // ends exactly now
  });

  it('respects the day of the week in shop time', () => {
    expect(applies(tenOff({ daysOfWeek: [6] }))).toBe(true); // Saturday
    expect(applies(tenOff({ daysOfWeek: [2] }))).toBe(false); // "Tuesday 2-for-1"
  });

  it('respects a daily time window', () => {
    expect(applies(tenOff({ timeFrom: '16:00', timeTo: '18:00' }))).toBe(false); // ends at 6pm
    expect(applies(tenOff({ timeFrom: '16:00', timeTo: '18:01' }))).toBe(true);
    expect(applies(tenOff({ timeFrom: '18:00', timeTo: '20:00' }))).toBe(true);
  });

  it('uses shop time in summer, not UTC', () => {
    const happyHour = tenOff({ timeFrom: '16:00', timeTo: '18:00' });
    // 15:30 UTC is 16:30 in London in July.
    expect(isScheduledNow(happyHour, new Date('2026-07-14T15:30:00Z'), 'Europe/London')).toBe(true);
    expect(isScheduledNow(happyHour, new Date('2026-07-14T17:30:00Z'), 'Europe/London')).toBe(
      false,
    );
    expect(localClock(new Date('2026-07-14T23:30:00Z'), 'Europe/London')).toEqual({
      weekday: 3,
      minutes: 30,
    });
  });

  it('treats the small hours of a late window as the evening before', () => {
    const fridayLate = tenOff({ daysOfWeek: [5], timeFrom: '22:00', timeTo: '02:00' });
    const at = (iso: string) => isScheduledNow(fridayLate, new Date(iso), 'Europe/London');
    expect(at('2026-11-13T23:00:00Z')).toBe(true); // Friday 11pm
    expect(at('2026-11-14T01:00:00Z')).toBe(true); // Saturday 1am, still Friday's window
    expect(at('2026-11-14T03:00:00Z')).toBe(false);
    expect(at('2026-11-14T23:00:00Z')).toBe(false); // Saturday 11pm
  });

  it('respects fulfilment, channel and minimum spend', () => {
    expect(applies(tenOff({ fulfilment: 'delivery' }))).toBe(false);
    expect(applies(tenOff({ fulfilment: 'collection' }))).toBe(true);
    expect(applies(tenOff({ channels: ['app'] }))).toBe(false);
    expect(applies(tenOff({ channels: ['web', 'app'] }))).toBe(true);
    expect(applies(tenOff({ minSubtotalPence: 2001 }))).toBe(false);
    expect(applies(tenOff({ minSubtotalPence: 2000 }))).toBe(true);
  });

  it('gives first-order and returning offers only when the server confirms the customer', () => {
    const first = tenOff({ customer: 'first_order' });
    const returning = tenOff({ customer: 'returning' });
    expect(applies(first)).toBe(false); // unknown in the browser preview
    expect(applies(first, ctx({ customer: { isFirstOrder: true } }))).toBe(true);
    expect(applies(first, ctx({ customer: { isFirstOrder: false } }))).toBe(false);
    expect(applies(returning, ctx({ customer: { isFirstOrder: false } }))).toBe(true);
    expect(applies(returning, ctx({ customer: { isFirstOrder: true } }))).toBe(false);
  });

  it('needs the right code for a code-only offer', () => {
    const coded = tenOff({}, { autoApply: false });
    expect(applies(coded)).toBe(false);
    expect(applies(coded, ctx({ unlockedByCode: { promotionId: id(1), code: 'OTHER' } }))).toBe(
      false,
    );
    const result = run(
      lines(),
      [coded],
      ctx({ unlockedByCode: { promotionId: coded.id, code: 'PIZZA10' } }),
    );
    expect(result.applied[0]).toMatchObject({ discountPence: 200, code: 'PIZZA10' });
  });

  it('skips a promotion that has reached its usage limit', () => {
    const p = tenOff({});
    expect(applies(p, ctx({ exhausted: new Set([p.id]) }))).toBe(false);
  });
});

describe('stacking, priority and exclusivity', () => {
  const pct = (percent: number, over = {}) =>
    promo({ type: 'percent_off', percent, scope: order, maxDiscountPence: null }, over);
  const lines = () => basket(line({ price: 1000 }), line({ price: 1000 }));

  it('applies only one promotion per stacking group: the higher priority', () => {
    const result = run(lines(), [
      pct(10, { name: 'Ten' }),
      pct(50, { name: 'Fifty', priority: 5 }),
    ]);
    expect(result.applied.map((a) => a.name)).toEqual(['Fifty']);
    expect(result.discountPence).toBe(1000);
  });

  it('between equal priorities, applies the one worth more to the customer', () => {
    const result = run(lines(), [pct(10, { name: 'Ten' }), pct(25, { name: 'Twenty-five' })]);
    expect(result.applied.map((a) => a.name)).toEqual(['Twenty-five']);
  });

  it('gives the same answer whatever order the promotions arrive in', () => {
    const a = pct(10, { name: 'A' });
    const b = pct(10, { name: 'B' });
    expect(run(lines(), [a, b]).applied[0]!.name).toBe(run(lines(), [b, a]).applied[0]!.name);
  });

  it('combines promotions in different groups, the second on what is left', () => {
    const result = run(lines(), [
      pct(50, { name: 'Half', priority: 2, stackingGroup: 'a' }),
      pct(10, { name: 'Ten', priority: 1, stackingGroup: 'b' }),
    ]);
    expect(result.applied.map((a) => [a.name, a.discountPence])).toEqual([
      ['Half', 1000],
      ['Ten', 100], // 10% of the remaining £10, not of £20
    ]);
  });

  it('does not let two item-level offers use the same item', () => {
    const bogof = promo(
      { type: 'buy_x_get_y', buy: 1, get: 1, discountPercent: 100, scope: pizzas },
      { priority: 2, stackingGroup: 'a' },
    );
    const freePizza = promo(
      { type: 'free_item', scope: pizzas, quantity: 1 },
      { priority: 1, stackingGroup: 'b' },
    );
    const result = run(lines(), [bogof, freePizza]);
    expect(result.applied).toHaveLength(1);
    expect(result.discountPence).toBe(1000);
  });

  it('lets an exclusive promotion apply only alone', () => {
    const exclusiveFirst = run(lines(), [
      pct(20, { name: 'Exclusive', priority: 9, exclusive: true, stackingGroup: 'a' }),
      pct(10, { name: 'Other', stackingGroup: 'b' }),
    ]);
    expect(exclusiveFirst.applied.map((a) => a.name)).toEqual(['Exclusive']);

    const exclusiveLater = run(lines(), [
      pct(10, { name: 'Other', priority: 9, stackingGroup: 'b' }),
      pct(20, { name: 'Exclusive', exclusive: true, stackingGroup: 'a' }),
    ]);
    expect(exclusiveLater.applied.map((a) => a.name)).toEqual(['Other']);
  });

  it('skips a higher-priority promotion that gives nothing on this basket', () => {
    const noPizzas = basket(line({ price: 500, categoryId: DRINKS }));
    const result = run(noPizzas, [
      promo(
        { type: 'buy_x_get_y', buy: 1, get: 1, discountPercent: 100, scope: pizzas },
        { priority: 9, exclusive: true },
      ),
      pct(10, { name: 'Ten' }),
    ]);
    expect(result.applied.map((a) => a.name)).toEqual(['Ten']);
  });

  it('never discounts below zero, however promotions are combined', () => {
    const greedy = Array.from({ length: 5 }, (_, i) =>
      promo({ type: 'amount_off', amountPence: 5000, scope: order }, { stackingGroup: `g${i}` }),
    );
    const result = run(lines(), [...greedy, pct(100, { stackingGroup: 'z' })]);
    expect(result.discountPence).toBe(2000);
    for (const [, off] of result.lineDiscounts) expect(off).toBeLessThanOrEqual(1000);
  });

  it('returns nothing for an empty basket or no promotions', () => {
    expect(run([], [pct(10)])).toMatchObject({
      discountPence: 0,
      applied: [],
      freeDelivery: false,
    });
    expect(run(lines(), []).discountPence).toBe(0);
  });
});
