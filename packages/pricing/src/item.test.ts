import { describe, expect, it } from 'vitest';
import { checkSelection, optionPrice, priceItem, type GroupSelection } from './item';

const topping = (id: string, small = 100, large = 140) => ({
  id,
  pricePence: 0,
  prices: { small, medium: 120, large },
});
const stuffed = { id: 'stuffed', pricePence: 0, prices: { small: 120, medium: 160, large: 200 } };
const thin = { id: 'thin', pricePence: 0, prices: { small: 0, medium: 0, large: 0 } };

const base = (selected: GroupSelection['selected']): GroupSelection => ({
  groupId: 'base',
  minSelect: 1,
  maxSelect: 1,
  freeSelect: 0,
  selected,
});
const toppings = (selected: GroupSelection['selected'], freeSelect = 0, maxSelect = 2) => ({
  groupId: 'toppings',
  minSelect: 0,
  maxSelect,
  freeSelect,
  selected,
});

describe('optionPrice', () => {
  it('uses the price for the chosen size', () => {
    expect(optionPrice(stuffed, 'large')).toBe(200);
    expect(optionPrice(stuffed, 'small')).toBe(120);
  });

  it('falls back to the flat price when the size has no entry', () => {
    expect(optionPrice({ id: 'dip', pricePence: 40, prices: {} }, 'standard')).toBe(40);
  });

  it('rejects a non-integer price', () => {
    expect(() => optionPrice({ id: 'x', pricePence: 0.5, prices: {} }, 'standard')).toThrow();
  });
});

describe('priceItem', () => {
  it('is just the size price with no paid options', () => {
    expect(priceItem({ slug: 'medium', pricePence: 1699 }, [base([thin])])).toEqual({
      basePence: 1699,
      optionsPence: 0,
      totalPence: 1699,
    });
  });

  it('adds a stuffed crust and two extra toppings at the large price', () => {
    const price = priceItem({ slug: 'large', pricePence: 1899 }, [
      base([stuffed]),
      toppings([topping('ham'), topping('bacon')]),
    ]);
    expect(price.optionsPence).toBe(200 + 140 + 140);
    expect(price.totalPence).toBe(1899 + 480);
  });

  it('charges only for selections beyond the free allowance', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => topping(id));
    const price = priceItem({ slug: 'small', pricePence: 1399 }, [toppings(six, 4, 6)]);
    expect(price.optionsPence).toBe(200);
  });

  it('makes the cheapest selections the free ones, whatever the order', () => {
    const cheap = topping('cheap', 50);
    const dear = topping('dear', 300);
    const a = priceItem({ slug: 'small', pricePence: 1000 }, [toppings([cheap, dear], 1)]);
    const b = priceItem({ slug: 'small', pricePence: 1000 }, [toppings([dear, cheap], 1)]);
    expect(a.optionsPence).toBe(300);
    expect(b).toEqual(a);
  });

  it('charges nothing when fewer are chosen than are free', () => {
    expect(
      priceItem({ slug: 'small', pricePence: 1399 }, [toppings([topping('a')], 4, 6)]).optionsPence,
    ).toBe(0);
  });
});

describe('checkSelection', () => {
  it('accepts a valid selection', () => {
    expect(checkSelection([base([thin]), toppings([topping('a')])])).toEqual([]);
  });

  it('reports a missing required choice', () => {
    expect(checkSelection([base([])])).toEqual([{ groupId: 'base', kind: 'too_few', required: 1 }]);
  });

  it('reports too many selections', () => {
    const three = [topping('a'), topping('b'), topping('c')];
    expect(checkSelection([toppings(three)])).toEqual([
      { groupId: 'toppings', kind: 'too_many', allowed: 2 },
    ]);
  });

  it('reports the same option chosen twice', () => {
    expect(checkSelection([toppings([topping('a'), topping('a')])])).toEqual([
      { groupId: 'toppings', kind: 'duplicate' },
    ]);
  });

  it('allows any number when there is no upper limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => topping(String(i)));
    expect(checkSelection([{ ...toppings(many), maxSelect: null }])).toEqual([]);
  });
});
