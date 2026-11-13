import { redirect } from 'next/navigation';
import { hasRole } from '@mp/types';
import { currentUser } from '@/lib/supabase-server';

/** The signed-in manager or admin. Redirects everyone else. Call at the top of every page. */
export async function requireManager() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!hasRole(user.role, 'manager')) redirect('/forbidden');
  return user;
}
