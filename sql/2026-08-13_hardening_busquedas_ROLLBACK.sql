-- ============================================================
-- ROLLBACK de 2026-08-13_hardening_busquedas.sql
-- ============================================================
-- Estado ORIGINAL capturado de pg_policies el 2026-08-13 antes del cambio:
--
--   policyname   | roles                | cmd    | qual | with_check
--   -------------+----------------------+--------+------+-----------
--   busq_insert  | {anon,authenticated} | INSERT | NULL | true
--
-- Correr esto SOLO si tras el cambio dejan de registrarse busquedas.
-- ATENCION: restaura la policy que autoriza CUALQUIER fila y vuelve a anular
-- el limite de 120 caracteres de public_insert_busquedas. Es el agujero.
--
-- Antes de revertir, descartar la causa mas probable: que se esten intentando
-- guardar terminos de mas de 120 caracteres. Eso se ve en los logs de la API
-- como error 42501 sobre la tabla busquedas. Si es eso, la solucion correcta
-- es recortar el termino en el cliente (js/app.js:51, trackSearch), no
-- reabrir la policy.
-- ============================================================

create policy busq_insert
  on public.busquedas
  for insert
  to anon, authenticated
  with check (true);

-- Verificacion: busq_insert debe volver a aparecer con with_check = true
select policyname, roles, cmd, with_check
from pg_policies
where schemaname = 'public' and tablename = 'busquedas'
order by cmd, policyname;
