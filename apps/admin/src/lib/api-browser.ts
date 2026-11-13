import { createApiClient } from '@mp/api-client';
import { env } from '@/env';
import { supabaseBrowser } from '@/lib/supabase-browser';

/** API client for Client Components, calling as the signed-in member of staff. */
export function browserApi() {
  const supabase = supabaseBrowser();
  return createApiClient({
    baseUrl: env.NEXT_PUBLIC_API_URL,
    getAccessToken: async () =>
      (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
}
