import { z } from 'zod';

// Promotions: what the admin portal saves and the pricing engine evaluates.
// The same schema validates the admin form and the API, so a promotion that
// can be saved is always one the engine understands.

const id = z.string().uuid();
const pence = z.number().int().min(0).max(1_000_000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 16:00');

/** What a reward applies to. */
export const promotionScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order') }),
  z.object({ kind: z.literal('categories'), categoryIds: z.array(id).min(1).max(30) }),
  z.object({ kind: z.literal('items'), itemIds: z.array(id).min(1).max(200) }),
]);
export type PromotionScope = z.infer<typeof promotionScopeSchema>;

/** Scope for rewards that only make sense on specific things. */
const itemScopeSchema = promotionScopeSchema;

export const promotionRewardSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('percent_off'),
    percent: z.number().int().min(1).max(100),
    scope: promotionScopeSchema,
    /** Optional cap on the discount. */
    maxDiscountPence: pence.nullable().default(null),
  }),
  z.object({
    type: z.literal('amount_off'),
    amountPence: pence.min(1),
    scope: promotionScopeSchema,
  }),
  z.object({
    // Buy `buy`, get `get` more at `discountPercent` off (100 = free). The
    // cheapest items in each group are the discounted ones.
    type: z.literal('buy_x_get_y'),
    buy: z.number().int().min(1).max(10),
    get: z.number().int().min(1).max(10),
    discountPercent: z.number().int().min(1).max(100).default(100),
    scope: itemScopeSchema,
  }),
  z.object({
    // A fixed price for a set of items, for example 2 pizzas + 2 sides for £25.
    // Covers each item's menu price; extra toppings and crusts are still charged.
    type: z.literal('bundle_price'),
    pricePence: pence,
    slots: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(60),
          scope: itemScopeSchema,
          quantity: z.number().int().min(1).max(10),
          /** Limit to certain sizes, for example ["medium"]. Empty = any size. */
          variantSlugs: z.array(z.string().min(1).max(40)).max(10).default([]),
        }),
      )
      .min(1)
      .max(6),
  }),
  z.object({
    // `quantity` of the cheapest matching items are free. Usually paired with a
    // minimum spend in the conditions ("free garlic bread over £20").
    type: z.literal('free_item'),
    scope: itemScopeSchema,
    quantity: z.number().int().min(1).max(5).default(1),
  }),
  z.object({ type: z.literal('free_delivery') }),
]);
export type PromotionReward = z.infer<typeof promotionRewardSchema>;

export const promotionConditionsSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  /** 0 = Sunday ... 6 = Saturday, shop time. Empty = every day. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  /** Daily window in shop time. Both or neither. May run past midnight. */
  timeFrom: time.nullable().default(null),
  timeTo: time.nullable().default(null),
  fulfilment: z.enum(['delivery', 'collection']).nullable().default(null),
  /** Empty = every channel. */
  channels: z
    .array(z.enum(['web', 'app', 'phone']))
    .max(3)
    .default([]),
  /** Basket subtotal (before discounts) needed. */
  minSubtotalPence: pence.default(0),
  /** Who it is for. */
  customer: z.enum(['anyone', 'first_order', 'returning']).default('anyone'),
});
export type PromotionConditions = z.infer<typeof promotionConditionsSchema>;

export const promotionUsageSchema = z.object({
  /** Total times it can be used. Null = unlimited. */
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().default(null),
  /** Times one customer can use it. Null = unlimited. */
  maxPerCustomer: z.number().int().min(1).max(1000).nullable().default(null),
});

export const promotionRulesSchema = z
  .object({
    conditions: promotionConditionsSchema,
    reward: promotionRewardSchema,
    usage: promotionUsageSchema,
  })
  .refine((r) => (r.conditions.timeFrom === null) === (r.conditions.timeTo === null), {
    path: ['conditions', 'timeTo'],
    message: 'Set both a start and an end time, or neither',
  })
  .refine(
    (r) =>
      !r.conditions.startsAt ||
      !r.conditions.endsAt ||
      Date.parse(r.conditions.startsAt) < Date.parse(r.conditions.endsAt),
    { path: ['conditions', 'endsAt'], message: 'The end must be after the start' },
  );
export type PromotionRules = z.infer<typeof promotionRulesSchema>;

export const promotionStatusSchema = z.enum(['draft', 'active', 'paused']);

const promoCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, 'Codes are 3 to 20 letters and numbers');

/** A promotion as the engine and the public pages see it. */
export const promotionSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  /** Higher runs first. */
  priority: z.number().int(),
  /** At most one promotion per group applies to a basket. */
  stackingGroup: z.string(),
  /** If this applies, nothing else does. */
  exclusive: z.boolean(),
  /** False = needs a code. */
  autoApply: z.boolean(),
  rules: promotionRulesSchema,
  banner: z.object({ show: z.boolean(), headline: z.string(), body: z.string() }),
});
export type Promotion = z.infer<typeof promotionSchema>;

export const savePromotionSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    /** Shown to customers. */
    description: z.string().trim().max(300),
    status: promotionStatusSchema,
    priority: z.number().int().min(0).max(1000),
    stackingGroup: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{1,30}$/, 'Use lowercase letters, numbers and hyphens'),
    exclusive: z.boolean(),
    autoApply: z.boolean(),
    rules: promotionRulesSchema,
    banner: z.object({
      show: z.boolean(),
      headline: z.string().trim().max(80),
      body: z.string().trim().max(200),
    }),
    codes: z
      .array(
        z.object({
          code: promoCode,
          /** Times this code can be used in total. 1 = single use. Null = unlimited. */
          maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
        }),
      )
      .max(200)
      .refine((codes) => new Set(codes.map((c) => c.code)).size === codes.length, {
        message: 'Each code can only be listed once',
      }),
  })
  .refine((p) => p.autoApply || p.codes.length > 0, {
    path: ['codes'],
    message: 'Add at least one code, or make the offer apply automatically',
  })
  .refine((p) => !p.banner.show || p.banner.headline.length > 0, {
    path: ['banner', 'headline'],
    message: 'A banner needs a headline',
  });
export type SavePromotionInput = z.infer<typeof savePromotionSchema>;

export const promotionStatusPatchSchema = z.object({ status: promotionStatusSchema });

/** A promotion as the admin portal sees it, with its codes and results so far. */
export const adminPromotionSchema = promotionSchema.extend({
  status: promotionStatusSchema,
  codes: z.array(
    z.object({
      code: z.string(),
      maxRedemptions: z.number().int().nullable(),
      redemptions: z.number().int(),
    }),
  ),
  stats: z.object({
    /** Paid orders that used it. */
    redemptions: z.number().int(),
    /** What it has cost in discounts. */
    discountPence: z.number().int(),
    /** What those orders took in total. */
    revenuePence: z.number().int(),
  }),
  updatedAt: z.string(),
});
export type AdminPromotion = z.infer<typeof adminPromotionSchema>;

/** What the customer sees about a promotion applied to their basket. */
export const appliedPromotionSchema = z.object({
  promotionId: id,
  name: z.string(),
  discountPence: z.number().int().min(0),
  freeDelivery: z.boolean(),
  /** The code that unlocked it, if any. */
  code: z.string().nullable(),
});
export type AppliedPromotion = z.infer<typeof appliedPromotionSchema>;
