-- ============================================================
-- 2026-08-13 — Hardening de busquedas (Puerta 2)
-- ============================================================
-- PROBLEMA
-- La tabla tenia DOS policies de INSERT, y la mas permisiva anulaba a la otra:
--
--   policyname               | roles                | cmd    | with_check
--   -------------------------+----------------------+--------+-------------------------------------------
--   public_insert_busquedas  | {anon,authenticated} | INSERT | (termino IS NOT NULL AND char_length(termino) <= 120)
--   busq_insert              | {anon,authenticated} | INSERT | true
--   busq_select_admin        | {authenticated}      | SELECT | is_admin()
--
-- En Postgres las policies PERMISSIVE del mismo comando se combinan con OR:
-- basta que UNA autorice. 'busq_insert' con with_check = true autoriza
-- cualquier fila, por lo que el limite de 120 caracteres de
-- 'public_insert_busquedas' nunca se aplicaba.
--
-- Comprobado desde curl con la clave publishable, sin login:
--   POST /rest/v1/busquedas {"termino":"probe"}  -> 201 Created
--
-- Y la columna no ayuda: busquedas.termino es 'text' sin character_maximum_length.
-- El tope de 100 caracteres observado en los datos reales es solo el largo que
-- la gente tipea; no hay nada que lo imponga. El input del buscador en
-- index.html tampoco tiene maxlength.
--
-- FIX
-- Borrar 'busq_insert'. NO hay que crear nada: al desaparecer la policy
-- permisiva, 'public_insert_busquedas' queda como unica autorizacion de INSERT
-- y su limite de 120 caracteres pasa a aplicarse de verdad.
--
-- POR QUE NO ROMPE LA APP
-- js/app.js:51 (trackSearch) inserta { termino: q, resultados: n }:
--   - termino nunca es null (hay un guard q.length < 2)
--   - el maximo real en 14.391 filas es 100 caracteres, por debajo de 120
--   - si alguna vez superara 120, el insert falla en silencio: la llamada usa
--     .then(() => {}, () => {}) dentro de un try/catch, o sea que el error se
--     descarta y la app sigue normal. Solo se pierde ese registro.
--
-- ALCANCE — LEER ESTO
-- Esto limita el TAMANO de cada fila, no la CANTIDAD. Un tercero puede seguir
-- insertando filas de 120 caracteres sin cuenta. Frenar eso exige control por
-- IP mediante una RPC SECURITY DEFINER (cambio mayor, toca el frontend).
-- Con la base en 22 MB sobre 8 GB incluidos, no se justifica hoy. Queda anotado.
-- ============================================================

drop policy if exists busq_insert on public.busquedas;

-- Verificacion: deben quedar solo public_insert_busquedas (INSERT) y
-- busq_select_admin (SELECT). Ninguna con with_check = true.
select policyname, roles, cmd, with_check
from pg_policies
where schemaname = 'public' and tablename = 'busquedas'
order by cmd, policyname;
