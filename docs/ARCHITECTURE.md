# Maidstone Pizza — Architecture

Status: **approved 2026-11-10; Phase 1 built.** Later phases are still plan. Items marked _verify_ must be checked against current official docs at implementation time; no third-party API detail is to be written from memory.

## 1. Fixed platform decisions

| Concern                           | Choice                                    |
| --------------------------------- | ----------------------------------------- |
| Database, Auth, Realtime, Storage | Supabase (Postgres), London `eu-west-2`   |
| Hosting (web apps + API)          | Vercel, functions pinned to `lhr1`        |
| Payments                          | Stripe (Payment Intents)                  |
| Mobile                            | React Native with Expo (EAS Build/Submit) |

## 2. Stack choices

| Area           | Choice                                                                                                                                    | Why                                                                                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo       | pnpm workspaces + Turborepo                                                                                                               | Shared packages with cached, dependency-aware builds; first-class on Vercel.                                                                                                                                                                                                                |
| Language       | TypeScript (strict) everywhere                                                                                                            | One type system from DB types to mobile screens.                                                                                                                                                                                                                                            |
| Customer web   | Next.js App Router + Tailwind                                                                                                             | SSR/ISR for local SEO, `next/font` self-hosting, image optimisation.                                                                                                                                                                                                                        |
| Admin          | Separate Next.js app                                                                                                                      | Different audience, auth gate and release cadence; keeps admin code out of the public bundle.                                                                                                                                                                                               |
| Kitchen        | Separate Next.js PWA (client-rendered)                                                                                                    | Locked-down single screen, installable on a tablet, own service worker and wake-lock.                                                                                                                                                                                                       |
| API            | **Hono on Vercel Functions** with `@hono/zod-openapi`                                                                                     | Routes are defined from the shared zod schemas, so validation, OpenAPI docs and the typed client come from one source; tiny cold start; raw-body access for webhook signatures is straightforward. Next Route Handlers would work but give no OpenAPI or typed client without extra layers. |
| Validation     | zod in `packages/validation`                                                                                                              | Same schemas on client forms, API input and env parsing.                                                                                                                                                                                                                                    |
| DB access      | `supabase-js` (RLS-scoped user client for reads; service-role client only in `apps/api`) + SQL functions for multi-statement transactions | Keeps RLS as the real boundary; transactional work (order creation, state transitions) lives in Postgres functions called via RPC.                                                                                                                                                          |
| Migrations     | Supabase CLI (`supabase/migrations`), `supabase gen types`                                                                                | Reviewable SQL, reproducible local stack, generated types.                                                                                                                                                                                                                                  |
| RLS tests      | pgTAP via `supabase test db`                                                                                                              | Policies tested in the database, per role, in CI.                                                                                                                                                                                                                                           |
| Unit tests     | Vitest                                                                                                                                    | Fast, native TS/ESM, works across all packages.                                                                                                                                                                                                                                             |
| E2E tests      | Playwright                                                                                                                                | Critical path browse → basket → pay (Stripe test mode) → kitchen sees order.                                                                                                                                                                                                                |
| Mobile         | Expo (dev client, Expo Router), `@stripe/stripe-react-native`, Expo Notifications                                                         | Required by brief; dev client is needed for native Google/Apple sign-in and Stripe.                                                                                                                                                                                                         |
| Client data    | TanStack Query + Zustand (basket)                                                                                                         | Caching/retries/polling fallback for server state; small persisted store for the basket.                                                                                                                                                                                                    |
| Email          | Resend + React Email                                                                                                                      | Templated transactional email from the same TS codebase.                                                                                                                                                                                                                                    |
| SMS (optional) | Twilio, behind a `Notifier` interface                                                                                                     | Off by default.                                                                                                                                                                                                                                                                             |
| Jobs           | Postgres `jobs` outbox table + Vercel Cron + `pg_cron`                                                                                    | See §8.                                                                                                                                                                                                                                                                                     |
| Errors / logs  | Sentry + structured JSON logs (pino)                                                                                                      | One error pipeline across web, API and mobile.                                                                                                                                                                                                                                              |
| Analytics      | Plausible (cookieless) + first-party funnel events                                                                                        | No tracking before consent; minimal GDPR surface.                                                                                                                                                                                                                                           |
| Bot protection | Cloudflare Turnstile on checkout + Stripe Radar                                                                                           | Free, privacy-friendly, no puzzle for most users.                                                                                                                                                                                                                                           |
| Rate limiting  | Postgres-backed fixed-window limiter in `apps/api`                                                                                        | No extra vendor; adequate for one shop. Swappable for Upstash later.                                                                                                                                                                                                                        |
| Address lookup | getAddress.io behind an `AddressLookup` interface                                                                                         | Purpose-built for UK postcodes and cheaper than Google Places; _verify_ current pricing/API.                                                                                                                                                                                                |
| Feature flags  | `feature_flags` table read through the API                                                                                                | Simple, admin-editable, no vendor.                                                                                                                                                                                                                                                          |
| CI             | GitHub Actions                                                                                                                            | Lint, typecheck, tests, build, migration check, dependency audit.                                                                                                                                                                                                                           |

