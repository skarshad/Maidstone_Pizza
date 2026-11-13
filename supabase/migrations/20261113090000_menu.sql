-- Phase 2: menu catalogue.
--
-- Everyone (including signed-out visitors) can read the published menu.
-- Staff can read everything. Only managers and admins can change it.
-- All money is integer pence.

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---- tables ---------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  image_path text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  -- Sold out while this is in the future. 'infinity' means until switched back on.
  sold_out_until timestamptz,
  -- VAT rate in basis points (2000 = 20%). Prices are VAT-inclusive.
  vat_rate_bp integer not null default 2000 check (vat_rate_bp between 0 and 10000),
  -- False until the owner has confirmed this item's allergen list. The site
  -- must not present allergen information as complete while this is false.
  allergens_confirmed boolean not null default false,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_category_idx on public.menu_items (category_id, sort_order);

create table public.item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.menu_items (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  price_pence integer not null check (price_pence >= 0),
  sort_order integer not null default 0,
  unique (item_id, slug)
);

create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer check (max_select is null or max_select >= min_select),
  sort_order integer not null default 0
);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.option_groups (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  -- Price when there is no size-specific row in option_prices.
  price_pence integer not null default 0 check (price_pence >= 0),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  sold_out_until timestamptz,
  unique (group_id, slug)
);

-- Option price for a given size. variant_slug matches item_variants.slug
-- (for example small / medium / large).
create table public.option_prices (
  option_id uuid not null references public.options (id) on delete cascade,
  variant_slug text not null,
  price_pence integer not null check (price_pence >= 0),
  primary key (option_id, variant_slug)
);

create table public.item_option_groups (
  item_id uuid not null references public.menu_items (id) on delete cascade,
  group_id uuid not null references public.option_groups (id) on delete cascade,
  sort_order integer not null default 0,
  -- Per-item limit; null means use the group's own max_select.
  max_select integer check (max_select is null or max_select >= 0),
  -- How many selections are included in the item price (cheapest charged first is
  -- NOT assumed: the pricing package decides which ones are free).
  free_select integer not null default 0 check (free_select >= 0),
  primary key (item_id, group_id)
);

create table public.allergens (
  code text primary key check (code ~ '^[a-z_]+$'),
  name text not null,
  sort_order integer not null default 0
);

create table public.item_allergens (
  item_id uuid not null references public.menu_items (id) on delete cascade,
  allergen_code text not null references public.allergens (code) on delete restrict,
  may_contain boolean not null default false,
  primary key (item_id, allergen_code)
);

create table public.option_allergens (
  option_id uuid not null references public.options (id) on delete cascade,
  allergen_code text not null references public.allergens (code) on delete restrict,
  may_contain boolean not null default false,
  primary key (option_id, allergen_code)
);

create table public.dietary_tags (
  code text primary key check (code ~ '^[a-z_]+$'),
  name text not null,
  sort_order integer not null default 0
);

create table public.item_dietary_tags (
  item_id uuid not null references public.menu_items (id) on delete cascade,
  tag_code text not null references public.dietary_tags (code) on delete restrict,
  primary key (item_id, tag_code)
);

-- The 14 allergens that UK food law requires to be declared.
insert into public.allergens (code, name, sort_order) values
  ('celery', 'Celery', 1),
  ('gluten', 'Cereals containing gluten', 2),
  ('crustaceans', 'Crustaceans', 3),
  ('eggs', 'Eggs', 4),
  ('fish', 'Fish', 5),
  ('lupin', 'Lupin', 6),
  ('milk', 'Milk', 7),
  ('molluscs', 'Molluscs', 8),
  ('mustard', 'Mustard', 9),
  ('nuts', 'Tree nuts', 10),
  ('peanuts', 'Peanuts', 11),
  ('sesame', 'Sesame', 12),
  ('soya', 'Soya', 13),
  ('sulphites', 'Sulphur dioxide and sulphites', 14);

insert into public.dietary_tags (code, name, sort_order) values
  ('vegetarian', 'Vegetarian', 1),
  ('vegan', 'Vegan', 2),
  ('spicy', 'Spicy', 3);

-- ---- row level security ---------------------------------------------------

alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.item_variants enable row level security;
alter table public.option_groups enable row level security;
alter table public.options enable row level security;
alter table public.option_prices enable row level security;
alter table public.item_option_groups enable row level security;
alter table public.allergens enable row level security;
alter table public.item_allergens enable row level security;
alter table public.option_allergens enable row level security;
alter table public.dietary_tags enable row level security;
alter table public.item_dietary_tags enable row level security;

-- Supabase grants full table rights to anon and authenticated by default.
-- Start from nothing and grant back only what each role needs.
revoke all on table
  public.categories, public.menu_items, public.item_variants, public.option_groups,
  public.options, public.option_prices, public.item_option_groups, public.allergens,
  public.item_allergens, public.option_allergens, public.dietary_tags, public.item_dietary_tags
