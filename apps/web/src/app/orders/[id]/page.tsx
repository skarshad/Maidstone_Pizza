import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@mp/ui';
import { OrderTracker } from '@/components/order/order-tracker';
import { serverApi } from '@/lib/api-server';

// The address carries a private order token: keep it out of search engines and
// never send it to other sites.
export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = typeof t === 'string' && t ? t : null;

  const api = await serverApi();
  // Signed-in owners are recognised by their session; guests by the token.
  const [order, shop] = await Promise.all([
    api.order(id, token).catch(() => null),
    api.shop().catch(() => null),
  ]);

  if (!order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-3xl">We could not find that order</h1>
        <p className="mt-3 text-ink-700">
          Check the link in your confirmation email, or sign in to see your orders.
        </p>
        <Link href="/account" className={buttonClasses('primary') + ' mt-6'}>
          Your account
        </Link>
      </div>
    );
  }

  return (
    <OrderTracker initial={order} orderToken={token} timezone={shop?.timezone ?? 'Europe/London'} />
  );
}
