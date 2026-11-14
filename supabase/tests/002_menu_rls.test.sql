-- RLS and write-rule tests for the Phase 2 menu tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---- fixtures -------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'customer@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'kitchen@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'manager@example.test');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'kitchen'),
  ('00000000-0000-0000-0000-0000000000d1', 'manager');

insert into public.categories (id, slug, name, is_published) values
  ('10000000-0000-0000-0000-000000000001', 't-live', 'Live', true),
  ('10000000-0000-0000-0000-000000000002', 't-hidden', 'Hidden', false);

insert into public.menu_items (id, category_id, slug, name, is_published) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 't-visible', 'Visible', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 't-draft', 'Draft', false),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 't-orphan', 'In hidden category', true);

insert into public.item_variants (item_id, slug, name, price_pence) values
  ('20000000-0000-0000-0000-000000000001', 'small', 'Small', 999),
  ('20000000-0000-0000-0000-000000000002', 'small', 'Small', 899),
  ('20000000-0000-0000-0000-000000000003', 'small', 'Small', 799);

insert into public.option_groups (id, slug, name) values
  ('30000000-0000-0000-0000-000000000001', 't-toppings', 'Toppings');

insert into public.options (id, group_id, slug, name, is_published) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 't-ham', 'Ham', true),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 't-secret', 'Secret', false);

insert into public.option_prices (option_id, variant_slug, price_pence) values
  ('40000000-0000-0000-0000-000000000001', 'small', 100),
  ('40000000-0000-0000-0000-000000000002', 'small', 100);

insert into public.item_allergens (item_id, allergen_code) values
  ('20000000-0000-0000-0000-000000000001', 'milk'),
  ('20000000-0000-0000-0000-000000000002', 'milk');

-- ---- structure ------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every public table has RLS enabled'
);
select is((select count(*)::int from public.allergens), 14, 'the 14 legal allergens are seeded');
select throws_ok(
  $$insert into public.item_variants (item_id, slug, name, price_pence)
    values ('20000000-0000-0000-0000-000000000001', 'bad', 'Bad', -1)$$,
  '23514', null, 'a negative price is rejected'
);

-- ---- anonymous visitor ----------------------------------------------------
set local role anon;
select is(
  (select count(*)::int from public.categories where slug like 't-%'), 1,
  'anon sees only published categories'
);
select is(
  (select count(*)::int from public.menu_items where slug like 't-%'), 1,
  'anon sees only published items in published categories'
);
select is(
  (select count(*)::int from public.item_variants
   where item_id::text like '20000000-0000-0000-0000-00000000000%'), 1,
  'anon sees prices only for visible items'
);
select is(
  (select count(*)::int from public.options where slug like 't-%'), 1,
  'anon sees only published options'
);
select is(
  (select count(*)::int from public.option_prices
   where option_id::text like '40000000-0000-0000-0000-00000000000%'), 1,
  'anon sees option prices only for visible options'
);
select is(
  (select count(*)::int from public.item_allergens
   where item_id::text like '20000000-0000-0000-0000-00000000000%'), 1,
  'anon sees allergens only for visible items'
);
select is((select count(*)::int from public.allergens), 14, 'anon can read the allergen list');
select throws_ok(
  $$insert into public.categories (slug, name) values ('t-anon', 'Anon')$$,
  '42501', null, 'anon cannot add a category'
);
select throws_ok(
  $$update public.item_variants set price_pence = 1$$,
  '42501', null, 'anon cannot change prices'
);
select throws_ok(
  $$select public.save_menu_item('{}'::jsonb)$$,
  '42501', null, 'anon cannot call save_menu_item'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('menu', 'items/x/anon.jpg')$$,
  '42501', null, 'anon cannot upload a menu image'
);
reset role;

-- ---- customer -------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","user_role":"customer"}';
set local role authenticated;
select is(
  (select count(*)::int from public.menu_items where slug like 't-%'), 1,
  'customer sees only the published menu'
);
select is_empty(
  $$update public.item_variants set price_pence = 1
    where item_id = '20000000-0000-0000-0000-000000000001' returning id$$,
  'customer cannot change a price'
);
select throws_ok(
  $$insert into public.menu_items (category_id, slug, name)
    values ('10000000-0000-0000-0000-000000000001', 't-cust', 'Mine')$$,
  '42501', null, 'customer cannot add an item'
);
select is_empty(
  $$delete from public.menu_items where slug = 't-visible' returning id$$,
  'customer cannot delete an item'
);
select throws_ok(
  $$select public.save_menu_item('{"variants":[{"slug":"s","name":"S","price_pence":1}]}'::jsonb)$$,
  '42501', null, 'customer cannot call save_menu_item'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('menu', 'items/x/customer.jpg')$$,
  '42501', null, 'customer cannot upload a menu image'
);
select is_empty(
  $$update public.menu_items set image_path = 'items/20000000-0000-0000-0000-000000000001/photo-1.gif'
    where slug = 't-visible' returning id$$,
  'customer cannot set an item image'
);
reset role;

