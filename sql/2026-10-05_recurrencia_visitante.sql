-- =====================================================================
-- Medir si el comprador vuelve  (2026-10-05)
--
-- POR QUE EXISTE
-- La pregunta mas importante que hoy NO se puede contestar es si la gente
-- vuelve. Medido el 2026-10-05: 565 usuarios nuevos y 4.189 busquedas en 30
-- dias, y busquedas.usuario_id esta en CERO filas -- nunca se escribio. O sea
-- que cada busqueda es un desconocido y no hay forma de saber si son 4.189
-- personas distintas o 400 que vuelven diez veces. Esas dos realidades piden
-- decisiones opuestas: la primera es un problema de retencion, la segunda es
-- un problema de alcance.
--
-- Y hay una segunda pregunta que depende de la primera: de los que buscaron y
-- NO encontraron nada (925 busquedas en 30 dias, el 22% del total), cuantos
-- vuelven igual? Si vuelven, el hueco de catalogo cuesta una venta. Si no
-- vuelven, cuesta el cliente entero. Eso cambia cuanto vale taparlo.
--
-- POR QUE UN ID DE VISITANTE Y NO usuario_id
-- usuario_id solo se puede llenar cuando hay sesion, asi que mediria la
-- recurrencia de los que inician sesion y no la del resto. El id de visitante
-- vive en el localStorage del navegador (js/app.js -> idVisitante()), es un
-- valor aleatorio sin ningun dato de la persona adentro, y cubre a todos.
-- usuario_id queda como esta, sin tocar.
--
-- POR QUE NO ALCANZA GA4
-- GA4 ya sabe cuanta gente vuelve, pero no puede cruzar el regreso contra el
-- resultado de la PRIMERA busqueda de esa persona: para eso hace falta la
-- historia por visitante, y eso solo sale exportando a BigQuery. Aca la
-- columna vive al lado del termino buscado, que es justo el cruce que importa.
--
-- OJO: ARRANCA EN CERO Y NO SE PUEDE RELLENAR HACIA ATRAS
-- Las 4.189 busquedas que ya hay quedan sin visitante para siempre. El numero
-- recien dice algo cuando haya gente que entro DOS veces despues del deploy,
-- o sea unas dos semanas. El panel muestra la cobertura justamente para que
-- nadie lea una tasa calculada sobre cuatro filas.
--
-- QUE NO TOCA
-- Ninguna policy, ningun grant existente, ninguna columna existente. Los
-- grants de busquedas son de TABLA (anon=INSERT sobre la tabla entera), no por
-- columna, asi que la columna nueva queda cubierta sola y no hace falta el
-- GRANT por columna que pide CLAUDE.md para el caso contrario.
-- =====================================================================

-- 1) La columna.
alter table public.busquedas
  add column if not exists visitante text;

comment on column public.busquedas.visitante is
  'Id aleatorio del navegador (localStorage eg_visitante). No tiene datos de la persona. Sirve para contar si vuelve.';

-- 2) Un tope de largo, y es lo unico que protege la columna.
-- La policy de INSERT (public_insert_busquedas) solo valida termino, asi que
-- cualquiera con la clave publica puede escribir el visitante que quiera. Eso
-- ya pasaba con el termino y se acepto; lo que NO se acepta es que la columna
-- sirva de deposito de texto arbitrario. El tope es de LARGO y no de FORMATO a
-- proposito: si rechazara por formato, una version vieja de la app en el cache
-- de alguien perderia la fila ENTERA (el insert va con .then(()=>{},()=>{}) y
-- el error se descarta en silencio), y perder la busqueda es peor que aceptar
-- un id raro.
alter table public.busquedas
  drop constraint if exists busquedas_visitante_corto;
alter table public.busquedas
  add constraint busquedas_visitante_corto
  check (visitante is null or char_length(visitante) <= 64);

-- 3) Indice para los conteos por visitante. Parcial: las ~4.200 filas viejas
-- no tienen visitante y no tienen por que ocupar lugar en el indice.
create index if not exists busquedas_visitante_idx
  on public.busquedas (visitante, created_at)
  where visitante is not null;