## 3. Repository layout

```
apps/
  web/        customer site (Next.js)
  admin/      admin portal (Next.js)
  kitchen/    kitchen display PWA (Next.js)
  api/        Hono API on Vercel Functions
  mobile/     Expo app (iOS + Android)
packages/
  ui/         design tokens (TS + Tailwind preset + RN theme), web components, brand motifs
  types/      generated Supabase types + canonical domain types
  validation/ zod schemas (API contracts, env, forms)
  pricing/    pure pricing + promotion engine (no I/O)
  api-client/ typed client for apps/api
  web-auth/   Next.js Supabase session helpers and role gate shared by web, admin, kitchen
  channels/   OrderChannelAdapter + Uber Eats / Just Eat / Deliveroo / middleware / mock adapters
  config/     shared eslint, tsconfig, tailwind preset
supabase/
  migrations/ schema, RLS, functions, triggers, cron
  tests/      pgTAP policy and state-machine tests
  seed.sql    reference data; menu loaded by scripts/seed-menu.ts
scripts/      menu import, seeding, brand asset generation, channel simulator CLI
data/         menu.seed.json
assets/brand/ supplied logo (source of truth) + generated derivatives
docs/         ARCHITECTURE, DEPLOYMENT, MENU_IMPORT_NOTES, GO_LIVE, AUTH_SETUP, INTEGRATIONS
```

## 4. Trust boundaries

- **Clients (web, admin, kitchen, mobile)** hold only the Supabase anon/publishable key and Stripe publishable key. They read public menu data and their own rows directly under RLS, and subscribe to Realtime on authorised private channels.
- **`apps/api`** is the only holder of the Supabase service-role key, Stripe secret key, webhook secrets and channel credentials. It owns price calculation, promo validation, order creation, payments, webhooks, refunds, status changes and every admin write.
- **Postgres** is the last line of defence: RLS on every table, a state-machine guard trigger, constraints, and an audit trigger. A bug in the API cannot make an illegal transition or leak another customer's row through a client key.
- A lint rule plus a CI grep fails the build if server-only env names appear in any client app.

## 5. Data model

All money is integer pence. All tables have RLS enabled. Timestamps are `timestamptz`; shop-local logic uses `Europe/London`.

**Identity**

- `profiles` (1:1 `auth.users`): name, phone, `stripe_customer_id`, marketing opt-in + timestamp, blocked flag, internal notes.
- `addresses`: per-user saved delivery addresses.
- `user_roles` holds staff roles (`kitchen | manager | admin`; no row means `customer`). A custom access token hook copies the role into the `user_role` JWT claim, so RLS and the API read it from the verified token. `customer_flags` (blocked, internal notes) is a separate staff-only table so customers can never read it. `staff_invites` comes in Phase 6.

**Menu**

