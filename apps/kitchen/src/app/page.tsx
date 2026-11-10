import { redirect } from 'next/navigation';
import { hasRole } from '@mp/types';
import { currentUser } from '@/lib/supabase-server';

// Phase 1 shell. The live order board, sound alerts and offline handling
// are built in Phase 4.
export default async function KitchenHome() {
  const user = await currentUser();
  // Defence in depth: the proxy already gates this, but never render without checking.
  if (!user) redirect('/login');
  if (!hasRole(user.role, 'kitchen')) redirect('/forbidden');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between border-b border-kitchen-border px-4">
        <p className="text-xl font-bold">Kitchen</p>
        <form action="/auth/signout" method="post" className="flex items-center gap-4">
          <span className="text-kitchen-muted">{user.email}</span>
          <button type="submit" className="min-h-12 font-semibold underline underline-offset-2">
            Sign out
          </button>
        </form>
      </header>
      <main className="grid flex-1 place-items-center p-6 text-center">
        <div>
          <p className="text-4xl font-bold">No orders yet</p>
          <p className="mt-3 text-kitchen-muted">The live order board arrives in Phase 4.</p>
        </div>
      </main>
    </div>
  );
}
