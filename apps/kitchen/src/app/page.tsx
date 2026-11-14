import { redirect } from 'next/navigation';
import { hasRole } from '@mp/types';
import { menuSchema } from '@mp/validation';
import { KitchenBoard } from '@/components/kitchen-board';
import { env } from '@/env';
import { currentUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** Allergen codes to their full names, for the flags on tickets. */
async function allergenNames(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/menu`, { cache: 'no-store' });
    if (!res.ok) return {};
    const menu = menuSchema.parse(await res.json());
    return Object.fromEntries(menu.allergens.map((a) => [a.code, a.name]));
  } catch {
    // Tickets fall back to the short allergen codes.
    return {};
  }
}

export default async function KitchenHome() {
  const user = await currentUser();
  // Defence in depth: the proxy already gates this, but never render without checking.
  if (!user) redirect('/login');
  if (!hasRole(user.role, 'kitchen')) redirect('/forbidden');

  return <KitchenBoard userEmail={user.email} allergenNames={await allergenNames()} />;
}
