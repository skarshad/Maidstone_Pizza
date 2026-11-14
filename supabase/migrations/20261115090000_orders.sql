-- Phase 3: shop configuration, orders, payments and the order state machine.
--
-- Customers never write to these tables. Orders are created and moved between
-- states only by the API (service role) through the functions below, so the
-- price, payment and lifecycle rules cannot be bypassed from a browser.
-- All money is integer pence.

-- ---- shop configuration ---------------------------------------------------

create table public.shop_settings (
  -- Single row.
  id boolean primary key default true check (id),
  shop_name text not null default 'Maidstone Pizza',
  timezone text not null default 'Europe/London',
  -- Temporary "not taking orders" switch, with a message for customers.
  ordering_paused boolean not null default false,
  paused_message text not null default '',
  -- Busy mode adds minutes to every estimate.
  busy_mode boolean not null default false,
  busy_extra_minutes integer not null default 15 check (busy_extra_minutes between 0 and 180),
  collection_minutes integer not null default 20 check (collection_minutes between 5 and 180),
  delivery_minutes integer not null default 45 check (delivery_minutes between 5 and 240),
  slot_minutes integer not null default 15 check (slot_minutes in (5, 10, 15, 20, 30, 60)),
  max_schedule_days integer not null default 2 check (max_schedule_days between 0 and 14),
  cash_enabled boolean not null default false,
  tips_enabled boolean not null default true,
  -- Unpaid orders are cancelled after this long.
  pending_payment_minutes integer not null default 30 check (pending_payment_minutes between 5 and 240),
  updated_at timestamptz not null default now()
);
insert into public.shop_settings default values;

create table public.opening_hours (
  -- 0 = Sunday ... 6 = Saturday, in the shop's timezone.
  weekday smallint primary key check (weekday between 0 and 6),
  opens time not null,
  -- At or before `opens` means the shop closes after midnight.
  closes time not null,
  is_closed boolean not null default false
);
-- Placeholder hours (4pm to 11pm daily) until the owner confirms the real ones.
insert into public.opening_hours (weekday, opens, closes)
select d, time '16:00', time '23:00' from generate_series(0, 6) as d;

