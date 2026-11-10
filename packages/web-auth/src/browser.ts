import { createBrowserClient } from '@supabase/ssr';

/** Supabase client for Client Components. Uses the publishable key only. */
export function createBrowserSupabase(url: string, publishableKey: string) {
  return createBrowserClient(url, publishableKey);
}
