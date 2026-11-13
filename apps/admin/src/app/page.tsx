import Link from 'next/link';
import { buttonClasses } from '@mp/ui';
import { AdminShell } from '@/components/admin-shell';
import { requireManager } from '@/lib/staff';

// Promotions, orders, customers, settings and reports are added in Phases 5 and 6.
export default async function AdminHome() {
  const user = await requireManager();

  return (
    <AdminShell user={user}>
      <h1 className="text-2xl">Dashboard</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-500">
        You are signed in with {user.role} access.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/menu" className={buttonClasses('primary')}>
          Manage the menu
        </Link>
        <Link href="/menu/options" className={buttonClasses('outline')}>
          Bases &amp; toppings
        </Link>
      </div>
    </AdminShell>
  );
}
