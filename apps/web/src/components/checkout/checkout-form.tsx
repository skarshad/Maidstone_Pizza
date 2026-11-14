'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@mp/api-client';
import {
  findZone,
  formatPence,
  parsePostcode,
  priceBasket,
  scheduleSlots,
  type Fulfilment,
} from '@mp/pricing';
import { Button, buttonClasses } from '@mp/ui';
import type { Menu, ShopInfo } from '@mp/validation';
import { browserApi } from '@/lib/api';
import { useBasket } from '@/lib/basket';
import { formatWhen } from '@/lib/order-display';
import { rememberPayment } from '@/lib/payment-session';

const field =
  'mt-1 min-h-12 w-full rounded-lg border border-ink-900/20 bg-white px-4 text-base ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500';
const label = 'block font-semibold';
const card = 'rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-900/5';
const choice =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg bg-white px-4 py-2 ring-1 ring-ink-900/15 ' +
  'hover:bg-cream-200 has-[:checked]:bg-red-50 has-[:checked]:ring-2 has-[:checked]:ring-red-500 ' +
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink-900';

const TIP_CHOICES = [0, 100, 200, 300, 500];

export function CheckoutForm({
  menu,
  shop,
  defaultEmail,
}: {
  menu: Menu;
  shop: ShopInfo;
  defaultEmail: string;
}) {
  const router = useRouter();
  const basket = useBasket();

  const [fulfilment, setFulfilment] = useState<Fulfilment>('collection');
  const [when, setWhen] = useState<string>(''); // '' = not chosen, 'asap', or an ISO time
  const [name, setName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [town, setTown] = useState('Maidstone');
  const [postcode, setPostcode] = useState('');
  const [notes, setNotes] = useState('');
  const [tipPence, setTipPence] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per attempt: a double click or a network retry reuses it, so the
  // server returns the same order instead of creating a second one.
  const attemptKey = useRef<string | null>(null);

  // The clock, refreshed each minute so time slots stay current.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const slots = useMemo(
    () =>
      scheduleSlots(
        {
          timezone: shop.timezone,
          hours: shop.hours,
          closures: shop.closures,
          orderingPaused: shop.paused,
        },
        now,
        {
          leadMinutes: fulfilment === 'delivery' ? shop.deliveryMinutes : shop.collectionMinutes,
          slotMinutes: shop.slotMinutes,
          maxDays: shop.maxScheduleDays,
        },
      ),
    [shop, now, fulfilment],
  );

  // Keep the chosen time valid as the clock moves or the order type changes.
  const whenIsValid =
    (when === 'asap' && shop.isOpen) || slots.some((slot) => slot.toISOString() === when);
  const effectiveWhen = whenIsValid ? when : shop.isOpen ? 'asap' : (slots[0]?.toISOString() ?? '');

  const zone = useMemo(() => {
    if (fulfilment !== 'delivery') return undefined;
    if (!parsePostcode(postcode)) return undefined;
    const match = findZone(
      shop.zones.map((z, index) => ({ ...z, isActive: true, sortOrder: index })),
      postcode,
    );
    return match
      ? { id: match.id, feePence: match.feePence, minOrderPence: match.minOrderPence }
      : null;
  }, [fulfilment, postcode, shop.zones]);

  const priced = useMemo(
    () =>
      priceBasket(basket.lines, menu, {
        fulfilment,
        zone,
        tipPence: fulfilment === 'delivery' && shop.tipsEnabled ? tipPence : 0,
      }),
    [basket.lines, menu, fulfilment, zone, tipPence, shop.tipsEnabled],
  );

  const unconfirmed = priced.lines.filter((l) => !l.allergensConfirmed).map((l) => l.name);
  const allergenNames = new Map(menu.allergens.map((a) => [a.code, a.name]));
  const paymentsOff = shop.payments.provider === 'unavailable';
  const nothingBookable = effectiveWhen === '';
  const blockingProblem = priced.problems.find((p) => p.code !== 'postcode_needed');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!priced.ok) {
      setError(priced.problems[0]?.message ?? 'Please check your basket.');
      return;
    }
    if (!acknowledged) {
      setError('Please confirm you have read the allergen notice.');
      return;
    }

    setBusy(true);
    attemptKey.current ??= crypto.randomUUID();
    try {
      const result = await browserApi().checkout(
        {
          lines: basket.lines.map(({ itemId, variantId, quantity, selections, notes: n }) => ({
            itemId,
            variantId,
            quantity,
            selections,
            notes: n,
          })),
          fulfilment,
          scheduledFor: effectiveWhen === 'asap' ? null : effectiveWhen,
          customer: { name, email, phone },
          address: fulfilment === 'delivery' ? { line1, line2, town, postcode } : undefined,
          notes,
          tipPence: priced.tipPence,
          allergenAcknowledged: true,
          expectedTotalPence: priced.totalPence,
          paymentMethod: 'card',
        },
        attemptKey.current,
      );
      rememberPayment(result);
      router.push(`/orders/${result.orderId}?t=${encodeURIComponent(result.orderToken ?? '')}`);
    } catch (e) {
      // The server answered: this attempt is over, so the next one gets a new key.
      if (e instanceof ApiError) attemptKey.current = null;
      setError(
        e instanceof ApiError
          ? e.message
          : 'We could not reach the shop. Check your connection and try again.',
      );
      if (e instanceof ApiError && (e.code === 'price_changed' || e.code === 'basket_invalid')) {
        router.refresh(); // reload the menu so the summary shows current prices
      }
      setBusy(false);
    }
  }

  if (!basket.ready) return <p className="mt-6 text-ink-700">Loading your basket…</p>;
  if (basket.lines.length === 0) {
    return (
      <div className="mt-6">
        <p className="text-lg text-ink-700">Your basket is empty.</p>
        <Link href="/menu" className={buttonClasses('primary', 'lg') + ' mt-4'}>
          See the menu
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {shop.paused && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">
            {shop.pausedMessage || 'We are not taking orders right now. Please try again later.'}
          </p>
        )}
        {paymentsOff && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">
            Online payment is not set up yet, so orders cannot be placed.
          </p>
        )}

        <fieldset className={card}>
          <legend className="float-left mb-3 w-full text-xl">Delivery or collection</legend>
          <div className="clear-both grid gap-2 sm:grid-cols-2">
            {(['collection', 'delivery'] as const).map((option) => (
              <label key={option} className={choice}>
                <input
                  type="radio"
                  name="fulfilment"
                  className="size-4 accent-red-500"
                  checked={fulfilment === option}
                  onChange={() => setFulfilment(option)}
                />
                <span>
                  <span className="font-semibold">
                    {option === 'collection' ? 'Collection' : 'Delivery'}
                  </span>
                  <span className="block text-sm text-ink-700">
                    about {option === 'collection' ? shop.collectionMinutes : shop.deliveryMinutes}{' '}
                    minutes
                  </span>
                </span>
              </label>
            ))}
          </div>

          {fulfilment === 'delivery' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="postcode">
                  Postcode
                </label>
                <input
                  id="postcode"
                  className={field + ' max-w-48 uppercase'}
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  autoComplete="postal-code"
                  required
                  aria-describedby="postcode-result"
                />
                <p id="postcode-result" role="status" className="mt-1 text-sm">
                  {zone === undefined && (
                    <span className="text-ink-700">
                      Enter your full postcode to check delivery.
                    </span>
                  )}
                  {zone === null && (
                    <span className="font-semibold text-red-700">
                      Sorry, we do not deliver to that postcode. You can still order for collection.
                    </span>
                  )}
                  {zone && (
                    <span className="font-semibold text-green-700">
                      We deliver there. Delivery {formatPence(zone.feePence)}, minimum order{' '}
                      {formatPence(zone.minOrderPence)}.
                    </span>
                  )}
                </p>
              </div>
              {/* TODO(credentials): address lookup (for example getAddress.io) once an API key is available. */}
              <div className="sm:col-span-2">
                <label className={label} htmlFor="line1">
                  Address line 1
                </label>
                <input
                  id="line1"
                  className={field}
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  autoComplete="address-line1"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="line2">
                  Address line 2{' '}
                  <span className="text-sm font-normal text-ink-700">(optional)</span>
                </label>
                <input
                  id="line2"
                  className={field}
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  autoComplete="address-line2"
                  maxLength={100}
                />
              </div>
              <div>
                <label className={label} htmlFor="town">
                  Town
                </label>
                <input
                  id="town"
                  className={field}
                  value={town}
                  onChange={(e) => setTown(e.target.value)}
                  autoComplete="address-level2"
                  maxLength={60}
                  required
                />
              </div>
            </div>
          )}
        </fieldset>

        <section className={card} aria-labelledby="when-heading">
          <h2 id="when-heading" className="text-xl">
            When
          </h2>
          {nothingBookable ? (
            <p role="alert" className="mt-2 font-semibold text-red-700">
              There are no times available to order for at the moment.
            </p>
          ) : (
            <>
              <label className="sr-only" htmlFor="when">
                Time
              </label>
              <select
                id="when"
                className={field}
                value={effectiveWhen}
                onChange={(e) => setWhen(e.target.value)}
              >
                {shop.isOpen && <option value="asap">As soon as possible</option>}
                {slots.map((slot) => (
                  <option key={slot.toISOString()} value={slot.toISOString()}>
                    {formatWhen(slot.toISOString(), shop.timezone, now)}
                  </option>
                ))}
              </select>
              {!shop.isOpen && (
                <p className="mt-2 text-sm text-ink-700">
                  We are closed right now, so choose a time for when we are open.
                </p>
              )}
            </>
          )}
        </section>

        <section className={card} aria-labelledby="details-heading">
          <h2 id="details-heading" className="text-xl">
            Your details
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="name">
                Name
              </label>
              <input
                id="name"
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className={field}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                aria-describedby="email-hint"
              />
              <p id="email-hint" className="mt-1 text-sm text-ink-700">
                For your order confirmation.
              </p>
            </div>
            <div>
              <label className={label} htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                className={field}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                required
                aria-describedby="phone-hint"
              />
              <p id="phone-hint" className="mt-1 text-sm text-ink-700">
                In case we need to reach you about this order.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="notes">
                Notes for the shop{' '}
                <span className="text-sm font-normal text-ink-700">(optional)</span>
              </label>
              <textarea
                id="notes"
                className={field + ' min-h-20 py-2'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={300}
              />
            </div>
          </div>
        </section>

        {fulfilment === 'delivery' && shop.tipsEnabled && (
          <fieldset className={card}>
            <legend className="float-left mb-3 w-full text-xl">Tip for your driver</legend>
            <div className="clear-both flex flex-wrap gap-2">
              {TIP_CHOICES.map((amount) => (
                <label key={amount} className={choice}>
                  <input
                    type="radio"
                    name="tip"
                    className="size-4 accent-red-500"
                    checked={tipPence === amount}
                    onChange={() => setTipPence(amount)}
                  />
                  {amount === 0 ? 'No tip' : formatPence(amount)}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <section className={card} aria-labelledby="allergen-heading">
          <h2 id="allergen-heading" className="text-xl">
            Allergens
          </h2>
          {unconfirmed.length > 0 && (
            <p className="mt-2 text-sm">
              <span className="font-semibold">
                Allergen information has not been confirmed for: {unconfirmed.join(', ')}.
              </span>{' '}
              If you or anyone you are ordering for has a food allergy or intolerance, please
              contact the shop before ordering.
            </p>
          )}
          {priced.lines.some((l) => l.allergensConfirmed) && (
            <ul className="mt-2 space-y-1 text-sm">
              {priced.lines
                .filter((l) => l.allergensConfirmed)
                .map((l) => (
                  <li key={l.lineIndex}>
                    <span className="font-semibold">{l.name}:</span>{' '}
                    {l.allergens.length
                      ? l.allergens
                          .map(
                            (a) =>
                              `${a.mayContain ? 'may contain ' : ''}${allergenNames.get(a.code) ?? a.code}`,
                          )
                          .join(', ')
                      : 'none of the 14 major allergens'}
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-ink-700">
            Extra toppings and crusts can add allergens, and everything is prepared in one kitchen.
          </p>
          <label className="mt-3 flex min-h-12 items-start gap-3 font-semibold">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-red-500"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              required
            />
            I have read the allergen information above
          </label>
        </section>
      </div>

      <aside className={card + ' h-fit lg:sticky lg:top-20'}>
        <h2 className="text-xl">Your order</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {priced.lines.map((line) => (
            <li key={line.lineIndex} className="flex justify-between gap-3">
              <span>
                {line.quantity} × {line.name}
                <span className="block text-ink-700">{line.variantName}</span>
              </span>
              <span className="tabular-nums">{formatPence(line.lineTotalPence)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-ink-900/10 pt-3 text-sm" aria-live="polite">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatPence(priced.subtotalPence)}</dd>
          </div>
          {fulfilment === 'delivery' && (
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd className="tabular-nums">
                {zone ? formatPence(priced.deliveryFeePence) : 'Enter postcode'}
              </dd>
            </div>
          )}
          {priced.tipPence > 0 && (
            <div className="flex justify-between">
              <dt>Tip</dt>
              <dd className="tabular-nums">{formatPence(priced.tipPence)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-2 text-base">
            <dt className="font-semibold">Total</dt>
            <dd className="font-display text-2xl font-black tabular-nums">
              {formatPence(priced.totalPence)}
            </dd>
          </div>
          <p className="text-ink-700">Includes VAT of {formatPence(priced.vatPence)}</p>
        </dl>

        {blockingProblem && (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
            {blockingProblem.message}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          disabled={busy || paymentsOff || shop.paused || nothingBookable || !priced.ok}
        >
          {busy ? 'Placing your order…' : 'Continue to payment'}
        </Button>
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
        <Link
          href="/basket"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-red-600 underline underline-offset-2"
        >
          Edit basket
        </Link>
      </aside>
    </form>
  );
}
