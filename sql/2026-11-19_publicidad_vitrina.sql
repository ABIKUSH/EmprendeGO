-- =====================================================================
-- PUBLICIDAD: las piezas pasan del bucket "publicidad" al bucket "vitrina"
-- (2026-11-19). Se corre DESPUES de 2026-11-19_publicidad_fase1.sql.
--
-- Por que: EasyList, la lista que usan casi todos los bloqueadores de
-- publicidad, frena toda imagen cuya direccion tenga /publicidad/. En la
-- primera prueba la pieza no cargaba ni en el panel, y en la app el anuncio
-- se escondia solo. Los anuncios siguen llevando el sello "Publicidad".
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vitrina', 'vitrina', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists vitrina_subir_admin on storage.objects;
create policy vitrina_subir_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vitrina' and public.is_admin());

drop policy if exists vitrina_borrar_admin on storage.objects;
create policy vitrina_borrar_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'vitrina' and public.is_admin());

-- El bucket viejo ya no se usa: se le quitan los permisos de subir y borrar.
-- (Las 3 imagenes de prueba que tiene se pueden borrar desde el panel de
-- Supabase > Storage, y despues el bucket entero.)
drop policy if exists publicidad_subir_admin on storage.objects;
drop policy if exists publicidad_borrar_admin on storage.objects;
