-- 2026-10-08 — LA RECURRENCIA DEL QUE COMPRA, no del que mira.
--
-- POR QUE: `admin_recurrencia()` ya mide si un VISITANTE vuelve a buscar otro
-- día, con el id de navegador que viaja en `busquedas`. Eso contesta "¿la gente
-- vuelve al buscador?". Lo que no contesta -y es la pregunta que define si esto
-- es un marketplace o un directorio- es:
--
--   ¿el que ya le pidió el WhatsApp a un mayorista vuelve a pedirle a otro?
--
-- Un directorio se usa una vez: buscás proveedor, lo encontrás, no volvés. Un
-- marketplace se usa seguido: te surtís de varios, cambiás, comparás. La
-- diferencia entre los dos vale toda la valuación, y hasta hoy no se medía.
--
-- ⚠️ ESTO RECIEN EMPIEZA A CONTAR EL 2026-10-08 Y HAY UN MOTIVO FEO.
-- `contactos_revelados` existe desde el 1 de octubre, pero estuvo SIEMPRE
-- vacía: la función que la escribe se creó declarada STABLE y Postgres no deja
-- escribir desde una función no volátil, así que fallaba en la primera llamada
-- de cualquier persona (ver sql/2026-10-08_whatsapp_volatile.sql). O sea que
-- esta medición arranca hoy, con cero historia, y lo mismo que pasa con el id
-- de visitante pasa acá: los 4.591 contactos anteriores no se pueden recuperar
-- porque nunca se guardó quién los hizo.
--
-- ⚠️ SOLO AGREGADOS, igual que `admin_wa_embudo()`. No sale un id de usuario,
-- ni un id de proveedor, ni una fila. Si mañana hace falta un corte nuevo, se
-- agrega ADENTRO de esta función; no se abre la tabla.
--
-- ⚠️ NO SE TOCA NADA DE LO QUE YA DEVOLVIA. Se agrega una clave `compradores`
-- al jsonb y el panel la pinta aparte. `test/recurrencia.test.js` comprueba las
-- claves viejas y tiene que seguir pasando.
--
-- PARA DESHACER: volver a la definición anterior, que es esta misma sin el
-- bloque 'compradores'.

create or replace function public.admin_recurrencia()
returns jsonb
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r jsonb;
begin
  perform public.admin_cotiz_guard();

  with marcadas as (
    select visitante,
           created_at,
           coalesce(resultados, 0) as resultados
    from public.busquedas
    where visitante is not null
      and resultados is not null
  ),
  por_visitante as (
    select visitante,
           count(distinct (created_at at time zone 'America/Argentina/Buenos_Aires')::date) as dias,
           min(created_at) as primera,
           max(created_at) as ultima,
           (array_agg(resultados order by created_at))[1] as resultados_primera
    from marcadas
    group by visitante
  ),
  -- El que pidió al menos un teléfono. Una fila por persona.
  por_comprador as (
    select usuario_id,
           count(*) as pedidos,
           count(distinct proveedor_id) as proveedores,
           count(distinct (revelado_at at time zone 'America/Argentina/Buenos_Aires')::date) as dias,
           min(revelado_at) as primero,
           max(revelado_at) as ultimo
    from public.contactos_revelados
    group by usuario_id
  )
  select jsonb_build_object(
    'cobertura', (
      select jsonb_build_object(
        'busquedas_totales', count(*),
        'con_visitante', count(visitante),
        'midiendo_desde', min(created_at) filter (where visitante is not null)
      )
      from public.busquedas
      where resultados is not null
    ),
    'visitantes', (select count(*) from por_visitante),
    'volvieron',  (select count(*) from por_visitante where dias > 1),
    'habituales', (select count(*) from por_visitante where dias > 2),
    'dias_hasta_volver_mediana', (
      select round(percentile_cont(0.5) within group (
               order by extract(epoch from (ultima - primera)) / 86400
             )::numeric, 1)
      from por_visitante
      where dias > 1
    ),
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
    ),
    -- ── El bloque nuevo ──────────────────────────────────────────────────
    'compradores', (
      select jsonb_build_object(
        -- Cuánta gente pidió al menos un teléfono.
        'compradores', count(*),
        -- La que define directorio vs marketplace: pidió a MAS DE UN mayorista.
        'mas_de_un_proveedor', count(*) filter (where proveedores > 1),
        -- Y la más exigente: volvió OTRO DIA. Un día distinto es una decisión
        -- nueva; dos pedidos en la misma sesión son la misma búsqueda.
        'volvieron_otro_dia', count(*) filter (where dias > 1),
        'tres_o_mas_proveedores', count(*) filter (where proveedores >= 3),
        'pedidos_totales', coalesce(sum(pedidos), 0),
        'proveedores_por_comprador_promedio',
          round(coalesce(avg(proveedores), 0)::numeric, 2),
        'midiendo_desde', (select min(revelado_at) from public.contactos_revelados),
        'dias_hasta_volver_mediana', (
          select round(percentile_cont(0.5) within group (
                   order by extract(epoch from (ultimo - primero)) / 86400
                 )::numeric, 1)
          from por_comprador where dias > 1
        )
      )
      from por_comprador
    )
  ) into r;

  return r;
end
$function$;

revoke all on function public.admin_recurrencia() from public, anon;
grant execute on function public.admin_recurrencia() to authenticated;
