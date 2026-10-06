-- =====================================================================
-- URGENTE — Los tokens de Mercado Libre y Tienda Nube se leen con la clave
-- publica  (2026-10-06)
--
-- QUE PASA
-- `proveedores` tiene los permisos de lectura otorgados POR COLUMNA, y entre
-- las columnas abiertas al rol `anon` quedaron:
--     ml_access_token, ml_refresh_token, ml_token_expires_at, tn_access_token
--
-- La clave publishable esta en index.html desde siempre (tiene que estarlo),
-- asi que cualquiera que abra la pagina puede pedir esos campos. Comprobado
-- el 2026-10-06 con curl, sin sesion:
--     4 proveedores con ml_access_token legible
--     4 con ml_refresh_token legible
--     7 con tn_access_token legible
--
-- Con el access token de Mercado Libre se opera la cuenta del proveedor; el
-- refresh token ademas se renueva solo, asi que no se vence. Con el de Tienda
-- Nube se opera su tienda.
--
-- DE DONDE SALIO
-- No es RLS: las policies estan bien (`prov_select_public` limita a anon a los
-- aprobados). Es el GRANT. El rol `authenticated` NO tiene estas columnas, asi
-- que el hardening de su momento arreglo un rol y dejo el otro. Las columnas
-- que `anon` tiene de mas respecto de `authenticated` son exactamente estas
-- ocho, y las cuatro primeras son credenciales.
--
-- POR QUE ES SEGURO REVOCARLAS
--   1. Ninguna se lee desde el navegador. Comprobado sobre js/*.js, index.html
--      y admin.html: cero menciones de las ocho.
--   2. Los flujos que SI las usan (api/ml.js, api/tiendanube.js) entran con la
--      service-role, que no pasa por estos grants.
--   3. El panel del proveedor entra como `authenticated`, que nunca las tuvo.
--   4. ⚠️ Ninguna policy de `proveedores` las menciona. Esto importa: una
--      policy que lee una columna revocada rompe la lectura ENTERA para ese
--      rol (ya paso en este proyecto, ver project_rls_referencia_columna_
--      revocada). Las policies de aca usan `estado`, `email` e is_admin(), y
--      esas dos columnas NO se tocan.
--
-- QUE NO SE TOCA
-- `email` queda como esta aunque sea PII, justamente por el punto 4:
-- `prov_select_auth` la usa en su USING. Revocarla dejaria a los proveedores
-- sin poder leer su propia ficha. Si alguna vez se quiere cerrar, primero hay
-- que reescribir esa policy con un helper SECURITY DEFINER.
-- =====================================================================

-- 1) LAS CREDENCIALES. Esto es lo urgente.
revoke select (ml_access_token)     on public.proveedores from anon;
revoke select (ml_refresh_token)    on public.proveedores from anon;
revoke select (ml_token_expires_at) on public.proveedores from anon;
revoke select (tn_access_token)     on public.proveedores from anon;

-- 2) Las otras cuatro que `anon` tenia de mas y no usa nadie. No son
-- credenciales, pero son datos internos: cuando se le escribio por ultima vez
-- a un proveedor y con que pago. No hay motivo para que sean publicas.
revoke select (last_notified_at)  on public.proveedores from anon;
revoke select (last_wa_at)        on public.proveedores from anon;
revoke select (notif_email)       on public.proveedores from anon;
revoke select (ultimo_payment_id) on public.proveedores from anon;

-- 3) Filos sueltos del mismo descuido. `anon` nunca tuvo que poder borrar ni
-- vaciar la tabla. Hoy no lo logra igual -no hay policy de DELETE para anon-,
-- pero TRUNCATE no pasa por RLS: si alguna vez quedara expuesto por otra via,
-- se lleva la tabla entera. El INSERT se conserva: es el registro de
-- proveedores, que entra sin sesion a proposito (policy `prov_insert`).
revoke delete, truncate on public.proveedores from anon;

notify pgrst, 'reload schema';

-- =====================================================================
-- VERIFICACION — las cuatro credenciales no deben aparecer
-- =====================================================================
select column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'proveedores'
  and grantee = 'anon' and privilege_type = 'SELECT'
  and column_name in ('ml_access_token','ml_refresh_token','ml_token_expires_at','tn_access_token');

-- =====================================================================
-- DESPUES DE APLICAR: HAY QUE ROTAR LOS TOKENS
-- Revocar cierra la puerta, pero lo que ya se pudo haber copiado sigue
-- sirviendo. Para cada proveedor conectado:
--   - Mercado Libre: desconectar y volver a conectar desde el panel invalida
--     el par access/refresh anterior.
--   - Tienda Nube: idem, reinstalar la app genera un token nuevo.
-- Son 4 de ML y 7 de TN. No se puede hacer desde la base: hay que pasar por
-- el OAuth de cada plataforma.
--
-- PARA DESHACER (no deberia hacer falta nunca)
--   grant select (ml_access_token, ml_refresh_token, ml_token_expires_at,
--                 tn_access_token, last_notified_at, last_wa_at, notif_email,
--                 ultimo_payment_id) on public.proveedores to anon;
--   grant delete, truncate on public.proveedores to anon;
-- =====================================================================
