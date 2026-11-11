# Deployment

Status: Phase 1. Nothing is deployed yet. Sections marked **later** are filled in by the phase that needs them.

## 1. Local development

Prerequisites: Node 22+, pnpm 12, Supabase CLI. Docker is only needed for a local database.

```
pnpm install
# copy each app's .env.example to .env.local and fill it in (see section 3)
pnpm dev            # web :3000, admin :3001, kitchen :3002, api :8787
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm check:secrets  # no server secrets in client code or the repo
```

This machine has no Docker, so local development uses a cloud **dev** Supabase project instead of `supabase start`. The database tests therefore run in CI with `pnpm db:test` (needs Docker), or here against the linked dev project with `pnpm db:test:remote`, which rolls everything back and leaves no data behind.

## 2. Supabase

Create three projects, all in **West Europe (London) `eu-west-2`**: `maidstone-pizza-dev`, `-staging`, `-prod`. Start with dev only.

For each project:

1. `supabase login`, then `supabase link --project-ref <ref>`.
2. `pnpm db:push` (`supabase db push --remote`) applies everything in `supabase/migrations`.
3. Enable the token hook: Dashboard > Authentication > Hooks > Custom Access Token > choose `public.custom_access_token_hook`. Without this, nobody gets a staff role in their token.
4. `pnpm db:types` regenerates `packages/types/src/database.ts`.
5. Auth providers and redirect URLs: see `docs/AUTH_SETUP.md`.

Make the first admin (once, per project, in the SQL editor), after that person has signed up:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'owner@example.com';
```

They must sign out and in again to receive the new role.

### Migrations workflow

- Every schema change is a new file from `supabase migration new <name>`. Never edit an applied migration.
- CI applies all migrations to a clean database and runs the pgTAP tests on every pull request.
- Promotion order: dev, then staging, then production, each with `supabase db push` against the linked project. Automating staging/production pushes from CI is added once those projects exist.

### Plan tier

- Free tier is fine while building (it pauses after a week of inactivity).
- Production needs **Pro** for daily backups and no pausing. Point-in-time recovery is a paid add-on on top of Pro; confirm current pricing before launch.

## 3. Environment variables

Every variable is validated at startup with zod; a missing one stops the app with a list of names.

| App                                      | File         | Variables                                                                                                                                                                            |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`, `apps/admin`, `apps/kitchen` | `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` (web also `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, Phase 3)           |
| `apps/api`                               | `.env.local` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CORS_ORIGINS`, later `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN` |

`SUPABASE_SECRET_KEY` and the Stripe secret keys exist **only** in `apps/api`. `pnpm check:secrets` and CI fail if a client app references them.

## 4. Vercel

Four projects from the one repository:

| Vercel project            | Root Directory | Framework                           |
| ------------------------- | -------------- | ----------------------------------- |
| `maidstone-pizza-web`     | `apps/web`     | Next.js                             |
| `maidstone-pizza-admin`   | `apps/admin`   | Next.js                             |
| `maidstone-pizza-kitchen` | `apps/kitchen` | Next.js                             |
| `maidstone-pizza-api`     | `apps/api`     | Hono (detected from `src/index.ts`) |

For each project:

1. Import the Git repository and set the Root Directory above. Leave "Include files outside the root directory" on so workspace packages resolve.
2. Functions run in London (`lhr1`), set by each app's `vercel.json`, to sit next to the database.
3. Add the environment variables from section 3 for Preview and Production separately (Preview points at the staging Supabase project, Production at prod).
4. Set `CORS_ORIGINS` on the API to the deployed web, admin and kitchen origins.
5. Pull requests get preview deployments automatically once the repository is connected.

Plan tier: the Hobby plan does not permit commercial use, so production needs **Pro**.

**Not done yet:** the first preview deploy. It needs a Git remote (GitHub) and a Supabase dev project, both of which need the owner's accounts.

## 5. Custom domain and DNS — later (Phase 9)

Planned hostnames: `maidstonepizza.co.uk` (web), `admin.`, `kitchen.` and `api.` subdomains. No domain has been bought yet.

## 6. Stripe go-live — later (Phase 3 and 9)

## 7. Mobile: EAS build and submit — later (Phase 8)

## 8. Backups and restore — later (Phase 9)
