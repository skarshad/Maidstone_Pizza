import { z } from 'zod';

const url = z.url();
const nonEmpty = z.string().min(1);

/** Values that are safe to ship in a browser or mobile bundle. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty,
  NEXT_PUBLIC_API_URL: url,
  NEXT_PUBLIC_SITE_URL: url,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: nonEmpty.optional(),
});
export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Server-only values. Only apps/api may parse this schema. */
export const serverEnvSchema = z.object({
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: nonEmpty,
  SUPABASE_SECRET_KEY: nonEmpty,
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3002')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  CRON_SECRET: nonEmpty.optional(),
  // Added in Phase 3 (payments and email); optional until then.
  STRIPE_SECRET_KEY: nonEmpty.optional(),
  STRIPE_WEBHOOK_SECRET: nonEmpty.optional(),
  RESEND_API_KEY: nonEmpty.optional(),
  SENTRY_DSN: url.optional(),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parse env vars and fail fast with a readable list of every problem.
 * Reports variable names only, never values.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>,
  label: string,
): z.infer<S> {
  // Treat empty strings as missing so `.env` lines like `KEY=` fail clearly.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.code}`)
      .join('\n');
    throw new Error(`Invalid ${label} environment variables:\n${problems}`);
  }
  return result.data;
}
