import { z } from 'zod';
import { allergenRefSchema, penceSchema } from './menu';
import { appliedPromotionSchema } from './promotion';

// Contracts for shop status, basket pricing, checkout and order tracking.

const id = z.string().uuid();

export const fulfilmentSchema = z.enum(['delivery', 'collection']);

export const ORDER_STATUS_VALUES = [
  'PENDING_PAYMENT',
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COLLECTED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED',
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUS_VALUES);

// ---- basket ----------------------------------------------------------------

export const basketLineSchema = z.object({
  itemId: id,
  variantId: id,
  quantity: z.number().int().min(1).max(20),
  selections: z
    .array(z.object({ groupId: id, optionIds: z.array(id).max(30) }))
    .max(10)
    .default([]),
  notes: z.string().trim().max(200).default(''),
});
export type BasketLine = z.infer<typeof basketLineSchema>;

/** A UK postcode as typed; the API normalises and validates it. */
const postcodeInput = z.string().trim().min(5).max(10);

export const priceBasketSchema = z.object({
  lines: z.array(basketLineSchema).max(40),
  fulfilment: fulfilmentSchema,
  postcode: postcodeInput.optional(),
  tipPence: z.number().int().min(0).max(10_000).default(0),
});
export type PriceBasketInput = z.infer<typeof priceBasketSchema>;

const basketProblemSchema = z.object({
  code: z.string(),
  message: z.string(),
  lineIndex: z.number().int().optional(),
});

export const pricedLineSchema = z.object({
  lineIndex: z.number().int(),
  itemId: id,
  itemSlug: z.string(),
  categoryId: id,
  categorySlug: z.string(),
  name: z.string(),
  variantId: id,
  variantSlug: z.string(),
  variantName: z.string(),
  quantity: z.number().int(),
  unitPricePence: penceSchema,
  optionsPence: penceSchema,
  lineTotalPence: z.number().int().min(0),
  discountPence: z.number().int().min(0),
  vatRateBp: z.number().int(),
  notes: z.string(),
  allergens: z.array(allergenRefSchema),
  allergensConfirmed: z.boolean(),
  options: z.array(
    z.object({
      optionId: id,
      groupId: id,
      groupName: z.string(),
      name: z.string(),
      pricePence: penceSchema,
    }),
  ),
});

export const pricedBasketSchema = z.object({
  lines: z.array(pricedLineSchema),
  itemCount: z.number().int(),
  subtotalPence: z.number().int(),
  discountPence: z.number().int(),
  appliedPromotions: z.array(appliedPromotionSchema),
  /** What happened to an entered promo code. Only set by the server. */
  promoCode: z
    .object({
      code: z.string(),
      status: z.enum(['applied', 'invalid', 'not_applicable']),
      message: z.string(),
    })
    .nullable()
    .optional(),
  deliveryFeePence: z.number().int(),
  tipPence: z.number().int(),
  vatPence: z.number().int(),
  totalPence: z.number().int(),
  problems: z.array(basketProblemSchema),
  ok: z.boolean(),
});
export type PricedBasketResponse = z.infer<typeof pricedBasketSchema>;

// ---- shop ------------------------------------------------------------------

export const shopInfoSchema = z.object({
  name: z.string(),
  timezone: z.string(),
  isOpen: z.boolean(),
  paused: z.boolean(),
  pausedMessage: z.string(),
  closesAt: z.string().nullable(),
  nextOpensAt: z.string().nullable(),
  busy: z.boolean(),
  /** Minutes until an ASAP order is ready, including any busy-mode extra. */
  collectionMinutes: z.number().int(),
  deliveryMinutes: z.number().int(),
  slotMinutes: z.number().int(),
  maxScheduleDays: z.number().int(),
  tipsEnabled: z.boolean(),
  cashEnabled: z.boolean(),
  hours: z.array(
    z.object({
      weekday: z.number().int(),
      opens: z.string(),
      closes: z.string(),
      isClosed: z.boolean(),
    }),
  ),
  closures: z.array(z.string()),
  zones: z.array(
    z.object({
      id,
      name: z.string(),
      postcodePrefixes: z.array(z.string()),
      feePence: penceSchema,
      minOrderPence: penceSchema,
    }),
  ),
  /** How card payments are taken in this environment. */
  payments: z.object({
    provider: z.enum(['stripe', 'simulator', 'unavailable']),
    publishableKey: z.string().nullable(),
  }),
});
export type ShopInfo = z.infer<typeof shopInfoSchema>;

export const deliveryCheckSchema = z.object({ postcode: postcodeInput });
export const deliveryCheckResultSchema = z.object({
  valid: z.boolean(),
  postcode: z.string().nullable(),
  deliverable: z.boolean(),
  zone: z
    .object({ id, name: z.string(), feePence: penceSchema, minOrderPence: penceSchema })
    .nullable(),
});
export type DeliveryCheckResult = z.infer<typeof deliveryCheckResultSchema>;

// ---- checkout --------------------------------------------------------------

export const customerDetailsSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(200)),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
});