- `categories`, `menu_items`, `item_variants` (size, price), `option_groups` (crust, toppings, deal slots; min/max rules), `options`, `option_prices` (price by size), `item_option_groups` (link + ordering).
- `allergens` (the 14), `item_allergens`, `option_allergens`, `dietary_tags`, `item_dietary_tags`.
- `channel_prices`: per-channel price overrides for variants and options.
- Availability: `is_published`, `sold_out_until` on items and options.

**Shop configuration**

- `shop_settings` (single row: VAT, prep times, busy mode, cash toggle, receipt text, business details), `opening_hours`, `holiday_closures`, `delivery_zones` (postcode prefixes and/or radius, fee, minimum), `notification_templates`, `feature_flags`.

**Orders**

- `orders`: number, channel (`web | app | phone | uber_eats | just_eat | deliveroo`), fulfilment, status enum, scheduled time, customer snapshot, address snapshot, totals (subtotal, discount, delivery fee, tip, VAT, total), payment method, guest lookup-token hash, external order id, platform commission, allergen acknowledgement.
- `order_items`, `order_item_options`: **snapshots** of names, prices and allergens at time of order, so later menu edits never alter history.
- `order_status_events`: every transition with actor, timestamp and reason.
- `payments`, `refunds`, `stripe_events` (processed event ids for idempotency).

**Promotions**

- `promotions`: type, JSON rule set validated by zod (conditions, rewards, schedule, channels, fulfilment, stacking group, priority, exclusivity), status, banner fields.
- `promo_codes`, `promotion_redemptions` (per order, with discount amount for reporting and usage caps).

**Channels**

- `channel_connections`, `channel_events` (raw webhook payloads, dedupe key, processing state), `channel_menu_mappings`.

**Operations**

- `jobs` (outbox/queue), `audit_log`, `push_tokens`, `feedback`, `rate_limits`.

**Phase 2, schema reserved now**

- `loyalty_accounts`, `loyalty_ledger`, `gift_cards`, `gift_card_ledger`.

### Order state machine

```
PENDING_PAYMENT → RECEIVED → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY → COMPLETED
                                                        └→ COLLECTED ────────→ COMPLETED
PENDING_PAYMENT → CANCELLED        RECEIVED → REJECTED
any pre-COMPLETED active state → CANCELLED        paid states → REFUNDED
```

Defined once as a transition table in `packages/types`, used by the API, and mirrored in a Postgres `BEFORE UPDATE` trigger that rejects illegal transitions and writes `order_status_events`. A test asserts the TypeScript table and the SQL table are identical.

## 6. Pricing and promotions

`packages/pricing` is a pure function: `price(basket, menuSnapshot, promotions, context) → PricedBasket`. No I/O, no clock access (time is passed in), fully deterministic.

- The web/mobile basket calls it for an instant preview. Checkout calls the **same function** in `apps/api` against fresh DB data; the server result is the only one stored or charged.
- Promotion evaluation: filter by eligibility (schedule, day/time window, channel, fulfilment, first-order, code, usage caps) → compute each candidate's discount → resolve by priority and stacking groups (exclusive promotions win alone; otherwise at most one per stacking group) → allocate discounts to lines for VAT and refund accuracy.
- Prices are VAT-inclusive; VAT is extracted per line by rate for the receipt.
- Usage caps are enforced atomically in the order-creation SQL function, not just in the preview.

## 7. API surface (`apps/api`, all under `/v1`)

| Group                    | Endpoints                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public                   | `GET /health`, `GET /menu`, `GET /shop/status`, `POST /delivery/check`, `GET /address/lookup`, `GET /promotions/active`                                                                     |
| Basket / checkout        | `POST /basket/price`, `POST /checkout` (creates `PENDING_PAYMENT` order + PaymentIntent), `GET /orders/:id` (owner or guest token), `POST /orders/:id/reorder`, `POST /orders/:id/feedback` |
| Account                  | `GET/PATCH /me`, addresses CRUD, `GET /me/payment-methods`, `POST /me/setup-intent`, `GET /me/export`, `DELETE /me`, `POST /me/push-tokens`                                                 |
| Kitchen (role ≥ kitchen) | `GET /kitchen/orders?since=`, `POST /kitchen/orders/:id/accept`, `/reject`, `/status`, `/items/:itemId/done`, `/print`                                                                      |
| Admin (role ≥ manager)   | menu, promotions, orders (incl. `/refund`, manual order entry), customers, settings, zones, hours, staff, reports, audit log, integrations, mappings, simulator                             |
| Webhooks                 | `POST /webhooks/stripe`, `POST /webhooks/channels/:channel`                                                                                                                                 |
| Cron                     | `POST /cron/jobs`, `/cron/expire-pending`, `/cron/retention` (protected by cron secret)                                                                                                     |
| Docs                     | `GET /openapi.json`, `GET /docs`                                                                                                                                                            |

