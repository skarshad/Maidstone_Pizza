'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@mp/api-client';
import { parsePounds, penceToInput } from '@mp/pricing';
import type { AdminMenuItem, AdminMenuOption } from '@mp/validation';
import { browserApi } from '@/lib/api-browser';
import { endOfTradingDay } from '@/lib/menu-form';

const small =
  'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ring-1 ring-ink-900/15 hover:bg-cream-200 disabled:opacity-50';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function ItemQuickActions({ item }: { item: AdminMenuItem }) {
  const { busy, error, run } = useAction();
  const api = browserApi();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        className={small}
        disabled={busy}
        onClick={() =>
          run(() =>
            api.admin.setItemAvailability(item.id, {
              soldOutUntil: item.soldOut ? null : endOfTradingDay(new Date()),
            }),
          )
        }
      >
        {item.soldOut ? 'Back on sale' : 'Sold out today'}
        <span className="sr-only">: {item.name}</span>
      </button>
      <button
        type="button"
        className={small}
        disabled={busy}
        onClick={() =>
          run(() => api.admin.setItemAvailability(item.id, { isPublished: !item.isPublished }))
        }
      >
        {item.isPublished ? 'Hide' : 'Show'}
        <span className="sr-only">: {item.name}</span>
      </button>
      {error && (
        <span role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}

export function CategoryToggle({
  id,
  name,
  isPublished,
}: {
  id: string;
  name: string;
  isPublished: boolean;
}) {
  const { busy, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        className={small}
        disabled={busy}
        onClick={() =>
          run(() => browserApi().admin.updateCategory(id, { isPublished: !isPublished }))
        }
      >
        {isPublished ? 'Hide category' : 'Show category'}
        <span className="sr-only">: {name}</span>
      </button>
      {error && (
        <span role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </span>
      )}
    </>
  );
}

const field =
  'min-h-11 w-full rounded-lg border border-ink-900/20 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500';

/** One editable row for a base, crust or topping. */
export function OptionRow({ option, sizeKeys }: { option: AdminMenuOption; sizeKeys: string[] }) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState(option.name);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      sizeKeys.map((key) => [key, penceToInput(option.prices[key] ?? option.pricePence)]),
    ),
  );
  const [isPublished, setIsPublished] = useState(option.isPublished);
  const [soldOut, setSoldOut] = useState(option.soldOut);
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    const parsed = Object.fromEntries(
      Object.entries(prices).map(([key, value]) => [key, parsePounds(value)]),
    );
    if (Object.values(parsed).some((p) => p === null) || !name.trim()) {
      setProblem('Enter a name and prices like 1.20.');
      return;
    }
    setProblem(null);
    run(() =>
      browserApi().admin.saveOption(option.id, {
        name: name.trim(),
        pricePence: option.pricePence,
        isPublished,
        // Keep an existing timed sell-out unless the tick box was changed.
        soldOutUntil: soldOut ? (option.soldOut ? option.soldOutUntil : 'infinity') : null,
        prices: parsed as Record<string, number>,
        allergens: option.allergens,
      }),
    );
  }

  return (
    <tr className="border-t border-ink-900/10 align-middle">
      <td className="py-2 pr-2">
        <input
          aria-label="Name"
          className={field}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      {sizeKeys.map((key) => (
        <td key={key} className="w-24 py-2 pr-2">
          <input
            aria-label={`${option.name} price, ${key}`}
            className={field + ' tabular-nums'}
            inputMode="decimal"
            value={prices[key]}
            onChange={(e) => setPrices((current) => ({ ...current, [key]: e.target.value }))}
          />
        </td>
      ))}
      <td className="py-2 pr-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-red-500"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          Shown
        </label>
      </td>
      <td className="py-2 pr-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-red-500"
            checked={soldOut}
            onChange={(e) => setSoldOut(e.target.checked)}
          />
          Sold out
        </label>
      </td>
      <td className="py-2 text-right">
        <button type="button" className={small} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
          <span className="sr-only">: {option.name}</span>
        </button>
        {(problem ?? error) && (
          <p role="alert" className="mt-1 text-sm font-semibold text-red-700">
            {problem ?? error}
          </p>
        )}
      </td>
    </tr>
  );
}
