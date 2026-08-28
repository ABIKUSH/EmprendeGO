-- ============================================================================
-- CALIFICACIÓN DEL COMPRADOR — v2: se cae la pregunta de cantidad
-- 2026-08-27
-- ============================================================================
--
-- Correr DESPUÉS de 2026-08-27_calificacion_comprador.sql, que ya está aplicado.
--
-- QUÉ CAMBIA Y POR QUÉ
-- La v1 preguntaba dos cosas: cantidad aproximada y si revende. La cantidad se
-- cae. El comprador le escribe AL PROVEEDOR, todavía no eligió ningún producto,
-- así que no tiene una cantidad en la cabeza: la pregunta lo traba y la
-- respuesta sería inventada. Si revende o no, en cambio, lo sabe siempre, y es
-- justo el dato que separa al mayorista del curioso — que es lo único que
-- estamos tratando de medir.
--
-- ⚠️ HAY QUE CORRERLO SÍ O SÍ. La v1 dejó la función con 4 argumentos y el
-- frontend ahora la llama con 3. PostgREST no la va a encontrar, el .catch va a
-- caer al RPC viejo y las calificaciones no se guardarían nunca: la métrica de
-- consultas seguiría andando y el dato nuevo se perdería en silencio.
--
-- ⚠️ Y CAMBIA LA GUARDA DEL UPDATE. En la v1 el UPDATE ubicaba la fila recién
-- insertada con `cantidad_rango IS NULL`. Sin esa columna esa condición sería
-- siempre verdadera y podría pisar una consulta ya calificada. Ahora la guarda
-- es `revende IS NULL`, que es la que corresponde.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PASO 1 — la función con la firma nueva
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_consulta_calificada(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.registrar_consulta_calificada(
  proveedor_id uuid,
  p_revende    text DEFAULT NULL,
  p_nombre     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Comportamiento de siempre, intacto: alta de la fila + contador acumulado.
  PERFORM public.registrar_consulta(registrar_consulta_calificada.proveedor_id);

  -- Estampa la fila recién insertada. Se la ubica por ctid para no depender de
  -- cuál es la PK. Las tres condiciones son las que lo hacen seguro:
  --   · created_at > now() - 10s → si registrar_consulta() no insertó nada
  --     (dedup del lado del servidor), no se pisa una fila vieja.
  --   · revende IS NULL          → no se pisa una consulta ya calificada.
  --   · proveedor_id             → acota al proveedor de esta llamada.
  -- Queda una carrera teórica: dos compradores distintos contactando AL MISMO
  -- proveedor dentro de la misma ventana de 10 segundos podrían cruzarse el
  -- nombre. Con el volumen actual (importadora electro, el más contactado,
  -- recibe 374 por mes ≈ 1 cada 2 horas) es despreciable.
  UPDATE public.consultas c
     SET revende          = NULLIF(btrim(coalesce(p_revende, '')), ''),
         comprador_nombre = NULLIF(left(btrim(coalesce(p_nombre, '')), 80), '')
   WHERE c.ctid = (
     SELECT c2.ctid
       FROM public.consultas c2
      WHERE c2.proveedor_id = registrar_consulta_calificada.proveedor_id
        AND c2.revende      IS NULL
        AND c2.created_at   > now() - interval '10 seconds'
      ORDER BY c2.created_at DESC
      LIMIT 1
   );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_consulta_calificada(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_consulta_calificada(uuid, text, text) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- PASO 2 — sacar la columna de cantidad
-- ---------------------------------------------------------------------------
-- Se puede borrar sin miedo: se creó hoy y el frontend con la pregunta de
-- cantidad NUNCA llegó a producción, así que la columna está vacía. El DO
-- comprueba eso antes de tocar nada: si alguna fila tiene dato, no la borra y
-- avisa, para que no se pierda algo medido.
DO $$
DECLARE n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='consultas'
                AND column_name='cantidad_rango') THEN
    EXECUTE 'SELECT count(*) FROM public.consultas WHERE cantidad_rango IS NOT NULL' INTO n;
    IF n = 0 THEN
      ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_cantidad_rango_chk;
      ALTER TABLE public.consultas DROP COLUMN cantidad_rango;
      RAISE NOTICE 'cantidad_rango borrada (estaba vacia)';
    ELSE
      RAISE NOTICE 'cantidad_rango CONSERVADA: tiene % filas con dato', n;
    END IF;
  END IF;
END $$;

-- El índice de la v1 nombraba cantidad_rango solo en el orden; sigue siendo
-- válido sobre (proveedor_id, revende, created_at). Se recrea por las dudas.
DROP INDEX IF EXISTS public.consultas_prov_revende_idx;
CREATE INDEX consultas_prov_revende_idx
  ON public.consultas (proveedor_id, revende, created_at DESC);

NOTIFY pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- PASO 3 — comprobar (después, con datos reales)
-- ---------------------------------------------------------------------------
-- El número que buscamos: de las consultas calificadas, cuántas son de alguien
-- que revende. Es la respuesta a "¿son todos minoristas?".
--
-- SELECT revende, count(*) AS consultas,
--        round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
--   FROM public.consultas
--  WHERE created_at > now() - interval '30 days' AND revende IS NOT NULL
--  GROUP BY revende ORDER BY consultas DESC;
