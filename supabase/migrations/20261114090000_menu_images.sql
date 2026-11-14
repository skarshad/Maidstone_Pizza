-- Menu item photos.
--
-- A public Storage bucket: anyone can view an image by its URL, only managers
-- and admins can upload, replace or delete. Storage itself enforces the size
-- and file-type limits, whatever the browser claims.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu',
  'menu',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "managers list menu images"
  on storage.objects for select to authenticated
  using (bucket_id = 'menu' and public.has_role('manager'));

create policy "managers upload menu images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'menu' and public.has_role('manager'));

create policy "managers replace menu images"
  on storage.objects for update to authenticated
  using (bucket_id = 'menu' and public.has_role('manager'))
  with check (bucket_id = 'menu' and public.has_role('manager'));

create policy "managers delete menu images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu' and public.has_role('manager'));

-- image_path is a path inside the menu bucket, always under the item's own folder.
alter table public.menu_items
  add constraint menu_items_image_path_format check (
    image_path is null
    or image_path ~ ('^items/' || id::text || '/[a-z0-9-]+\.(jpg|jpeg|png|webp|gif)$')
  );