-- ---- kitchen --------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","user_role":"kitchen"}';
set local role authenticated;
select is(
  (select count(*)::int from public.menu_items where slug like 't-%'), 3,
  'kitchen staff see unpublished items too'
);
select is_empty(
  $$update public.menu_items set name = 'x' where slug = 't-visible' returning id$$,
  'kitchen staff cannot edit the menu'
);
reset role;

-- ---- manager --------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","user_role":"manager"}';
set local role authenticated;
select is(
  (select count(*)::int from public.categories where slug like 't-%'), 2,
  'manager sees hidden categories'
);
select isnt_empty(
  $$update public.item_variants set price_pence = 1099
    where item_id = '20000000-0000-0000-0000-000000000001' returning id$$,
  'manager can change a price'
);
select lives_ok(
  $$select public.save_menu_item('{
      "category_id":"10000000-0000-0000-0000-000000000001",
      "slug":"t-new","name":"New item","description":"d",
      "variants":[{"slug":"small","name":"Small","price_pence":500},{"slug":"large","name":"Large","price_pence":900}],
      "option_groups":[{"group_id":"30000000-0000-0000-0000-000000000001","max_select":2,"free_select":1}],
      "allergens":[{"code":"gluten"},{"code":"nuts","may_contain":true}],
      "tags":["vegetarian"]
    }'::jsonb)$$,
  'manager can create an item with sizes, options, allergens and tags'
);
select is(
  (select count(*)::int from public.item_variants v
   join public.menu_items i on i.id = v.item_id where i.slug = 't-new'),
  2, 'the new item has both sizes'
);
select lives_ok(
  $$select public.save_menu_item(jsonb_build_object(
      'id', (select id from public.menu_items where slug = 't-new'),
      'category_id', '10000000-0000-0000-0000-000000000001',
      'slug', 't-new', 'name', 'Renamed',
      'variants', '[{"slug":"large","name":"Large","price_pence":950}]'::jsonb,
      'allergens', '[]'::jsonb
    ))$$,
  'manager can update an item'
);
select results_eq(
  $$select v.slug, v.price_pence from public.item_variants v
    join public.menu_items i on i.id = v.item_id where i.slug = 't-new'$$,
  $$values ('large'::text, 950)$$,
  'updating replaces the sizes and prices'
);
select is(
  (select count(*)::int from public.item_allergens a
   join public.menu_items i on i.id = a.item_id where i.slug = 't-new'),
  0, 'updating replaces the allergen list'
);
select throws_ok(
  $$select public.save_menu_item('{"category_id":"10000000-0000-0000-0000-000000000001","slug":"t-none","name":"No sizes","variants":[]}'::jsonb)$$,
  '22023', null, 'an item without any price is rejected'
);
select lives_ok(
  $$select public.save_menu_option('{
      "id":"40000000-0000-0000-0000-000000000001","name":"Ham","is_published":true,
      "prices":{"small":120,"large":160},"allergens":[{"code":"sulphites"}]
    }'::jsonb)$$,
  'manager can update an option and its prices'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('menu', 'items/20000000-0000-0000-0000-000000000001/photo-1.gif')$$,
  'manager can upload a menu image'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('other-bucket', 'x.jpg')$$,
  '42501', null, 'the manager rule covers the menu bucket only'
);
select isnt_empty(
  $$update public.menu_items set image_path = 'items/20000000-0000-0000-0000-000000000001/photo-1.gif'
    where slug = 't-visible' returning id$$,
  'manager can set an item image'
);
select throws_ok(
  $$update public.menu_items set image_path = 'items/20000000-0000-0000-0000-000000000002/photo-1.gif'
    where slug = 't-visible'$$,
  '23514', null, 'an image path must sit in the item''s own folder'
);
select throws_ok(
  $$update public.menu_items set image_path = 'items/20000000-0000-0000-0000-000000000001/evil.svg'
    where slug = 't-visible'$$,
  '23514', null, 'only image file types are accepted as a path'
);
-- Deleting is covered by the "managers delete menu images" policy, but Supabase
-- blocks direct SQL deletes from storage tables, so it cannot be tested here.
reset role;

select is(
  (select actor_id from public.audit_log
   where entity = 'item_variants' and action = 'update' and (after ->> 'price_pence') = '1099'
   limit 1),
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  'price changes are audited with the manager who made them'
);

select * from finish();
rollback;
