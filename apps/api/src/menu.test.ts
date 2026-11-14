import { describe, expect, it } from 'vitest';
import type { Role } from '@mp/types';
import { adminMenuSchema, menuSchema } from '@mp/validation';
import { createApp } from './app';
import type { Deps } from './deps';
import { assembleAdminMenu, assemblePublicMenu } from './menu-assemble';
import { IDS, NOW, fakeMenuStore, menuRows, variantId } from './menu-fixtures';
import { fakeOrderDeps } from './order-fixtures';

const url = (path: string) => `https://cdn.test/${path}`;

function setup() {
  const menu = fakeMenuStore();
  const deps: Deps = {
    corsOrigins: ['https://shop.test'],
    verifyToken: async (token) => {
      const role = token.startsWith('role:') ? (token.slice(5) as Role) : null;
      return role ? { id: `user-${role}`, email: `${role}@example.test`, role } : null;
    },
    pingDatabase: async () => true,
    menu,
    order: fakeOrderDeps().deps,
    cronSecret: null,
  };
  return { app: createApp(() => deps), menu };
}

const as = (role: string, init: RequestInit = {}) => ({
  ...init,
  headers: { Authorization: `Bearer role:${role}`, 'Content-Type': 'application/json' },
});
const body = (value: unknown) => ({ body: JSON.stringify(value) });

const validItem = {
  categoryId: IDS.pizzas,
  slug: 'new-pizza',
  name: 'New pizza',
  description: 'Tasty',
  isPublished: true,
  soldOutUntil: null,
  allergensConfirmed: false,
  variants: [{ slug: 'small', name: 'Small', pricePence: 999 }],
  optionGroups: [{ groupId: IDS.base, maxSelect: null, freeSelect: 0 }],
  allergens: [{ code: 'milk', mayContain: false }],
  tags: ['vegetarian'],
};

describe('assemblePublicMenu', () => {
  const menu = assemblePublicMenu(menuRows(), NOW, url);

  it('matches the published contract', () => {
    expect(() => menuSchema.parse(menu)).not.toThrow();
  });

  it('leaves out unpublished categories, items and options', () => {
    expect(menu.categories.map((c) => c.slug)).toEqual(['pizzas']);
    expect(menu.categories[0]!.items.map((i) => i.slug)).toEqual(['maidstone-special']);
    expect(menu.optionGroups[0]!.options.map((o) => o.slug)).toEqual(['thin']);
  });

  it('does not expose staff-only fields', () => {
    const item = menu.categories[0]!.items[0]!;
    expect(item).not.toHaveProperty('isPublished');
    expect(item).not.toHaveProperty('soldOutUntil');
    expect(menu.optionGroups[0]!.options[0]).not.toHaveProperty('isPublished');
  });

  it('orders sizes by sort order and carries prices in pence', () => {
    expect(menu.categories[0]!.items[0]!.variants).toEqual([
      { id: variantId(1, 1), slug: 'small', name: '10" Small', pricePence: 1499 },
      { id: variantId(1, 2), slug: 'large', name: '15" Large', pricePence: 1899 },
    ]);
  });

  it('works out sold-out from the timestamp, including "until switched back on"', () => {
    expect(menu.categories[0]!.items[0]!.soldOut).toBe(true);
    expect(menu.optionGroups[0]!.options[0]!.soldOut).toBe(true);
    const later = assemblePublicMenu(menuRows(), new Date('2026-11-14T09:00:00Z'), url);
    expect(later.categories[0]!.items[0]!.soldOut).toBe(false);
    expect(later.optionGroups[0]!.options[0]!.soldOut).toBe(true);
  });

  it('lists allergens in the legal order, with may-contain flags and per-size option prices', () => {
    expect(menu.categories[0]!.items[0]!.allergens).toEqual([
      { code: 'gluten', mayContain: false },
      { code: 'milk', mayContain: false },
    ]);
    expect(menu.optionGroups[0]!.options[0]).toMatchObject({
      prices: { small: 0, large: 50 },
      allergens: [{ code: 'gluten', mayContain: true }],
    });
  });

  it('drops a published item that has no price', () => {
    const rows = menuRows();
    rows.items[0]!.item_variants = [];
    expect(assemblePublicMenu(rows, NOW, url).categories).toEqual([]);
  });
});

describe('assembleAdminMenu', () => {
  const menu = assembleAdminMenu(menuRows(), NOW, url);

  it('matches the admin contract and includes everything', () => {
    expect(() => adminMenuSchema.parse(menu)).not.toThrow();
    expect(menu.categories.map((c) => c.slug)).toEqual(['pizzas', 'hidden']);
    expect(menu.categories[0]!.items.map((i) => i.slug)).toEqual(['maidstone-special', 'draft']);
    expect(menu.optionGroups[0]!.options.map((o) => o.slug)).toEqual(['thin', 'secret']);
  });

  it('builds image URLs from stored paths', () => {
    expect(menu.categories[0]!.items[1]!.imageUrl).toBe('https://cdn.test/draft.jpg');
  });
});

describe('GET /v1/menu', () => {
  it('is public and cacheable', async () => {
    const res = await setup().app.request('/v1/menu');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage=60');
    const menu = menuSchema.parse(await res.json());
    expect(menu.categories[0]!.items).toHaveLength(1);
  });
});

