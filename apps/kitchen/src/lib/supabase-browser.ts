import { createBrowserSupabase } from '@mp/web-auth/browser';
import { env } from '@/env';

export const supabaseBrowser = () =>
  createBrowserSupabase(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
