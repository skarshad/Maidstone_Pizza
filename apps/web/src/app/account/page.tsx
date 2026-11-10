import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, Button, Card } from '@mp/ui';
import { currentUser } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

// Phase 1: proves sign-in, session and role claims end to end. Profile,
// addresses, order history and deletion arrive in later phases.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/account');

  return (
    <div className="mx-auto max-w-md px-4 py-10">
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
    </div>
  );
}
