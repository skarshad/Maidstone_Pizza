-- RLS and role tests for the Phase 1 baseline. Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---- fixtures -------------------------------------------------------------
-- The database may already hold real accounts, so counts below only look at
-- these fixture rows (ids ending 000a to 000e).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'kitchen@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'manager@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'admin@example.test');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-00000000000c', 'kitchen'),
  ('00000000-0000-0000-0000-00000000000d', 'manager'),
  ('00000000-0000-0000-0000-00000000000e', 'admin');

insert into public.customer_flags (user_id, is_blocked, internal_notes)
values ('00000000-0000-0000-0000-00000000000a', true, 'staff eyes only');

-- ---- structure ------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every public table has RLS enabled'
);

select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-00000000000_'),
  5,
  'a profile row is created for each new auth user'
);

-- ---- token hook -----------------------------------------------------------
select is(
  public.custom_access_token_hook(
    '{"user_id":"00000000-0000-0000-0000-00000000000d","claims":{}}'::jsonb
  ) -> 'claims' ->> 'user_role',
  'manager',
  'hook adds the staff role claim'
);

select is(
  public.custom_access_token_hook(
    '{"user_id":"00000000-0000-0000-0000-00000000000a","claims":{}}'::jsonb
  ) -> 'claims' ->> 'user_role',
  'customer',
  'hook defaults to customer'
);

-- ---- anonymous ------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.audit_log', '42501', null, 'anon cannot read the audit log');
select throws_ok('select * from public.user_roles', '42501', null, 'anon cannot read roles');
reset role;

-- ---- customer (Alice) -----------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","user_role":"customer"}';
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'customer sees only their own profile');
select is((select count(*)::int from public.customer_flags), 0, 'customer cannot see staff flags about them');
select is((select count(*)::int from public.audit_log), 0, 'customer cannot see the audit log');
select is((select count(*)::int from public.user_roles), 0, 'customer cannot see staff roles');

select lives_ok(
  $$update public.profiles set full_name = 'Alice', marketing_opt_in = true
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'customer can update own contact details'
);
select isnt(
  (select marketing_opt_in_at from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  null,
  'marketing consent timestamp is recorded'
);
select is_empty(
  $$update public.profiles set full_name = 'hacked'
    where id = '00000000-0000-0000-0000-00000000000b' returning id$$,
  'customer cannot update another profile'
);
select throws_ok(
  $$update public.profiles set stripe_customer_id = 'cus_x'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'customer cannot set server-owned columns'
);
select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('00000000-0000-0000-0000-00000000000a', 'admin')$$,
  '42501', null, 'customer cannot grant themselves a role'
);
select throws_ok(
  $$insert into public.audit_log (action, entity) values ('x', 'y')$$,
  '42501', null, 'audit log cannot be written by clients'
);

-- A forged claim on a customer token is the hook''s job to prevent; has_role
-- must still deny when there is no signed-in user at all.
reset role;
set local request.jwt.claims = '';
select is(public.has_role('customer'), false, 'has_role is false without a user');

-- ---- kitchen --------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","user_role":"kitchen"}';
set local role authenticated;
select is((select count(*)::int from public.profiles), 1, 'kitchen sees only their own profile');
select is((select count(*)::int from public.audit_log), 0, 'kitchen cannot see the audit log');

-- ---- manager --------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated","user_role":"manager"}';
set local role authenticated;
select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-00000000000_'),
  5,
  'manager sees all profiles'
);
select is((select count(*)::int from public.customer_flags), 1, 'manager sees customer flags');
select cmp_ok((select count(*)::int from public.audit_log), '>=', 4, 'role and flag changes were audited');

-- ---- admin ----------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated","user_role":"admin"}';
set local role authenticated;
select is(
  (select count(*)::int from public.user_roles where user_id::text like '00000000-0000-0000-0000-00000000000_'),
  3,
  'admin sees all staff roles'
);

select * from finish();
rollback;
