import { createClient } from '@supabase/supabase-js';
import { isRole, type Role } from '@mp/types';
import { parseEnv, serverEnvSchema, type ServerEnv } from '@mp/validation';
import { createHmac } from 'node:crypto';
import type { OrderDeps } from './checkout';
import { createLogSender, createResendSender } from './email';
import { createMenuStore, type MenuStore } from './menu-store';
import { createOrderStore } from './order-store';
import { createSimulatorProvider, createStripeProvider, type PaymentProvider } from './payments';

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
  /** Shop status, basket pricing, checkout, payments and email. */
  order: OrderDeps;
  /** Shared secret for the scheduled-work endpoints. Null disables them. */
  cronSecret: string | null;
}

export function loadEnv(): ServerEnv {
  return parseEnv(serverEnvSchema, process.env, 'api');
}

/**
 * Stripe when all three Stripe values are set. Otherwise the simulator, but
 * only when explicitly switched on and never in production. Otherwise none,
 * and checkout is refused.
 */
export function choosePayments(
  env: ServerEnv,
  runtime: { vercelEnv?: string; nodeEnv?: string },
): PaymentProvider | null {
  const stripeKeys = [env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, env.STRIPE_PUBLISHABLE_KEY];
  if (stripeKeys.every(Boolean)) {
    return createStripeProvider({
      secretKey: env.STRIPE_SECRET_KEY!,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY!,
    });
  }
  if (stripeKeys.some(Boolean)) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message:
          'Stripe is only partly configured: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PUBLISHABLE_KEY are all needed.',
      }),
    );
  }
  const production = runtime.vercelEnv === 'production';
  if (env.PAYMENTS_SIMULATOR === 'true' && !production) {
    return createSimulatorProvider({
      secret: createHmac('sha256', env.SUPABASE_SECRET_KEY)
        .update('payments-simulator')
        .digest('hex'),
    });
  }
  return null;
}

export function createDeps(env: ServerEnv = loadEnv()): Deps {
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
  // Publishable-key client: verifies tokens and reads public data as a signed-out visitor.
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, noSession);
  // Secret-key client: bypasses RLS. Must never leave this service.
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, noSession);

  const menu = createMenuStore({
    supabaseUrl: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    anon: authClient,
  });

  return {
    corsOrigins: env.CORS_ORIGINS,
    cronSecret: env.CRON_SECRET ?? null,

    order: {
      orders: createOrderStore(admin),
      payments: choosePayments(env, {
        vercelEnv: process.env.VERCEL_ENV,
        nodeEnv: process.env.NODE_ENV,
      }),
      email: env.RESEND_API_KEY
        ? createResendSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
        : createLogSender(),
      getMenu: () => menu.getPublicMenu(),
      now: () => new Date(),
      siteUrl: env.PUBLIC_SITE_URL.replace(/\/$/, ''),
      tokenSecret:
        env.ORDER_TOKEN_SECRET ??
        createHmac('sha256', env.SUPABASE_SECRET_KEY).update('order-token').digest('hex'),
    },

    menu,

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