Payment rule: an order leaves `PENDING_PAYMENT` only inside the verified `payment_intent.succeeded` webhook handler. The client's success callback only navigates to the tracking page.

## 8. Background jobs on serverless

There is no long-running worker. Work that must survive a function timeout or a third-party outage is written to a `jobs` row **in the same transaction** as the change that caused it (outbox pattern), so it cannot be lost.

- Columns: `type`, `payload`, `idempotency_key` (unique), `status` (`queued | running | succeeded | failed | dead`), `attempts`, `run_at`, `last_error`.
- A Vercel Cron hits `/cron/jobs` every minute; the handler claims a batch with `FOR UPDATE SKIP LOCKED`, runs handlers, and reschedules failures with exponential backoff. After max attempts a job becomes `dead` and shows in the admin error log with a retry button.
- Latency-sensitive jobs (confirmation email, push, channel status callback) are also attempted right after the response via Vercel's `waitUntil` (_verify_), with the cron as the safety net.
- `pg_cron` handles pure-database schedules: promotion activation/expiry, expiring stale `PENDING_PAYMENT` orders, retention purges.
- Why this fits: state lives in Postgres we already run, every invocation is short and stateless, retries and idempotency are explicit, and nothing depends on a process staying alive. `pgmq` is the upgrade path if volume ever needs it.

## 9. Realtime and kitchen resilience

- Order changes are broadcast from a Postgres trigger to **private** Realtime channels (`kitchen:orders`, `order:<id>`), authorised by RLS on `realtime.messages` (_verify_ current Broadcast-from-database API).
- The kitchen client never trusts the socket alone: it keeps a `lastSeen` cursor, polls `GET /kitchen/orders?since=` every 15 s (5 s while the socket is down), and does a full re-fetch on every reconnect. Realtime is a speed-up; polling is the guarantee.
- Offline banner, screen wake-lock, an explicit "Enable sound" step, and an alarm that repeats until the order is accepted.
- Printing sits behind a `TicketPrinter` interface (`NoopPrinter` first; ESC/POS network or print-service implementation later).

## 10. Delivery platform adapters

- `packages/channels` defines the canonical order model and `OrderChannelAdapter` (`verifyAndParseWebhook`, `acceptOrder`, `rejectOrder`, `updateStatus`, `syncMenu`, `setStoreAvailability`).
- Webhook route: verify signature → store raw event in `channel_events` (unique on channel + external id + event type) → enqueue job → return 200. Processing happens in the job with retries and dead-lettering.
- Unmapped items still create the order, flagged on the ticket and in the admin mapping tool.
- Adapters: `mock` (fully working, drives the simulator and tests), `uber-eats`, `just-eat`, `deliveroo`, plus a `middleware` slot (Deliverect/Otter). Real adapters are written against published docs with `TODO(credentials)` where partner access is required; `docs/INTEGRATIONS.md` will list exactly what to apply for.

## 11. Auth

- Supabase Auth across web, admin and mobile: Google, Apple, Facebook, email + password, magic link, email verification, password reset.
- Web uses `@supabase/ssr` cookie sessions; mobile uses native Google/Apple flows with ID-token sign-in and secure token storage.
- Guest checkout: server-created guest orders with a random lookup token (only its hash stored) embedded in the tracking link.
- Admin and kitchen apps check the role claim in middleware; the API re-checks on every endpoint; RLS enforces it again in the database.
- `docs/AUTH_SETUP.md` will list every provider console step and redirect URL.

