import type { AppliedPromotion, Promotion, PromotionScope } from '@mp/validation';
import type { Pence } from './money';

// The promotions engine. Pure: no I/O and no clock (the time is passed in).
// The website runs it for a preview; the API runs the same code at checkout
// with facts only the server knows (usage counts, whether it is the customer's
// first order), and only the API's result is charged.
//
// Rules that keep discounts from combining by accident:
//   - Promotions are tried in priority order (highest first).
//   - At most one promotion per stacking group applies. Promotions share the
//     group "default" unless an admin deliberately gives them another.
//   - An exclusive promotion only applies alone.
//   - An item used by one item-level offer (2-for-1, a bundle, a free item, a
//     discount on specific items) cannot be used by another.
//   - Whole-order discounts apply to what is left after item-level offers.
//   - Nothing is ever discounted below zero.

/** One priced basket line, as much as the engine needs. */
export interface PromoLine {
  lineIndex: number;
  itemId: string;
  categoryId: string;
  variantSlug: string;
  quantity: number;
  /** Menu price of one, before options. */
  unitPricePence: Pence;
  /** Charged options for one. */
  optionsPence: Pence;
}

export interface PromotionContext {
  now: Date;
  /** The shop's timezone, for day-of-week and time-window rules. */
  timezone: string;
  fulfilment: 'delivery' | 'collection';
  channel: 'web' | 'app' | 'phone';
  /** Delivery fee before any free-delivery offer. */
  deliveryFeePence: Pence;
  /** The promotion a valid entered code unlocks, if any. */
  unlockedByCode?: { promotionId: string; code: string } | null;
  /**
   * Whether this is the customer's first order. Only the server knows; when it
   * is left out (browser preview), first-order and returning-customer offers
   * are not applied.
   */
  customer?: { isFirstOrder: boolean };
  /** Promotions that have reached a usage limit (server only). */
  exhausted?: ReadonlySet<string>;
}

export interface PromotionResult {
  applied: AppliedPromotion[];
  /** Discount per input line, indexed by lineIndex. */
  lineDiscounts: Map<number, Pence>;
  /** Total taken off the items. */
  discountPence: Pence;
  freeDelivery: boolean;
}

interface Unit {
  lineIndex: number;
  itemId: string;
  categoryId: string;
  variantSlug: string;
  /** What is still chargeable for this unit's menu price and its options. */
  base: Pence;
  extras: Pence;
  /** Used by an item-level offer. */
  consumed: boolean;
}

const remaining = (unit: Unit) => unit.base + unit.extras;

function matches(scope: PromotionScope, unit: Unit): boolean {
  switch (scope.kind) {
    case 'order':
      return true;
    case 'categories':
      return scope.categoryIds.includes(unit.categoryId);
    case 'items':
      return scope.itemIds.includes(unit.itemId);
  }
}

/** Splits `total` across `weights` in whole pence, exactly (largest remainder). */
export function allocate(total: Pence, weights: number[]): Pence[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    // Never give a share more than its own weight (a unit cannot go below zero).
    if (shares[index]! < weights[index]!) {
      shares[index]!++;
      left--;
    }
  }
  return shares;
}

