'use client';

import { useMemo, useState } from 'react';
import { checkSelection, formatPence, optionPrice, priceItem } from '@mp/pricing';
import { Button } from '@mp/ui';
import type { MenuItem } from '@mp/validation';
import type { ResolvedGroup } from '@/lib/menu';

const choiceClasses =
  'flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-4 py-2 ring-1 ring-ink-900/15 ' +
  'transition-colors duration-150 hover:bg-cream-200 has-[:checked]:bg-red-50 has-[:checked]:ring-2 has-[:checked]:ring-red-500 ' +
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink-900 ' +
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';

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
  const [variantSlug, setVariantSlug] = useState(item.variants[0]!.slug);
  const [selected, setSelected] = useState(() => initialSelection(groups));

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

  return (
    <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
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
                    onChange={() => setVariantSlug(v.slug)}
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

      <div className="sticky bottom-0 -mx-4 border-t border-ink-900/10 bg-cream-100/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:bg-white">
        <div className="flex items-center justify-between gap-4">
          <p aria-live="polite" className="text-lg">
            Total{' '}
            <span className="font-display text-2xl font-black tabular-nums">
              {formatPence(price.totalPence)}
            </span>
          </p>
          {/* Basket and checkout arrive in Phase 3. */}
          <Button type="submit" size="lg" disabled aria-describedby="ordering-note">
            {item.soldOut ? 'Sold out' : 'Add to basket'}
          </Button>
        </div>
        <p id="ordering-note" className="mt-2 text-sm text-ink-700">
          {problems.length > 0
            ? 'Please complete the choices above.'
            : 'Online ordering opens soon. Prices include VAT.'}
        </p>
      </div>
    </form>
  );
}
