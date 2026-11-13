'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@mp/api-client';
import { parsePounds, penceToInput } from '@mp/pricing';
import { Button } from '@mp/ui';
import { saveMenuItemSchema, type AdminMenu, type AdminMenuItem } from '@mp/validation';
import { browserApi } from '@/lib/api-browser';
import { endOfTradingDay, slugify } from '@/lib/menu-form';

type AllergenState = 'no' | 'contains' | 'may';
type SoldOut = 'available' | 'today' | 'indefinite' | 'keep';

interface VariantRow {
  slug: string;
  name: string;
  price: string;
}

const input =
  'min-h-11 w-full rounded-lg border border-ink-900/20 bg-white px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500';
const label = 'block text-sm font-semibold';
const card = 'rounded-xl border border-ink-900/10 p-4';

export function ItemForm({ menu, item }: { menu: AdminMenu; item?: AdminMenuItem }) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? '');
  const [slug, setSlug] = useState(item?.slug ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? menu.categories[0]?.id ?? '');
  const [isPublished, setIsPublished] = useState(item?.isPublished ?? false);
  const [soldOut, setSoldOut] = useState<SoldOut>(
    !item?.soldOutUntil ? 'available' : item.soldOutUntil === 'infinity' ? 'indefinite' : 'keep',
  );
  const [variants, setVariants] = useState<VariantRow[]>(
    item?.variants.map((v) => ({
      slug: v.slug,
      name: v.name,
      price: penceToInput(v.pricePence),
    })) ?? [{ slug: 'standard', name: 'Standard', price: '' }],
  );
  const [groups, setGroups] = useState(() =>
    Object.fromEntries(
      menu.optionGroups.map((group) => {
        const ref = item?.optionGroups.find((g) => g.groupId === group.id);
        return [
          group.id,
          {
            enabled: Boolean(ref),
            maxSelect: ref?.maxSelect == null ? '' : String(ref.maxSelect),
            freeSelect: String(ref?.freeSelect ?? 0),
          },
        ];
      }),
    ),
  );
  const [allergens, setAllergens] = useState<Record<string, AllergenState>>(() =>
    Object.fromEntries(
      menu.allergens.map((a) => {
        const ref = item?.allergens.find((x) => x.code === a.code);
        return [a.code, ref ? (ref.mayContain ? 'may' : 'contains') : 'no'];
      }),
    ),
  );
  const [allergensConfirmed, setAllergensConfirmed] = useState(item?.allergensConfirmed ?? false);
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setVariant = (index: number, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const prices = variants.map((v) => parsePounds(v.price));
    if (prices.some((p) => p === null)) {
      setError('Enter each price in pounds and pence, for example 14.99.');
      return;
    }
    const wholeNumber = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : null);
    const optionGroups = [];
    for (const group of menu.optionGroups) {
      const state = groups[group.id]!;
      if (!state.enabled) continue;
      const maxSelect = state.maxSelect.trim() === '' ? null : wholeNumber(state.maxSelect);
      const freeSelect = wholeNumber(state.freeSelect);
      if ((state.maxSelect.trim() !== '' && maxSelect === null) || freeSelect === null) {
        setError(`"${group.name}": limits must be whole numbers.`);
        return;
      }
      optionGroups.push({ groupId: group.id, maxSelect, freeSelect });
    }

    const parsed = saveMenuItemSchema.safeParse({
      categoryId,
      slug: slug || slugify(name),
      name,
      description,
      sortOrder: item?.sortOrder,
      isPublished,
      soldOutUntil:
        soldOut === 'available'
          ? null
          : soldOut === 'indefinite'
            ? 'infinity'
            : soldOut === 'today'
              ? endOfTradingDay(new Date())
              : (item?.soldOutUntil ?? null),
      allergensConfirmed,
      variants: variants.map((v, i) => ({
        slug: v.slug || slugify(v.name),
        name: v.name,
        pricePence: prices[i]!,
      })),
      optionGroups,
      allergens: Object.entries(allergens)
        .filter(([, state]) => state !== 'no')
        .map(([code, state]) => ({ code, mayContain: state === 'may' })),
      tags,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setError(`${issue.path.join(' > ') || 'Form'}: ${issue.message}`);
      return;
    }

    setBusy(true);
    try {
      const api = browserApi();
      if (item) await api.admin.updateItem(item.id, parsed.data);
      else await api.admin.createItem(parsed.data);
      router.push('/menu');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Check your connection.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!window.confirm(`Delete "${item.name}" permanently? Hiding it is usually safer.`)) return;
    setBusy(true);
    try {
      await browserApi().admin.deleteItem(item.id);
      router.push('/menu');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 lg:grid-cols-2" noValidate>
      <section className={card}>
        <h2 className="text-lg">Details</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className={label} htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className={input}
              value={name}
              maxLength={80}
              required
              onChange={(e) => {
                setName(e.target.value);
                if (!item) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div>
            <label className={label} htmlFor="slug">
              Web address name
            </label>
            <input
              id="slug"
              className={input}
              value={slug}
              aria-describedby="slug-hint"
              onChange={(e) => setSlug(e.target.value)}
            />
            <p id="slug-hint" className="mt-1 text-xs text-ink-500">
              Lowercase letters, numbers and hyphens. Changing it breaks old links.
            </p>
          </div>
          <div>
            <label className={label} htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              className={input + ' min-h-24 py-2'}
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className={input}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5 accent-red-500"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
            Show on the menu
          </label>
          <div>
            <label className={label} htmlFor="soldout">
              Availability
            </label>
            <select
              id="soldout"
              className={input}
              value={soldOut}
              onChange={(e) => setSoldOut(e.target.value as SoldOut)}
            >
              <option value="available">Available</option>
              <option value="today">Sold out for today</option>
              <option value="indefinite">Sold out until switched back on</option>
              {soldOut === 'keep' && <option value="keep">Sold out (keep current end time)</option>}
            </select>
          </div>
          <fieldset>
            <legend className={label}>Labels</legend>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {menu.dietaryTags.map((tag) => (
                <label key={tag.code} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-red-500"
                    checked={tags.includes(tag.code)}
                    onChange={(e) =>
                      setTags((current) =>
                        e.target.checked
                          ? [...current, tag.code]
                          : current.filter((t) => t !== tag.code),
                      )
                    }
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <div className="space-y-4">
        <section className={card}>
          <h2 className="text-lg">Sizes and prices</h2>
          <p className="mt-1 text-xs text-ink-500">
            Prices include VAT. Use the keys small, medium and large for pizzas so crust and topping
            prices line up.
          </p>
          <div className="mt-3 space-y-2">
            {variants.map((variant, index) => (
              <div key={index} className="grid grid-cols-[6rem_1fr_6rem_auto] items-end gap-2">
                <div>
                  <label className="text-xs font-semibold" htmlFor={`v-slug-${index}`}>
                    Key
                  </label>
                  <input
                    id={`v-slug-${index}`}
                    className={input}
                    value={variant.slug}
                    onChange={(e) => setVariant(index, { slug: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold" htmlFor={`v-name-${index}`}>
                    Shown as
                  </label>
                  <input
                    id={`v-name-${index}`}
                    className={input}
                    value={variant.name}
                    onChange={(e) => setVariant(index, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold" htmlFor={`v-price-${index}`}>
                    Price £
                  </label>
                  <input
                    id={`v-price-${index}`}
                    className={input + ' tabular-nums'}
                    inputMode="decimal"
                    value={variant.price}
                    onChange={(e) => setVariant(index, { price: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm font-semibold text-red-700 underline disabled:opacity-40"
                  disabled={variants.length === 1}
                  onClick={() => setVariants((rows) => rows.filter((_, i) => i !== index))}
                >
                  Remove<span className="sr-only"> {variant.name}</span>
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 min-h-11 text-sm font-semibold underline"
            onClick={() => setVariants((rows) => [...rows, { slug: '', name: '', price: '' }])}
          >
            Add a size
          </button>
        </section>

        <section className={card}>
          <h2 className="text-lg">Choices offered with this item</h2>
          <div className="mt-2 space-y-3">
            {menu.optionGroups.map((group) => {
              const state = groups[group.id]!;
              const patch = (change: Partial<typeof state>) =>
                setGroups((current) => ({ ...current, [group.id]: { ...state, ...change } }));
              return (
                <div key={group.id}>
                  <label className="flex min-h-11 items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      className="size-5 accent-red-500"
                      checked={state.enabled}
                      onChange={(e) => patch({ enabled: e.target.checked })}
                    />
                    {group.name}
                  </label>
                  {state.enabled && group.maxSelect !== 1 && (
                    <div className="ml-8 grid max-w-sm grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold" htmlFor={`max-${group.id}`}>
                          Most a customer can pick
                        </label>
                        <input
                          id={`max-${group.id}`}
                          className={input}
                          inputMode="numeric"
                          placeholder="No limit"
                          value={state.maxSelect}
                          onChange={(e) => patch({ maxSelect: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold" htmlFor={`free-${group.id}`}>
                          Included in the price
                        </label>
                        <input
                          id={`free-${group.id}`}
                          className={input}
                          inputMode="numeric"
                          value={state.freeSelect}
                          onChange={(e) => patch({ freeSelect: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className={card + ' lg:col-span-2'}>
        <h2 className="text-lg">Allergens</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-500">
          Set each of the 14 allergens from your supplier and recipe information, then tick the
          confirmation. Until it is ticked, customers see &ldquo;not confirmed, contact the
          shop&rdquo; instead of this list.
        </p>
        <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {menu.allergens.map((allergen) => (
            <div key={allergen.code}>
              <label className="text-sm font-semibold" htmlFor={`al-${allergen.code}`}>
                {allergen.name}
              </label>
              <select
                id={`al-${allergen.code}`}
                className={input}
                value={allergens[allergen.code]}
                onChange={(e) => {
                  setAllergens((current) => ({
                    ...current,
                    [allergen.code]: e.target.value as AllergenState,
                  }));
                  // Any change needs confirming again.
                  setAllergensConfirmed(false);
                }}
              >
                <option value="no">Not in this item</option>
                <option value="contains">Contains</option>
                <option value="may">May contain</option>
              </select>
            </div>
          ))}
        </div>
        <label className="mt-4 flex min-h-11 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="size-5 accent-red-500"
            checked={allergensConfirmed}
            onChange={(e) => setAllergensConfirmed(e.target.checked)}
          />
          I have checked this allergen list and it is complete and correct
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : item ? 'Save changes' : 'Create item'}
        </Button>
        {item && (
          <Button type="button" variant="ghost" disabled={busy} onClick={remove}>
            Delete item
          </Button>
        )}
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      </div>
    </form>
  );
}
