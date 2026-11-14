import { describe, expect, it } from 'vitest';
import type { Menu } from '@mp/validation';
import { priceBasket, vatIncludedBp, type BasketLineInput } from './basket';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SIZES = { small: 100, medium: 120, large: 140 };

function menu(): Menu {
  const topping = (n: number, name: string, soldOut = false) => ({
    id: id(300 + n),
    slug: name.toLowerCase(),
    name,
    soldOut,
    pricePence: 0,
    prices: SIZES,
    allergens: [],
  });
  return {
    categories: [
      {
        id: id(1),
        slug: 'pizzas',
        name: 'Pizzas',
        description: '',
        items: [
          {
            id: id(10),
            slug: 'special',
            name: 'Maidstone Special',
            description: '',
            imageUrl: null,
            tags: [],
            soldOut: false,
            allergensConfirmed: true,
            allergens: [{ code: 'milk', mayContain: false }],
            vatRateBp: 2000,
            variants: [
              { id: id(101), slug: 'small', name: 'Small', pricePence: 1499 },
              { id: id(103), slug: 'large', name: 'Large', pricePence: 1899 },
            ],
            optionGroups: [
              { groupId: id(200), maxSelect: null, freeSelect: 0 },
              { groupId: id(201), maxSelect: 2, freeSelect: 0 },
            ],
          },
          {
            id: id(11),
            slug: 'create-your-own',
            name: 'Create Your Own',
            description: '',
            imageUrl: null,
            tags: [],
            soldOut: false,
            allergensConfirmed: false,
            allergens: [],
            vatRateBp: 2000,
            variants: [{ id: id(111), slug: 'small', name: 'Small', pricePence: 1399 }],
            optionGroups: [
              { groupId: id(200), maxSelect: null, freeSelect: 0 },
              { groupId: id(201), maxSelect: 6, freeSelect: 4 },
            ],
          },
          {
            id: id(12),
            slug: 'gone',
            name: 'Sold Out Pizza',
            description: '',
            imageUrl: null,
            tags: [],
            soldOut: true,
            allergensConfirmed: false,
            allergens: [],
            vatRateBp: 2000,
            variants: [{ id: id(121), slug: 'small', name: 'Small', pricePence: 999 }],
            optionGroups: [],
          },
        ],
      },
      {
        id: id(2),
        slug: 'drinks',
        name: 'Drinks',
        description: '',
        items: [
          {
            id: id(20),
            slug: 'water',
            name: 'Still water',
            description: '',
            imageUrl: null,
            tags: [],
            soldOut: false,
            allergensConfirmed: true,
            allergens: [],
            vatRateBp: 0,
            variants: [{ id: id(201), slug: 'standard', name: 'Standard', pricePence: 99 }],
            optionGroups: [],
          },
        ],
      },
    ],
    optionGroups: [
      {
        id: id(200),
        slug: 'base',
        name: 'Base',
        minSelect: 1,
        maxSelect: 1,
        options: [
          {
            id: id(250),
            slug: 'thin',
            name: 'Thin',
            soldOut: false,
            pricePence: 0,
            prices: { small: 0, large: 0 },
            allergens: [],
          },
          {
            id: id(251),
            slug: 'stuffed',
            name: 'Stuffed crust',
            soldOut: false,
            pricePence: 0,
            prices: { small: 120, large: 200 },
            allergens: [],
          },
        ],
      },
      {
        id: id(201),
        slug: 'toppings',
        name: 'Extra toppings',
        minSelect: 0,
        maxSelect: null,
        options: [
          topping(1, 'Ham'),
          topping(2, 'Bacon'),
          topping(3, 'Tuna'),
          topping(4, 'Onions'),
          topping(5, 'Salami'),
          topping(6, 'Chicken'),
          topping(7, 'Olives', true),
        ],
      },
    ],
    allergens: [{ code: 'milk', name: 'Milk' }],
    dietaryTags: [],
  };
}

const zone = { id: id(900), feePence: 250, minOrderPence: 1200 };
const collection = { fulfilment: 'collection' as const, tipPence: 0 };
const delivery = { fulfilment: 'delivery' as const, zone, tipPence: 0 };

const special = (over: Partial<BasketLineInput> = {}): BasketLineInput => ({
  itemId: id(10),
  variantId: id(103),
  quantity: 1,
  selections: [{ groupId: id(200), optionIds: [id(250)] }],
  ...over,
});
const toppings = (...ns: number[]) => ({ groupId: id(201), optionIds: ns.map((n) => id(300 + n)) });

describe('vatIncludedBp', () => {
  it('extracts VAT from a VAT-inclusive amount', () => {
    expect(vatIncludedBp(1200, 2000)).toBe(200);
    expect(vatIncludedBp(1899, 2000)).toBe(317); // 316.5 rounds up
    expect(vatIncludedBp(999, 0)).toBe(0);
    expect(vatIncludedBp(1050, 500)).toBe(50);
  });
});