create table public.holiday_closures (
  closed_on date primary key,
  reason text not null default ''
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Outward postcodes, upper case without spaces, for example {ME14,ME15}.
  postcode_prefixes text[] not null check (cardinality(postcode_prefixes) > 0),
  fee_pence integer not null check (fee_pence >= 0),
  min_order_pence integer not null default 0 check (min_order_pence >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0
);
-- Placeholder zone until the owner confirms the real delivery area and charges.
insert into public.delivery_zones (name, postcode_prefixes, fee_pence, min_order_pence)
values ('Maidstone', '{ME14,ME15,ME16}', 250, 1200);

-- ---- order lifecycle ------------------------------------------------------

create type public.order_status as enum (
  'PENDING_PAYMENT', 'RECEIVED', 'ACCEPTED', 'PREPARING', 'READY',
  'OUT_FOR_DELIVERY', 'COLLECTED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'REFUNDED'
);

-- The allowed moves. Mirrors ORDER_TRANSITIONS in packages/types; a test keeps
-- the two identical, so change both together.
create table public.order_transitions (
  from_status public.order_status not null,
  to_status public.order_status not null,
  primary key (from_status, to_status)
);
insert into public.order_transitions (from_status, to_status) values
  ('PENDING_PAYMENT', 'RECEIVED'),
  ('PENDING_PAYMENT', 'CANCELLED'),
  ('RECEIVED', 'ACCEPTED'),
  ('RECEIVED', 'REJECTED'),
  ('RECEIVED', 'CANCELLED'),
  ('ACCEPTED', 'PREPARING'),
  ('ACCEPTED', 'CANCELLED'),
  ('ACCEPTED', 'REFUNDED'),
  ('PREPARING', 'READY'),
  ('PREPARING', 'CANCELLED'),
  ('PREPARING', 'REFUNDED'),
  ('READY', 'OUT_FOR_DELIVERY'),
  ('READY', 'COLLECTED'),
  ('READY', 'CANCELLED'),
  ('READY', 'REFUNDED'),
  ('OUT_FOR_DELIVERY', 'COMPLETED'),
  ('OUT_FOR_DELIVERY', 'CANCELLED'),
  ('OUT_FOR_DELIVERY', 'REFUNDED'),
  ('COLLECTED', 'COMPLETED'),
  ('COLLECTED', 'REFUNDED'),
  ('COMPLETED', 'REFUNDED'),
  ('REJECTED', 'REFUNDED'),
  ('CANCELLED', 'REFUNDED');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity (start with 1001) unique,
  -- Null for guest orders.
  user_id uuid references auth.users (id) on delete set null,
  channel text not null default 'web'
    check (channel in ('web', 'app', 'phone', 'uber_eats', 'just_eat', 'deliveroo')),
  fulfilment text not null check (fulfilment in ('delivery', 'collection')),
  status public.order_status not null default 'PENDING_PAYMENT',
  -- Null means as soon as possible.
  scheduled_for timestamptz,
  estimated_ready_at timestamptz not null,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_email text not null,
  customer_phone text not null,
  -- {line1, line2, town, postcode}; required for delivery.
  address jsonb,
  delivery_zone_id uuid references public.delivery_zones (id) on delete set null,
  notes text not null default '',
  subtotal_pence integer not null check (subtotal_pence >= 0),
  discount_pence integer not null default 0 check (discount_pence >= 0),
  delivery_fee_pence integer not null default 0 check (delivery_fee_pence >= 0),
  tip_pence integer not null default 0 check (tip_pence >= 0),
  -- VAT contained in the total (prices are VAT-inclusive).
  vat_pence integer not null check (vat_pence >= 0),
  total_pence integer not null check (total_pence > 0),
  payment_method text not null default 'card' check (payment_method in ('card', 'cash')),
  -- SHA-256 of the guest's order lookup token. Never the token itself.
  guest_token_hash text,
  -- Customer confirmed they read the allergen notice.
  allergen_acknowledged boolean not null,
  -- Stops a double-click or retry creating two orders.
  idempotency_key text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_adds_up
    check (total_pence = subtotal_pence - discount_pence + delivery_fee_pence + tip_pence),
  constraint orders_delivery_has_address check (fulfilment <> 'delivery' or address is not null)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at);

-- Snapshots: what was ordered, as it was named and priced at the time.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  item_id uuid references public.menu_items (id) on delete set null,
  name text not null,
  variant_name text not null,
  quantity integer not null check (quantity between 1 and 50),
  -- Price of one, before options.
  unit_price_pence integer not null check (unit_price_pence >= 0),
  -- Charged options for one.
  options_pence integer not null default 0 check (options_pence >= 0),
  line_total_pence integer not null check (line_total_pence >= 0),
  vat_rate_bp integer not null check (vat_rate_bp between 0 and 10000),
  notes text not null default '',
  -- [{code, mayContain}] as shown to the customer when they ordered.
  allergens jsonb not null default '[]'::jsonb,
  allergens_confirmed boolean not null default false,
  sort_order integer not null default 0,
  constraint order_items_line_adds_up
    check (line_total_pence = (unit_price_pence + options_pence) * quantity)
);
create index order_items_order_idx on public.order_items (order_id, sort_order);

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  option_id uuid references public.options (id) on delete set null,
  group_name text not null,
  name text not null,
  -- What was charged for it (0 when it was within the free allowance).
  price_pence integer not null default 0 check (price_pence >= 0),
  sort_order integer not null default 0
);
create index order_item_options_item_idx on public.order_item_options (order_item_id, sort_order);

create table public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid,
  actor_role text,
  reason text,
  created_at timestamptz not null default now()
);
create index order_status_events_order_idx on public.order_status_events (order_id, id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'simulator', 'cash')),
  -- The provider's own id for this payment (Stripe PaymentIntent id).
  provider_ref text not null unique,
  amount_pence integer not null check (amount_pence > 0),
  refunded_pence integer not null default 0 check (refunded_pence >= 0),
  status text not null default 'pending' check (
    status in ('pending', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded', 'amount_mismatch')
  ),
  disputed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);

