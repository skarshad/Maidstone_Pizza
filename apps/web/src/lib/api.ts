import { createApiClient } from '@mp/api-client';
import { env } from '@/env';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * API client for Client Components. Sends the customer's access token when
 * they are signed in, so their orders are linked to their account; guests
 * simply have no token.
 */
export function browserApi() {
  const supabase = supabaseBrowser();
  return createApiClient({
    baseUrl: env.NEXT_PUBLIC_API_URL,
    getAccessToken: async () =>
      (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
}
