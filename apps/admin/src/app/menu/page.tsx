import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPence } from '@mp/pricing';
import { Badge, buttonClasses } from '@mp/ui';
import { AdminShell } from '@/components/admin-shell';
import { CategoryToggle, ItemQuickActions } from '@/components/menu/menu-actions';
import { serverApi } from '@/lib/api-server';
import { requireManager } from '@/lib/staff';

export const metadata: Metadata = { title: 'Menu' };
export const dynamic = 'force-dynamic';

export default async function MenuAdminPage() {
  const user = await requireManager();
  const menu = await (await serverApi()).admin.menu().catch(() => null);

  if (!menu) {
    return (
      <AdminShell user={user}>
        <h1 className="text-2xl">Menu</h1>
        <p role="alert" className="mt-3 font-semibold text-red-700">
          The menu could not be loaded. Check that the API is running, then refresh.
        </p>
      </AdminShell>
    );
  }

  const items = menu.categories.flatMap((c) => c.items);
  const unconfirmed = items.filter((i) => !i.allergensConfirmed).length;

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Menu</h1>
        <Link href="/menu/items/new" className={buttonClasses('primary')}>
          Add an item
        </Link>
      </div>
      {unconfirmed > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <span className="font-semibold">
            {unconfirmed} of {items.length} items have no confirmed allergen information.
          </span>{' '}
          Customers are told to contact the shop for those items. Open each item to enter and
          confirm its allergens.
        </p>
      )}

      {menu.categories.map((category) => (
        <section key={category.id} className="mt-8" aria-labelledby={`cat-${category.id}`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={`cat-${category.id}`} className="text-xl">
              {category.name}
            </h2>
            {!category.isPublished && <Badge tone="neutral">Hidden</Badge>}
            <CategoryToggle
              id={category.id}
              name={category.name}
              isPublished={category.isPublished}
            />
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Item
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Prices
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {category.items.map((item) => (
                  <tr key={item.id} className="border-t border-ink-900/10 align-middle">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <Link
                        href={`/menu/items/${item.id}`}
                        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
                      >
                        {item.name}
                      </Link>
                    </th>
                    <td className="py-2 pr-3 tabular-nums">
                      {item.variants.map((v) => formatPence(v.pricePence)).join(' / ')}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex flex-wrap gap-1.5">
                        {!item.isPublished && <Badge tone="neutral">Hidden</Badge>}
                        {item.soldOut && <Badge tone="red">Sold out</Badge>}
                        {!item.allergensConfirmed && (
                          <Badge tone="red">Allergens not confirmed</Badge>
                        )}
                        {item.isPublished && !item.soldOut && item.allergensConfirmed && (
                          <Badge tone="green">Live</Badge>
                        )}
                      </span>
                    </td>
                    <td className="py-2">
                      <ItemQuickActions item={item} />
                    </td>
                  </tr>
                ))}
                {category.items.length === 0 && (
                  <tr className="border-t border-ink-900/10">
                    <td colSpan={4} className="py-3 text-ink-500">
                      No items in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </AdminShell>
  );
}
