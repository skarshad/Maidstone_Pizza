# Maidstone Pizza — working notes for Claude

Ordering platform for a pizza takeaway in Maidstone, Kent: customer web, admin, kitchen display, API, iOS/Android. Full design in `docs/ARCHITECTURE.md`. Read it before making structural changes.

**Current state (2026-11-14):** Phases 1 to 3 code complete. Phase 3 adds basket, checkout, order tracking, Stripe + payment simulator, the verified payment webhook, the order state machine and confirmation emails. The orders migration `20261115090000_orders.sql` passes its tests in a rolled-back dry run; the owner pushes it with `pnpm db:push --yes`. No Stripe or Resend account yet: local dev uses `PAYMENTS_SIMULATOR=true` and logs emails. The real Stripe path is typed against the SDK but has never run against Stripe. Not built in Phase 3 (see docs/DEPLOYMENT.md section 6): refunds UI, saved cards, cash, address lookup, checkout rate limiting, E2E tests. Shop hours, delivery zone and fees are placeholders seeded by the migration; the admin screens for them come in Phase 6. Dev Supabase project is in Ireland (`eu-west-1`); staging and production must be London. Still open from Phase 1: Git remote, Vercel preview deploy. Menu owner decisions: `docs/MENU_IMPORT_NOTES.md` (allergens block launch). Next: Phase 4 (kitchen display and realtime). Update this line at the end of every phase.

## Fixed decisions (ask before changing)

Supabase (London, `eu-west-2`) · Vercel (`lhr1`) · Stripe · Expo · pnpm + Turborepo · TypeScript strict · Hono API in `apps/api`.

## Rules

- **Money is integer pence.** Never floats. Format only at the UI edge.
- **The server is the price authority.** All pricing goes through `packages/pricing`; `apps/api` recomputes at checkout and never trusts client totals.
- **Orders leave `PENDING_PAYMENT` only in the verified Stripe webhook.**
- **Order status changes go through the state machine** (`packages/types` transition table + Postgres guard trigger). Keep the two in sync; a test enforces it.
- **RLS on every table**, with a pgTAP test for each policy. A migration adding a table without RLS and tests is incomplete.
- **Service-role key, Stripe secret key, webhook and channel secrets exist only in `apps/api`.** Never import them into `web`, `admin`, `kitchen`, `mobile` or any `packages/*` used by clients.
- **No secrets in the repo.** Add every new variable to the app's `.env.example` and its zod env schema.
- **Never write third-party API details from memory.** Read current official docs first (Supabase, Stripe, Vercel, Expo, delivery platforms). Where credentials are missing, code against an interface and a mock, and leave `TODO(credentials)`.
- **Never guess business data** (prices, allergens, hours, fees). Ask, or record the gap in `docs/MENU_IMPORT_NOTES.md`.
- **Logo:** use `assets/brand/maidstone-pizza-logo.png` exactly as supplied. Generate derivatives with the script; never redraw or recolour.
- Allergen data must flow through to menu, checkout, order snapshot and kitchen ticket.
- Schema changes are new migration files; never edit an applied migration.
- User-facing strings go through the i18n helper (English only for now).
- Accessibility: WCAG 2.2 AA, visible focus, respect `prefers-reduced-motion`.

## Conventions

- Files `kebab-case`, React components `PascalCase`, DB identifiers `snake_case`.
- zod schemas live in `packages/validation` and are the source for API contracts and form validation.
- Shared code goes in `packages/*`; apps never import from other apps.
- Tests sit next to the code as `*.test.ts`; DB tests in `supabase/tests`; E2E in `apps/web/e2e`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), one logical change each. Commit at the end of each working step; never commit a broken build.

## Commands

All exist in the root `package.json` unless marked planned.

