import { cookies } from 'next/headers';
import { createServerSupabase, getVerifiedUser } from '@mp/web-auth/server';
import { env } from '@/env';

export async function supabaseServer() {
  return createServerSupabase(
    await cookies(),
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** The signed-in user from a verified token, or null. */
export async function currentUser() {
  return getVerifiedUser(await supabaseServer());
}
