import Link from 'next/link';
import { formatPence } from '@mp/pricing';
import { Badge, Sunburst } from '@mp/ui';
import type { Menu, MenuCategory, MenuItem } from '@mp/validation';
import { lowestPrice } from '@/lib/menu';

export function TagBadges({ item, menu }: { item: MenuItem; menu: Menu }) {
  if (item.tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {item.tags.map((code) => (
        <Badge key={code} tone={code === 'spicy' ? 'red' : 'green'}>
          {menu.dietaryTags.find((t) => t.code === code)?.name ?? code}
        </Badge>
      ))}
    </span>
  );
}

export function CategoryNav({ menu, current }: { menu: Menu; current: string }) {
  return (
    <nav
      aria-label="Menu categories"
      className="sticky top-16 z-30 border-b border-ink-900/10 bg-cream-100/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3">
        {menu.categories.map((category) => {
          const active = category.slug === current;
          return (
            <li key={category.id} className="shrink-0">
              <Link
                href={`/menu/${category.slug}`}
                aria-current={active ? 'page' : undefined}
                className={
                  'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-150 ' +
                  (active
                    ? 'bg-red-500 text-white'
                    : 'bg-white text-ink-900 ring-1 ring-ink-900/10 hover:bg-cream-200')
                }
              >
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ItemCard({
  item,
  category,
  menu,
}: {
  item: MenuItem;
  category: MenuCategory;
  menu: Menu;
}) {
  const single = item.variants.length === 1;
  return (
    <li>
      <Link
        href={`/menu/${category.slug}/${item.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-ink-900/5 transition-shadow duration-150 hover:shadow-raised"
      >
        <div
          className={
            'relative flex items-end overflow-hidden bg-cream-200 px-4 pb-3 ' +
            (item.imageUrl ? 'h-44' : 'h-24')
          }
        >
          {item.imageUrl ? (
            // Plain img so animated GIFs play. Decorative: the name is right below.
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <Sunburst className="pointer-events-none absolute -bottom-8 left-1/2 w-72 -translate-x-1/2 text-red-500/15" />
          )}
          <span className="relative rounded-full bg-ink-900 px-3 py-1 text-sm font-semibold text-cream-100">
            {single ? '' : 'from '}
            {formatPence(lowestPrice(item))}
          </span>
          {item.soldOut && (
            <span className="relative ml-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-red-700 ring-1 ring-red-500/30">
              Sold out
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="text-xl leading-tight group-hover:text-red-600">{item.name}</h3>
          <p className="text-sm text-ink-700">{item.description}</p>
          <div className="mt-auto pt-1">
            <TagBadges item={item} menu={menu} />
          </div>
        </div>
      </Link>
    </li>
  );
}

export function AllergenPanel({ item, menu }: { item: MenuItem; menu: Menu }) {
  const nameOf = (code: string) => menu.allergens.find((a) => a.code === code)?.name ?? code;
  const contains = item.allergens.filter((a) => !a.mayContain);
  const mayContain = item.allergens.filter((a) => a.mayContain);

  return (
    <section
      aria-labelledby="allergens-heading"
      className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-900/5"
    >
      <h2 id="allergens-heading" className="text-xl">
        Allergens
      </h2>
      {item.allergensConfirmed ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="font-semibold">Contains: </span>
            {contains.length
              ? contains.map((a) => nameOf(a.code)).join(', ')
              : 'none of the 14 major allergens'}
          </p>
          {mayContain.length > 0 && (
            <p>
              <span className="font-semibold">May contain: </span>
              {mayContain.map((a) => nameOf(a.code)).join(', ')}
            </p>
          )}
          <p className="text-ink-700">
            Extra toppings and crusts can add allergens. Everything is prepared in one kitchen, so
            we cannot guarantee any item is free from traces of other allergens.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm">
          <span className="font-semibold">
            Allergen information for this item has not been confirmed yet.
          </span>{' '}
          If you have a food allergy or intolerance, please contact the shop before ordering.
        </p>
      )}
    </section>
  );
}

export function MenuUnavailable() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl">The menu is taking a moment</h1>
      <p className="mt-3 text-ink-700">
        We could not load the menu just now. Please refresh the page in a minute.
      </p>
    </div>
  );
}
