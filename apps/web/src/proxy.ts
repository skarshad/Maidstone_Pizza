import type { NextRequest } from 'next/server';
import { updateSession } from '@mp/web-auth/proxy';
import { env } from '@/env';

export async function proxy(request: NextRequest) {
  return updateSession(request, {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    requiredRole: (pathname) => (pathname.startsWith('/account') ? 'customer' : null),
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
