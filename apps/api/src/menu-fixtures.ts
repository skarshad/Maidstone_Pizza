import type { MenuRows } from './menu-assemble';
import { assembleAdminMenu, assemblePublicMenu } from './menu-assemble';
import { StoreError, type MenuStore } from './menu-store';

// Test data and an in-memory MenuStore. Not used at runtime.

export const IDS = {
  pizzas: '11111111-1111-4111-8111-111111111111',
  hiddenCategory: '11111111-1111-4111-8111-222222222222',
  special: '22222222-2222-4222-8222-111111111111',
  draft: '22222222-2222-4222-8222-222222222222',
  inHidden: '22222222-2222-4222-8222-333333333333',
  base: '33333333-3333-4333-8333-111111111111',
  thin: '44444444-4444-4444-8444-111111111111',
  secret: '44444444-4444-4444-8444-222222222222',
  missing: '99999999-9999-4999-8999-999999999999',
} as const;

export const variantId = (item: number, size: number) =>
  `55555555-5555-4555-8555-0000000000${item}${size}`;

export const NOW = new Date('2026-11-13T18:00:00Z');

export function menuRows(): MenuRows {
  const variants = (n: number) => [
    { id: variantId(n, 2), slug: 'large', name: '15" Large', price_pence: 1899, sort_order: 3 },
    { id: variantId(n, 1), slug: 'small', name: '10" Small', price_pence: 1499, sort_order: 1 },
  ];
  return {
    categories: [
      {
        id: IDS.hiddenCategory,
        slug: 'hidden',
        name: 'Hidden',
        description: '',
        sort_order: 2,
        is_published: false,
      },
      {
        id: IDS.pizzas,
        slug: 'pizzas',
        name: 'Pizzas',
        description: '',
        sort_order: 1,
        is_published: true,
      },
    ],
    items: [
      {
        id: IDS.special,
        category_id: IDS.pizzas,
        slug: 'maidstone-special',
        name: 'Maidstone Special',
        description: 'Ham & Pepperoni',
        image_path: null,
        sort_order: 1,
        is_published: true,
        sold_out_until: '2026-11-13T23:00:00+00:00',
        allergens_confirmed: true,
        item_variants: variants(1),
        item_option_groups: [
          { group_id: IDS.base, sort_order: 1, max_select: null, free_select: 0 },
        ],
        item_allergens: [
          { allergen_code: 'milk', may_contain: false },
          { allergen_code: 'gluten', may_contain: false },
        ],
        item_dietary_tags: [{ tag_code: 'spicy' }],
      },
      {
        id: IDS.draft,
        category_id: IDS.pizzas,
        slug: 'draft',
        name: 'Draft pizza',
        description: '',
        image_path: 'draft.jpg',
        sort_order: 2,
        is_published: false,
        sold_out_until: null,
        allergens_confirmed: false,
        item_variants: variants(2),
        item_option_groups: [],
        item_allergens: [],
        item_dietary_tags: [],
      },
      {
        id: IDS.inHidden,
        category_id: IDS.hiddenCategory,
        slug: 'in-hidden',
        name: 'In hidden category',
        description: '',
        image_path: null,
        sort_order: 1,
        is_published: true,
        sold_out_until: null,
        allergens_confirmed: false,
        item_variants: variants(3),
        item_option_groups: [],
        item_allergens: [],
        item_dietary_tags: [],
      },
    ],
    optionGroups: [
      {
        id: IDS.base,
        slug: 'pizza-base',
        name: 'Base',
        min_select: 1,
        max_select: 1,
        sort_order: 1,
        options: [
          {
            id: IDS.secret,
            slug: 'secret',
            name: 'Secret base',
            price_pence: 0,
            sort_order: 2,
            is_published: false,
            sold_out_until: null,
            option_prices: [],
            option_allergens: [],
          },
          {
            id: IDS.thin,
            slug: 'thin',
            name: 'Thin',
            price_pence: 0,
            sort_order: 1,
            is_published: true,
            sold_out_until: 'infinity',
            option_prices: [
              { variant_slug: 'small', price_pence: 0 },
              { variant_slug: 'large', price_pence: 50 },
            ],
            option_allergens: [{ allergen_code: 'gluten', may_contain: true }],
          },
        ],
      },
    ],
    allergens: [
      { code: 'milk', name: 'Milk', sort_order: 7 },
      { code: 'gluten', name: 'Cereals containing gluten', sort_order: 2 },
    ],
    dietaryTags: [{ code: 'spicy', name: 'Spicy', sort_order: 3 }],
  };
}

export interface FakeMenuStore extends MenuStore {
  calls: Array<{ method: string; token: string; args: unknown[] }>;
}

/** In-memory store. Known ids succeed; IDS.missing is "not found"; slug "taken" conflicts. */
export function fakeMenuStore(): FakeMenuStore {
  const calls: FakeMenuStore['calls'] = [];
  const url = (path: string) => `https://cdn.test/${path}`;
  const mustExist = (id: string) => {
    if (id === IDS.missing) throw new StoreError('not_found', 'Not found.');
  };
  return {
    calls,
    getPublicMenu: async () => assemblePublicMenu(menuRows(), NOW, url),
    getAdminMenu: async (token) => {
      calls.push({ method: 'getAdminMenu', token, args: [] });
      return assembleAdminMenu(menuRows(), NOW, url);
    },
    saveItem: async (token, id, input) => {
      calls.push({ method: 'saveItem', token, args: [id, input] });
      if (id) mustExist(id);
      if (input.slug === 'taken') throw new StoreError('conflict', 'That slug is already in use.');
      return id ?? IDS.draft;
    },
    setItemAvailability: async (token, id, input) => {
      calls.push({ method: 'setItemAvailability', token, args: [id, input] });
      mustExist(id);
    },
    setItemImage: async (token, id, imagePath) => {
      calls.push({ method: 'setItemImage', token, args: [id, imagePath] });
      mustExist(id);
    },
    deleteItem: async (token, id) => {
      calls.push({ method: 'deleteItem', token, args: [id] });
      mustExist(id);
    },
    saveOption: async (token, id, input) => {
      calls.push({ method: 'saveOption', token, args: [id, input] });
      mustExist(id);
    },
    updateCategory: async (token, id, input) => {
      calls.push({ method: 'updateCategory', token, args: [id, input] });
      mustExist(id);
    },
  };
}