```
pnpm install              install everything
pnpm dev                  run web, admin, kitchen and api together
pnpm lint | typecheck | test | build
pnpm check:secrets        fail if server secrets are referenced by client code or committed
pnpm db:start             supabase start (needs Docker; not available on this machine)
pnpm db:push              apply migrations to the linked Supabase project
pnpm db:test              pgTAP RLS and state-machine tests (needs Docker; used in CI)
pnpm db:test:remote       same tests against the linked dev project, no Docker; always rolled back
pnpm db:types             regenerate packages/types from the database
pnpm db:test:remote --pending   dry-run unpushed migrations plus all tests, rolled back
pnpm brand:assets         generate icons, splash, OG image from the logo
pnpm menu:import          capture the source menu into data/menu.source.json
pnpm menu:build           build data/menu.seed.json from the capture and data/menu.overrides.json
pnpm menu:seed            load the seed into the database (adds missing rows only; --overwrite, --dry-run)
```

Planned: `pnpm test:e2e` (Phase 3), `pnpm simulate:order` (Phase 7).

Builds and `next dev` need the four `NEXT_PUBLIC_*` variables set (placeholders are fine for a build; see `.github/workflows/ci.yml`).

## Client decisions (2026-11-10)

- Repo stays in its current OneDrive folder (client choice). Expect slow installs and turbo runs (2 to 4 minutes for a full check).
- No Docker: develop against a cloud dev Supabase project.
- Defaults accepted, all placeholders to be confirmed before launch: delivery to ME14/ME15/ME16, £2.50 fee, £12 minimum, own drivers; no alcohol; cards + Apple Pay + Google Pay, cash built but off; hours 4pm to 11pm daily; one tablet/monitor in the kitchen, no printer; free tiers while building; add a Pastas page.
- No domain yet; placeholder `maidstonepizza.co.uk`.

## End-of-phase checklist

Lint, typecheck and tests green → docs updated → commit → short summary to the client: done, next, blocked.

## Environment notes

- Windows 11, PowerShell primary; Git Bash available. Node 25, pnpm 12, Supabase CLI 3.1.
- No Docker or WSL on this machine as of 2026-11-10, so the local Supabase stack cannot run here. Supabase CLI 3 targets the local stack by default: pass `--remote` for the linked project (the `db:*` scripts already do). The CLI labels the dev project "production"; that is just its wording for any hosted project.
- Pushing migrations to the hosted database is blocked for Claude by the permission system; the owner runs `pnpm db:push` (add `--yes`).
- pnpm enforces a minimum release age on dependencies. If install rejects a just-published package, pin an older version; do not relax the policy.
- typescript is pinned to 6.0.x because typescript-eslint does not support 7 yet.
- Supabase keys use the current names: publishable key (clients) and secret key (API only). Next.js 16 uses `proxy.ts`, not `middleware.ts`.
- Roles live in `public.user_roles`; the custom access token hook copies them into the `user_role` JWT claim. `packages/web-auth` holds the shared Next.js session and role-gate code.
- Menu: allergens are never guessed. Items carry `allergens_confirmed`; while false, the site says so and points the customer to the shop. Staff menu writes go through the API acting as the signed-in user (their token, not the secret key), so RLS and the audit log apply.
- Supabase grants anon and authenticated full table rights by default: every new table must `revoke all` first, then grant back what is needed.
- Database tests must not assume an empty database; count only fixture rows.
- Large multi-file bash heredocs fail on this machine; use the Write tool per file.
- Orders: customers have no write access to order tables. The API creates and moves orders only through the SQL functions in the orders migration (`create_order`, `transition_order`, `record_payment_event`), using the secret key. Guest order links carry a token derived from the order id (`orderToken` in `apps/api/src/checkout.ts`); it is not stored.
- Payments go through the `PaymentProvider` interface (`apps/api/src/payments.ts`). Never mark an order paid anywhere except `record_payment_event`, reached from a verified webhook.
- The basket lives in the browser (localStorage) and holds choices only, never prices.
- Never stop servers with a blanket `taskkill node.exe`; run them as background tasks and stop that task.
