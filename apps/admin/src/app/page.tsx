import { redirect } from 'next/navigation';
import { hasRole } from '@mp/types';
import { Badge } from '@mp/ui';
import { currentUser } from '@/lib/supabase-server';

// Phase 1 shell. Menu, promotions, orders, customers, settings and reports
// are added in Phases 2, 5 and 6.
export default async function AdminHome() {
  const user = await currentUser();
  // Defence in depth: the proxy already gates this, but never render without checking.
  if (!user) redirect('/login');
  if (!hasRole(user.role, 'manager')) redirect('/forbidden');

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b border-ink-900/10 px-4">
        <p className="font-display text-lg font-black">
          Maidstone Pizza <span className="text-red-500">Admin</span>
        </p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-500">{user.email}</span>
          <Badge tone="red">{user.role}</Badge>
          <form action="/auth/signout" method="post">
            <button type="submit" className="min-h-11 font-semibold underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-4">
        <h1 className="text-2xl">Dashboard</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-500">
          You are signed in with {user.role} access. Menu management arrives in Phase 2.
        </p>
      </main>
    </div>
  );
}
