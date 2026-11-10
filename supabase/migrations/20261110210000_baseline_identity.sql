-- Phase 1 baseline: roles, profiles, staff-only customer flags, audit log.
-- Every table here has RLS enabled; policies are tested in supabase/tests.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- Enum order matters: later values are more privileged (see has_role).
create type public.app_role as enum ('customer', 'kitchen', 'manager', 'admin');

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);
comment on table public.user_roles is
  'Staff roles. Users without a row are customers. Written only by the API (service role).';

alter table public.user_roles enable row level security;

-- Role of the caller, read from the JWT claim set by custom_access_token_hook.
create function public.jwt_role()
returns public.app_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif((select auth.jwt()) ->> 'user_role', '')::public.app_role,
    'customer'::public.app_role
  );
$$;

create function public.has_role(minimum public.app_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null and public.jwt_role() >= minimum;
$$;

-- Custom Access Token hook: copies the user's role into the `user_role` claim.
-- Contract: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  found_role public.app_role;
begin
  select role into found_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(found_role, 'customer')));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

revoke all on table public.user_roles from anon, public;
revoke insert, update, delete, truncate on table public.user_roles from authenticated;
grant select on table public.user_roles to authenticated;
grant all on table public.user_roles to supabase_auth_admin;

create policy "auth admin reads roles for the token hook"
  on public.user_roles for select to supabase_auth_admin
  using (true);

create policy "users read own role, admins read all"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Profiles (customer-editable)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 32),
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Customers may change only their contact details and marketing preference.
revoke all on table public.profiles from anon, public;
revoke insert, update, delete, truncate on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone, marketing_opt_in) on table public.profiles to authenticated;

create policy "read own profile, managers read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_role('manager'));

create policy "update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Record when marketing consent was given (UK GDPR evidence); clear on withdrawal.
  if new.marketing_opt_in is distinct from old.marketing_opt_in then
    new.marketing_opt_in_at := case when new.marketing_opt_in then now() else null end;
  end if;
  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- Create a profile row for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Staff-only customer flags (kept apart so customers can never read them)
-- ---------------------------------------------------------------------------
create table public.customer_flags (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_blocked boolean not null default false,
  internal_notes text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.customer_flags enable row level security;

revoke all on table public.customer_flags from anon, public;
revoke insert, update, delete, truncate on table public.customer_flags from authenticated;
grant select on table public.customer_flags to authenticated;

create policy "managers read customer flags"
  on public.customer_flags for select to authenticated
  using (public.has_role('manager'));

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);

alter table public.audit_log enable row level security;

revoke all on table public.audit_log from anon, public;
revoke insert, update, delete, truncate on table public.audit_log from authenticated;
grant select on table public.audit_log to authenticated;

create policy "managers read the audit log"
  on public.audit_log for select to authenticated
  using (public.has_role('manager'));

-- Generic row-change audit trigger. Attach with:
--   create trigger <t>_audit after insert or update or delete on <t>
--   for each row execute function public.audit_row_change();
-- Tables need an `id` or `user_id` column to be identified in the log.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, before, after)
  values (
    nullif(claims ->> 'sub', '')::uuid,
    coalesce(claims ->> 'user_role', claims ->> 'role', current_user),
    lower(tg_op),
    tg_table_name,
    coalesce(new_row ->> 'id', new_row ->> 'user_id', old_row ->> 'id', old_row ->> 'user_id'),
    old_row,
    new_row
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.audit_row_change from authenticated, anon, public;
revoke execute on function public.handle_new_user from authenticated, anon, public;

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

create trigger customer_flags_audit
  after insert or update or delete on public.customer_flags
  for each row execute function public.audit_row_change();
