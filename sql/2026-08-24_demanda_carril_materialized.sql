-- =====================================================================
-- COTIZACIONES — el carril "buscado sin respuesta" tardaba 9 segundos.
-- Fecha: 2026-08-24
--
-- Se corre UNA sola vez, en el SQL editor de Supabase (proyecto
-- seubtijmyoahnyspvidq), con el rol por defecto (postgres).
--
-- QUE PASABA
-- Entrar a Cotizaciones y tocar "Probar" tardaba varios segundos. El feed
-- no tenia la culpa: cotiz_feed_publico() resuelve en 10 ms. El que
-- tardaba era el carril, y el frontend lo esperaba junto con el feed en el
-- mismo Promise.all (eso se arreglo aparte, en js/cotizaciones.js).
--
-- Medido con EXPLAIN ANALYZE contra produccion, antes de este archivo:
--
--   cotiz_feed_publico(60)            ->     10 ms
--   cotiz_demanda_sin_respuesta(10)   ->  8.996 ms
--
-- POR QUE TARDABA
-- El plan elegia un Nested Loop Anti Join para el "not exists" contra
-- demanda_oculta:
--
--   Nested Loop Anti Join  (actual time=1.434..9144.818 rows=10408)
--     Join Filter: (o.raiz = cotiz_raiz(b.termino))
--     Rows Removed by Join Filter: 901276
--     ->  Seq Scan on demanda_oculta o  (loops=11054)
--
-- O sea: por cada una de las ~11.000 busquedas de los ultimos 30 dias
-- recorria entera demanda_oculta, y en CADA comparacion volvia a calcular
-- cotiz_raiz(b.termino). 901.276 ejecuciones de un translate y dos
-- regexp_replace. Ahi se iban los 9 segundos (1,4 ms -> 9.144 ms).
--
-- El planificador llega ahi porque estima rows=1 donde hay 11.054: la
-- pila de filtros funcionales sobre busquedas no le deja estimar nada
-- parecido a la realidad. No es un indice que falte — el de created_at ya
-- esta y se usa (Index Cond, 169 ms para traer las 11.054 filas).
--
-- EL ARREGLO
-- Una sola palabra: `materialized` en el CTE `limpio`.
--
-- Desde PostgreSQL 12 un CTE que se usa una sola vez y no tiene efectos se
-- inlinea por defecto. Al inlinearse, `raiz` deja de ser una columna y
-- vuelve a ser la EXPRESION cotiz_raiz(b.termino), que el join entonces
-- recalcula una y otra vez. Con `materialized` el CTE se evalua una vez a
-- un tuplestore: cotiz_raiz corre 11.054 veces en lugar de 901.276, y el
-- plan pasa a Hash Right Anti Join.
--
--   despues:  cotiz_demanda_sin_respuesta(10)  ->  205 ms   (44x)
--
-- NO CAMBIA LO QUE DEVUELVE. `materialized` decide COMO se evalua el CTE,
-- no que se calcula: la funcion es stable y de solo lectura, asi que el
-- resultado es identico. Al final de este archivo hay una comprobacion que
-- lo verifica contra la huella tomada ANTES de correrlo.
--
-- Se usa create or replace con la MISMA firma (integer) -> jsonb, asi que
-- no toca ni el dueño ni los permisos: el grant execute a anon y
-- authenticated de 2026-08-12 sigue tal cual y no hay que re-otorgar nada.
-- El cuerpo es el mismo del archivo original salvo esa palabra.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
--
-- Este archivo REEMPLAZA una funcion que tiene que existir. Si no esta,
-- correr primero sql/2026-08-12_demanda_sin_respuesta.sql: crear la
-- funcion aca sin su tabla demanda_oculta dejaria el carril mostrando
-- lugares, marcas y vapes.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.cotiz_demanda_sin_respuesta(integer)') is null then
    raise exception 'Falta public.cotiz_demanda_sin_respuesta(integer). Corra antes sql/2026-08-12_demanda_sin_respuesta.sql';
  end if;
  if to_regclass('public.demanda_oculta') is null then
    raise exception 'Falta public.demanda_oculta. Corra antes sql/2026-08-12_demanda_sin_respuesta.sql';
  end if;
  if to_regprocedure('public.cotiz_raiz(text)') is null then
    raise exception 'Falta public.cotiz_raiz(text). Corra antes sql/2026-08-12_demanda_sin_respuesta.sql';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) LA MISMA FUNCION, CON EL CTE MATERIALIZADO