// ---- time rules ----------------------------------------------------------------

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** Day of week (0 = Sunday) and minutes past midnight, in a timezone. */
export function localClock(date: Date, timeZone: string): { weekday: number; minutes: number } {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
    });
    clockFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday ?? '');
  return { weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** True when the promotion's dates, days and daily time window include `now`. */
export function isScheduledNow(promotion: Promotion, now: Date, timezone: string): boolean {
  const c = promotion.rules.conditions;
  if (c.startsAt && now.getTime() < Date.parse(c.startsAt)) return false;
  if (c.endsAt && now.getTime() >= Date.parse(c.endsAt)) return false;

  const clock = localClock(now, timezone);
  let day = clock.weekday;
  if (c.timeFrom !== null && c.timeTo !== null) {
    const from = toMinutes(c.timeFrom);
    const to = toMinutes(c.timeTo);
    if (from <= to) {
      if (clock.minutes < from || clock.minutes >= to) return false;
    } else if (clock.minutes < to) {
      // After midnight in a window that began the evening before: it counts as
      // that evening's day ("Friday 10pm to 2am" still applies at 1am Saturday).
      day = (day + 6) % 7;
    } else if (clock.minutes < from) {
      return false;
    }
  }
  return c.daysOfWeek.length === 0 || c.daysOfWeek.includes(day);
}

function isEligible(promotion: Promotion, subtotalPence: Pence, context: PromotionContext) {
  const c = promotion.rules.conditions;
  if (!promotion.autoApply && context.unlockedByCode?.promotionId !== promotion.id) return false;
  if (context.exhausted?.has(promotion.id)) return false;
  if (!isScheduledNow(promotion, context.now, context.timezone)) return false;
  if (c.fulfilment && c.fulfilment !== context.fulfilment) return false;
  if (c.channels.length > 0 && !c.channels.includes(context.channel)) return false;
  if (subtotalPence < c.minSubtotalPence) return false;
  if (c.customer === 'first_order' && context.customer?.isFirstOrder !== true) return false;
  if (c.customer === 'returning' && context.customer?.isFirstOrder !== false) return false;
  return true;
}

// ---- rewards ---------------------------------------------------------------------

interface Outcome {
  /** Pence to take off each unit. */
  takes: Array<{ unit: Unit; pence: Pence; baseOnly: boolean }>;
  /** Units this offer uses up. */
  consume: Unit[];
  freeDelivery: boolean;
}

const nothing = (): Outcome => ({ takes: [], consume: [], freeDelivery: false });
const byValueDesc = (a: Unit, b: Unit) => remaining(b) - remaining(a) || a.lineIndex - b.lineIndex;

function spread(units: Unit[], total: Pence, itemLevel: boolean): Outcome {
  const shares = allocate(
    total,
    units.map((u) => remaining(u)),
  );
  return {
    takes: units.map((unit, i) => ({ unit, pence: shares[i]!, baseOnly: false })),
    consume: itemLevel ? units : [],
    freeDelivery: false,
  };
}

/** Units a scoped reward may touch. Whole-order rewards see everything. */
function targets(scope: PromotionScope, units: Unit[]): Unit[] {
  return scope.kind === 'order'
    ? units.filter((u) => remaining(u) > 0)
    : units.filter((u) => !u.consumed && matches(scope, u) && remaining(u) > 0);
}

function evaluate(promotion: Promotion, units: Unit[], context: PromotionContext): Outcome {
  const reward = promotion.rules.reward;
  switch (reward.type) {
    case 'percent_off': {
      const pool = targets(reward.scope, units);
      const sum = pool.reduce((s, u) => s + remaining(u), 0);
      let total = Math.round((sum * reward.percent) / 100);
      if (reward.maxDiscountPence !== null) total = Math.min(total, reward.maxDiscountPence);
      return spread(pool, total, reward.scope.kind !== 'order');
    }

    case 'amount_off': {
      const pool = targets(reward.scope, units);
      const sum = pool.reduce((s, u) => s + remaining(u), 0);
      return spread(pool, Math.min(reward.amountPence, sum), reward.scope.kind !== 'order');
    }

    case 'buy_x_get_y': {
      const pool = units.filter((u) => !u.consumed && matches(reward.scope, u)).sort(byValueDesc);
      const size = reward.buy + reward.get;
      const outcome = nothing();
      for (let start = 0; start + size <= pool.length; start += size) {
        const group = pool.slice(start, start + size);
        outcome.consume.push(...group);
        // The cheapest in each group are the discounted ones.
        for (const unit of group.slice(reward.buy)) {
          outcome.takes.push({
            unit,
            pence: Math.round((remaining(unit) * reward.discountPercent) / 100),
            baseOnly: false,
          });
        }
      }
      return outcome;
    }

    case 'bundle_price': {
      const outcome = nothing();
      const taken = new Set<Unit>();
      for (let instance = 0; instance < 20; instance++) {
        const picked: Unit[] = [];
        let complete = true;
        for (const slot of reward.slots) {
          const candidates = units
            .filter(
              (u) =>
                !u.consumed &&
                !taken.has(u) &&
                !picked.includes(u) &&
                matches(slot.scope, u) &&
                (slot.variantSlugs.length === 0 || slot.variantSlugs.includes(u.variantSlug)),
            )
            // Dearest first: the customer gets the best saving the deal allows.
            .sort((a, b) => b.base - a.base || a.lineIndex - b.lineIndex)
            .slice(0, slot.quantity);
          if (candidates.length < slot.quantity) {
            complete = false;
            break;
          }
          picked.push(...candidates);
        }
        if (!complete) break;
        const menuPrice = picked.reduce((s, u) => s + u.base, 0);
        const saving = menuPrice - reward.pricePence;
        // A "deal" that would cost more than the menu price is never applied.
        if (saving <= 0) break;
        const shares = allocate(
          saving,
          picked.map((u) => u.base),
        );
        picked.forEach((unit, i) => {
          taken.add(unit);
          outcome.consume.push(unit);
          outcome.takes.push({ unit, pence: shares[i]!, baseOnly: true });
        });
      }
      return outcome;
    }

    case 'free_item': {
      const pool = units
        .filter((u) => !u.consumed && matches(reward.scope, u) && remaining(u) > 0)
        .sort((a, b) => remaining(a) - remaining(b) || a.lineIndex - b.lineIndex)
        .slice(0, reward.quantity);
      return {
        takes: pool.map((unit) => ({ unit, pence: remaining(unit), baseOnly: false })),
        consume: pool,
        freeDelivery: false,
      };
    }

    case 'free_delivery':
      return {
        ...nothing(),
        freeDelivery: context.fulfilment === 'delivery' && context.deliveryFeePence > 0,
      };
  }
}

const totalOf = (outcome: Outcome) => outcome.takes.reduce((s, t) => s + t.pence, 0);

function commit(outcome: Outcome): void {
  for (const { unit, pence, baseOnly } of outcome.takes) {
    const fromBase = Math.min(unit.base, pence);
    unit.base -= fromBase;
    if (!baseOnly) unit.extras -= Math.min(unit.extras, pence - fromBase);
  }
  for (const unit of outcome.consume) unit.consumed = true;
}

/**
 * Works out which promotions apply to a basket and what each takes off.
 * `promotions` should already be limited to active ones.
 */
export function evaluatePromotions(
  lines: PromoLine[],
  promotions: Promotion[],
  context: PromotionContext,
): PromotionResult {
  const units: Unit[] = lines.flatMap((line) =>
    Array.from({ length: line.quantity }, () => ({
      lineIndex: line.lineIndex,
      itemId: line.itemId,
      categoryId: line.categoryId,
      variantSlug: line.variantSlug,
      base: line.unitPricePence,
      extras: line.optionsPence,
      consumed: false,
    })),
  );
  const before = new Map(units.map((u) => [u, remaining(u)]));
  const subtotal = units.reduce((s, u) => s + remaining(u), 0);

  // Priority first. Between equals, the one worth more to the customer on this
  // basket, then a stable order, so the result never depends on database order.
  const worth = (promotion: Promotion) => {
    const outcome = evaluate(promotion, units, context);
    return totalOf(outcome) + (outcome.freeDelivery ? context.deliveryFeePence : 0);
  };
  const candidates = promotions
    .filter((p) => isEligible(p, subtotal, context))
    .map((p) => ({ promotion: p, worth: worth(p) }))
    .sort(
      (a, b) =>
        b.promotion.priority - a.promotion.priority ||
        b.worth - a.worth ||
        a.promotion.id.localeCompare(b.promotion.id),
    );

  const applied: AppliedPromotion[] = [];
  const usedGroups = new Set<string>();
  let freeDelivery: boolean = false;

  for (const { promotion } of candidates) {
    if (promotion.exclusive && applied.length > 0) continue;
    if (usedGroups.has(promotion.stackingGroup)) continue;

    const outcome = evaluate(promotion, units, context);
    const discount = totalOf(outcome);
    const givesDelivery: boolean = outcome.freeDelivery && !freeDelivery;
    if (discount <= 0 && !givesDelivery) continue;

    commit(outcome);
    usedGroups.add(promotion.stackingGroup);
    freeDelivery ||= givesDelivery;
    applied.push({
      promotionId: promotion.id,
      name: promotion.name,
      discountPence: discount,
      freeDelivery: givesDelivery,
      code:
        context.unlockedByCode?.promotionId === promotion.id ? context.unlockedByCode.code : null,
    });
    if (promotion.exclusive) break;
  }

  const lineDiscounts = new Map<number, Pence>();
  for (const unit of units) {
    const off = before.get(unit)! - remaining(unit);
    if (off > 0) lineDiscounts.set(unit.lineIndex, (lineDiscounts.get(unit.lineIndex) ?? 0) + off);
  }
  return {
    applied,
    lineDiscounts,
    discountPence: applied.reduce((s, a) => s + a.discountPence, 0),
    freeDelivery,
  };
}
