-- ============================================================
-- 2026-08-13 — Cerrar escritura anonima en tablas sin uso (Puerta 4, bloque A)
-- ============================================================
-- CONTEXTO
-- Auditando el rol 'authenticated' (todo lo anterior se habia probado solo como
-- anonimo) aparecieron 4 policies de INSERT sin verificacion de identidad. Las
-- dos capas de Postgres dan permiso en todas:
--
--   tabla       | GRANT INSERT a anon | policy      | with_check
--   ------------+---------------------+-------------+------------
--   historial   | si                  | hist_insert | true
--   reportes    | si                  | reporte_insert | true
--   pedidos     | si                  | pedido_insert  | true
--   proveedores | si                  | prov_insert    | (estado = 'pendiente')
--
-- Cuando GRANT y policy autorizan, el INSERT entra. Es el mismo caso que
-- busquedas/busq_insert, corregido en 2026-08-13_hardening_busquedas.sql.
--
-- NOTA: aqui NO se escribieron filas de prueba. La conclusion sale de cruzar
-- information_schema.role_table_grants con pg_policies, que son las dos unicas
-- capas que Postgres evalua para un INSERT.
--
-- ALCANCE DE ESTE ARCHIVO
-- Solo las dos tablas que el codigo NO usa. pedidos y proveedores quedan fuera
-- a proposito: son flujos vivos (checkout anonimo y alta de proveedor) y
-- cerrarlos sin mas romperia la app. Van en un archivo aparte.
--
-- VERIFICACION DE QUE NO SE USAN
--   historial: cero referencias en todo el repo. Las coincidencias de la
--     palabra "historial" son otras cosas (localStorage eg_historial,
--     textos de admin.html, comentarios en api/ml.js y notificar-mensaje.js).
--     No existe ningun from('historial').
--   reportes: solo lectura y update, y solo desde el panel admin
--     (admin.html:905, 1534, 1562, 1572). No hay ningun insert en el frontend:
--     el flujo de "reportar" no esta implementado.
--
-- POR QUE ALCANZA CON BORRAR LA POLICY
-- Las dos tablas tienen RLS activado (verificado: cero tablas sin RLS en
-- public). Sin ninguna policy permisiva de INSERT, RLS rechaza todo INSERT sin
-- necesidad de tocar los GRANT. Es el cambio minimo y el mas facil de revertir.
-- ============================================================

drop policy if exists hist_insert    on public.historial;
drop policy if exists reporte_insert on public.reportes;

-- Verificacion: no debe quedar ninguna policy de INSERT en estas dos tablas.
select tablename, policyname, cmd, array_to_string(roles, ',') as roles
from pg_policies
where schemaname = 'public' and tablename in ('historial','reportes')
order by tablename, cmd;
