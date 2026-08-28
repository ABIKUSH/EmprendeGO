-- ============================================================================
-- CALIFICACIÓN DEL COMPRADOR EN LA CONSULTA
-- 2026-08-27
-- ============================================================================
--
-- POR QUÉ
-- Hasta hoy los ~2.800 contactos mensuales salían todos con el MISMO texto que
-- generaba la app: sin nombre, sin cantidad y sin decir si el que escribe
-- revende o compra una unidad para sí mismo. El proveedor recibía 40 mensajes
-- idénticos y no podía distinguir un mayorista de un curioso, así que dejó de
-- contestarlos a todos. Varios lo dijeron con esas palabras: "mensajes
-- demasiado minoristas". Inspiración Denim recibe 43 consultas por mes gratis
-- y pidió darse de baja.
--
-- Esta migración guarda las tres respuestas junto a la consulta. Es lo que
-- después permite decirle al proveedor "recibió 38 compradores mayoristas" en
-- lugar de "recibió 61 clics", que es lo único que hoy le podemos mostrar.
--
-- ⚠️ LA PRIMERA VERSIÓN MIDE, NO FILTRA. Al que responde "es para mí" no se lo
-- frena: se lo deja pasar y se lo marca. Frenarlo daría bronca, algunos igual
-- compran cantidad, y sobre todo nos dejaría sin el número que estamos
-- tratando de averiguar. Filtrar después, si el dato lo justifica.
--
-- ⚠️ `public.consultas` y `registrar_consulta()` se crearon a mano en Supabase
-- en julio de 2026 y NO están versionados en este repo. Por eso el PASO 0 es
-- de verificación y hay que mirarlo ANTES de correr el resto: si los nombres
-- no coinciden con lo que asume este archivo, corregilo acá y no en la base.
--
-- Rollback: sql/2026-08-27_calificacion_comprador_ROLLBACK.sql
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PASO 0 — VERIFICAR (no modifica nada; leer la salida antes de seguir)
-- ---------------------------------------------------------------------------
-- Se espera: una tabla public.consultas con al menos proveedor_id y created_at,
-- y una función registrar_consulta(proveedor_id uuid).

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'consultas'
 ORDER BY ordinal_position;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'registrar_consulta%';


-- ---------------------------------------------------------------------------
-- PASO 1 — COLUMNAS
-- ---------------------------------------------------------------------------
-- Los CHECK aceptan NULL a propósito: todas las filas anteriores al 27-08-2026
-- no tienen calificación y tienen que seguir siendo válidas.
-- Los valores tienen que coincidir con EG_CANTIDADES / EG_REVENDE de js/app.js.
-- Si se agrega una opción allá, hay que agregarla acá o el INSERT falla.

ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS cantidad_rango   text;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS revende          text;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS comprador_nombre text;

ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_cantidad_rango_chk;
ALTER TABLE public.consultas ADD  CONSTRAINT consultas_cantidad_rango_chk
  CHECK (cantidad_rango IS NULL OR cantidad_rango IN ('1-5', '6-20', '20-50', '50+'));

ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_revende_chk;
ALTER TABLE public.consultas ADD  CONSTRAINT consultas_revende_chk
  CHECK (revende IS NULL OR revende IN ('local', 'online', 'propio'));

-- El nombre lo escribe el comprador: se acota el largo para que un pegado
-- accidental de 2 KB no entre a la tabla.
ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_comprador_nombre_chk;
ALTER TABLE public.consultas ADD  CONSTRAINT consultas_comprador_nombre_chk
  CHECK (comprador_nombre IS NULL OR char_length(comprador_nombre) <= 80);

-- Para el panel: "consultas de revendedores este mes" por proveedor.
CREATE INDEX IF NOT EXISTS consultas_prov_revende_idx
  ON public.consultas (proveedor_id, revende, created_at DESC);


