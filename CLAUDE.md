# Maidstone Pizza — working notes for Claude

Ordering platform for a pizza takeaway in Maidstone, Kent: customer web, admin, kitchen display, API, iOS/Android. Full design in `docs/ARCHITECTURE.md`. Read it before making structural changes.

**Current state:** planning complete, awaiting client answers. No code scaffolded yet. Update this line at the end of every phase.

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

Planned; confirm each exists in `package.json` once Phase 1 lands.

```
pnpm install              install everything
pnpm dev                  run web, admin, kitchen and api together
pnpm lint | typecheck | test | build
pnpm test:e2e             Playwright critical path
pnpm db:start             supabase start (needs Docker)
pnpm db:reset             re-apply migrations + seed
pnpm db:test              pgTAP RLS and state-machine tests
pnpm db:types             regenerate packages/types from the database
pnpm menu:import          scrape source menu → data/menu.seed.json
pnpm menu:seed            load data/menu.seed.json into the database
pnpm brand:assets         generate icons, splash, OG image from the logo
pnpm simulate:order       fire a fake delivery-platform webhook
```

## End-of-phase checklist

Lint, typecheck and tests green → docs updated → commit → short summary to the client: done, next, blocked.

## Environment notes

- Windows 11, PowerShell primary; Git Bash available. Node 25, pnpm 12, Supabase CLI 3.1.
- No Docker or WSL on this machine as of 2026-11-10, so the local Supabase stack cannot run here yet.
- The folder is inside OneDrive; `node_modules` must not live in a synced folder.
