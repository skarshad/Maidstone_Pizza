import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatPence } from '@mp/pricing';
import { Badge, Button, Card } from '@mp/ui';
import { serverApi } from '@/lib/api-server';
import { STATUS_LABEL, formatWhen } from '@/lib/order-display';
import { currentUser } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

// Profile, saved addresses, reorder and account deletion arrive in later phases.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/account');

  const orders = await (await serverApi()).myOrders().catch(() => null);
  const now = new Date();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Card className="p-6">
        <h1 className="text-3xl">Your account</h1>
        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="text-ink-500">Email</dt>
            <dd className="font-semibold">{user.email ?? 'Not provided'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Access</dt>
            <dd>
              <Badge tone={user.role === 'customer' ? 'neutral' : 'green'}>{user.role}</Badge>
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/account/update-password" className="font-semibold text-red-500 underline">
            Change password
          </Link>
        </div>
        <form action="/auth/signout" method="post" className="mt-6">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-2xl">Your orders</h2>
        {orders === null && (
          <p className="mt-3 text-sm text-ink-700">
            Your orders could not be loaded just now. Please refresh in a minute.
          </p>
        )}
        {orders?.length === 0 && (
          <p className="mt-3 text-sm text-ink-700">
            No orders yet. Orders you place while signed in appear here.
          </p>
        )}
        {orders && orders.length > 0 && (
          <ul className="mt-3 divide-y divide-ink-900/10">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link
                    href={`/orders/${order.id}`}
                    className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
                  >
                    Order #{order.orderNumber}
                  </Link>
                  <p className="text-sm text-ink-700">
                    {formatWhen(order.createdAt, 'Europe/London', now)} · {order.itemCount}{' '}
                    {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
                    {order.fulfilment === 'delivery' ? 'Delivery' : 'Collection'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatPence(order.totalPence)}</p>
                  <p className="text-sm text-ink-700">{STATUS_LABEL[order.status]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
