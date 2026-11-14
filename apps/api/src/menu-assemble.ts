import { isSoldOut, type AdminMenu, type AllergenRef, type Menu } from '@mp/validation';

// Turns database rows into the menu the clients consume. Pure, so it is tested
// without a database.

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  is_published: boolean;
}

export interface ItemRow {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  description: string;
  image_path: string | null;
  sort_order: number;
  is_published: boolean;
  sold_out_until: string | null;
  allergens_confirmed: boolean;
  vat_rate_bp: number;
  item_variants: Array<{
    id: string;
    slug: string;
    name: string;
    price_pence: number;
    sort_order: number;
  }>;
  item_option_groups: Array<{
    group_id: string;
    sort_order: number;
    max_select: number | null;
    free_select: number;
  }>;
  item_allergens: Array<{ allergen_code: string; may_contain: boolean }>;
  item_dietary_tags: Array<{ tag_code: string }>;
}

export interface OptionGroupRow {
  id: string;
  slug: string;
  name: string;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  options: Array<{
    id: string;
    slug: string;
    name: string;
    price_pence: number;
    sort_order: number;
    is_published: boolean;
    sold_out_until: string | null;
    option_prices: Array<{ variant_slug: string; price_pence: number }>;
    option_allergens: Array<{ allergen_code: string; may_contain: boolean }>;
  }>;
}

export interface LookupRow {
  code: string;
  name: string;
  sort_order: number;
}

export interface MenuRows {
  categories: CategoryRow[];
  items: ItemRow[];
  optionGroups: OptionGroupRow[];
  allergens: LookupRow[];
  dietaryTags: LookupRow[];
}

const bySort = <T extends { sort_order: number; name?: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.name ?? '').localeCompare(b.name ?? '');

function allergenRefs(
  rows: Array<{ allergen_code: string; may_contain: boolean }>,
  order: Map<string, number>,
): AllergenRef[] {
  return rows
    .map((r) => ({ code: r.allergen_code, mayContain: r.may_contain }))
    .sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
}

/** Everything, including unpublished rows and the flags staff need. */
export function assembleAdminMenu(
  rows: MenuRows,
  now: Date,
  imageUrl: (path: string) => string,
): AdminMenu {
  const allergenOrder = new Map(rows.allergens.map((a) => [a.code, a.sort_order]));
  const tagOrder = new Map(rows.dietaryTags.map((t) => [t.code, t.sort_order]));

  return {
    categories: [...rows.categories].sort(bySort).map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      isPublished: category.is_published,
      sortOrder: category.sort_order,
      items: rows.items
        .filter((item) => item.category_id === category.id)
        .sort(bySort)
        .map((item) => ({
          id: item.id,
          categoryId: item.category_id,
          slug: item.slug,
          name: item.name,
          description: item.description,
          imageUrl: item.image_path ? imageUrl(item.image_path) : null,
          tags: item.item_dietary_tags
            .map((t) => t.tag_code)
            .sort((a, b) => (tagOrder.get(a) ?? 99) - (tagOrder.get(b) ?? 99)),
          soldOut: isSoldOut(item.sold_out_until, now),
          allergensConfirmed: item.allergens_confirmed,
          allergens: allergenRefs(item.item_allergens, allergenOrder),
          vatRateBp: item.vat_rate_bp,
          variants: [...item.item_variants].sort(bySort).map((v) => ({
            id: v.id,
            slug: v.slug,
            name: v.name,
            pricePence: v.price_pence,
          })),
          optionGroups: [...item.item_option_groups]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((g) => ({
              groupId: g.group_id,
              maxSelect: g.max_select,
              freeSelect: g.free_select,
            })),
          isPublished: item.is_published,
          soldOutUntil: item.sold_out_until,
          sortOrder: item.sort_order,
        })),
    })),
    optionGroups: [...rows.optionGroups].sort(bySort).map((group) => ({
      id: group.id,
      slug: group.slug,
      name: group.name,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      options: [...group.options].sort(bySort).map((option) => ({
        id: option.id,
        slug: option.slug,
        name: option.name,
        soldOut: isSoldOut(option.sold_out_until, now),
        pricePence: option.price_pence,
        prices: Object.fromEntries(
          option.option_prices.map((p) => [p.variant_slug, p.price_pence]),
        ),
        allergens: allergenRefs(option.option_allergens, allergenOrder),
        isPublished: option.is_published,
        soldOutUntil: option.sold_out_until,
        sortOrder: option.sort_order,
      })),
    })),
    allergens: [...rows.allergens].sort(bySort).map(({ code, name }) => ({ code, name })),
    dietaryTags: [...rows.dietaryTags].sort(bySort).map(({ code, name }) => ({ code, name })),
  };
}

/**
 * The customer-facing menu. RLS already hides unpublished rows from anonymous
 * reads; filtering again here means a mistake in either layer alone cannot
 * leak a draft item.
 */
export function assemblePublicMenu(
  rows: MenuRows,
  now: Date,
  imageUrl: (path: string) => string,
): Menu {
  const full = assembleAdminMenu(rows, now, imageUrl);
  return {
    categories: full.categories
      .filter((category) => category.isPublished)
      .map(({ isPublished: _p, sortOrder: _s, items, ...category }) => ({
        ...category,
        items: items
          .filter((item) => item.isPublished && item.variants.length > 0)
          .map(
            ({ isPublished: _ip, soldOutUntil: _u, sortOrder: _is, categoryId: _c, ...item }) =>
              item,
          ),
      }))
      .filter((category) => category.items.length > 0),
    optionGroups: full.optionGroups.map((group) => ({
      ...group,
      options: group.options
        .filter((option) => option.isPublished)
        .map(({ isPublished: _p, soldOutUntil: _u, sortOrder: _s, ...option }) => option),
    })),
    allergens: full.allergens,
    dietaryTags: full.dietaryTags,
  };
}