-- 4) La lectura del panel, por el mismo camino que el embudo de WhatsApp:
-- SECURITY DEFINER + el porton de admin + SOLO agregados. busquedas tiene RLS
-- con una sola policy de SELECT (is_admin()), asi que el panel ya podria leer
-- las filas una por una; se usa una funcion igual por dos motivos:
--   a) son miles de filas y el conteo por visitante en el navegador obliga a
--      bajarlas todas (ver traerTodasLasBusquedas, que ya pagina);
--   b) lo que sale son numeros, no filas, asi que ni hay que pensar en que se
--      expone.
create or replace function public.admin_recurrencia()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r jsonb;
begin
  -- Mismo porton que el resto del panel: si no sos admin, 42501 y chau.
  perform public.admin_cotiz_guard();

  with marcadas as (
    -- Solo busquedas REALES del buscador: las filas historicas de nombres de
    -- proveedor tienen resultados nulo y el panel ya las excluye. Si entraran
    -- aca, contarian como visita sin haber sido una busqueda.
    select visitante,
           created_at,
           coalesce(resultados, 0) as resultados
    from public.busquedas
    where visitante is not null
      and resultados is not null
  ),
  por_visitante as (
    select visitante,
           -- Los dias se cuentan en hora argentina. En UTC una busqueda de las
           -- 22:30 cae al dia siguiente, y un visitante de una sola sesion
           -- nocturna aparentaria haber vuelto.
           count(distinct (created_at at time zone 'America/Argentina/Buenos_Aires')::date) as dias,
           min(created_at) as primera,
           max(created_at) as ultima,
           -- El resultado de la PRIMERA busqueda: es el que define si la
           -- primera impresion fue "encontre" o "no hay nada".
           (array_agg(resultados order by created_at))[1] as resultados_primera
    from marcadas
    group by visitante
  )
  select jsonb_build_object(

    -- 1) Cobertura. Va PRIMERO porque sin esto la tasa de regreso se lee como
    -- si fuera la verdad desde el dia uno, y arranca sobre casi nada.
    'cobertura', (
      select jsonb_build_object(
        'busquedas_totales', count(*),
        'con_visitante', count(visitante),
        'midiendo_desde', min(created_at) filter (where visitante is not null)
      )
      from public.busquedas
      where resultados is not null
    ),

    -- 2) El numero que se buscaba.
    'visitantes', (select count(*) from por_visitante),
    'volvieron',  (select count(*) from por_visitante where dias > 1),
    'habituales', (select count(*) from por_visitante where dias > 2),

    -- 3) Cuanto tardan en volver. La MEDIANA y no el promedio: un solo
    -- visitante que reaparece a los dos meses corre el promedio y hace creer
    -- que la gente vuelve mas tarde de lo que vuelve.
    'dias_hasta_volver_mediana', (
      select round(percentile_cont(0.5) within group (
               order by extract(epoch from (ultima - primera)) / 86400
             )::numeric, 1)
      from por_visitante
      where dias > 1
    ),

    -- 4) EL CRUCE QUE JUSTIFICA TODO ESTO: vuelve el que no encontro nada?
    'por_primera_busqueda', (
      select coalesce(jsonb_object_agg(k, jsonb_build_object(
               'visitantes', n, 'volvieron', v)), '{}'::jsonb)
      from (
        select case when resultados_primera = 0 then 'sin_resultados'
                    else 'con_resultados' end as k,
               count(*) as n,
               count(*) filter (where dias > 1) as v
        from por_visitante
        group by 1
      ) z
    )
  ) into r;

  return r;
end
$function$;

revoke all on function public.admin_recurrencia() from public, anon;
grant execute on function public.admin_recurrencia() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- VERIFICACION
-- =====================================================================
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'busquedas'
  and column_name = 'visitante';

-- =====================================================================
-- PARA DESHACER
--   drop function if exists public.admin_recurrencia();
--   drop index if exists public.busquedas_visitante_idx;
--   alter table public.busquedas drop constraint if exists busquedas_visitante_corto;
--   alter table public.busquedas drop column if exists visitante;
--   notify pgrst, 'reload schema';
-- =====================================================================