describe('priceBasket', () => {
  it('prices a simple collection order', () => {
    const priced = priceBasket([special()], menu(), collection);
    expect(priced.ok).toBe(true);
    expect(priced).toMatchObject({
      itemCount: 1,
      subtotalPence: 1899,
      deliveryFeePence: 0,
      tipPence: 0,
      totalPence: 1899,
      vatPence: 317,
    });
    expect(priced.lines[0]).toMatchObject({
      name: 'Maidstone Special',
      variantName: 'Large',
      unitPricePence: 1899,
      optionsPence: 0,
      allergens: [{ code: 'milk', mayContain: false }],
      allergensConfirmed: true,
    });
  });

  it('charges options at the price for the chosen size, times the quantity', () => {
    const line = special({
      quantity: 2,
      selections: [{ groupId: id(200), optionIds: [id(251)] }, toppings(1, 2)],
    });
    const priced = priceBasket([line], menu(), collection);
    expect(priced.lines[0]!.optionsPence).toBe(200 + 140 + 140);
    expect(priced.lines[0]!.lineTotalPence).toBe((1899 + 480) * 2);
    expect(priced.totalPence).toBe(4758);
  });

  it('adds the delivery fee and tip, and VAT on food and delivery but not the tip', () => {
    const priced = priceBasket([special()], menu(), { ...delivery, tipPence: 200 });
    expect(priced).toMatchObject({
      subtotalPence: 1899,
      deliveryFeePence: 250,
      tipPence: 200,
      totalPence: 2349,
      vatPence: 317 + 42,
      ok: true,
    });
  });

  it('never charges a tip on collection', () => {
    const priced = priceBasket([special()], menu(), { fulfilment: 'collection', tipPence: 500 });
    expect(priced.tipPence).toBe(0);
    expect(priced.totalPence).toBe(1899);
  });

  it('applies each line its own VAT rate', () => {
    const water = { itemId: id(20), variantId: id(201), quantity: 3, selections: [] };
    const priced = priceBasket([special(), water], menu(), collection);
    expect(priced.subtotalPence).toBe(1899 + 297);
    expect(priced.vatPence).toBe(317);
  });

  it('includes the free allowance and charges only the extras', () => {
    const line = {
      itemId: id(11),
      variantId: id(111),
      quantity: 1,
      selections: [{ groupId: id(200), optionIds: [id(250)] }, toppings(1, 2, 3, 4, 5, 6)],
    };
    const priced = priceBasket([line], menu(), collection);
    expect(priced.ok).toBe(true);
    expect(priced.lines[0]!.optionsPence).toBe(200);
    expect(priced.lines[0]!.options.filter((o) => o.pricePence === 0)).toHaveLength(5); // base + 4 free
  });

  it('blocks delivery below the minimum order', () => {
    const water = { itemId: id(20), variantId: id(201), quantity: 1, selections: [] };
    const priced = priceBasket([water], menu(), delivery);
    expect(priced.ok).toBe(false);
    expect(priced.problems.map((p) => p.code)).toEqual(['below_minimum']);
  });

  it('distinguishes "no postcode yet" from "outside the delivery area"', () => {
    const unknown = priceBasket([special()], menu(), { fulfilment: 'delivery', tipPence: 0 });
    expect(unknown.problems.map((p) => p.code)).toEqual(['postcode_needed']);
    const outside = priceBasket([special()], menu(), {
      fulfilment: 'delivery',
      zone: null,
      tipPence: 0,
    });
    expect(outside.problems.map((p) => p.code)).toEqual(['no_delivery_zone']);
  });

  it.each([
    ['unknown item', special({ itemId: id(999) }), 'item_unavailable'],
    [
      'sold-out item',
      { itemId: id(12), variantId: id(121), quantity: 1, selections: [] },
      'item_sold_out',
    ],
    ['size from another item', special({ variantId: id(111) }), 'size_unavailable'],
    ['zero quantity', special({ quantity: 0 }), 'quantity_invalid'],
    ['fractional quantity', special({ quantity: 1.5 }), 'quantity_invalid'],
    ['huge quantity', special({ quantity: 21 }), 'quantity_invalid'],
    ['missing required base', special({ selections: [] }), 'selection_invalid'],
    [
      'two bases',
      special({ selections: [{ groupId: id(200), optionIds: [id(250), id(251)] }] }),
      'selection_invalid',
    ],
    [
      'too many toppings',
      special({ selections: [{ groupId: id(200), optionIds: [id(250)] }, toppings(1, 2, 3)] }),
      'selection_invalid',
    ],
    [
      'same topping twice',
      special({ selections: [{ groupId: id(200), optionIds: [id(250)] }, toppings(1, 1)] }),
      'selection_invalid',
    ],
    [
      'unknown option',
      special({ selections: [{ groupId: id(200), optionIds: [id(998)] }] }),
      'option_unavailable',
    ],
    [
      'sold-out option',
      special({ selections: [{ groupId: id(200), optionIds: [id(250)] }, toppings(7)] }),
      'option_sold_out',
    ],
    [
      'options on an item that has none',
      { itemId: id(20), variantId: id(201), quantity: 1, selections: [toppings(1)] },
      'option_unavailable',
    ],
  ])('rejects a line with %s and charges nothing for it', (_name, line, code) => {
    const priced = priceBasket([line as BasketLineInput], menu(), collection);
    expect(priced.ok).toBe(false);
    expect(priced.problems).toEqual([expect.objectContaining({ code, lineIndex: 0 })]);
    expect(priced.lines).toEqual([]);
    expect(priced.totalPence).toBe(0);
  });

  it('rejects an empty basket and an invalid tip', () => {
    expect(priceBasket([], menu(), collection).problems.map((p) => p.code)).toEqual(['empty']);
    for (const tipPence of [-1, 1.5, 10_001]) {
      const priced = priceBasket([special()], menu(), { ...delivery, tipPence });
      expect(priced.problems.map((p) => p.code)).toEqual(['tip_invalid']);
      expect(priced.tipPence).toBe(0);
    }
  });

  it('always satisfies total = subtotal - discount + delivery + tip, in whole pence', () => {
    const priced = priceBasket(
      [
        special({
          quantity: 3,
          selections: [{ groupId: id(200), optionIds: [id(251)] }, toppings(2)],
        }),
      ],
      menu(),
      { ...delivery, tipPence: 150 },
    );
    expect(priced.totalPence).toBe(
      priced.subtotalPence - priced.discountPence + priced.deliveryFeePence + priced.tipPence,
    );
    for (const value of [priced.subtotalPence, priced.vatPence, priced.totalPence]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
