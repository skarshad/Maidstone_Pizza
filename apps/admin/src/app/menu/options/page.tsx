import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
import { OptionRow } from '@/components/menu/menu-actions';
import { serverApi } from '@/lib/api-server';
import { requireManager } from '@/lib/staff';

export const metadata: Metadata = { title: 'Bases & toppings' };
export const dynamic = 'force-dynamic';

const SIZE_ORDER = ['small', 'medium', 'large'];

export default async function OptionsPage() {
  const user = await requireManager();
  const menu = await (await serverApi()).admin.menu().catch(() => null);

  return (
    <AdminShell user={user}>
      <h1 className="text-2xl">Bases &amp; toppings</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-500">
        Prices are per size and include VAT. Untick &ldquo;Shown&rdquo; to remove a choice from the
        menu, or tick &ldquo;Sold out&rdquo; to keep it visible but unavailable.
      </p>
      {!menu && (
        <p role="alert" className="mt-3 font-semibold text-red-700">
          Could not load the menu. Check that the API is running, then refresh.
        </p>
      )}
      {menu?.optionGroups.map((group) => {
        const keys = [...new Set(group.options.flatMap((o) => Object.keys(o.prices)))].sort(
          (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b) || a.localeCompare(b),
        );
        return (
          <section key={group.id} className="mt-8" aria-labelledby={`group-${group.id}`}>
            <h2 id={`group-${group.id}`} className="text-xl">
              {group.name}
            </h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th scope="col" className="py-2 pr-2 font-semibold">
                      Name
                    </th>
                    {keys.map((key) => (
                      <th key={key} scope="col" className="py-2 pr-2 font-semibold">
                        {key} £
                      </th>
                    ))}
                    <th scope="col" className="py-2 pr-2 font-semibold">
                      Menu
                    </th>
                    <th scope="col" className="py-2 pr-2 font-semibold">
                      Stock
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      <span className="sr-only">Save</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.options.map((option) => (
                    <OptionRow key={option.id} option={option} sizeKeys={keys} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </AdminShell>
  );
}
