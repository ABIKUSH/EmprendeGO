-- ============================================================
-- ROLLBACK de 2026-08-13_hardening_tablas_muertas.sql
-- ============================================================
-- Estado ORIGINAL capturado de pg_policies el 2026-08-13 antes del cambio:
--
--   tablename  | policyname     | cmd    | roles                | qual | with_check
--   -----------+----------------+--------+----------------------+------+-----------
--   historial  | hist_insert    | INSERT | {anon,authenticated} | NULL | true
--   reportes   | reporte_insert | INSERT | {anon,authenticated} | NULL | true
--
-- Correr esto SOLO si aparece un flujo que necesitaba insertar en estas tablas
-- (por ejemplo, si se implementa el boton de "reportar proveedor").
--
-- ATENCION: restaura la autorizacion de INSERT a CUALQUIERA sin cuenta y sin
-- limite de filas. Si el flujo nuevo es legitimo, lo correcto no es revertir a
-- 'true' sino escribir una policy con su condicion propia (por ejemplo, exigir
-- 'to authenticated', o acotar los campos como se hizo en busquedas).
-- ============================================================

create policy hist_insert
  on public.historial
  for insert
  to anon, authenticated
  with check (true);

create policy reporte_insert
  on public.reportes
  for insert
  to anon, authenticated
  with check (true);

-- Verificacion: deben reaparecer las dos policies de INSERT
select tablename, policyname, cmd, array_to_string(roles, ',') as roles, with_check
from pg_policies
where schemaname = 'public' and tablename in ('historial','reportes')
order by tablename, cmd;
