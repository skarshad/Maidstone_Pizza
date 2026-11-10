import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@mp/web-auth/paths';
import { supabaseServer } from '@/lib/supabase-server';

// Landing point for OAuth sign-in and email links (confirm, magic link, reset).
// Exchanges the one-time code for a session cookie, then redirects on-site.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'), '/account');

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL('/login?error=link', request.url));
}
