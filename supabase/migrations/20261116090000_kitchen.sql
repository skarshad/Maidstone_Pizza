-- Phase 4: kitchen display.
--
-- Accept / reject details on orders, per-item "done" marks, and a Realtime
-- ping so kitchen screens refresh the moment an order changes. The ping carries
-- only an order id and status; screens then fetch the details from the API.
-- Realtime is a speed-up only: the kitchen screen also polls, so a missed ping
-- can never hide an order.

alter table public.orders
  add column accepted_prep_minutes integer check (accepted_prep_minutes between 1 and 240),
  add column reject_reason text;

alter table public.order_items
  add column done_at timestamptz;

-- ---- kitchen actions (service role only; the API checks the staff role) -----

-- Accepts a new order with the kitchen's preparation time. For an ASAP order
-- the estimate becomes now + prep time; a scheduled order keeps its booked time.
create function public.kitchen_accept_order(
  p_order_id uuid,
  p_prep_minutes integer,
  p_actor_id uuid,
  p_actor_role text
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_prep_minutes is null or p_prep_minutes not between 1 and 240 then
    raise exception 'Preparation time must be between 1 and 240 minutes' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.actor_role', coalesce(p_actor_role, 'kitchen'), true);
  perform set_config('app.reason', 'accepted, ' || p_prep_minutes || ' min', true);

  update public.orders
  set status = 'ACCEPTED',
      accepted_prep_minutes = p_prep_minutes,
      estimated_ready_at = coalesce(scheduled_for, now() + make_interval(mins => p_prep_minutes))
  where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return 'ACCEPTED';
end;
$$;

create function public.kitchen_reject_order(
  p_order_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_actor_role text
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason is needed to reject an order' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.actor_role', coalesce(p_actor_role, 'kitchen'), true);
  perform set_config('app.reason', left(trim(p_reason), 200), true);

  update public.orders
  set status = 'REJECTED', reject_reason = left(trim(p_reason), 200)
  where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return 'REJECTED';
end;
$$;

-- Ticks or unticks one item on a ticket. Returns false if the item is not on that order.
create function public.kitchen_set_item_done(p_order_id uuid, p_item_id uuid, p_done boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.order_items
  set done_at = case when p_done then coalesce(done_at, now()) end
  where id = p_item_id and order_id = p_order_id;
  return found;
end;
$$;

revoke execute on function
  public.kitchen_accept_order(uuid, integer, uuid, text),
  public.kitchen_reject_order(uuid, text, uuid, text),
  public.kitchen_set_item_done(uuid, uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.kitchen_accept_order(uuid, integer, uuid, text),
  public.kitchen_reject_order(uuid, text, uuid, text),
  public.kitchen_set_item_done(uuid, uuid, boolean)
to service_role;

-- ---- realtime ping ------------------------------------------------------------

-- Sends "an order changed" to the private kitchen:orders channel. Wrapped so
-- that a Realtime problem can never make an order update fail.
create function public.notify_kitchen(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('order_id', p_order_id, 'status', p_status),
    'order_changed',
    'kitchen:orders',
    true
  );
exception when others then
  -- Screens poll as well, so a lost ping only delays an update by seconds.
  null;
end;
$$;

create function public.orders_notify_kitchen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Unpaid orders are not the kitchen's business yet.
  if new.status <> 'PENDING_PAYMENT'
     and (
       tg_op = 'INSERT'
       or new.status is distinct from old.status
       or new.estimated_ready_at is distinct from old.estimated_ready_at
     ) then
    perform public.notify_kitchen(new.id, new.status::text);
  end if;
  return new;
end;
$$;

create trigger orders_notify_kitchen after insert or update on public.orders
  for each row execute function public.orders_notify_kitchen();

create function public.order_items_notify_kitchen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.done_at is distinct from old.done_at then
    perform public.notify_kitchen(new.order_id, 'item');
  end if;
  return new;
end;
$$;

create trigger order_items_notify_kitchen after update on public.order_items
  for each row execute function public.order_items_notify_kitchen();

revoke execute on function
  public.notify_kitchen(uuid, text),
  public.orders_notify_kitchen(),
  public.order_items_notify_kitchen()
from public, anon, authenticated;

-- Only staff may listen on the kitchen channel. Clients never send on it.
create policy "kitchen staff receive kitchen order pings"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'kitchen:orders' and public.has_role('kitchen'));