describe('admin menu routes', () => {
  const writes: Array<[string, string, unknown?]> = [
    ['POST', '/v1/admin/menu/items', validItem],
    ['PUT', `/v1/admin/menu/items/${IDS.special}`, validItem],
    ['PATCH', `/v1/admin/menu/items/${IDS.special}/availability`, { isPublished: false }],
    [
      'PATCH',
      `/v1/admin/menu/items/${IDS.special}/image`,
      { imagePath: `items/${IDS.special}/photo-1.gif` },
    ],
    ['DELETE', `/v1/admin/menu/items/${IDS.special}`],
    [
      'PUT',
      `/v1/admin/menu/options/${IDS.thin}`,
      {
        name: 'Thin',
        pricePence: 0,
        isPublished: true,
        soldOutUntil: null,
        prices: { small: 0 },
        allergens: [],
      },
    ],
    ['PATCH', `/v1/admin/menu/categories/${IDS.pizzas}`, { name: 'Pizza' }],
  ];

  it('refuses anonymous, customer and kitchen callers on every route', async () => {
    const { app, menu } = setup();
    for (const [method, path, payload] of [['GET', '/v1/admin/menu'] as const, ...writes]) {
      const init = { method, ...(payload ? body(payload) : {}) };
      expect((await app.request(path, init)).status, `${method} ${path} anon`).toBe(401);
      for (const role of ['customer', 'kitchen']) {
        const res = await app.request(path, as(role, init));
        expect(res.status, `${method} ${path} ${role}`).toBe(403);
      }
    }
    expect(menu.calls).toEqual([]);
  });

  it('lets a manager do everything, acting with their own token', async () => {
    const { app, menu } = setup();
    expect((await app.request('/v1/admin/menu', as('manager'))).status).toBe(200);
    for (const [method, path, payload] of writes) {
      const res = await app.request(
        path,
        as('manager', { method, ...(payload ? body(payload) : {}) }),
      );
      expect(res.status, `${method} ${path}`).toBe(method === 'POST' ? 201 : 200);
    }
    expect(menu.calls.map((c) => c.method)).toEqual([
      'getAdminMenu',
      'saveItem',
      'saveItem',
      'setItemAvailability',
      'setItemImage',
      'deleteItem',
      'saveOption',
      'updateCategory',
    ]);
    expect(new Set(menu.calls.map((c) => c.token))).toEqual(new Set(['role:manager']));
  });

  it('never caches the admin menu', async () => {
    const res = await setup().app.request('/v1/admin/menu', as('admin'));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects invalid items before touching the database', async () => {
    const { app, menu } = setup();
    const bad = [
      { ...validItem, variants: [] },
      { ...validItem, variants: [{ slug: 'small', name: 'Small', pricePence: 9.99 }] },
      { ...validItem, variants: [{ slug: 'small', name: 'Small', pricePence: -1 }] },
      { ...validItem, slug: 'Not A Slug' },
      { ...validItem, name: '   ' },
      { ...validItem, soldOutUntil: 'tomorrow' },
      {
        ...validItem,
        variants: [
          { slug: 'small', name: 'A', pricePence: 1 },
          { slug: 'small', name: 'B', pricePence: 2 },
        ],
      },
    ];
    for (const payload of bad) {
      const res = await app.request(
        '/v1/admin/menu/items',
        as('manager', { method: 'POST', ...body(payload) }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'invalid' } });
    }
    expect(menu.calls).toEqual([]);
  });

  it("only accepts a photo path inside the item's own folder, with an image extension", async () => {
    const { app, menu } = setup();
    const path = `/v1/admin/menu/items/${IDS.special}/image`;
    const bad = [
      `items/${IDS.draft}/photo-1.gif`,
      `items/${IDS.special}/../secret.gif`,
      `items/${IDS.special}/photo.svg`,
      `items/${IDS.special}/photo.gif?x=1`,
      'https://evil.test/a.gif',
    ];
    for (const imagePath of bad) {
      const res = await app.request(
        path,
        as('manager', { method: 'PATCH', ...body({ imagePath }) }),
      );
      expect(res.status, imagePath).toBe(400);
    }
    expect(menu.calls).toEqual([]);
    const cleared = await app.request(
      path,
      as('manager', { method: 'PATCH', ...body({ imagePath: null }) }),
    );
    expect(cleared.status).toBe(200);
    expect(menu.calls.at(-1)!.args).toEqual([IDS.special, null]);
  });

  it('rejects a malformed id', async () => {
    const res = await setup().app.request(
      '/v1/admin/menu/items/not-a-uuid',
      as('manager', { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
  });

  it('maps not-found and conflict from the store', async () => {
    const { app } = setup();
    const missing = await app.request(
      `/v1/admin/menu/items/${IDS.missing}`,
      as('manager', { method: 'PUT', ...body(validItem) }),
    );
    expect(missing.status).toBe(404);
    const conflict = await app.request(
      '/v1/admin/menu/items',
      as('manager', { method: 'POST', ...body({ ...validItem, slug: 'taken' }) }),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'conflict' } });
  });

  it('accepts "sold out until switched back on" and an empty availability change is rejected', async () => {
    const { app, menu } = setup();
    const path = `/v1/admin/menu/items/${IDS.special}/availability`;
    const ok = await app.request(
      path,
      as('manager', { method: 'PATCH', ...body({ soldOutUntil: 'infinity' }) }),
    );
    expect(ok.status).toBe(200);
    expect(menu.calls.at(-1)!.args[1]).toEqual({ soldOutUntil: 'infinity' });
    const empty = await app.request(path, as('manager', { method: 'PATCH', ...body({}) }));
    expect(empty.status).toBe(400);
  });
});
