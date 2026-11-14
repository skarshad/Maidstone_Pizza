-- Orders: access rules, the state machine guard, payment recording and expiry.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- ---- fixtures -------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'alice@example.test'),
  ('00000000-0000-0000-0000-0000000003b1', 'bob@example.test'),
  ('00000000-0000-0000-0000-0000000003c1', 'kitchen@example.test'),
  ('00000000-0000-0000-0000-0000000003d1', 'manager@example.test');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000003c1', 'kitchen'),
  ('00000000-0000-0000-0000-0000000003d1', 'manager');

-- Three orders through the same function the API uses: Alice (delivery),
-- Bob (collection) and a guest.
create temp table t_orders (who text primary key, id uuid);
grant all on t_orders to public;

insert into t_orders
select 'alice', (public.create_order('{
  "user_id":"00000000-0000-0000-0000-0000000003a1","fulfilment":"delivery",
  "estimated_ready_at":"2030-01-01T18:45:00Z",
  "customer_name":"Alice","customer_email":"alice@example.test","customer_phone":"07000000001",
  "address":{"line1":"1 High St","town":"Maidstone","postcode":"ME14 1AA"},
  "subtotal_pence":3398,"delivery_fee_pence":250,"tip_pence":100,"vat_pence":608,"total_pence":3748,
  "allergen_acknowledged":true,"idempotency_key":"t3-alice",
  "items":[
    {"name":"Maidstone Special","variant_name":"Large","quantity":2,"unit_price_pence":1499,"options_pence":200,
     "line_total_pence":3398,"vat_rate_bp":2000,"allergens":[],"allergens_confirmed":false,
     "options":[{"group_name":"Base","name":"Stuffed crust: Cheese","price_pence":200}]}
  ]}'::jsonb) ->> 'id')::uuid;

insert into t_orders
select 'bob', (public.create_order('{
  "user_id":"00000000-0000-0000-0000-0000000003b1","fulfilment":"collection",
  "estimated_ready_at":"2030-01-01T18:20:00Z",
  "customer_name":"Bob","customer_email":"bob@example.test","customer_phone":"07000000002",
  "subtotal_pence":999,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":167,"total_pence":999,
  "allergen_acknowledged":true,"idempotency_key":"t3-bob",
  "items":[{"name":"Cheese & Tomato","variant_name":"Small","quantity":1,"unit_price_pence":999,
            "options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}]}'::jsonb) ->> 'id')::uuid;

insert into t_orders
select 'guest', (public.create_order('{
  "fulfilment":"collection","estimated_ready_at":"2030-01-01T18:20:00Z",
  "customer_name":"Guest","customer_email":"guest@example.test","customer_phone":"07000000003",
  "subtotal_pence":599,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":100,"total_pence":599,
  "allergen_acknowledged":true,"guest_token_hash":"abc","idempotency_key":"t3-guest",
  "items":[{"name":"Meat Lasagne","variant_name":"Standard","quantity":1,"unit_price_pence":599,
            "options_pence":0,"line_total_pence":599,"vat_rate_bp":2000}]}'::jsonb) ->> 'id')::uuid;

insert into public.payments (order_id, provider, provider_ref, amount_pence)
select id, 'simulator', 'pi_t3_' || who, case who when 'alice' then 3748 when 'bob' then 999 else 599 end
from t_orders;

-- ---- structure ------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'every public table has RLS enabled'
);
select is(
  (select status::text from public.orders where id = (select id from t_orders where who = 'alice')),
  'PENDING_PAYMENT', 'a new order starts as PENDING_PAYMENT'
);
select is(
  (select count(*)::int from public.order_item_options o
   join public.order_items i on i.id = o.order_item_id
   where i.order_id = (select id from t_orders where who = 'alice')),
  1, 'item options are snapshotted with the order'
);
select is(
  (public.create_order('{"idempotency_key":"t3-alice","items":[]}'::jsonb) ->> 'created'),
  'false', 'a repeated idempotency key returns the first order instead of creating another'
);
select throws_ok(
  $$select public.create_order('{
      "fulfilment":"collection","estimated_ready_at":"2030-01-01T18:20:00Z",
      "customer_name":"X","customer_email":"x@example.test","customer_phone":"0",
      "subtotal_pence":1000,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":0,"total_pence":1000,
      "allergen_acknowledged":true,
      "items":[{"name":"A","variant_name":"S","quantity":1,"unit_price_pence":999,
                "options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}]}'::jsonb)$$,
  '23514', null, 'lines that do not add up to the subtotal are rejected'
);
select throws_ok(
  $$select public.create_order('{
      "fulfilment":"collection","estimated_ready_at":"2030-01-01T18:20:00Z",
      "customer_name":"X","customer_email":"x@example.test","customer_phone":"0",
      "subtotal_pence":999,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":0,"total_pence":1500,
      "allergen_acknowledged":true,
      "items":[{"name":"A","variant_name":"S","quantity":1,"unit_price_pence":999,
                "options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}]}'::jsonb)$$,
  '23514', null, 'a total that does not match its parts is rejected'
);
select throws_ok(
  $$select public.create_order('{
      "fulfilment":"delivery","estimated_ready_at":"2030-01-01T18:20:00Z",
      "customer_name":"X","customer_email":"x@example.test","customer_phone":"0",
      "subtotal_pence":999,"delivery_fee_pence":0,"tip_pence":0,"vat_pence":0,"total_pence":999,
      "allergen_acknowledged":true,
      "items":[{"name":"A","variant_name":"S","quantity":1,"unit_price_pence":999,
                "options_pence":0,"line_total_pence":999,"vat_rate_bp":2000}]}'::jsonb)$$,
  '23514', null, 'a delivery order without an address is rejected'
);

-- ---- anonymous ------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.orders', '42501', null, 'anon cannot read orders');
select throws_ok('select * from public.payments', '42501', null, 'anon cannot read payments');
select throws_ok('select * from public.jobs', '42501', null, 'anon cannot read jobs');
select throws_ok(
  $$select public.create_order('{}'::jsonb)$$, '42501', null, 'anon cannot call create_order'
);
select throws_ok(
  $$select public.record_payment_event('{}'::jsonb)$$, '42501', null,
  'anon cannot forge a payment event'
);
select is((select count(*)::int from public.opening_hours), 7, 'anon can read opening hours');
select is(
  (select count(*)::int from public.delivery_zones where name = 'Maidstone'), 1,
  'anon can read active delivery zones'
);
select throws_ok(
  $$update public.shop_settings set cash_enabled = true$$, '42501', null,
  'anon cannot change shop settings'
);
reset role;

-- ---- customer (Alice) -----------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated","user_role":"customer"}';
set local role authenticated;
select is(
  (select count(*)::int from public.orders where id in (select id from t_orders)), 1,
  'a customer sees only their own order'
);
select is(
  (select count(*)::int from public.order_items where order_id in (select id from t_orders)), 1,
  'a customer sees only their own order lines'
);
select is(
  (select count(*)::int from public.order_status_events where order_id in (select id from t_orders)), 1,
  'a customer sees only their own order history'
);
select throws_ok(
  $$update public.orders set status = 'RECEIVED'$$, '42501', null,
  'a customer cannot mark their own order paid'
);
select throws_ok(
  $$update public.orders set total_pence = 1$$, '42501', null,
  'a customer cannot change a total'
);
select throws_ok(
  $$insert into public.orders (fulfilment, estimated_ready_at, customer_name, customer_email,
      customer_phone, subtotal_pence, vat_pence, total_pence, allergen_acknowledged)
    values ('collection', now(), 'x', 'x', 'x', 1, 0, 1, true)$$,
  '42501', null, 'a customer cannot insert an order directly'
);
select throws_ok(
  $$select public.transition_order(
      (select id from t_orders where who = 'alice'), 'RECEIVED', null, 'customer', 'free pizza')$$,
  '42501', null, 'a customer cannot call transition_order'
);
select throws_ok('select * from public.payments', '42501', null, 'a customer cannot read payments');
select is_empty(
  $$update public.shop_settings set cash_enabled = true returning id$$,
  'a customer cannot change shop settings'
);
reset role;

-- ---- kitchen and manager --------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003c1","role":"authenticated","user_role":"kitchen"}';
set local role authenticated;
select is(
  (select count(*)::int from public.orders where id in (select id from t_orders)), 3,
  'kitchen staff see every order'
);
select throws_ok(
  $$update public.orders set status = 'ACCEPTED'$$, '42501', null,
  'kitchen staff cannot change orders directly (only through the API)'
);
reset role;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003d1","role":"authenticated","user_role":"manager"}';
set local role authenticated;
select isnt_empty(
  $$update public.shop_settings set busy_mode = true returning id$$,
  'a manager can change shop settings'
);
select lives_ok(
  $$insert into public.holiday_closures (closed_on, reason) values ('2030-12-25', 'Christmas Day')$$,
  'a manager can add a closure'
);
reset role;

-- ---- payments and the state machine (as the API's service role) ------------
set local role service_role;

select is(
  public.record_payment_event('{"event_id":"evt_t3_1","type":"payment_intent.succeeded","provider_ref":"pi_t3_alice","amount_pence":3748}'::jsonb),
  'paid', 'a verified payment marks the order paid'
);
select is(
  (select status::text from public.orders where id = (select id from t_orders where who = 'alice')),
  'RECEIVED', 'the paid order moves to RECEIVED'
);
select is(
  public.record_payment_event('{"event_id":"evt_t3_1","type":"payment_intent.succeeded","provider_ref":"pi_t3_alice","amount_pence":3748}'::jsonb),
  'duplicate', 'the same event delivered twice is ignored'
);
select is(
  (select count(*)::int from public.jobs
   where kind = 'order_confirmation_email'
     and payload ->> 'order_id' = (select id::text from t_orders where who = 'alice')),
  1, 'exactly one confirmation email is queued'
);
select is(
  (select actor_role from public.order_status_events
   where order_id = (select id from t_orders where who = 'alice') and to_status = 'RECEIVED'),
  'payment_webhook', 'the status change records that the payment webhook made it'
);
select is(
  public.record_payment_event('{"event_id":"evt_t3_2","type":"payment_intent.succeeded","provider_ref":"pi_t3_bob","amount_pence":1}'::jsonb),
  'amount_mismatch', 'a payment for the wrong amount is not accepted'
);
select is(
  (select status::text from public.orders where id = (select id from t_orders where who = 'bob')),
  'PENDING_PAYMENT', 'an underpaid order stays unpaid'
);
select is(
  public.record_payment_event('{"event_id":"evt_t3_3","type":"payment_intent.succeeded","provider_ref":"pi_nobody","amount_pence":1}'::jsonb),
  'unknown_payment', 'an event for an unknown payment changes nothing'
);

select throws_ok(
  $$select public.transition_order(
      (select id from t_orders where who = 'alice'), 'READY', null, 'kitchen', 'skip ahead')$$,
  '23514', null, 'an order cannot skip states'
);
select lives_ok(
  $$select public.transition_order(
      (select id from t_orders where who = 'alice'), 'ACCEPTED',
      '00000000-0000-0000-0000-0000000003c1', 'kitchen', 'accepted')$$,
  'a legal move is allowed'
);
select is(
  (select actor_id from public.order_status_events
   where order_id = (select id from t_orders where who = 'alice') and to_status = 'ACCEPTED'),
  '00000000-0000-0000-0000-0000000003c1'::uuid, 'the move records who made it'
);
select throws_ok(
  $$select public.transition_order(
      (select id from t_orders where who = 'bob'), 'ACCEPTED', null, 'kitchen', 'unpaid')$$,
  '23514', null, 'an unpaid order cannot be accepted'
);
select throws_ok(
  $$update public.orders set total_pence = 1, subtotal_pence = 1
    where id = (select id from t_orders where who = 'alice')$$,
  '23514', null, 'order totals cannot be edited after creation, even by the service role'
);
select throws_ok(
  $$update public.orders set user_id = '00000000-0000-0000-0000-0000000003b1'
    where id = (select id from t_orders where who = 'alice')$$,
  '23514', null, 'an order cannot be moved to another account'
);

-- Collection order cannot go out for delivery.
select lives_ok(
  $outer$do $inner$
    declare v uuid := (select id from t_orders where who = 'guest');
    begin
      perform public.record_payment_event(jsonb_build_object(
        'event_id', 'evt_t3_4', 'type', 'payment_intent.succeeded',
        'provider_ref', 'pi_t3_guest', 'amount_pence', 599));
      perform public.transition_order(v, 'ACCEPTED', null, 'kitchen', '');
      perform public.transition_order(v, 'PREPARING', null, 'kitchen', '');
      perform public.transition_order(v, 'READY', null, 'kitchen', '');
    end $inner$ $outer$,
  'an order can walk the normal path to READY'
);
select throws_ok(
  $$select public.transition_order(
      (select id from t_orders where who = 'guest'), 'OUT_FOR_DELIVERY', null, 'kitchen', '')$$,
  '23514', null, 'a collection order cannot go out for delivery'
);

-- Refund from the provider.
select is(
  public.record_payment_event('{"event_id":"evt_t3_5","type":"charge.refunded","provider_ref":"pi_t3_guest","refunded_pence":599}'::jsonb),
  'refunded', 'a full refund is recorded'
);
select is(
  (select status::text from public.orders where id = (select id from t_orders where who = 'guest')),
  'REFUNDED', 'a fully refunded order moves to REFUNDED'
);

-- Expiry of unpaid orders.
update public.orders set created_at = now() - interval '3 hours'
where id = (select id from t_orders where who = 'bob');
select is(
  (select count(*)::int from public.expire_pending_orders() e
   where e.order_id = (select id from t_orders where who = 'bob')),
  1, 'an unpaid order is cancelled after the time limit'
);
reset role;

select * from finish();
rollback;
