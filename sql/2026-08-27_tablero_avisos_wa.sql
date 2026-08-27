-- =====================================================================
-- Tablero del embudo de avisos por WhatsApp  (2026-08-27)
--
-- POR QUE EXISTE
-- `avisos_wa` guarda desde el 26-08 entregado_at / leido_at / respondio_at,
-- y no habia ningun lugar donde mirarlos. Sin eso no se puede contestar la
-- pregunta del MVP -- "el proveedor cotiza mas rapido si se entera por
-- WhatsApp?" -- porque no se distingue "lo leyo y no le sirvio" (problema del
-- mensaje) de "nunca le llego" (problema del canal).
--
-- POR QUE UNA FUNCION Y NO UN SELECT DESDE EL PANEL
-- `avisos_wa` tiene RLS activada y CERO policies y CERO grants a proposito:
-- adentro hay telefonos de proveedores y solo la ve el service-role. Esta
-- funcion es SECURITY DEFINER, o sea que corre con los permisos del dueño y
-- puede leer la tabla, pero devuelve UNICAMENTE agregados: ningun telefono,
-- ningun wa_message_id, ningun id de fila. Aunque se filtrara el resultado,
-- no hay dato personal adentro.
--
-- QUE NO TOCA
-- No modifica ninguna tabla, ninguna policy y ningun grant existente. Es
-- puramente aditivo: se puede borrar con un DROP FUNCTION y todo sigue igual.
-- =====================================================================

