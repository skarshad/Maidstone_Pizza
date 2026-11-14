-- Kitchen actions: who may call them, and what they change.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'customer4@example.test'),
  ('00000000-0000-0000-0000-0000000004c1', 'kitchen4@example.test');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000004c1', 'kitchen');

create temp table t4 (who text primary key, id uuid);
grant all on t4 to public;

-- Two paid collection orders: one ASAP, one scheduled.
insert into t4
select 'asap', (public.create_order('{
  "fulfilment":"collection","estimated_ready_at":"2030-01-01T18:20:00Z",
  "customer_name":"A","customer_email":"a4@example.test","customer_phone":"07000000004",
  "subtotal_pence":1998,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":333,"total_pence":1998,
  "allergen_acknowledged":true,"idempotency_key":"t4-asap",
  "items":[
    {"name":"Pizza A","variant_name":"Small","quantity":1,"unit_price_pence":999,"options_pence":0,"line_total_pence":999,"vat_rate_bp":2000},
    {"name":"Pizza B","variant_name":"Small","quantity":1,"unit_price_pence":999,"options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}
  ]}'::jsonb) ->> 'id')::uuid;

insert into t4
select 'booked', (public.create_order('{
  "fulfilment":"collection","scheduled_for":"2030-06-01T19:00:00Z","estimated_ready_at":"2030-06-01T19:00:00Z",
  "customer_name":"B","customer_email":"b4@example.test","customer_phone":"07000000005",
  "subtotal_pence":999,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":167,"total_pence":999,
  "allergen_acknowledged":true,"idempotency_key":"t4-booked",
  "items":[{"name":"Pizza C","variant_name":"Small","quantity":1,"unit_price_pence":999,"options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}]}'::jsonb) ->> 'id')::uuid;

insert into t4
select 'unpaid', (public.create_order('{
  "fulfilment":"collection","estimated_ready_at":"2030-01-01T18:20:00Z",
  "customer_name":"C","customer_email":"c4@example.test","customer_phone":"07000000006",
  "subtotal_pence":999,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":167,"total_pence":999,
  "allergen_acknowledged":true,"idempotency_key":"t4-unpaid",
  "items":[{"name":"Pizza D","variant_name":"Small","quantity":1,"unit_price_pence":999,"options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}]}'::jsonb) ->> 'id')::uuid;

insert into t4
select 'reject', (public.create_order('{
  "fulfilment":"collection","estimated_ready_at":"2030-01-01T18:20:00Z",
  "customer_name":"R","customer_email":"r4@example.test","customer_phone":"07000000007",
  "subtotal_pence":999,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":167,"total_pence":999,
  "allergen_acknowledged":true,"idempotency_key":"t4-reject",
  "items":[{"name":"Pizza E","variant_name":"Small","quantity":1,"unit_price_pence":999,"options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}]}'::jsonb) ->> 'id')::uuid;

insert into public.payments (order_id, provider, provider_ref, amount_pence)
select id, 'simulator', 'pi_t4_' || who, case who when 'asap' then 1998 else 999 end from t4;

select is(
  public.record_payment_event('{"event_id":"evt_t4_3","type":"payment_intent.succeeded","provider_ref":"pi_t4_reject","amount_pence":999}'::jsonb),
  'paid', 'fixture: order to reject is paid'
);

select is(
  public.record_payment_event('{"event_id":"evt_t4_1","type":"payment_intent.succeeded","provider_ref":"pi_t4_asap","amount_pence":1998}'::jsonb),
  'paid', 'fixture: ASAP order is paid'
);
select is(
  public.record_payment_event('{"event_id":"evt_t4_2","type":"payment_intent.succeeded","provider_ref":"pi_t4_booked","amount_pence":999}'::jsonb),
  'paid', 'fixture: booked order is paid'
);

-- ---- who may call the kitchen functions ------------------------------------
set local role anon;
select throws_ok(
  $$select public.kitchen_accept_order((select id from t4 where who = 'asap'), 20, null, 'kitchen')$$,
  '42501', null, 'anon cannot accept an order'
);
reset role;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated","user_role":"customer"}';
set local role authenticated;
select throws_ok(
  $$select public.kitchen_accept_order((select id from t4 where who = 'asap'), 20, null, 'kitchen')$$,
  '42501', null, 'a customer cannot accept an order'
);
select throws_ok(
  $$select public.kitchen_reject_order((select id from t4 where who = 'asap'), 'no thanks', null, 'kitchen')$$,
  '42501', null, 'a customer cannot reject an order'
);
select throws_ok(
  $$select public.kitchen_set_item_done((select id from t4 where who = 'asap'), gen_random_uuid(), true)$$,
  '42501', null, 'a customer cannot tick items'
);
reset role;

-- Even kitchen staff go through the API, never straight to the database.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004c1","role":"authenticated","user_role":"kitchen"}';
set local role authenticated;
select throws_ok(
  $$select public.kitchen_accept_order((select id from t4 where who = 'asap'), 20, null, 'kitchen')$$,
  '42501', null, 'kitchen staff cannot call the function directly'
);
select throws_ok(
  $$update public.order_items set done_at = now()$$,
  '42501', null, 'kitchen staff cannot edit order items directly'
);
reset role;

-- ---- behaviour (as the API's service role) -----------------------------------
set local role service_role;

select throws_ok(
  $$select public.kitchen_accept_order((select id from t4 where who = 'unpaid'), 20, null, 'kitchen')$$,
  '23514', null, 'an unpaid order cannot be accepted'
);
select throws_ok(
  $$select public.kitchen_accept_order((select id from t4 where who = 'asap'), 0, null, 'kitchen')$$,
  '22023', null, 'a preparation time must be sensible'
);
select lives_ok(
  $$select public.kitchen_accept_order(
      (select id from t4 where who = 'asap'), 25,
      '00000000-0000-0000-0000-0000000004c1', 'kitchen')$$,
  'a paid order can be accepted'
);
select ok(
  (select estimated_ready_at between now() + interval '24 minutes' and now() + interval '26 minutes'
     and accepted_prep_minutes = 25 and status = 'ACCEPTED'
   from public.orders where id = (select id from t4 where who = 'asap')),
  'accepting an ASAP order sets the estimate to now plus the preparation time'
);
select is(
  (select actor_id from public.order_status_events
   where order_id = (select id from t4 where who = 'asap') and to_status = 'ACCEPTED'),
  '00000000-0000-0000-0000-0000000004c1'::uuid, 'the acceptance records who did it'
);
select lives_ok(
  $$select public.kitchen_accept_order((select id from t4 where who = 'booked'), 20, null, 'kitchen')$$,
  'a scheduled order can be accepted'
);
select is(
  (select estimated_ready_at from public.orders where id = (select id from t4 where who = 'booked')),
  '2030-06-01T19:00:00Z'::timestamptz, 'a scheduled order keeps its booked time'
);

select is(
  public.kitchen_set_item_done(
    (select id from t4 where who = 'asap'),
    (select i.id from public.order_items i
     where i.order_id = (select id from t4 where who = 'asap') and i.name = 'Pizza A'),
    true),
  true, 'an item can be ticked done'
);
select is(
  public.kitchen_set_item_done(
    (select id from t4 where who = 'booked'),
    (select i.id from public.order_items i
     where i.order_id = (select id from t4 where who = 'asap') and i.name = 'Pizza B'),
    true),
  false, 'an item cannot be ticked through a different order'
);

select throws_ok(
  $$select public.kitchen_reject_order((select id from t4 where who = 'asap'), 'too late', null, 'kitchen')$$,
  '23514', null, 'an accepted order can no longer be rejected'
);
reset role;

-- Rejecting a paid, not-yet-accepted order.
set local role service_role;
select throws_ok(
  $$select public.kitchen_reject_order((select id from t4 where who = 'reject'), ' ', null, 'kitchen')$$,
  '22023', null, 'rejecting needs a reason'
);
select lives_ok(
  $$select public.kitchen_reject_order(
      (select id from t4 where who = 'reject'), 'Out of dough',
      '00000000-0000-0000-0000-0000000004c1', 'kitchen')$$,
  'a paid order can be rejected with a reason'
);
select results_eq(
  $$select status::text, reject_reason from public.orders
    where id = (select id from t4 where who = 'reject')$$,
  $$values ('REJECTED'::text, 'Out of dough'::text)$$,
  'the rejection and its reason are stored'
);
reset role;

select * from finish();
rollback;
