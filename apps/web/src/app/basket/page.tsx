import type { Metadata } from 'next';
import { BasketView } from '@/components/basket/basket-view';
import { MenuUnavailable } from '@/components/menu/menu-parts';
import { getMenu } from '@/lib/menu';

export const metadata: Metadata = { title: 'Your basket', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function BasketPage() {
  const menu = await getMenu();
  if (!menu) return <MenuUnavailable />;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-4xl">Your basket</h1>
      <BasketView menu={menu} />
    </div>
  );
}
