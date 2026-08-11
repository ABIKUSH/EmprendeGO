-- =====================================================================
-- COTIZACIONES — feed publico para visitantes SIN sesion.
-- Fecha: 2026-08-11
--
-- Se corre UNA sola vez, en el SQL editor de Supabase (proyecto
-- seubtijmyoahnyspvidq), con el rol por defecto (postgres).
--
-- Problema: hasta ahora, el que entraba sin cuenta veia una pantalla que
-- le pedia iniciar sesion antes de mostrarle nada. No hay incentivo: no
-- sabe que hay adentro. La policy sol_select es TO authenticated y anon
-- no tiene ningun grant sobre public.solicitudes, asi que sin cuenta el
-- feed vuelve vacio.
--
-- Por que UNA FUNCION y no abrir la tabla a anon:
--
--   La clave anonima es publica (esta en el JS del sitio). Si a anon se le
--   dieran GRANT SELECT sobre comprador_nombre/comprador_foto y una policy
--   de lectura, cualquiera podria pegarle directo a PostgREST y bajarse la
--   lista completa de nombres y fotos de los compradores. Mascarar el
--   nombre en el frontend seria puramente cosmetico.
--
--   Con esta funcion, anon NO recibe ningun permiso sobre la tabla: solo
--   puede ejecutar esto, que devuelve ya recortado lo que corresponde.
--
-- Que sale y que NO sale:
--   SALE  : titulo, cantidad, rubro, provincia, detalles, presupuesto,
--           fechas, cantidad de respuestas y el nombre MASCARADO.
--   NO SALE: comprador_foto, usuario_id, usuario_email, y nada de la
--           tabla cotizaciones (los precios sigue viendolos solo el dueño
--           del pedido, por la RLS de siempre).
--
-- Todo es ADITIVO: no toca tablas, ni policies, ni grants existentes.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
-- Si algo no esta como se espera, la excepcion aborta el script entero.
-- ---------------------------------------------------------------------
do $$
declare
  v_col text;
begin
  if to_regclass('public.solicitudes') is null then
    raise exception 'Falta la tabla public.solicitudes.';
  end if;

  foreach v_col in array array['id','created_at','cierra_at','estado','titulo',
                               'cantidad','rubro','provincia','detalles',
                               'presupuesto','respuestas','comprador_nombre']
  loop
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = 'public.solicitudes'::regclass
         and a.attname = v_col and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception 'A public.solicitudes le falta la columna %', v_col;
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 1) NOMBRE MASCARADO
--
-- "María Rodríguez"            -> "María R."
-- "Ana"                        -> "Ana"
-- "buschiazzomariadelrosario"  -> "Emprendedor"
--
-- El ultimo caso importa: muchos nombres llegan como un solo token pegado
-- (suele ser el handle de Instagram o el mail sin arroba). Recortarlo
-- quedaria feo y publicarlo entero es justo lo que se quiere evitar, asi
-- que cae en el generico.
--
-- Los espacios se normalizan ANTES de partir: con "juan  perez" (dos
-- espacios), split_part(...,' ',2) devuelve vacio y salia "Juan ." con la
-- inicial colgada. El regexp cubre tambien tabs y saltos de linea.
--
-- IMMUTABLE para que se pueda usar libremente adentro de la consulta.
-- ---------------------------------------------------------------------
create or replace function public.cotiz_nombre_publico(p_nombre text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  with n as (
    select regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g') as v
  )
  select case
    when v = '' then 'Emprendedor'
    when position(' ' in v) > 0 then
         initcap(split_part(v, ' ', 1)) || ' ' || upper(left(split_part(v, ' ', 2), 1)) || '.'
    when length(v) <= 12 then initcap(v)
    else 'Emprendedor'
  end
  from n;
$$;


-- ---------------------------------------------------------------------
-- 2) EL FEED PUBLICO
--
-- SECURITY DEFINER: corre como el dueño de la tabla, asi que se saltea la
-- RLS a proposito. Por eso el filtro de "solo pedidos abiertos y vigentes"
-- va ACA ADENTRO y no se puede eludir desde afuera: quien llama solo
-- elige cuantas filas quiere, y aun eso queda topeado.
--
-- Devuelve jsonb, igual que las RPCs del admin, para que un cambio de tipo
-- de columna no rompa la funcion con el clasico "structure of query does
-- not match function result type".
-- ---------------------------------------------------------------------
create or replace function public.cotiz_feed_publico(p_limit integer default 60)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select s.id,
           s.created_at,
           s.cierra_at,
           s.titulo,
           s.cantidad,
           s.rubro,
           s.provincia,
           s.detalles,
           s.presupuesto,
           s.respuestas,
           public.cotiz_nombre_publico(s.comprador_nombre) as comprador_nombre
      from public.solicitudes s
     where s.estado = 'abierta'
       and s.cierra_at > now()
     order by s.created_at desc
     limit greatest(1, least(coalesce(p_limit, 60), 100))
  ) t;
$$;


-- ---------------------------------------------------------------------
-- 3) PERMISOS
--
-- Solo EXECUTE, y solo sobre estas funciones. anon sigue sin ningun
-- permiso sobre public.solicitudes: si se borrara esta funcion, el
-- visitante sin sesion volveria a no ver nada, no a ver de mas.
--
-- authenticated no la necesita (lee la tabla directo, con la RLS de
-- siempre y con el nombre completo), asi que no se le otorga.
-- ---------------------------------------------------------------------
revoke all on function public.cotiz_nombre_publico(text) from public, anon, authenticated;
revoke all on function public.cotiz_feed_publico(integer) from public, anon, authenticated;

grant execute on function public.cotiz_feed_publico(integer) to anon;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACION
-- Tiene que devolver las dos funciones, y cotiz_feed_publico con
-- prosecdef = true (security definer).
-- =====================================================================
select p.proname::text as funcion,
       p.prosecdef     as security_definer,
       coalesce(array_to_string(array(
         select r.rolname::text
           from pg_roles r
          where has_function_privilege(r.oid, p.oid, 'EXECUTE')
            and r.rolname in ('anon','authenticated')
       ), ', '), '(ninguno)') as puede_ejecutar
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('cotiz_feed_publico','cotiz_nombre_publico')
 order by 1;


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   drop function if exists public.cotiz_feed_publico(integer);
--   drop function if exists public.cotiz_nombre_publico(text);
--   notify pgrst, 'reload schema';
--
-- El frontend degrada solo: sin la funcion, el feed del visitante sin
-- sesion vuelve vacio y se le muestra el cartel de siempre.
-- =====================================================================