-- Every payment webhook event already handled, so a redelivery is ignored.
create table public.payment_events (
  event_id text primary key,
  event_type text not null,
  provider_ref text,
  outcome text,
  received_at timestamptz not null default now()
);

-- Outbox: work that must not be lost (emails, things for staff to review).
create table public.jobs (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_due_idx on public.jobs (status, run_after);

-- ---- state machine guard --------------------------------------------------

create function public.orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- What the customer was charged for can never be edited afterwards.
  if (new.subtotal_pence, new.discount_pence, new.delivery_fee_pence, new.tip_pence,
      new.vat_pence, new.total_pence, new.fulfilment)
     is distinct from
     (old.subtotal_pence, old.discount_pence, old.delivery_fee_pence, old.tip_pence,
      old.vat_pence, old.total_pence, old.fulfilment) then
    raise exception 'Order totals and fulfilment cannot be changed' using errcode = '23514';
  end if;
  -- An order cannot be handed to another account. It may lose its owner only
  -- when that account is deleted (the foreign key sets it to null).
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    raise exception 'An order cannot be moved to another account' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.order_transitions t
      where t.from_status = old.status and t.to_status = new.status
    ) then
      raise exception 'Order cannot move from % to %', old.status, new.status
        using errcode = '23514';
    end if;
    if new.status = 'OUT_FOR_DELIVERY' and new.fulfilment <> 'delivery' then
      raise exception 'A collection order cannot go out for delivery' using errcode = '23514';
    end if;
    if new.status = 'COLLECTED' and new.fulfilment <> 'collection' then
      raise exception 'A delivery order cannot be collected' using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_guard before update on public.orders
  for each row execute function public.orders_guard();

-- Logs every status change with who, when and why. The actor comes from
-- settings that transition_order() and the payment functions set for the
-- current transaction.
create function public.orders_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_events (order_id, from_status, to_status, actor_id, actor_role, reason)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      nullif(current_setting('app.actor_id', true), '')::uuid,
      coalesce(nullif(current_setting('app.actor_role', true), ''), 'system'),
      nullif(current_setting('app.reason', true), '')
    );
  end if;
  return new;
end;
$$;

create trigger orders_log_status after insert or update on public.orders
  for each row execute function public.orders_log_status();

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();
create trigger shop_settings_touch before update on public.shop_settings
  for each row execute function public.touch_updated_at();

-- ---- functions the API calls (service role only) ---------------------------

-- Creates an order with its item snapshots in one transaction. The API has
-- already priced the basket from the live menu; nothing here trusts a browser.
-- Returns {id, order_number, created}. With a repeated idempotency key it
-- returns the first order and created = false.
create function public.create_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_item_id uuid;
  v_sort integer := 0;
