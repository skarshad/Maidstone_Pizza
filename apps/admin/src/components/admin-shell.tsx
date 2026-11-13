import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@mp/ui';
import type { VerifiedUser } from '@mp/web-auth/server';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/menu', label: 'Menu' },
  { href: '/menu/options', label: 'Bases & toppings' },
];

export function AdminShell({ user, children }: { user: VerifiedUser; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ink-900/10 px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <p className="font-display text-lg font-black">
            Maidstone Pizza <span className="text-red-500">Admin</span>
          </p>
          <nav aria-label="Admin" className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-cream-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
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
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
