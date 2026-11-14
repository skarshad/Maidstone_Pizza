import { z } from 'zod';

// Contracts for the menu API. The same schemas validate admin forms.

const id = z.string().uuid();
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
/** Integer pence. Capped so a typo cannot create a £10,000 pizza. */
export const penceSchema = z.number().int().min(0).max(100_000);
const name = z.string().trim().min(1).max(80);

/** ISO timestamp, or "infinity" meaning until switched back on, or null. */
export const soldOutUntilSchema = z
  .union([z.literal('infinity'), z.iso.datetime({ offset: true })])
  .nullable();

export const allergenRefSchema = z.object({ code: z.string(), mayContain: z.boolean() });
export type AllergenRef = z.infer<typeof allergenRefSchema>;

// ---- read models ------------------------------------------------------------

export const menuVariantSchema = z.object({
  id,
  slug: z.string(),
  name: z.string(),
  pricePence: penceSchema,
});

export const menuOptionSchema = z.object({
  id,
  slug: z.string(),
  name: z.string(),
  soldOut: z.boolean(),
  /** Price when `prices` has no entry for the chosen size. */
  pricePence: penceSchema,
  /** Price by variant slug (small / medium / large). */
  prices: z.record(z.string(), penceSchema),
  allergens: z.array(allergenRefSchema),
});

export const menuOptionGroupSchema = z.object({
  id,
  slug: z.string(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int().nullable(),
  options: z.array(menuOptionSchema),
});

export const menuItemGroupSchema = z.object({
  groupId: id,
  /** Per-item limit; null means use the group's own limit. */
  maxSelect: z.number().int().nullable(),
  /** Selections included in the item price. */
  freeSelect: z.number().int(),
});

export const menuItemSchema = z.object({
  id,
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().nullable(),
  tags: z.array(z.string()),
  soldOut: z.boolean(),
  /** False until the owner has confirmed this item's allergens. */
  allergensConfirmed: z.boolean(),
  allergens: z.array(allergenRefSchema),
  /** VAT rate in basis points (2000 = 20%). Prices are VAT-inclusive. */
  vatRateBp: z.number().int(),
  variants: z.array(menuVariantSchema),
  optionGroups: z.array(menuItemGroupSchema),
});

export const menuCategorySchema = z.object({
  id,
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  items: z.array(menuItemSchema),
});

const lookupSchema = z.object({ code: z.string(), name: z.string() });

export const menuSchema = z.object({
  categories: z.array(menuCategorySchema),
  optionGroups: z.array(menuOptionGroupSchema),
  allergens: z.array(lookupSchema),
  dietaryTags: z.array(lookupSchema),
});

export type MenuVariant = z.infer<typeof menuVariantSchema>;
export type MenuOption = z.infer<typeof menuOptionSchema>;
export type MenuOptionGroup = z.infer<typeof menuOptionGroupSchema>;
export type MenuItemGroup = z.infer<typeof menuItemGroupSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type Menu = z.infer<typeof menuSchema>;

// ---- admin read models (everything, including unpublished) --------------------

const adminFlags = z.object({
  isPublished: z.boolean(),
  soldOutUntil: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const adminMenuItemSchema = menuItemSchema
  .extend(adminFlags.shape)
  .extend({ categoryId: id });
export const adminMenuOptionSchema = menuOptionSchema.extend(adminFlags.shape);
export const adminMenuSchema = z.object({
  categories: z.array(
    menuCategorySchema.extend({
      isPublished: z.boolean(),
      sortOrder: z.number().int(),
      items: z.array(adminMenuItemSchema),
    }),
  ),
  optionGroups: z.array(menuOptionGroupSchema.extend({ options: z.array(adminMenuOptionSchema) })),
  allergens: z.array(lookupSchema),
  dietaryTags: z.array(lookupSchema),
});

export type AdminMenuItem = z.infer<typeof adminMenuItemSchema>;
export type AdminMenuOption = z.infer<typeof adminMenuOptionSchema>;
export type AdminMenu = z.infer<typeof adminMenuSchema>;
export type AdminMenuCategory = AdminMenu['categories'][number];

// ---- admin inputs -----------------------------------------------------------

export const saveMenuItemSchema = z.object({
  categoryId: id,
  slug: slugSchema,
  name,
  description: z.string().trim().max(500),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isPublished: z.boolean(),
  soldOutUntil: soldOutUntilSchema,
  allergensConfirmed: z.boolean(),
  variants: z
    .array(z.object({ slug: slugSchema, name, pricePence: penceSchema }))
    .min(1, 'Add at least one size or price')
    .max(12)
    .refine((v) => new Set(v.map((x) => x.slug)).size === v.length, 'Each size needs its own key'),
  optionGroups: z
    .array(
      z.object({
        groupId: id,
        maxSelect: z.number().int().min(0).max(50).nullable(),
        freeSelect: z.number().int().min(0).max(50),
      }),
    )
    .max(10),
  allergens: z.array(allergenRefSchema).max(14),
  tags: z.array(z.string()).max(10),
});
export type SaveMenuItemInput = z.infer<typeof saveMenuItemSchema>;

export const itemAvailabilitySchema = z
  .object({ isPublished: z.boolean().optional(), soldOutUntil: soldOutUntilSchema.optional() })
  .refine((v) => v.isPublished !== undefined || v.soldOutUntil !== undefined, 'Nothing to change');
export type ItemAvailabilityInput = z.infer<typeof itemAvailabilitySchema>;

export const saveMenuOptionSchema = z.object({
  name,
  pricePence: penceSchema,
  isPublished: z.boolean(),
  soldOutUntil: soldOutUntilSchema,
  prices: z.record(slugSchema, penceSchema),
  allergens: z.array(allergenRefSchema).max(14),
});
export type SaveMenuOptionInput = z.infer<typeof saveMenuOptionSchema>;

export const categoryPatchSchema = z
  .object({
    name: name.optional(),
    description: z.string().trim().max(300).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type CategoryPatchInput = z.infer<typeof categoryPatchSchema>;

/** True when a sold-out marker is still in force at `now`. */
export function isSoldOut(soldOutUntil: string | null | undefined, now: Date): boolean {
  if (!soldOutUntil) return false;
  if (soldOutUntil === 'infinity') return true;
  const until = Date.parse(soldOutUntil);
  return Number.isFinite(until) && until > now.getTime();
}

// ---- item photos ------------------------------------------------------------

export const MENU_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;
export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Where an item's photo lives inside the "menu" storage bucket. */
export function menuImagePath(itemId: string, fileName: string, extension: string): string {
  return `items/${itemId}/${fileName}.${extension}`;
}

export const itemImageSchema = z.object({
  /** Path inside the menu bucket, or null to remove the photo. */
  imagePath: z
    .string()
    .regex(/^items\/[0-9a-f-]{36}\/[a-z0-9-]{1,60}\.(jpg|jpeg|png|webp|gif)$/)
    .nullable(),
});
export type ItemImageInput = z.infer<typeof itemImageSchema>;