begin
  if p ->> 'idempotency_key' is not null then
    select * into v_order from public.orders where idempotency_key = p ->> 'idempotency_key';
    if found then
      return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'created', false);
    end if;
  end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'An order needs at least one item' using errcode = '22023';
  end if;

  perform set_config('app.actor_id', coalesce(p ->> 'user_id', ''), true);
  perform set_config('app.actor_role', 'customer', true);
  perform set_config('app.reason', 'order placed', true);

  insert into public.orders (
    user_id, channel, fulfilment, scheduled_for, estimated_ready_at,
    customer_name, customer_email, customer_phone, address, delivery_zone_id, notes,
    subtotal_pence, discount_pence, delivery_fee_pence, tip_pence, vat_pence, total_pence,
    payment_method, guest_token_hash, allergen_acknowledged, idempotency_key
  ) values (
    nullif(p ->> 'user_id', '')::uuid,
    coalesce(p ->> 'channel', 'web'),
    p ->> 'fulfilment',
    nullif(p ->> 'scheduled_for', '')::timestamptz,
    (p ->> 'estimated_ready_at')::timestamptz,
    p ->> 'customer_name',
    p ->> 'customer_email',
    p ->> 'customer_phone',
    case when jsonb_typeof(p -> 'address') = 'object' then p -> 'address' end,
    nullif(p ->> 'delivery_zone_id', '')::uuid,
    coalesce(p ->> 'notes', ''),
    (p ->> 'subtotal_pence')::integer,
    coalesce((p ->> 'discount_pence')::integer, 0),
    (p ->> 'delivery_fee_pence')::integer,
    (p ->> 'tip_pence')::integer,
    (p ->> 'vat_pence')::integer,
    (p ->> 'total_pence')::integer,
    coalesce(p ->> 'payment_method', 'card'),
    nullif(p ->> 'guest_token_hash', ''),
    (p ->> 'allergen_acknowledged')::boolean,
    nullif(p ->> 'idempotency_key', '')
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_sort := v_sort + 1;
    insert into public.order_items (
      order_id, item_id, name, variant_name, quantity, unit_price_pence, options_pence,
      line_total_pence, vat_rate_bp, notes, allergens, allergens_confirmed, sort_order
    ) values (
      v_order.id,
      nullif(v_item ->> 'item_id', '')::uuid,
      v_item ->> 'name',
      v_item ->> 'variant_name',
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'unit_price_pence')::integer,
      (v_item ->> 'options_pence')::integer,
      (v_item ->> 'line_total_pence')::integer,
      (v_item ->> 'vat_rate_bp')::integer,
      coalesce(v_item ->> 'notes', ''),
      coalesce(v_item -> 'allergens', '[]'::jsonb),
      coalesce((v_item ->> 'allergens_confirmed')::boolean, false),
      v_sort
    )
    returning id into v_item_id;

    insert into public.order_item_options (order_item_id, option_id, group_name, name, price_pence, sort_order)
    select
      v_item_id,
      nullif(o ->> 'option_id', '')::uuid,
      o ->> 'group_name',
      o ->> 'name',
      (o ->> 'price_pence')::integer,
      ord::integer
    from jsonb_array_elements(coalesce(v_item -> 'options', '[]'::jsonb)) with ordinality as t (o, ord);
  end loop;

  -- The lines must add up to the subtotal the customer is charged.
  if (select coalesce(sum(line_total_pence), 0) from public.order_items where order_id = v_order.id)
     <> v_order.subtotal_pence then
    raise exception 'Order lines do not add up to the subtotal' using errcode = '23514';
  end if;

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'created', true);
end;
$$;

