-- ============================================================
-- 2026-08-13 — Hardening de Storage (Paso 2 de 3) — CIERRE DEL AGUJERO
-- ============================================================
-- PROBLEMA
-- Las dos unicas policies del schema storage eran:
--
--   policyname       | roles    | cmd    | qual | with_check
--   -----------------+----------+--------+------+---------------------------------
--   Subir avatares   | {public} | INSERT | NULL | (bucket_id = 'Avatares'::text)
--   Subir imagenes   | {public} | INSERT | NULL | (bucket_id = 'productos'::text)
--
-- 'public' en Postgres NO significa "usuarios publicos de la app": significa
-- TODOS los roles, incluido 'anon'. Y el with_check solo valida a que bucket
-- va el archivo, sin exigir sesion. Resultado comprobado desde curl con la
-- clave publishable, sin login:
--
--   POST /storage/v1/object/productos/x.bin  -> 200 OK  (subio 6 MB)
--
-- El Paso 1 (file_size_limit 3 MB + allowed_mime_types) acota el dano por
-- archivo pero NO cierra la puerta: un tercero puede repetir subidas de 3 MB
-- indefinidamente hasta agotar la cuota de Storage.
--
-- FIX
-- Reemplazar ambas policies exigiendo rol 'authenticated'. Pasa de
-- "cualquiera en internet" a "alguien que se creo una cuenta".
--
-- POR QUE NO ROMPE LA APP (verificado en el codigo)
-- La app usa Supabase Auth de verdad, no un login casero:
--   js/app.js:2164  auth.signInWithOAuth   (Google, proveedores/compradores)
--   js/app.js:2320  auth.signInWithPassword
--   admin.html:790  auth.signInWithPassword (el admin tambien es sesion real)
-- Y TODOS los puntos de subida corren con sesion ya iniciada:
--   app.js:3585/3589/3685/3691  subirFotoStorage(..., currentUser.proveedorId)
--   app.js:5496/5516            subirAvatar(...) desde el panel
--   app.js:7524                 subirFotoStorage(...) en Novedades
--   admin.html:1489             upload con provEditando (panel admin)
-- No hay ninguna subida durante el registro, antes de tener sesion.
--
-- LO QUE NO CAMBIA
-- - La LECTURA de imagenes: los buckets siguen public=true y se sirven por el
--   endpoint publico, que no pasa por estas policies de INSERT.
-- - El DELETE: sigue sin policy, o sea sigue bloqueado para todos salvo
--   service_role. Por eso los archivos de prueba hay que borrarlos a mano.
--
-- ALCANCE DELIBERADO
-- No se restringe la subida a la carpeta del propio proveedor (que el primer
-- segmento del path sea su id). Seria mas estricto, pero exige mapear
-- auth.uid() contra proveedores.id, relacion que no esta verificada todavia;
-- hacerlo a ciegas romperia subidas legitimas. Queda anotado como mejora.
-- ============================================================

drop policy if exists "Subir avatares" on storage.objects;
drop policy if exists "Subir imagenes" on storage.objects;

create policy "Subir avatares"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'Avatares' and auth.uid() is not null);

create policy "Subir imagenes"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'productos' and auth.uid() is not null);

-- Verificacion: ambas filas deben mostrar roles={authenticated}
select policyname, roles, cmd, with_check
from pg_policies
where schemaname = 'storage'
order by policyname;