from anon, authenticated, public;

grant select on table
  public.categories, public.menu_items, public.item_variants, public.option_groups,
  public.options, public.option_prices, public.item_option_groups, public.allergens,
  public.item_allergens, public.option_allergens, public.dietary_tags, public.item_dietary_tags
to anon, authenticated;

-- Table privileges for writes; the policies below limit them to managers.
grant insert, update, delete on table
  public.categories, public.menu_items, public.item_variants, public.option_groups,
  public.options, public.option_prices, public.item_option_groups,
  public.item_allergens, public.option_allergens, public.item_dietary_tags
to authenticated;

-- Reads. Child tables defer to the parent row's visibility: the subquery runs
-- under the caller's own RLS, so a hidden item hides its variants too.
create policy "published categories are public, staff read all"
  on public.categories for select to anon, authenticated
  using (is_published or public.has_role('kitchen'));

create policy "published items are public, staff read all"
  on public.menu_items for select to anon, authenticated
  using (
    public.has_role('kitchen')
    or (is_published and exists (select 1 from public.categories c where c.id = category_id))
  );

create policy "variants follow their item"
  on public.item_variants for select to anon, authenticated
  using (exists (select 1 from public.menu_items i where i.id = item_id));

create policy "option groups are public"
  on public.option_groups for select to anon, authenticated
  using (true);

create policy "published options are public, staff read all"
  on public.options for select to anon, authenticated
  using (is_published or public.has_role('kitchen'));

create policy "option prices follow their option"
  on public.option_prices for select to anon, authenticated
  using (exists (select 1 from public.options o where o.id = option_id));

create policy "item option groups follow their item"
  on public.item_option_groups for select to anon, authenticated
  using (exists (select 1 from public.menu_items i where i.id = item_id));

create policy "allergen list is public"
  on public.allergens for select to anon, authenticated
  using (true);

create policy "item allergens follow their item"
  on public.item_allergens for select to anon, authenticated
  using (exists (select 1 from public.menu_items i where i.id = item_id));

create policy "option allergens follow their option"
  on public.option_allergens for select to anon, authenticated
  using (exists (select 1 from public.options o where o.id = option_id));

create policy "dietary tags are public"
  on public.dietary_tags for select to anon, authenticated
  using (true);

create policy "item dietary tags follow their item"
  on public.item_dietary_tags for select to anon, authenticated
  using (exists (select 1 from public.menu_items i where i.id = item_id));

-- Writes: managers and admins only.
create policy "managers insert categories" on public.categories
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update categories" on public.categories
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete categories" on public.categories
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert items" on public.menu_items
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update items" on public.menu_items
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete items" on public.menu_items
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert variants" on public.item_variants
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update variants" on public.item_variants
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete variants" on public.item_variants
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert option groups" on public.option_groups
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update option groups" on public.option_groups
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete option groups" on public.option_groups
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert options" on public.options
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update options" on public.options
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete options" on public.options
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert option prices" on public.option_prices
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update option prices" on public.option_prices
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete option prices" on public.option_prices
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert item option groups" on public.item_option_groups
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update item option groups" on public.item_option_groups
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete item option groups" on public.item_option_groups
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert item allergens" on public.item_allergens
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update item allergens" on public.item_allergens
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete item allergens" on public.item_allergens
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert option allergens" on public.option_allergens
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers update option allergens" on public.option_allergens
  for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy "managers delete option allergens" on public.option_allergens
  for delete to authenticated using (public.has_role('manager'));

create policy "managers insert item dietary tags" on public.item_dietary_tags
  for insert to authenticated with check (public.has_role('manager'));
create policy "managers delete item dietary tags" on public.item_dietary_tags
  for delete to authenticated using (public.has_role('manager'));

-- ---- triggers -------------------------------------------------------------

create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row_change();
create trigger menu_items_audit after insert or update or delete on public.menu_items
  for each row execute function public.audit_row_change();
create trigger item_variants_audit after insert or update or delete on public.item_variants
  for each row execute function public.audit_row_change();
create trigger option_groups_audit after insert or update or delete on public.option_groups
  for each row execute function public.audit_row_change();
create trigger options_audit after insert or update or delete on public.options
  for each row execute function public.audit_row_change();
create trigger option_prices_audit after insert or update or delete on public.option_prices
  for each row execute function public.audit_row_change();
create trigger item_allergens_audit after insert or update or delete on public.item_allergens
  for each row execute function public.audit_row_change();

