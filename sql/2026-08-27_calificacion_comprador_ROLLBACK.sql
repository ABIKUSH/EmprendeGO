-- ============================================================================
-- ROLLBACK de sql/2026-08-27_calificacion_comprador.sql
-- ============================================================================
--
-- ⚠️ Antes de correrlo: el frontend cae solo al RPC viejo si el nuevo no
-- existe (js/app.js, registrarConsulta), así que borrar la función NO rompe la
-- métrica de consultas. Pero SÍ se pierden las calificaciones ya guardadas.
-- Si lo que se busca es solo apagar la función, corré el PASO 1 y dejá las
-- columnas: no molestan y conservan lo medido.
-- ============================================================================

-- PASO 1 — sacar el RPC (el front vuelve solo a registrar_consulta)
DROP FUNCTION IF EXISTS public.registrar_consulta_calificada(uuid, text, text, text);

-- PASO 2 — sacar las columnas (DESTRUCTIVO: se pierde lo medido)
-- Guardar antes una copia si el dato importa:
--   CREATE TABLE public.consultas_calif_backup AS
--     SELECT proveedor_id, created_at, cantidad_rango, revende, comprador_nombre
--       FROM public.consultas WHERE revende IS NOT NULL;

DROP INDEX IF EXISTS public.consultas_prov_revende_idx;

ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_cantidad_rango_chk;
ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_revende_chk;
ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_comprador_nombre_chk;

ALTER TABLE public.consultas DROP COLUMN IF EXISTS cantidad_rango;
ALTER TABLE public.consultas DROP COLUMN IF EXISTS revende;
ALTER TABLE public.consultas DROP COLUMN IF EXISTS comprador_nombre;

NOTIFY pgrst, 'reload schema';