export const addressSchema = z.object({
  line1: z.string().trim().min(1, 'Enter the first line of your address').max(100),
  line2: z.string().trim().max(100).default(''),
  town: z.string().trim().min(1, 'Enter your town').max(60),
  postcode: postcodeInput,
});
export type AddressInput = z.infer<typeof addressSchema>;

export const checkoutSchema = z
  .object({
    lines: z.array(basketLineSchema).min(1, 'Your basket is empty').max(40),
    fulfilment: fulfilmentSchema,
    /** ISO time for a scheduled order, or null for as soon as possible. */
    scheduledFor: z.iso.datetime({ offset: true }).nullable(),
    customer: customerDetailsSchema,
    address: addressSchema.optional(),
    notes: z.string().trim().max(300).default(''),
    tipPence: z.number().int().min(0).max(10_000).default(0),
    /** The customer must confirm they have read the allergen notice. */
    allergenAcknowledged: z.literal(true, 'Please confirm you have read the allergen notice'),
    /** The total the customer was shown. Checkout stops if the real total differs. */
    expectedTotalPence: z.number().int().min(1),
    paymentMethod: z.literal('card'),
  })
  .refine((v) => v.fulfilment !== 'delivery' || v.address !== undefined, {
    path: ['address'],
    message: 'Enter your delivery address',
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const checkoutResultSchema = z.object({
  orderId: id,
  orderNumber: z.number().int(),
  /** Lets a guest view this order. Only returned once, when the order is created. */
  orderToken: z.string().nullable(),
  totalPence: z.number().int(),
  payment: z.object({
    provider: z.enum(['stripe', 'simulator']),
    /** Stripe PaymentIntent client secret, for the Payment Element. */
    clientSecret: z.string().nullable(),
    publishableKey: z.string().nullable(),
  }),
});
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

// ---- order tracking --------------------------------------------------------

export const orderViewSchema = z.object({
  id,
  orderNumber: z.number().int(),
  status: orderStatusSchema,
  fulfilment: fulfilmentSchema,
  createdAt: z.string(),
  scheduledFor: z.string().nullable(),
  estimatedReadyAt: z.string(),
  paidAt: z.string().nullable(),
  customerName: z.string(),
  address: z
    .object({ line1: z.string(), line2: z.string(), town: z.string(), postcode: z.string() })
    .nullable(),
  notes: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      variantName: z.string(),
      quantity: z.number().int(),
      lineTotalPence: z.number().int(),
      notes: z.string(),
      options: z.array(z.object({ name: z.string(), pricePence: z.number().int() })),
    }),
  ),
  subtotalPence: z.number().int(),
  discountPence: z.number().int(),
  deliveryFeePence: z.number().int(),
  tipPence: z.number().int(),
  vatPence: z.number().int(),
  totalPence: z.number().int(),
  timeline: z.array(z.object({ status: orderStatusSchema, at: z.string() })),
});
export type OrderView = z.infer<typeof orderViewSchema>;

export const orderSummarySchema = z.object({
  id,
  orderNumber: z.number().int(),
  status: orderStatusSchema,
  fulfilment: fulfilmentSchema,
  createdAt: z.string(),
  totalPence: z.number().int(),
  itemCount: z.number().int(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

// ---- kitchen display -------------------------------------------------------

export const orderChannelSchema = z.enum([
  'web',
  'app',
  'phone',
  'uber_eats',
  'just_eat',
  'deliveroo',
]);

export const kitchenOrderSchema = z.object({
  id,
  orderNumber: z.number().int(),
  status: orderStatusSchema,
  channel: orderChannelSchema,
  fulfilment: fulfilmentSchema,
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  scheduledFor: z.string().nullable(),
  /** When the order is due: the booked time, or the kitchen's estimate. */
  estimatedReadyAt: z.string(),
  updatedAt: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  address: z
    .object({ line1: z.string(), line2: z.string(), town: z.string(), postcode: z.string() })
    .nullable(),
  notes: z.string(),
  rejectReason: z.string().nullable(),
  items: z.array(
    z.object({
      id,
      name: z.string(),
      variantName: z.string(),
      quantity: z.number().int(),
      notes: z.string(),
      done: z.boolean(),
      allergens: z.array(allergenRefSchema),
      allergensConfirmed: z.boolean(),
      options: z.array(z.object({ groupName: z.string(), name: z.string() })),
    }),
  ),
});
export type KitchenOrder = z.infer<typeof kitchenOrderSchema>;

export const kitchenBoardSchema = z.object({
  /** The server's clock, so every screen counts down from the same time. */
  serverTime: z.string(),
  orders: z.array(kitchenOrderSchema),
});
export type KitchenBoard = z.infer<typeof kitchenBoardSchema>;

export const kitchenAcceptSchema = z.object({ prepMinutes: z.number().int().min(1).max(240) });
export const kitchenRejectSchema = z.object({ reason: z.string().trim().min(3).max(200) });
/** The moves kitchen staff make after accepting. */
export const KITCHEN_NEXT_STATUSES = [
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COLLECTED',
  'COMPLETED',
] as const;
export const kitchenStatusSchema = z.object({ to: z.enum(KITCHEN_NEXT_STATUSES) });
export const kitchenItemDoneSchema = z.object({ done: z.boolean() });
