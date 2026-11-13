import { createApiClient } from '@mp/api-client';
import { env } from '@/env';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * API client for Server Components, calling as the signed-in member of staff.
 * The cookie's access token is only forwarded; the API verifies its signature
 * and role, so nothing here is trusted on its own.
 */
export async function serverApi() {
  const supabase = await supabaseServer();
  return createApiClient({
    baseUrl: env.NEXT_PUBLIC_API_URL,
    getAccessToken: async () =>
      (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
}
