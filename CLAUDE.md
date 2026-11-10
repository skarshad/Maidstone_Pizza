# Maidstone Pizza — working notes for Claude

Ordering platform for a pizza takeaway in Maidstone, Kent: customer web, admin, kitchen display, API, iOS/Android. Full design in `docs/ARCHITECTURE.md`. Read it before making structural changes.

**Current state (2026-11-10):** Phase 1 code complete and committed. Not yet done, blocked on owner accounts: Supabase dev project (migrations never applied to a real database, pgTAP tests never run), auth providers, Git remote, first Vercel preview deploy. Next: Phase 2 (menu import). Update this line at the end of every phase.

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
pnpm db:test              pgTAP RLS and state-machine tests
pnpm db:types             regenerate packages/types from the database
pnpm brand:assets         generate icons, splash, OG image from the logo
```

Planned: `pnpm test:e2e` (Phase 3), `pnpm menu:import` / `pnpm menu:seed` (Phase 2), `pnpm simulate:order` (Phase 7).

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
- No Docker or WSL on this machine as of 2026-11-10, so the local Supabase stack cannot run here.
- pnpm enforces a minimum release age on dependencies. If install rejects a just-published package, pin an older version; do not relax the policy.
- typescript is pinned to 6.0.x because typescript-eslint does not support 7 yet.
- Supabase keys use the current names: publishable key (clients) and secret key (API only). Next.js 16 uses `proxy.ts`, not `middleware.ts`.
- Roles live in `public.user_roles`; the custom access token hook copies them into the `user_role` JWT claim. `packages/web-auth` holds the shared Next.js session and role-gate code.
- Never stop servers with a blanket `taskkill node.exe`; run them as background tasks and stop that task.
