import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminMenu,
  CategoryPatchInput,
  ItemAvailabilityInput,
  Menu,
  SaveMenuItemInput,
  SaveMenuOptionInput,
} from '@mp/validation';
import { assembleAdminMenu, assemblePublicMenu, type MenuRows } from './menu-assemble';

/** A failure the caller caused or can act on. Anything else is a 500. */
export class StoreError extends Error {
  readonly code: 'not_found' | 'conflict' | 'invalid' | 'forbidden';

  constructor(code: StoreError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Menu reads and writes. Staff methods take the caller's own access token and
 * run as that user, so RLS is enforced by the database as well as by the API's
 * role gate, and the audit log records who made each change.
 */
export interface MenuStore {
  getPublicMenu(): Promise<Menu>;
  getAdminMenu(token: string): Promise<AdminMenu>;
  /** Creates when `id` is null. Returns the item id. */
  saveItem(token: string, id: string | null, input: SaveMenuItemInput): Promise<string>;
  setItemAvailability(token: string, id: string, input: ItemAvailabilityInput): Promise<void>;
  /** Sets or clears (null) the path of the item photo in the menu bucket. */
  setItemImage(token: string, id: string, imagePath: string | null): Promise<void>;
  deleteItem(token: string, id: string): Promise<void>;
  saveOption(token: string, id: string, input: SaveMenuOptionInput): Promise<void>;
  updateCategory(token: string, id: string, input: CategoryPatchInput): Promise<void>;
}

const ITEM_COLUMNS =
  'id, category_id, slug, name, description, image_path, sort_order, is_published, sold_out_until, allergens_confirmed, vat_rate_bp, ' +
  'item_variants(id, slug, name, price_pence, sort_order), ' +
  'item_option_groups(group_id, sort_order, max_select, free_select), ' +
  'item_allergens(allergen_code, may_contain), ' +
  'item_dietary_tags(tag_code)';
const GROUP_COLUMNS =
  'id, slug, name, min_select, max_select, sort_order, ' +
  'options(id, slug, name, price_pence, sort_order, is_published, sold_out_until, ' +
  'option_prices(variant_slug, price_pence), option_allergens(allergen_code, may_contain))';

interface PgError {
  code?: string;
  message: string;
}

function toStoreError(error: PgError): Error {
  switch (error.code) {
    case '23505':
      return new StoreError('conflict', 'That web address name (slug) is already in use.');
    case '23503':
      return new StoreError('invalid', 'That refers to something that does not exist.');
    case '23514':
    case '22023':
    case '22P02':
    case '23502':
      return new StoreError('invalid', 'Some of the details are not valid.');
    case 'P0002':
      return new StoreError('not_found', 'Not found.');
    case '42501':
      return new StoreError('forbidden', 'You do not have access to this.');
    default:
      return new Error(`database error ${error.code ?? ''}: ${error.message}`);
  }
}

async function loadRows(db: SupabaseClient): Promise<MenuRows> {
  const [categories, items, optionGroups, allergens, dietaryTags] = await Promise.all([
    db.from('categories').select('id, slug, name, description, sort_order, is_published'),
    db.from('menu_items').select(ITEM_COLUMNS),
    db.from('option_groups').select(GROUP_COLUMNS),
    db.from('allergens').select('code, name, sort_order'),
    db.from('dietary_tags').select('code, name, sort_order'),
  ]);
  for (const result of [categories, items, optionGroups, allergens, dietaryTags]) {
    if (result.error) throw toStoreError(result.error);
  }
  return {
    categories: categories.data,
    items: items.data,
    optionGroups: optionGroups.data,
    allergens: allergens.data,
    dietaryTags: dietaryTags.data,
  } as unknown as MenuRows;
}

export function createMenuStore(config: {
  supabaseUrl: string;
  publishableKey: string;
  /** Anonymous client: sees exactly what a signed-out visitor may see. */
  anon: SupabaseClient;
}): MenuStore {
  const imageUrl = (path: string) =>
    `${config.supabaseUrl}/storage/v1/object/public/menu/${path.replace(/^\/+/, '')}`;

  /** A client that acts as the signed-in member of staff. */
  const asUser = (token: string) =>
    createClient(config.supabaseUrl, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

  return {
    async getPublicMenu() {
      return assemblePublicMenu(await loadRows(config.anon), new Date(), imageUrl);
    },

    async getAdminMenu(token) {
      return assembleAdminMenu(await loadRows(asUser(token)), new Date(), imageUrl);
    },

    async saveItem(token, id, input) {
      const { data, error } = await asUser(token).rpc('save_menu_item', {
        p: {
          id,
          category_id: input.categoryId,
          slug: input.slug,
          name: input.name,
          description: input.description,
          sort_order: input.sortOrder ?? null,
          is_published: input.isPublished,
          sold_out_until: input.soldOutUntil,
          allergens_confirmed: input.allergensConfirmed,
          variants: input.variants.map((v) => ({
            slug: v.slug,
            name: v.name,
            price_pence: v.pricePence,
          })),
          option_groups: input.optionGroups.map((g) => ({
            group_id: g.groupId,
            max_select: g.maxSelect,
            free_select: g.freeSelect,
          })),
          allergens: input.allergens.map((a) => ({ code: a.code, may_contain: a.mayContain })),
          tags: input.tags,
        },
      });
      if (error) throw toStoreError(error);
      return data as string;
    },

    async setItemAvailability(token, id, input) {
      const patch: Record<string, unknown> = {};
      if (input.isPublished !== undefined) patch.is_published = input.isPublished;
      if (input.soldOutUntil !== undefined) patch.sold_out_until = input.soldOutUntil;
      const { data, error } = await asUser(token)
        .from('menu_items')
        .update(patch)
        .eq('id', id)
        .select('id');
      if (error) throw toStoreError(error);
      if (!data?.length) throw new StoreError('not_found', 'Not found.');
    },

    async setItemImage(token, id, imagePath) {
      const { data, error } = await asUser(token)
        .from('menu_items')
        .update({ image_path: imagePath })
        .eq('id', id)
        .select('id');
      if (error) throw toStoreError(error);
      if (!data?.length) throw new StoreError('not_found', 'Not found.');
    },

    async deleteItem(token, id) {
      const { data, error } = await asUser(token)
        .from('menu_items')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw toStoreError(error);
      if (!data?.length) throw new StoreError('not_found', 'Not found.');
    },

    async saveOption(token, id, input) {
      const { error } = await asUser(token).rpc('save_menu_option', {
        p: {
          id,
          name: input.name,
          price_pence: input.pricePence,
          is_published: input.isPublished,
          sold_out_until: input.soldOutUntil,
          prices: input.prices,
          allergens: input.allergens.map((a) => ({ code: a.code, may_contain: a.mayContain })),
        },
      });
      if (error) throw toStoreError(error);
    },

    async updateCategory(token, id, input) {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
      if (input.isPublished !== undefined) patch.is_published = input.isPublished;
      const { data, error } = await asUser(token)
        .from('categories')
        .update(patch)
        .eq('id', id)
        .select('id');
      if (error) throw toStoreError(error);
      if (!data?.length) throw new StoreError('not_found', 'Not found.');
    },
  };
}