-- ---------------------------------------------------------------------------
-- PASO 2 — RPC
-- ---------------------------------------------------------------------------
-- Envuelve a registrar_consulta() en vez de reemplazarla: esa función ya
-- resuelve el alta de la fila Y el contador acumulado proveedores.consultas, y
-- no está versionada acá, así que reescribirla a ciegas es la forma más fácil
-- de romper la métrica que ya funciona.
--
-- ⚠️ El estampado busca la fila recién insertada por ctid (no hace falta saber
-- cuál es la PK). Las tres condiciones del WHERE son las que lo hacen seguro:
--   · created_at > now() - 10s  → si registrar_consulta() no insertó nada
--     (dedup del lado del servidor), no se pisa una fila vieja.
--   · cantidad_rango IS NULL    → no se pisa una consulta ya calificada.
--   · proveedor_id              → acota al proveedor de esta llamada.
-- Queda una carrera teórica: dos compradores distintos contactando AL MISMO
-- proveedor dentro de la misma ventana de 10 segundos podrían cruzarse la
-- calificación. Con el volumen actual (importadora electro, el más contactado,
-- recibe 374 por mes ≈ 1 cada 2 horas) es despreciable. Si algún día un
-- proveedor recibe decenas por minuto, esto hay que resolverlo devolviendo el
-- id desde registrar_consulta().

CREATE OR REPLACE FUNCTION public.registrar_consulta_calificada(
  proveedor_id uuid,
  p_cantidad   text DEFAULT NULL,
  p_revende    text DEFAULT NULL,
  p_nombre     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Comportamiento de siempre, intacto.
  PERFORM public.registrar_consulta(registrar_consulta_calificada.proveedor_id);

  UPDATE public.consultas c
     SET cantidad_rango   = NULLIF(btrim(coalesce(p_cantidad, '')), ''),
         revende          = NULLIF(btrim(coalesce(p_revende,  '')), ''),
         comprador_nombre = NULLIF(left(btrim(coalesce(p_nombre, '')), 80), '')
   WHERE c.ctid = (
     SELECT c2.ctid
       FROM public.consultas c2
      WHERE c2.proveedor_id   = registrar_consulta_calificada.proveedor_id
        AND c2.cantidad_rango IS NULL
        AND c2.created_at     > now() - interval '10 seconds'
      ORDER BY c2.created_at DESC
      LIMIT 1
   );
END;
$$;

-- La llama el comprador sin sesión: anon la necesita. Mismo patrón que el
-- resto de los RPC del front (registrar_consulta, increment_visitas).
REVOKE ALL ON FUNCTION public.registrar_consulta_calificada(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_consulta_calificada(uuid, text, text, text) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- PASO 3 — GRANTS DE COLUMNA
-- ---------------------------------------------------------------------------
-- ⚠️ ADD COLUMN no hereda los grants de la tabla (está en CLAUDE.md). Sin esto,
-- un SELECT del panel sobre las columnas nuevas devuelve 403 desde PostgREST.
-- Se otorga SOLO lectura y SOLO a authenticated: `comprador_nombre` es un dato
-- de una persona y anon no tiene por qué verlo. La escritura entra únicamente
-- por el RPC de arriba, que es SECURITY DEFINER.

GRANT SELECT (cantidad_rango, revende) ON public.consultas TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- PASO 4 — COMPROBACIÓN (correr después, con datos reales)
-- ---------------------------------------------------------------------------
-- El número que estamos buscando: de las consultas calificadas, cuántas son
-- de alguien que revende. Es la respuesta a "¿son todos minoristas?".
--
-- SELECT revende,
--        count(*)                                        AS consultas,
--        round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
--   FROM public.consultas
--  WHERE created_at > now() - interval '30 days'
--    AND revende IS NOT NULL
--  GROUP BY revende
--  ORDER BY consultas DESC;
--
-- Y el mismo corte por proveedor, que es lo que se le muestra a él:
--
-- SELECT p.nombre,
--        count(*) FILTER (WHERE c.revende IN ('local','online')) AS revendedores,
--        count(*) FILTER (WHERE c.revende = 'propio')            AS uso_personal,
--        count(*) FILTER (WHERE c.revende IS NULL)               AS sin_calificar
--   FROM public.consultas c
--   JOIN public.proveedores p ON p.id = c.proveedor_id
--  WHERE c.created_at > now() - interval '30 days'
--  GROUP BY p.nombre
--  ORDER BY revendedores DESC
--  LIMIT 30;
