'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { MAX_LINE_QUANTITY, formatPence, priceBasket } from '@mp/pricing';
import { buttonClasses } from '@mp/ui';
import type { Menu } from '@mp/validation';
import { useBasket } from '@/lib/basket';
import { lowestPrice } from '@/lib/menu';

const stepButton =
  'inline-flex size-11 items-center justify-center rounded-full bg-white text-xl font-semibold ring-1 ring-ink-900/15 hover:bg-cream-200 disabled:opacity-40';

const UPSELL_CATEGORIES = ['drinks', 'dips', 'desserts'];

/** Quick extras: things with one price and no choices, not already in the basket. */
function suggestions(menu: Menu, inBasket: Set<string>) {
  return UPSELL_CATEGORIES.flatMap((slug) => {
    const category = menu.categories.find((c) => c.slug === slug);
    return (category?.items ?? [])
      .filter(
        (item) =>
          !item.soldOut &&
          item.variants.length === 1 &&
          item.optionGroups.length === 0 &&
          !inBasket.has(item.id),
      )
      .slice(0, 2);
  });
}

export function BasketView({ menu }: { menu: Menu }) {
  const basket = useBasket();

  // Preview only: priced as collection so no postcode is needed yet. The
  // delivery fee is added at checkout, and the server prices everything again.
  const priced = useMemo(
    () => priceBasket(basket.lines, menu, { fulfilment: 'collection', tipPence: 0 }),
    [basket.lines, menu],
  );

  if (!basket.ready) {
    return <p className="mt-6 text-ink-700">Loading your basket…</p>;
  }

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

  const extras = suggestions(menu, new Set(basket.lines.map((l) => l.itemId)));
  const hasLineProblems = priced.problems.some((p) => p.lineIndex !== undefined);

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <ul className="divide-y divide-ink-900/10 rounded-xl bg-white shadow-card ring-1 ring-ink-900/5">
          {basket.lines.map((line, index) => {
            const pricedLine = priced.lines.find((l) => l.lineIndex === index);
            const problem = priced.problems.find((p) => p.lineIndex === index);
            return (
              <li key={line.key} className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
                <div className="min-w-0 flex-1 basis-48">
                  {pricedLine ? (
                    <>
                      <p className="font-display text-lg font-black leading-tight">
                        <Link
                          href={`/menu/${pricedLine.categorySlug}/${pricedLine.itemSlug}`}
                          className="hover:text-red-600"
                        >
                          {pricedLine.name}
                        </Link>
                      </p>
                      <p className="text-sm text-ink-700">{pricedLine.variantName}</p>
                      {pricedLine.options.length > 0 && (
                        <ul className="mt-1 text-sm text-ink-700">
                          {pricedLine.options.map((option) => (
                            <li key={option.optionId}>
                              {option.name}
                              {option.pricePence > 0 && ` (+${formatPence(option.pricePence)})`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {pricedLine.notes && (
                        <p className="mt-1 text-sm italic text-ink-700">
                          &ldquo;{pricedLine.notes}&rdquo;
                        </p>
                      )}
                    </>
                  ) : (
                    <p role="alert" className="font-semibold text-red-700">
                      {problem?.message ?? 'This item is no longer available.'} Please remove it.
                    </p>
                  )}
                </div>

                {pricedLine && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={stepButton}
                      aria-label={`One fewer ${pricedLine.name}`}
                      onClick={() => basket.setQuantity(line.key, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center font-semibold tabular-nums">
                      <span className="sr-only">Quantity </span>
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      className={stepButton}
                      aria-label={`One more ${pricedLine.name}`}
                      disabled={line.quantity >= MAX_LINE_QUANTITY}
                      onClick={() => basket.setQuantity(line.key, line.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                )}

                <div className="flex min-w-20 flex-col items-end gap-1">
                  {pricedLine && (
                    <p className="font-semibold tabular-nums">
                      {formatPence(pricedLine.lineTotalPence)}
                    </p>
                  )}
                  <button
                    type="button"
                    className="min-h-11 text-sm font-semibold text-red-700 underline underline-offset-2"
                    onClick={() => basket.remove(line.key)}
                  >
                    Remove
                    <span className="sr-only"> {pricedLine?.name ?? 'unavailable item'}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {extras.length > 0 && (
          <section className="mt-8" aria-labelledby="extras-heading">
            <h2 id="extras-heading" className="text-2xl">
              Add a drink, dip or dessert?
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {extras.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-2 ring-1 ring-ink-900/10"
                >
                  <span>
                    <span className="font-semibold">{item.name}</span>{' '}
                    <span className="text-sm tabular-nums text-ink-700">
                      {formatPence(lowestPrice(item))}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={buttonClasses('outline')}
                    onClick={() =>
                      basket.add({
                        itemId: item.id,
                        variantId: item.variants[0]!.id,
                        quantity: 1,
                        selections: [],
                      })
                    }
                  >
                    Add<span className="sr-only"> {item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="h-fit rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-900/5">
        <h2 className="text-xl">Summary</h2>
        <dl className="mt-3 flex items-center justify-between text-lg">
          <dt>Subtotal</dt>
          <dd className="font-display text-2xl font-black tabular-nums" aria-live="polite">
            {formatPence(priced.subtotalPence)}
          </dd>
        </dl>
        <p className="mt-1 text-sm text-ink-700">
          Prices include VAT. Delivery, if you choose it, is added at checkout.
        </p>
        {hasLineProblems ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-red-700">
            Remove the unavailable items to continue.
          </p>
        ) : (
          <Link href="/checkout" className={buttonClasses('primary', 'lg') + ' mt-4 w-full'}>
            Go to checkout
          </Link>
        )}
        <Link
          href="/menu"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-red-600 underline underline-offset-2"
        >
          Add more from the menu
        </Link>
      </aside>
    </div>
  );
}
