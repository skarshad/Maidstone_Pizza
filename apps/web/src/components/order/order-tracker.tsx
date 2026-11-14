'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPence } from '@mp/pricing';
import { buttonClasses } from '@mp/ui';
import type { OrderView } from '@mp/validation';
import { PaymentPanel } from '@/components/order/payment-panel';
import { browserApi } from '@/lib/api';
import { useBasket } from '@/lib/basket';
import {
  STATUS_LABEL,
  formatTime,
  formatWhen,
  headline,
  isFinished,
  progressSteps,
} from '@/lib/order-display';
import { recallPayment, takeBasketClearFor, type PaymentSession } from '@/lib/payment-session';

const card = 'rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-900/5';

export function OrderTracker({
  initial,
  orderToken,
  timezone,
}: {
  initial: OrderView;
  orderToken: string | null;
  timezone: string;
}) {
  const basket = useBasket();
  const [order, setOrder] = useState(initial);
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setSession(recallPayment(initial.id));
    setNow(new Date());
    // Back from an off-site payment step (Stripe adds these to the address).
    if (new URLSearchParams(window.location.search).has('payment_intent')) setSubmitted(true);
  }, [initial.id]);

  // Follow the order until it is finished. Live push updates arrive in Phase 4;
  // until then the page asks again every few seconds.
  const unpaid = order.status === 'PENDING_PAYMENT';
  const finished = isFinished(order.status);
  useEffect(() => {
    if (finished) return;
    const every = unpaid ? (submitted ? 2_000 : 10_000) : 15_000;
    const timer = setInterval(async () => {
      try {
        setOrder(await browserApi().order(initial.id, orderToken));
        setNow(new Date());
      } catch {
        // A missed check is fine; the next one will catch up.
      }
    }, every);
    return () => clearInterval(timer);
  }, [finished, unpaid, submitted, initial.id, orderToken]);

  // Empty the basket once the order placed from this tab is confirmed paid.
  const { ready, clear } = basket;
  useEffect(() => {
    if (ready && !unpaid && order.status !== 'CANCELLED' && takeBasketClearFor(order.id)) clear();
  }, [ready, unpaid, order.status, order.id, clear]);

  const steps = progressSteps(order.fulfilment);
  const reached = new Set(order.timeline.map((t) => t.status));
  const timeOf = (status: OrderView['status']) =>
    order.timeline.find((t) => t.status === status)?.at;
  const stopped =
    order.status === 'CANCELLED' || order.status === 'REJECTED' || order.status === 'REFUNDED';
  const delivery = order.fulfilment === 'delivery';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm font-semibold text-ink-700">Order #{order.orderNumber}</p>
      <h1 className="mt-1 text-3xl sm:text-4xl" aria-live="polite">
        {headline(order)}
      </h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {unpaid && (
            <section className={card} aria-labelledby="pay-heading">
              <h2 id="pay-heading" className="text-xl">
                Payment
              </h2>
              <div className="mt-3">
                {submitted ? (
                  <p role="status" className="font-semibold">
                    Confirming your payment… this usually takes a few seconds.
                  </p>
                ) : (
                  <PaymentPanel
                    orderId={order.id}
                    orderToken={orderToken}
                    totalPence={order.totalPence}
                    session={session}
                    onSubmitted={() => setSubmitted(true)}
                  />
                )}
              </div>
              <p className="mt-3 text-sm text-ink-700">
                Your order is sent to the kitchen once payment is confirmed. Unpaid orders are
                cancelled automatically.
              </p>
            </section>
          )}

          {!unpaid && !stopped && (
            <section className={card} aria-labelledby="progress-heading">
              <h2 id="progress-heading" className="text-xl">
                Progress
              </h2>
              <p className="mt-1 text-ink-700">
                {order.scheduledFor
                  ? `${delivery ? 'Delivery' : 'Collection'} booked for ${
                      now ? formatWhen(order.scheduledFor, timezone, now) : ''
                    }`
                  : `Estimated ${delivery ? 'delivery' : 'ready to collect'}: ${formatTime(
                      order.estimatedReadyAt,
                      timezone,
                    )}`}
              </p>
              <ol className="mt-4 space-y-3">
                {steps.map((step) => {
                  const done = reached.has(step);
                  const current = order.status === step;
                  const at = timeOf(step);
                  return (
                    <li key={step} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={
                          'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                          (done ? 'bg-green-500 text-white' : 'bg-cream-200 text-ink-500')
                        }
                      >
                        {done ? '✓' : ''}
                      </span>
                      <span className={current ? 'font-semibold' : done ? '' : 'text-ink-500'}>
                        {STATUS_LABEL[step]}
                        <span className="sr-only">
                          {current ? ' (current step)' : done ? ' (done)' : ' (not yet)'}
                        </span>
                      </span>
                      {at && (
                        <span className="ml-auto text-sm tabular-nums text-ink-700">
                          {formatTime(at, timezone)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {stopped && (
            <section className={card}>
              <p>
                {order.status === 'REFUNDED'
                  ? 'Your payment has been refunded. It can take a few days to reach your account.'
                  : order.paidAt
                    ? 'If you have paid, the shop will be in touch about your refund.'
                    : 'You have not been charged for this order.'}
              </p>
              <Link href="/menu" className={buttonClasses('primary') + ' mt-4'}>
                Back to the menu
              </Link>
            </section>
          )}

          {order.address && (
            <section className={card}>
              <h2 className="text-xl">Delivering to</h2>
              <p className="mt-2">
                {[
                  order.address.line1,
                  order.address.line2,
                  order.address.town,
                  order.address.postcode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </section>
          )}
        </div>

        <aside className={card + ' h-fit'}>
          <h2 className="text-xl">Your order</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>
                  <span className="font-semibold">
                    {item.quantity} × {item.name}
                  </span>
                  <span className="block text-ink-700">{item.variantName}</span>
                  {item.options.map((option, i) => (
                    <span key={i} className="block text-ink-700">
                      + {option.name}
                    </span>
                  ))}
                  {item.notes && <span className="block italic text-ink-700">“{item.notes}”</span>}
                </span>
                <span className="tabular-nums">{formatPence(item.lineTotalPence)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-ink-900/10 pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatPence(order.subtotalPence)}</dd>
            </div>
            {delivery && (
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd className="tabular-nums">{formatPence(order.deliveryFeePence)}</dd>
              </div>
            )}
            {order.tipPence > 0 && (
              <div className="flex justify-between">
                <dt>Tip</dt>
                <dd className="tabular-nums">{formatPence(order.tipPence)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-2 text-base">
              <dt className="font-semibold">{unpaid ? 'Total to pay' : 'Total'}</dt>
              <dd className="font-display text-2xl font-black tabular-nums">
                {formatPence(order.totalPence)}
              </dd>
            </div>
            <p className="text-ink-700">Includes VAT of {formatPence(order.vatPence)}</p>
          </dl>
          <p className="mt-4 text-sm text-ink-700">
            Food allergy or intolerance? Please contact the shop before your order is prepared.
          </p>
        </aside>
      </div>
    </div>
  );
}
