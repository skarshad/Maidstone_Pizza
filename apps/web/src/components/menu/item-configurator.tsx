'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  MAX_LINE_QUANTITY,
  checkSelection,
  formatPence,
  optionPrice,
  priceItem,
} from '@mp/pricing';
import { Button, buttonClasses } from '@mp/ui';
import type { MenuItem } from '@mp/validation';
import { useBasket } from '@/lib/basket';
import type { ResolvedGroup } from '@/lib/menu';

const choiceClasses =
  'flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-4 py-2 ring-1 ring-ink-900/15 ' +
  'transition-colors duration-150 hover:bg-cream-200 has-[:checked]:bg-red-50 has-[:checked]:ring-2 has-[:checked]:ring-red-500 ' +
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink-900 ' +
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';

const stepButton =
  'inline-flex size-11 items-center justify-center rounded-full bg-white text-xl font-semibold ring-1 ring-ink-900/15 hover:bg-cream-200 disabled:opacity-40';

const isSingleChoice = (g: ResolvedGroup) => g.minSelect === 1 && g.maxSelect === 1;

function initialSelection(groups: ResolvedGroup[]): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((g) => {
      const first = g.group.options.find((o) => !o.soldOut);
      return [g.group.id, isSingleChoice(g) && first ? [first.id] : []];
    }),
  );
}

export function ItemConfigurator({ item, groups }: { item: MenuItem; groups: ResolvedGroup[] }) {
  const basket = useBasket();
  const [variantSlug, setVariantSlug] = useState(item.variants[0]!.slug);
  const [selected, setSelected] = useState(() => initialSelection(groups));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [added, setAdded] = useState(0);

  const variant = item.variants.find((v) => v.slug === variantSlug) ?? item.variants[0]!;

  const { price, problems } = useMemo(() => {
    const selections = groups.map((g) => ({
      groupId: g.group.id,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      freeSelect: g.freeSelect,
      selected: g.group.options.filter((o) => (selected[g.group.id] ?? []).includes(o.id)),
    }));
    return { price: priceItem(variant, selections), problems: checkSelection(selections) };
  }, [groups, selected, variant]);

  function toggle(group: ResolvedGroup, optionId: string) {
    setAdded(0);
    setSelected((current) => {
      const chosen = current[group.group.id] ?? [];
      if (isSingleChoice(group)) return { ...current, [group.group.id]: [optionId] };
      if (chosen.includes(optionId)) {
        return { ...current, [group.group.id]: chosen.filter((id) => id !== optionId) };
      }
      if (group.maxSelect !== null && chosen.length >= group.maxSelect) return current;
      return { ...current, [group.group.id]: [...chosen, optionId] };
    });
  }

  const canAdd = !item.soldOut && problems.length === 0;

  function addToBasket() {
    if (!canAdd) return;
    basket.add({
      itemId: item.id,
      variantId: variant.id,
      quantity,
      selections: groups.map((g) => ({
        groupId: g.group.id,
        optionIds: selected[g.group.id] ?? [],
      })),
      notes,
    });
    setAdded(quantity);
    setQuantity(1);
    setNotes('');
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        addToBasket();
      }}
    >
      {item.variants.length > 1 && (
        <fieldset>
          <legend className="text-lg font-semibold">Size</legend>
          <div className="mt-2 grid gap-2">
            {item.variants.map((v) => (
              <label key={v.id} className={choiceClasses}>
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="size"
                    value={v.slug}
                    checked={v.slug === variant.slug}
                    onChange={() => {
                      setAdded(0);
                      setVariantSlug(v.slug);
                    }}
                    className="size-4 accent-red-500"
                  />
                  {v.name}
                </span>
                <span className="font-semibold tabular-nums">{formatPence(v.pricePence)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {groups.map((g) => {
        const chosen = selected[g.group.id] ?? [];
        const single = isSingleChoice(g);
        const atLimit = !single && g.maxSelect !== null && chosen.length >= g.maxSelect;
        const hintId = `hint-${g.group.id}`;
        return (
          <fieldset key={g.group.id} aria-describedby={single ? undefined : hintId}>
            <legend className="text-lg font-semibold">{g.group.name}</legend>
            {!single && (
              <p id={hintId} className="mt-1 text-sm text-ink-700">
                {g.maxSelect !== null ? `Choose up to ${g.maxSelect}. ` : ''}
                {g.freeSelect > 0 ? `${g.freeSelect} included in the price. ` : ''}
                {chosen.length} chosen.
              </p>
            )}
            <div className={'mt-2 grid gap-2 ' + (single ? '' : 'sm:grid-cols-2')}>
              {g.group.options.map((option) => {
                const checked = chosen.includes(option.id);
                const cost = optionPrice(option, variant.slug);
                return (
                  <label key={option.id} className={choiceClasses}>
                    <span className="flex items-center gap-3">
                      <input
                        type={single ? 'radio' : 'checkbox'}
                        name={g.group.id}
                        checked={checked}
                        disabled={option.soldOut || (!checked && atLimit)}
                        onChange={() => toggle(g, option.id)}
                        className="size-4 accent-red-500"
                      />
                      <span>
                        {option.name}
                        {option.soldOut && <span className="text-red-700"> (sold out)</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-ink-700">
                      {cost > 0 ? `+${formatPence(cost)}` : single ? 'No extra' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div>
        <label htmlFor="item-notes" className="text-lg font-semibold">
          Special instructions <span className="text-sm font-normal text-ink-700">(optional)</span>
        </label>
        <input
          id="item-notes"
          value={notes}
          maxLength={200}
          onChange={(event) => setNotes(event.target.value)}
          aria-describedby="item-notes-hint"
          className="mt-2 min-h-12 w-full rounded-lg border border-ink-900/20 bg-white px-4"
        />
        <p id="item-notes-hint" className="mt-1 text-sm text-ink-700">
          For example &ldquo;well done&rdquo;. Please do not use this for allergies: contact the
          shop instead.
        </p>
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-ink-900/10 bg-cream-100/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={stepButton}
              aria-label="One fewer"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span
              className="min-w-6 text-center text-lg font-semibold tabular-nums"
              aria-live="polite"
            >
              <span className="sr-only">Quantity </span>
              {quantity}
            </span>
            <button
              type="button"
              className={stepButton}
              aria-label="One more"
              disabled={quantity >= MAX_LINE_QUANTITY}
              onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
            >
              +
            </button>
          </div>
          <Button type="submit" size="lg" disabled={!canAdd}>
            {item.soldOut
              ? 'Sold out'
              : `Add to basket · ${formatPence(price.totalPence * quantity)}`}
          </Button>
        </div>
        <div role="status" className="mt-2 text-sm">
          {added > 0 ? (
            <p className="flex flex-wrap items-center gap-3 font-semibold text-green-700">
              Added {added} to your basket.
              <Link href="/basket" className={buttonClasses('secondary')}>
                View basket
              </Link>
            </p>
          ) : (
            <p className="text-ink-700">
              {problems.length > 0 ? 'Please complete the choices above.' : 'Prices include VAT.'}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
