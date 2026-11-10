import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasRole, type Role } from '@mp/types';
import { userFromClaims } from './server';

export interface SessionOptions {
  url: string;
  publishableKey: string;
  /** Minimum role needed for a path, or null if the path is public. */
  requiredRole(pathname: string): Role | null;
  loginPath?: string;
  forbiddenPath?: string;
}

/**
 * Runs in each app's proxy.ts (Next.js 16; formerly middleware.ts).
 * Refreshes the Supabase session cookie and enforces page-level role gates.
 * Pattern: https://supabase.com/docs/guides/auth/server-side/creating-a-client
 */
export async function updateSession(request: NextRequest, options: SessionOptions) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(options.url, options.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options: cookieOptions } of cookiesToSet) {
          response.cookies.set(name, value, cookieOptions);
        }
      },
    },
  });

  // getClaims() verifies the token signature and refreshes it when near expiry.
  const { data } = await supabase.auth.getClaims();
  const user = userFromClaims(data?.claims as Record<string, unknown> | undefined);

  const needed = options.requiredRole(request.nextUrl.pathname);
  if (needed === null) return response;

  const redirectTo = (pathname: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = next ? `?next=${encodeURIComponent(next)}` : '';
    const redirect = NextResponse.redirect(url);
    // Carry any refreshed session cookies onto the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user) {
    return redirectTo(
      options.loginPath ?? '/login',
      request.nextUrl.pathname + request.nextUrl.search,
    );
  }
  if (!hasRole(user.role, needed)) return redirectTo(options.forbiddenPath ?? '/forbidden');
  return response;
}

/** Skip static assets and images. */
export const proxyMatcher = [
  '/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
];