-- ---- save an item and everything attached to it in one transaction --------
--
-- Runs with the caller's own rights (security invoker), so the policies above
-- still apply; the explicit role check just gives a clear error.
--
-- p = {
--   id?, category_id, slug, name, description, sort_order, is_published,
--   sold_out_until, allergens_confirmed,
--   variants: [{slug, name, price_pence}],
--   option_groups: [{group_id, max_select, free_select}],
--   allergens: [{code, may_contain}],
--   tags: [code]
-- }
create function public.save_menu_item(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  if not public.has_role('manager') then
    raise exception 'Only managers can change the menu' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'variants') is distinct from 'array' or jsonb_array_length(p -> 'variants') = 0 then
    raise exception 'An item needs at least one size or price' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.menu_items
      (category_id, slug, name, description, sort_order, is_published, sold_out_until, allergens_confirmed)
    values (
      (p ->> 'category_id')::uuid,
      p ->> 'slug',
      p ->> 'name',
      coalesce(p ->> 'description', ''),
      coalesce((p ->> 'sort_order')::integer, 0),
      coalesce((p ->> 'is_published')::boolean, true),
      nullif(p ->> 'sold_out_until', '')::timestamptz,
      coalesce((p ->> 'allergens_confirmed')::boolean, false)
    )
    returning id into v_id;
  else
    update public.menu_items set
      category_id = (p ->> 'category_id')::uuid,
      slug = p ->> 'slug',
      name = p ->> 'name',
      description = coalesce(p ->> 'description', ''),
      sort_order = coalesce((p ->> 'sort_order')::integer, sort_order),
      is_published = coalesce((p ->> 'is_published')::boolean, is_published),
      sold_out_until = nullif(p ->> 'sold_out_until', '')::timestamptz,
      allergens_confirmed = coalesce((p ->> 'allergens_confirmed')::boolean, false)
    where id = v_id;
    if not found then
      raise exception 'Menu item not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_variants
  where item_id = v_id
    and slug not in (select v ->> 'slug' from jsonb_array_elements(p -> 'variants') as v);

  insert into public.item_variants (item_id, slug, name, price_pence, sort_order)
  select v_id, v ->> 'slug', v ->> 'name', (v ->> 'price_pence')::integer, ord::integer
  from jsonb_array_elements(p -> 'variants') with ordinality as t (v, ord)
  on conflict (item_id, slug) do update
    set name = excluded.name, price_pence = excluded.price_pence, sort_order = excluded.sort_order;

  delete from public.item_option_groups where item_id = v_id;
  insert into public.item_option_groups (item_id, group_id, sort_order, max_select, free_select)
  select
    v_id,
    (g ->> 'group_id')::uuid,
    ord::integer,
    (g ->> 'max_select')::integer,
    coalesce((g ->> 'free_select')::integer, 0)
  from jsonb_array_elements(coalesce(p -> 'option_groups', '[]'::jsonb)) with ordinality as t (g, ord);

  delete from public.item_allergens where item_id = v_id;
  insert into public.item_allergens (item_id, allergen_code, may_contain)
  select v_id, a ->> 'code', coalesce((a ->> 'may_contain')::boolean, false)
  from jsonb_array_elements(coalesce(p -> 'allergens', '[]'::jsonb)) as a;

  delete from public.item_dietary_tags where item_id = v_id;
  insert into public.item_dietary_tags (item_id, tag_code)
  select v_id, code
  from jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb)) as code;

  return v_id;
end;
$$;

revoke execute on function public.save_menu_item from anon, public;
grant execute on function public.save_menu_item to authenticated;
revoke execute on function public.touch_updated_at from authenticated, anon, public;

-- Update an existing option, its per-size prices and its allergens together.
-- p = { id, name, price_pence, is_published, sold_out_until,
--       prices: {variant_slug: pence}, allergens: [{code, may_contain}] }
create function public.save_menu_option(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
begin
  if not public.has_role('manager') then
    raise exception 'Only managers can change the menu' using errcode = '42501';
  end if;

  update public.options set
    name = p ->> 'name',
    price_pence = coalesce((p ->> 'price_pence')::integer, price_pence),
    is_published = coalesce((p ->> 'is_published')::boolean, is_published),
    sold_out_until = nullif(p ->> 'sold_out_until', '')::timestamptz
  where id = v_id;
  if not found then
    raise exception 'Option not found' using errcode = 'P0002';
  end if;

  delete from public.option_prices where option_id = v_id;
  insert into public.option_prices (option_id, variant_slug, price_pence)
  select v_id, key, value::integer
  from jsonb_each_text(coalesce(p -> 'prices', '{}'::jsonb));

  delete from public.option_allergens where option_id = v_id;
  insert into public.option_allergens (option_id, allergen_code, may_contain)
  select v_id, a ->> 'code', coalesce((a ->> 'may_contain')::boolean, false)
  from jsonb_array_elements(coalesce(p -> 'allergens', '[]'::jsonb)) as a;

  return v_id;
end;
$$;

revoke execute on function public.save_menu_option from anon, public;
grant execute on function public.save_menu_option to authenticated;