--
-- Los filtros son exactamente los de 2026-08-12 y no se tocan:
--   - entre 3 y 40 caracteres, solo letras/numeros/espacios
--   - sin 4 digitos seguidos (telefonos, codigos, DNI)
--   - 5 busquedas o mas, en 3 dias distintos o mas
--   - 85% o mas de esas busquedas sin ningun resultado
--   - al menos un cero en los ultimos 7 dias (que siga vigente)
--   - que no este en demanda_oculta
--
-- Sigue siendo security definer: corre como el dueño y ve public.busquedas
-- aunque la RLS no deje leerla a nadie. Por eso todos los filtros viven
-- adentro y no se pueden eludir; quien llama solo elige cuantos quiere, y
-- topeado.
-- ---------------------------------------------------------------------
create or replace function public.cotiz_demanda_sin_respuesta(p_limit integer default 10)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with limpio as materialized (
    select lower(btrim(regexp_replace(b.termino, '\s+', ' ', 'g'))) as t,
           public.cotiz_raiz(b.termino) as raiz,
           b.resultados,
           b.created_at
      from public.busquedas b
     where b.created_at > now() - interval '30 days'
       and b.termino is not null
       and b.resultados is not null
       and length(btrim(b.termino)) between 3 and 40
       and lower(btrim(b.termino)) ~ '^[a-z0-9áéíóúüñ][a-z0-9áéíóúüñ ]*$'
       and b.termino !~ '[0-9]{4,}'
  ),
  agg as (
    select l.raiz,
           mode() within group (order by l.t) as etiqueta,
           count(*)                                        as veces,
           count(distinct l.created_at::date)              as dias,
           count(*) filter (where l.resultados = 0)        as ceros,
           max(l.created_at) filter (where l.resultados = 0) as ultimo_cero
      from limpio l
     where l.raiz <> ''
       and not exists (select 1 from public.demanda_oculta o where o.raiz = l.raiz)
     group by l.raiz
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.busquedas desc), '[]'::jsonb)
    from (
      select a.etiqueta as termino,
             a.ceros    as busquedas
        from agg a
       where a.veces >= 5
         and a.dias  >= 3
         and a.ceros::numeric / a.veces >= 0.85
         and a.ultimo_cero > now() - interval '7 days'
       order by a.ceros desc
       limit greatest(1, least(coalesce(p_limit, 10), 30))
    ) x;
$$;

commit;


-- ---------------------------------------------------------------------
-- 2) ESTADISTICAS AL DIA
--
-- No arregla nada por si solo (la mala estimacion viene de los filtros
-- funcionales, que ANALYZE no sabe medir), pero la tabla crece ~11.000
-- filas por mes y no cuesta nada dejarla fresca. Va fuera de la
-- transaccion a proposito.
-- ---------------------------------------------------------------------
analyze public.busquedas;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACION
--
-- 1) Que devuelva EXACTAMENTE lo mismo que antes de correr este archivo.
--    La huella se tomo con la funcion vieja, minutos antes:
--
--      select md5(public.cotiz_demanda_sin_respuesta(10)::text);
--      -> f5ad577960e54ca1e80f90b2df3c80d1
--
--    Si el resultado de abajo no es 'igual que antes', puede ser esto o
--    puede ser simplemente que entraron busquedas nuevas en el medio: en
--    ese caso, comparar a ojo las dos salidas.
-- =====================================================================
select case md5(public.cotiz_demanda_sin_respuesta(10)::text)
         when 'f5ad577960e54ca1e80f90b2df3c80d1' then 'igual que antes'
         else 'DISTINTO: comparar a mano contra la salida vieja'
       end as sale_lo_mismo;

-- 2) Que el plan ya no sea un Nested Loop Anti Join y que baje de 9 s.
--    Se espera 'Hash Right Anti Join' y un Execution Time de ~200 ms.
explain (analyze, buffers) select public.cotiz_demanda_sin_respuesta(10);


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal):
--   volver a correr sql/2026-08-12_demanda_sin_respuesta.sql, que tiene
--   el cuerpo original. Es create or replace, asi que alcanza con eso y
--   no hay que tocar permisos. El unico efecto de volver atras es que la
--   consulta vuelve a tardar 9 segundos.
-- =====================================================================
