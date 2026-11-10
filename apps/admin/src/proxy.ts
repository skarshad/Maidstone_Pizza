import type { NextRequest } from 'next/server';
import { updateSession } from '@mp/web-auth/proxy';
import { env } from '@/env';

// Everything except the sign-in and "no access" pages needs the admin role or above.
// The API and database RLS enforce the same rule independently.
const PUBLIC_PATHS = ['/login', '/forbidden', '/auth/', '/manifest.webmanifest'];

export async function proxy(request: NextRequest) {
  return updateSession(request, {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    requiredRole: (pathname) =>
      PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ? null : 'manager',
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