## 12. Design system

- `packages/ui` exports tokens (colours sampled from the supplied logo, type scale, radii, shadows, motion) as TypeScript, a Tailwind preset, and a React Native theme. Every text/background pair is checked for WCAG AA by a unit test.
- Display font chosen by comparing Playfair Display, DM Serif Display, Abril Fatface and Chonburi against the logo wordmark; body font DM Sans. `next/font` on web, Expo Google Fonts on mobile.
- Sunburst rays and ring segments as SVG motifs. Kitchen has a dark high-contrast theme; admin a neutral dense theme with red accent.
- `scripts/brand-assets.ts` (sharp) generates favicons, PWA/maskable icons, OG image, Expo icon/adaptive icon/splash, email header and a 1-bit thermal logo from the unmodified source file.
- `/design` route in `apps/web` shows tokens and components.

## 13. Environments

| Env        | Supabase                                     | Vercel                                 | Stripe                 |
| ---------- | -------------------------------------------- | -------------------------------------- | ---------------------- |
| local      | CLI stack (Docker) or a personal dev project | `pnpm dev`                             | test mode + Stripe CLI |
| staging    | staging project                              | Preview deployments + `staging` branch | test mode              |
| production | production project (PITR enabled)            | Production                             | live mode              |

Four Vercel projects (`web`, `admin`, `kitchen`, `api`) from one repo, each with its own root directory. Env vars are validated with zod at startup; each app has a `.env.example`.

## 14. Compliance built in

14 allergens per item and option, shown on menu, checkout, order record and kitchen ticket; cookie consent with analytics off until granted; data export and deletion; marketing opt-in with timestamp; retention jobs; VAT breakdown; optional alcohol age notice; WCAG 2.2 AA; secure headers, CORS allow-list, rate limits; processor list in the privacy policy.

## 15. Phases

1. **Foundation** — monorepo, tooling, CI, tokens/fonts/brand assets, Supabase baseline + RLS + roles, auth, env validation, first preview deploy.
2. **Menu** — import + seed, menu API, admin menu management, customer menu pages.
3. **Basket and checkout** — pricing engine, zones, hours, Stripe + webhooks, state machine, emails.
4. **Kitchen display + realtime** — sound, status flow, resilience, printer interface.
5. **Promotions** — engine, admin UI, Special Offers page.
6. **Admin completion** — orders, customers, settings, reports, audit log, refunds.
7. **Channel adapters** — canonical model, simulator, three adapters, mapping UI, status sync.
8. **Mobile** — Expo app end to end, push, store config.
9. **Hardening and launch** — RLS audit, accessibility, load test, SEO, legal pages, backups, `GO_LIVE.md`.

Each phase ends with tests, lint and typecheck green, docs updated, a commit, and a short summary.

## 16. Findings from the initial survey (2026-11-10)

- **Logo:** supplied 2026-11-10 as a 2000×2000 PNG (renamed from `Logo.png`). Large enough for every derivative; no SVG needed. Sampled colours: cream `#FBEFD5`, red `#BF2F21`, green `#28633B`, ink `#151515`.
- **Menu source is readable.** Navigation exposes seven categories: Pizzas, Sides & Starters, **Pastas** (not in the brief's page list), Special Offers, Desserts, Drinks, Dips. Listing pages show only "from" prices; sizes, crusts and toppings are on per-item pages, which the importer must visit. An allergen/nutrition page also exists.
- **Existing `data/menu.seed.json`** holds 22 pizzas with "from" prices only and no sizes or options. Phase 2 replaces it with the full normalised schema.
- **Possible trademark flag:** "GoGo Special" carries the source brand's name and needs renaming.
- **Machine:** Node 25, pnpm 12, git and Supabase CLI are present. Docker and WSL are not, so `supabase start` cannot run locally as things stand. Vercel, Stripe, EAS and GitHub CLIs are not installed.
- **Project folder is inside OneDrive.** Syncing `node_modules` causes file locks and very slow installs; the repo should live outside OneDrive.
- iOS builds need EAS cloud builds (no Mac required) and an Apple Developer account.
