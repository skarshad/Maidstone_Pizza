import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRole, type Role } from '@mp/types';

interface CookieStore {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
}

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export function createServerSupabase(
  cookieStore: CookieStore,
  url: string,
  publishableKey: string,
) {
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore here.
        }
      },
    },
  });
}

export interface VerifiedUser {
  id: string;
  email: string | null;
  role: Role;
}

export function userFromClaims(
  claims: Record<string, unknown> | null | undefined,
): VerifiedUser | null {
  if (!claims || typeof claims.sub !== 'string' || claims.is_anonymous === true) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    role: isRole(claims.user_role) ? claims.user_role : 'customer',
  };
}

/**
 * The signed-in user, from a token whose signature has been verified.
 * Never use getSession() for this on the server: it trusts the cookie as-is.
 */
export async function getVerifiedUser(supabase: SupabaseClient): Promise<VerifiedUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  return userFromClaims(data?.claims as Record<string, unknown> | undefined);
}