create or replace function public.admin_wa_embudo()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
begin
  -- Mismo porton que el resto del panel: si no sos admin, 42501 y chau.
  -- Se reusa a proposito en vez de escribir un chequeo nuevo.
  perform public.admin_cotiz_guard();

  select jsonb_build_object(

    -- 1) El embudo crudo, en tres ventanas. 'reservados' son todas las filas:
    --    la fila se reserva ANTES de mandar, asi que reservados = enviados +
    --    fallos + lo que quedo colgado.
    'ventana', jsonb_build_object(
      'd7',  (select jsonb_build_object(
                'reservados', count(*),
                'enviados',   count(*) filter (where estado = 'enviado'),
                'fallos',     count(*) filter (where estado = 'fallo'),
                'entregados', count(entregado_at),
                'leidos',     count(leido_at),
                'respondieron', count(respondio_at))
              from public.avisos_wa where created_at > now() - interval '7 days'),
      'd30', (select jsonb_build_object(
                'reservados', count(*),
                'enviados',   count(*) filter (where estado = 'enviado'),
                'fallos',     count(*) filter (where estado = 'fallo'),
                'entregados', count(entregado_at),
                'leidos',     count(leido_at),
                'respondieron', count(respondio_at))
              from public.avisos_wa where created_at > now() - interval '30 days'),
      'todo', (select jsonb_build_object(
                'reservados', count(*),
                'enviados',   count(*) filter (where estado = 'enviado'),
                'fallos',     count(*) filter (where estado = 'fallo'),
                'entregados', count(entregado_at),
                'leidos',     count(leido_at),
                'respondieron', count(respondio_at))
              from public.avisos_wa)
    ),

    -- 2) El experimento. El grupo de control sale gratis: son los pedidos que
    --    se publicaron sin que saliera ningun aviso (los de rubro "Otro" y
    --    todos los anteriores al lanzamiento). Se comparan tasas, no totales.
    'efecto', (
      select jsonb_build_object(
        'con_aviso', jsonb_build_object(
          'pedidos',   count(*) filter (where avisados > 0),
          'con_cotiz', count(*) filter (where avisados > 0 and cotiz > 0)),
        'sin_aviso', jsonb_build_object(
          'pedidos',   count(*) filter (where avisados = 0),
          'con_cotiz', count(*) filter (where avisados = 0 and cotiz > 0)))
      from (
        select (select count(*) from public.avisos_wa a
                 where a.solicitud_id = s.id and a.estado = 'enviado') as avisados,
               (select count(*) from public.cotizaciones c
                 where c.solicitud_id = s.id) as cotiz
          from public.solicitudes s
      ) x
    ),

    -- 3) La otra mitad de la hipotesis: no solo SI cotiza, sino CUANDO. Horas
    --    promedio entre que se publica el pedido y entra la primera cotizacion.
    --    Los pedidos que nunca recibieron nada no entran en el promedio.
    'velocidad', (
      select jsonb_build_object(
        'con_aviso', round(avg(horas) filter (where avisados > 0)::numeric, 1),
        'sin_aviso', round(avg(horas) filter (where avisados = 0)::numeric, 1))
      from (
        select (select count(*) from public.avisos_wa a
                 where a.solicitud_id = s.id and a.estado = 'enviado') as avisados,
               extract(epoch from (
                 (select min(c.created_at) from public.cotizaciones c
                   where c.solicitud_id = s.id) - s.created_at)) / 3600 as horas
          from public.solicitudes s
      ) v
      where horas is not null
    ),

    -- 4) Atribucion fina: de los proveedores a los que se les toco el timbre,
    --    cuantos cotizaron ESE pedido despues del aviso. El "despues" importa:
    --    si ya habia cotizado antes, el aviso no hizo nada.
    'atribuido', (
      select jsonb_build_object('avisos', count(*), 'cotizaron', count(*) filter (where cotizo))
      from (
        select exists (
                 select 1 from public.cotizaciones c
                  where c.solicitud_id = a.solicitud_id
                    and c.proveedor_id = a.proveedor_id
                    and c.created_at >= a.created_at) as cotizo
          from public.avisos_wa a where a.estado = 'enviado'
      ) y
    ),

    -- 5) Por rubro. Sirve para dos cosas distintas: ver donde el aviso rinde,
    --    y ver que rubros piden mucho y no tienen a quien avisarle.
    'por_rubro', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
        select s.rubro,
               count(*) as pedidos,
               count(*) filter (where av.n > 0) as con_aviso,
               coalesce(sum(av.n), 0) as destinatarios,
               count(*) filter (where co.n > 0) as con_cotiz
          from public.solicitudes s
          left join lateral (select count(*) n from public.avisos_wa a
                              where a.solicitud_id = s.id and a.estado = 'enviado') av on true
          left join lateral (select count(*) n from public.cotizaciones c
                              where c.solicitud_id = s.id) co on true
         group by s.rubro
         order by count(*) desc, s.rubro
      ) r
    ),

    -- 6) Los que fallaron, agrupados por motivo. Un motivo que se repite es
    --    un problema de configuracion, no mala suerte.
    'fallos', (
      select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from (
        select coalesce(nullif(left(error, 120), ''), '(sin detalle)') as motivo,
               count(*) as n, max(created_at) as ultimo
          from public.avisos_wa where estado = 'fallo'
         group by 1 order by 2 desc limit 10
      ) f
    ),

    -- 7) Los que reciben y nunca contestan. Son los primeros candidatos a
    --    salir del reparto el dia que subamos el tope de destinatarios, y de
    --    paso son los que mas riesgo traen de que reporten el numero.
    'mudos', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (
        select p.nombre, p.rubro, count(*) as recibidos,
               count(a.leido_at) as leidos, max(a.created_at) as ultimo
          from public.avisos_wa a
          join public.proveedores p on p.id = a.proveedor_id
         where a.estado = 'enviado'
         group by p.id, p.nombre, p.rubro
        having count(*) >= 2
           and not exists (select 1 from public.cotizaciones c where c.proveedor_id = p.id)
         order by count(*) desc limit 20
      ) m
    )

  ) into v;

  return v;
end;
$function$;

-- Nadie sin sesion puede llamarla. El guard de adentro ademas exige ser admin,
-- asi que un usuario logueado cualquiera se come un 42501.
revoke all on function public.admin_wa_embudo() from public, anon;
grant execute on function public.admin_wa_embudo() to authenticated;

notify pgrst, 'reload schema';
