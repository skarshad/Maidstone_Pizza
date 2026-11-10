# Auth setup

What has to be configured by hand, per Supabase project, for sign-in to work. The code for all of these is in place; none of the providers has been configured or tested against a real project yet.

Throughout, `<project-ref>` is the Supabase project reference and `<site>` is the web app's origin (`http://localhost:3000` locally).

## 1. Supabase URL configuration

Dashboard > Authentication > URL Configuration:

- **Site URL:** `<site>`
- **Redirect URLs** (add each):
  - `http://localhost:3000/auth/callback`
  - `https://<production-domain>/auth/callback`
  - `https://*-<vercel-team>.vercel.app/auth/callback` (preview deployments)
  - the mobile deep link, added in Phase 8

Every sign-in route (OAuth, email confirmation, magic link, password reset) returns to `/auth/callback`, which exchanges the one-time code for a session cookie and then redirects to a same-site path only.

## 2. Token hook (roles)

Dashboard > Authentication > Hooks > **Custom Access Token** > `public.custom_access_token_hook`.

This copies the user's role from `public.user_roles` into the `user_role` claim. Customers have no row and get `customer`. Staff roles are granted by inserting a row (see `docs/DEPLOYMENT.md`); from Phase 6 the admin portal does this.

## 3. Email

Dashboard > Authentication > Providers > Email:

- Enable email + password, and **Confirm email**.
- Magic links use the same provider; no extra switch.
- Minimum password length 8 (the forms enforce the same).

Supabase's built-in email sender is rate-limited and meant for testing. Before launch, set custom SMTP (Resend) under Authentication > Emails so confirmation and reset emails come from the shop's domain. That is done in Phase 3 with the transactional email work.

Magic links and reset links must be opened in the same browser that requested them (PKCE flow).

## 4. Social providers

For each provider, the **callback URL to register in the provider's console** is shown on the provider's page in the Supabase dashboard (Authentication > Providers). It has the form `https://<project-ref>.supabase.co/auth/v1/callback`. Copy it from the dashboard rather than typing it.

| Provider | Where to create credentials                                                                                                 | What Supabase needs                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Google   | Google Cloud Console > APIs & Services > Credentials > OAuth client (Web application)                                       | Client ID, client secret                                                             |
| Apple    | Apple Developer > Certificates, Identifiers & Profiles: an App ID with Sign in with Apple, a Services ID for web, and a key | Services ID, team ID, key ID, private key (Supabase generates the secret from these) |
| Facebook | Meta for Developers > create an app > Facebook Login                                                                        | App ID, app secret                                                                   |

Notes:

- Apple needs a paid Apple Developer account, and the web secret expires periodically and must be regenerated. Follow the current Supabase "Login with Apple" guide when doing this; the steps change.
- Apple Sign-In is mandatory in the iOS app because other social logins are offered.
- Facebook requires the app to be switched to Live mode, with a privacy policy URL and a data-deletion URL, before the public can use it.
- Mobile uses native Google and Apple sign-in with ID tokens (Phase 8), which needs extra client IDs (iOS and Android) added to the Google provider's allowed client IDs.

## 5. Staff apps

`apps/admin` and `apps/kitchen` offer email + password only. Access is checked three times: in each app's `proxy.ts`, on every API route, and by RLS in the database.

| App     | Minimum role |
| ------- | ------------ |
| kitchen | `kitchen`    |
| admin   | `manager`    |

## 6. Checklist to verify once a project exists

- [ ] Sign up with email, confirm, sign in, sign out
- [ ] Magic link
- [ ] Password reset
- [ ] Google, Apple, Facebook
- [ ] A customer account is redirected to "No access" in admin and kitchen
- [ ] After granting `kitchen`, that user reaches the kitchen app but not admin
- [ ] `GET /v1/me` on the API returns the right role
