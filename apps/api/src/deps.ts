import { createClient } from '@supabase/supabase-js';
import { isRole, type Role } from '@mp/types';
import { parseEnv, serverEnvSchema, type ServerEnv } from '@mp/validation';
import { createMenuStore, type MenuStore } from './menu-store';

export interface AuthUser {
  id: string;
  email: string | null;
  role: Role;
}

/** Everything the app needs from the outside world. Faked in tests. */
export interface Deps {
  corsOrigins: string[];
  /** Verifies a Supabase access token and returns the caller, or null if invalid. */
  verifyToken(token: string): Promise<AuthUser | null>;
  /** True when the database answers a trivial query. */
  pingDatabase(): Promise<boolean>;
  menu: MenuStore;
}

export function loadEnv(): ServerEnv {
  return parseEnv(serverEnvSchema, process.env, 'api');
}

export function createDeps(env: ServerEnv = loadEnv()): Deps {
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
  // Publishable-key client: verifies tokens and reads public data as a signed-out visitor.
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, noSession);
  // Secret-key client: bypasses RLS. Must never leave this service.
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, noSession);

  return {
    corsOrigins: env.CORS_ORIGINS,

    menu: createMenuStore({
      supabaseUrl: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      anon: authClient,
    }),

    async verifyToken(token) {
      const { data, error } = await authClient.auth.getClaims(token);
      const claims = data?.claims;
      if (error || !claims?.sub) return null;
      const role = (claims as Record<string, unknown>).user_role;
      return {
        id: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : null,
        role: isRole(role) ? role : 'customer',
      };
    },

    async pingDatabase() {
      const { error } = await admin.from('profiles').select('id', { head: true }).limit(1);
      return !error;
    },
  };
}
