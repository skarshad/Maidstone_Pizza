import type { Metadata } from 'next';
import { CheckoutForm } from '@/components/checkout/checkout-form';
import { MenuUnavailable } from '@/components/menu/menu-parts';
import { serverApi } from '@/lib/api-server';
import { getMenu } from '@/lib/menu';
import { currentUser } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const api = await serverApi();
  const [menu, shop, user] = await Promise.all([
    getMenu(),
    api.shop().catch(() => null),
    currentUser(),
  ]);
  if (!menu || !shop) return <MenuUnavailable />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-4xl">Checkout</h1>
      {!user && (
        <p className="mt-2 text-sm text-ink-700">
          You are checking out as a guest. Sign in first if you want this order saved to your
          account.
        </p>
      )}
      <CheckoutForm menu={menu} shop={shop} defaultEmail={user?.email ?? ''} />
    </div>
  );
}