-- Moves an order to a new status, recording who did it and why. The guard
-- trigger rejects any move the state machine does not allow.
create function public.transition_order(
  p_order_id uuid,
  p_to public.order_status,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.actor_role', coalesce(p_actor_role, 'system'), true);
  perform set_config('app.reason', coalesce(p_reason, ''), true);
  update public.orders set status = p_to where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return p_to;
end;
$$;

-- Applies one verified payment webhook event, exactly once.
-- p = {event_id, type, provider_ref, amount_pence?, refunded_pence?}
-- Returns: duplicate | unknown_payment | paid | amount_mismatch | needs_review
--          | failed | refunded | partially_refunded | disputed | ignored
create function public.record_payment_event(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p ->> 'type';
  v_payment public.payments;
  v_order public.orders;
  v_outcome text;
  v_refunded integer;
begin
  insert into public.payment_events (event_id, event_type, provider_ref)
  values (p ->> 'event_id', v_type, p ->> 'provider_ref')
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  select * into v_payment from public.payments where provider_ref = p ->> 'provider_ref' for update;
  if not found then
    v_outcome := 'unknown_payment';
  else
    select * into v_order from public.orders where id = v_payment.order_id for update;
    perform set_config('app.actor_id', '', true);
    perform set_config('app.actor_role', 'payment_webhook', true);
    perform set_config('app.reason', v_type, true);

    if v_type = 'payment_intent.succeeded' then
      if (p ->> 'amount_pence')::integer is distinct from v_order.total_pence then
        -- Paid a different amount from the order total: never mark it paid.
        update public.payments set status = 'amount_mismatch' where id = v_payment.id;
        insert into public.jobs (kind, payload)
        values ('payment_review', jsonb_build_object('order_id', v_order.id, 'reason', 'amount_mismatch'));
        v_outcome := 'amount_mismatch';
      else
        update public.payments set status = 'succeeded' where id = v_payment.id;
        if v_order.status = 'PENDING_PAYMENT' then
          update public.orders set status = 'RECEIVED', paid_at = now() where id = v_order.id;
          insert into public.jobs (kind, payload)
          values ('order_confirmation_email', jsonb_build_object('order_id', v_order.id));
          v_outcome := 'paid';
        elsif v_order.paid_at is not null then
          v_outcome := 'ignored';
        else
          -- Money arrived for an order that was already cancelled (for example it timed out).
          update public.orders set paid_at = now() where id = v_order.id;
          insert into public.jobs (kind, payload)
          values ('payment_review', jsonb_build_object('order_id', v_order.id, 'reason', 'paid_after_cancel'));
          v_outcome := 'needs_review';
        end if;
      end if;

    elsif v_type = 'payment_intent.payment_failed' then
      update public.payments set status = 'failed' where id = v_payment.id and status = 'pending';
      v_outcome := 'failed';

    elsif v_type = 'charge.refunded' then
      v_refunded := coalesce((p ->> 'refunded_pence')::integer, 0);
      if v_refunded >= v_payment.amount_pence then
        update public.payments set status = 'refunded', refunded_pence = v_refunded where id = v_payment.id;
        if exists (
          select 1 from public.order_transitions t
          where t.from_status = v_order.status and t.to_status = 'REFUNDED'
        ) then
          update public.orders set status = 'REFUNDED' where id = v_order.id;
        end if;
        v_outcome := 'refunded';
      else
        update public.payments set status = 'partially_refunded', refunded_pence = v_refunded
        where id = v_payment.id;
        v_outcome := 'partially_refunded';
      end if;

    elsif v_type = 'charge.dispute.created' then
      update public.payments set disputed = true where id = v_payment.id;
      insert into public.jobs (kind, payload)
      values ('payment_review', jsonb_build_object('order_id', v_order.id, 'reason', 'dispute'));
      v_outcome := 'disputed';

    else
      v_outcome := 'ignored';
    end if;
  end if;

  update public.payment_events set outcome = v_outcome where event_id = p ->> 'event_id';
  return v_outcome;
end;
$$;

-- Cancels orders that were never paid. Returns the payment references so the
-- API can cancel them with the payment provider too.
create function public.expire_pending_orders()
returns table (order_id uuid, provider_ref text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor_id', '', true);
  perform set_config('app.actor_role', 'system', true);
  perform set_config('app.reason', 'payment not completed in time', true);

  return query
  with expired as (
    update public.orders o
    set status = 'CANCELLED'
    where o.status = 'PENDING_PAYMENT'
      and o.created_at < now() - make_interval(
        mins => (select s.pending_payment_minutes from public.shop_settings s)
      )
    returning o.id
  ), cancelled as (
    update public.payments pay
    set status = 'cancelled'
    from expired e
    where pay.order_id = e.id and pay.status = 'pending'
    returning pay.order_id, pay.provider_ref
  )
  select e.id, c.provider_ref
  from expired e
  left join cancelled c on c.order_id = e.id;
end;
$$;

-- Hands out due jobs of the given kinds to one worker at a time. Kinds the
-- caller does not ask for (for example payment_review, which waits for a
-- person) are left alone.
create function public.claim_jobs(p_limit integer, p_kinds text[])
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  update public.jobs j
  set status = 'running', attempts = j.attempts + 1
  where j.id in (
    select id from public.jobs
    where kind = any (p_kinds)
      and (
        (status = 'pending' and run_after <= now())
        -- A worker that died mid-job: pick it up again after ten minutes.
        or (status = 'running' and updated_at < now() - interval '10 minutes')
      )
    order by id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning j.*;
$$;

-- Marks a job done, or schedules a retry with a growing delay (failed after 6 tries).
create function public.finish_job(p_id bigint, p_ok boolean, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.jobs
  set status = case when p_ok then 'done' when attempts >= 6 then 'failed' else 'pending' end,
      last_error = case when p_ok then null else left(p_error, 500) end,
      run_after = case when p_ok then run_after else now() + make_interval(mins => attempts * attempts) end
  where id = p_id;
$$;

revoke execute on function
  public.create_order(jsonb),
  public.transition_order(uuid, public.order_status, uuid, text, text),
  public.record_payment_event(jsonb),
  public.expire_pending_orders(),
  public.claim_jobs(integer, text[]),
  public.finish_job(bigint, boolean, text),
  public.orders_guard(),
  public.orders_log_status()
from public, anon, authenticated;

grant execute on function
  public.create_order(jsonb),
  public.transition_order(uuid, public.order_status, uuid, text, text),
  public.record_payment_event(jsonb),
  public.expire_pending_orders(),
  public.claim_jobs(integer, text[]),
  public.finish_job(bigint, boolean, text)
to service_role;

-- ---- row level security ---------------------------------------------------

alter table public.shop_settings enable row level security;
alter table public.opening_hours enable row level security;
alter table public.holiday_closures enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.order_transitions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_options enable row level security;
alter table public.order_status_events enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.jobs enable row level security;

revoke all on table
  public.shop_settings, public.opening_hours, public.holiday_closures, public.delivery_zones,
  public.order_transitions, public.orders, public.order_items, public.order_item_options,
  public.order_status_events, public.payments, public.payment_events, public.jobs
from anon, authenticated, public;

-- Shop configuration: everyone reads, managers change.
grant select on table
  public.shop_settings, public.opening_hours, public.holiday_closures, public.delivery_zones,
  public.order_transitions
to anon, authenticated;
grant update on table public.shop_settings to authenticated;
grant insert, update, delete on table
  public.opening_hours, public.holiday_closures, public.delivery_zones
to authenticated;

create policy "shop settings are public" on public.shop_settings
  for select to anon, authenticated using (true);
create policy "managers update shop settings" on public.shop_settings
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

create policy "opening hours are public" on public.opening_hours
  for select to anon, authenticated using (true);
create policy "managers insert opening hours" on public.opening_hours
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update opening hours" on public.opening_hours
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete opening hours" on public.opening_hours
  for delete to authenticated using (public.has_role('manager'));

create policy "closures are public" on public.holiday_closures
  for select to anon, authenticated using (true);
create policy "managers insert closures" on public.holiday_closures
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update closures" on public.holiday_closures
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete closures" on public.holiday_closures
  for delete to authenticated using (public.has_role('manager'));

create policy "active zones are public, managers read all" on public.delivery_zones
  for select to anon, authenticated using (is_active or public.has_role('manager'));
create policy "managers insert zones" on public.delivery_zones
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update zones" on public.delivery_zones
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete zones" on public.delivery_zones
  for delete to authenticated using (public.has_role('manager'));

create policy "transition rules are public" on public.order_transitions
  for select to anon, authenticated using (true);

-- Orders: a signed-in customer reads their own; staff read all. No client can
-- insert, update or delete: those rights are not granted at all. Guests read
-- through the API, which checks their order token.
grant select on table
  public.orders, public.order_items, public.order_item_options, public.order_status_events
to authenticated;

create policy "customers read own orders, staff read all" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('kitchen'));

create policy "order items follow their order" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "order item options follow their order" on public.order_item_options
  for select to authenticated
  using (exists (select 1 from public.order_items i where i.id = order_item_id));

create policy "order history follows its order" on public.order_status_events
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- payments, payment_events and jobs: no grants and no policies. Only the API's
-- service role can touch them.

create trigger shop_settings_audit after update on public.shop_settings
  for each row execute function public.audit_row_change();
create trigger opening_hours_audit after insert or update or delete on public.opening_hours
  for each row execute function public.audit_row_change();
create trigger holiday_closures_audit after insert or update or delete on public.holiday_closures
  for each row execute function public.audit_row_change();
create trigger delivery_zones_audit after insert or update or delete on public.delivery_zones
  for each row execute function public.audit_row_change();
