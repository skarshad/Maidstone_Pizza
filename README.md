# Maidstone Pizza

Ordering platform for a pizza takeaway in Maidstone, Kent: customer website, admin portal, kitchen display and API, with iOS and Android apps to follow.

**Status:** Phase 1 (foundation) is built. You can run the apps, sign in and see the brand and layout. The menu, basket and checkout come in later phases.

## Run it locally

### What you need

- Node.js 22 or newer
- pnpm 12 (`npm install -g pnpm` if you don't have it)
- A Supabase project with the migrations applied. The dev project `maidstone-pizza-dev` is already set up.

### First time only

1. Install the dependencies from the project folder. This takes a few minutes because the folder is inside OneDrive.

   ```
   pnpm install
   ```

2. Make sure each app has a `.env.local` file. On the original machine these already exist. On a new machine, copy each app's `.env.example` to `.env.local` and fill in the values from the Supabase dashboard (Connect):

   | File                      | Values to fill in                                                  |
   | ------------------------- | ------------------------------------------------------------------ |
   | `apps/web/.env.local`     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
   | `apps/admin/.env.local`   | the same two values                                                |
   | `apps/kitchen/.env.local` | the same two values                                                |
   | `apps/api/.env.local`     | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`  |

   The secret key goes in `apps/api/.env.local` only, never in the other three. These files are ignored by git; never commit them.

### Every time

Start everything with one command:

```
pnpm dev
```

Leave that window open, then visit:

| What                                     | Address                         |
| ---------------------------------------- | ------------------------------- |
| Customer website                         | http://localhost:3000           |
| Design preview (colours, fonts, buttons) | http://localhost:3000/design    |
| Sign in or create an account             | http://localhost:3000/login     |
| Admin portal                             | http://localhost:3001           |
| Kitchen display                          | http://localhost:3002           |
| API documentation                        | http://localhost:8787/docs      |
| API health check                         | http://localhost:8787/v1/health |

The first load of each page is slow while it compiles. Press `Ctrl+C` in the window to stop everything.

To run one app on its own:

```
pnpm --filter @mp/web dev        # or @mp/admin, @mp/kitchen, @mp/api
```

## Signing in to admin and kitchen

Admin and kitchen refuse anyone without a staff role. To give yourself one:

1. In the Supabase dashboard, go to Authentication > Hooks > Custom Access Token and choose `public.custom_access_token_hook`. This is needed once per project.
2. Create an account at http://localhost:3000/login.
3. In the Supabase SQL editor, run this with your own email:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```

4. Sign out and sign in again. Admin and kitchen will now let you in.

## If something goes wrong

- **"Invalid environment" error on start:** a `.env.local` file is missing or has an empty value. Check the table above.
- **"Port already in use":** another copy is still running. Close the other window, or find and stop that one process. Don't stop every Node process at once; other tools on the machine use Node too.
- **Health check shows a database error:** the Supabase URL or keys in `apps/api/.env.local` are wrong, or the project is paused (free projects pause after a week unused; restore it from the dashboard).
- **Admin says "forbidden" after you added the role:** the hook in step 1 isn't enabled, or you haven't signed out and back in.

## Useful commands

```
pnpm lint | typecheck | test | build     checks
pnpm check:secrets                       fail if a secret is in the repo or client code
pnpm db:push                             apply new migrations to the linked Supabase project
pnpm db:test:remote                      run the access-policy tests against the dev project
pnpm db:types                            regenerate database types
pnpm brand:assets                        regenerate icons and images from the logo
```

## More detail

- `docs/ARCHITECTURE.md`: how the system is designed and the build phases
- `docs/DEPLOYMENT.md`: Supabase, Vercel and environment setup
- `docs/AUTH_SETUP.md`: sign-in providers (Google, Apple, Facebook, email)
- `CLAUDE.md`: project rules and current state
