-- ============================================================
-- ROLLBACK de 2026-08-13_hardening_storage_paso2.sql
-- ============================================================
-- Estado ORIGINAL capturado de pg_policies el 2026-08-13 antes del cambio:
--
--   policyname       | roles    | cmd    | qual | with_check
--   -----------------+----------+--------+------+---------------------------------
--   Subir avatares   | {public} | INSERT | NULL | (bucket_id = 'Avatares'::text)
--   Subir imagenes   | {public} | INSERT | NULL | (bucket_id = 'productos'::text)
--
-- Correr esto SOLO si tras el Paso 2 un proveedor logueado no puede subir
-- fotos. ATENCION: deja el bucket abierto a subidas ANONIMAS otra vez, que es
-- justamente el agujero. Usarlo como parche temporal mientras se diagnostica,
-- nunca como estado final.
--
-- Antes de revertir, descartar primero la causa mas probable:
-- que la sesion del usuario haya expirado (cerrar sesion y volver a entrar).
-- ============================================================

drop policy if exists "Subir avatares" on storage.objects;
drop policy if exists "Subir imagenes" on storage.objects;

create policy "Subir avatares"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'Avatares');

create policy "Subir imagenes"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'productos');

-- Verificacion: ambas filas deben volver a mostrar roles={public}
select policyname, roles, cmd, with_check
from pg_policies
where schemaname = 'storage'
order by policyname;
