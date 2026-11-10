// Fails if server-only secrets could reach a client bundle or the repo.
//   1. Client apps and client-side packages must not reference server-only variable names.
//   2. No tracked file may contain something that looks like a real secret value.
//
//   pnpm check:secrets
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CLIENT_PATHS = [
  'apps/web/',
  'apps/admin/',
  'apps/kitchen/',
  'apps/mobile/',
  'packages/ui/',
  'packages/web-auth/',
  'packages/api-client/',
];

const SERVER_ONLY_NAMES = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'CRON_SECRET',
  'serverEnvSchema',
];

const SECRET_VALUE_PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'Supabase secret key'],
  [/sk_(live|test)_[A-Za-z0-9]{16,}/, 'Stripe secret key'],
  [/rk_(live|test)_[A-Za-z0-9]{16,}/, 'Stripe restricted key'],
  [/whsec_[A-Za-z0-9]{16,}/, 'Stripe webhook secret'],
  [/re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/, 'Resend API key'],
  // A JWT whose payload contains "role":"service_role" (legacy Supabase service key).
  [
    /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/,
    'Supabase service-role JWT',
  ],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'private key'],
];

const SELF = 'scripts/check-client-secrets.mjs';
const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n')
  .filter(
    (f) =>
      f && f !== SELF && !/\.(png|ico|jpg|jpeg|webp|woff2?)$/.test(f) && f !== 'pnpm-lock.yaml',
  );

const problems = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (CLIENT_PATHS.some((p) => file.startsWith(p))) {
    for (const name of SERVER_ONLY_NAMES) {
      if (text.includes(name))
        problems.push(`${file}: client code references server-only "${name}"`);
    }
  }
  for (const [pattern, label] of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) problems.push(`${file}: contains what looks like a ${label}`);
  }
}

if (problems.length) {
  console.error('Secret check failed:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Secret check passed (${files.length} files scanned).`);
