-- =====================================================================
-- HOME — un ejemplo real de "pedís una vez, te cotizan varios".
-- Fecha: 2026-08-20
--
-- CORRER A MANO en el editor SQL de Supabase (proyecto seubtijmyoahnyspvidq).
--
-- ORDEN: después de sql/2026-08-20_pedidos_de_proveedor.sql, que es la que
-- crea cotizaciones.tipo. El chequeo previo lo verifica y aborta si falta.
--
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- =====================================================================
-- POR QUÉ
--
-- El home nuevo tiene un bloque "Así funciona" que no explica qué es pedir
-- una cotización: muestra un pedido real y las respuestas que recibió.
-- Mostrar el mecanismo es lo único que enseña un modelo que nadie conoce
-- todavía — hay 16.745 búsquedas por mes y sólo 5 pedidos publicados.
--
-- El problema es que los precios de una cotización NO son públicos. La
-- policy cot_select los deja ver únicamente al comprador dueño del pedido
-- (o al proveedor que la mandó, o a un admin). Es a propósito: si los
-- precios fueran legibles, la competencia se llevaría la lista entera.
--
-- Entonces esta función es la excepción angosta y explícita: devuelve UN
-- ejemplo, ya recortado, para el home.
--
-- =====================================================================
-- QUÉ SE MUESTRA Y QUÉ NO
--
--   SÍ  el título del pedido, su rubro, su provincia y cuándo se publicó
--       (todo eso YA es público: sale en el feed de Cotizaciones)
--   SÍ  el precio de cada respuesta, el mínimo y la condición de envío
--   NO  el nombre del proveedor -> van sus INICIALES
--   NO  nada del comprador: ni nombre, ni foto, ni usuario_id
--   NO  el id de la cotización ni el del proveedor
--
-- Lo que convence del bloque es ver TRES PRECIOS DISTINTOS para el mismo
-- pedido, no de quién son. Las iniciales alcanzan para que se lean como
-- tres casas distintas, que es todo lo que tiene que transmitir.
--
-- ⚠️ Si algún día se quiere mostrar el nombre completo, que sea con el
-- consentimiento del proveedor y con una columna que lo registre. NO se
-- resuelve sacándole el enmascarado a esta función.
--
-- =====================================================================
-- POR QUÉ SECURITY DEFINER Y POR QUÉ ES SEGURO
--
-- Corre con los permisos del dueño, así que se saltea la RLS. Eso la
-- vuelve peligrosa por definición, y por eso:
--   1. NO recibe parámetros. No hay nada que inyectar ni que enumerar:
--      siempre devuelve el mismo ejemplo para todo el mundo.
--   2. search_path fijo a public, pg_temp.
--   3. Devuelve como máximo 3 respuestas de 1 solo pedido.
--   4. La lista de columnas es explícita. Nunca un select *: una columna
--      nueva en cotizaciones no puede colarse sola al home.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.solicitudes') is null then
    raise exception 'Falta la tabla public.solicitudes.';
  end if;
  if to_regclass('public.cotizaciones') is null then
    raise exception 'Falta la tabla public.cotizaciones.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='cotizaciones' and column_name='tipo'
  ) then
    raise exception
      'Falta cotizaciones.tipo: correr antes sql/2026-08-20_pedidos_de_proveedor.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) INICIALES DE UN NOMBRE COMERCIAL
--
-- Se saca lo que no sea letra o espacio antes de cortar: hay proveedores
-- cargados como "@VisioWipe" o "EMA IMPORTADORA", y unas iniciales "@V"
-- se leerían como un error de la página.
-- ---------------------------------------------------------------------
create or replace function public.eg_iniciales(p_nombre text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(
      upper(substr(regexp_replace(btrim(coalesce(p_nombre,'')), '[^[:alpha:] ]', '', 'g'), 1, 2)),
      ''),
    '??');
$$;

-- ---------------------------------------------------------------------
-- 2) EL EJEMPLO
--
-- Elige el pedido ABIERTO más reciente que tenga al menos 2 cotizaciones
-- con precio. Con una sola respuesta el bloque no demuestra nada: la idea
-- entera es que te cotizan VARIOS.
--
-- Sólo pedidos tipo 'producto': los de tipo 'proveedor' se responden con
-- un remito de cobertura y no tienen precio por unidad, así que no sirven
-- para mostrar tres precios comparados.
-- ---------------------------------------------------------------------
create or replace function public.cotiz_ejemplo_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sol   record;
  v_resps jsonb;
begin
  select s.id, s.titulo, s.rubro, s.provincia, s.created_at, s.unidad
    into v_sol
  from public.solicitudes s
  where s.estado = 'abierta'
    and s.cierra_at > now()
    and coalesce(s.tipo, 'producto') = 'producto'
    and (
      select count(*) from public.cotizaciones c
      where c.solicitud_id = s.id and c.precio is not null
    ) >= 2
  order by s.created_at desc
  limit 1;

  if v_sol.id is null then
    -- Sin ejemplo de verdad no se inventa uno: el frontend deja el bloque
    -- oculto y el home queda con el hero y la mercadería.
    return null;
  end if;

  select jsonb_agg(x.fila order by x.precio asc)
    into v_resps
  from (
    select
      c.precio,
      jsonb_build_object(
        'iniciales',  public.eg_iniciales(p.nombre),
        'nombre',     'Un mayorista verificado',
        'precio_txt', '$' || to_char(c.precio, 'FM999G999G999'),
        'minimo',     nullif(btrim(coalesce(c.minimo, '')), ''),
        'envio',      nullif(btrim(coalesce(c.pagos, '')), '')
      ) as fila
    from public.cotizaciones c
    join public.proveedores p on p.id = c.proveedor_id
    where c.solicitud_id = v_sol.id
      and c.precio is not null
    order by c.precio asc
    limit 3
  ) x;

  return jsonb_build_object(
    'titulo',     v_sol.titulo,
    'rubro',      v_sol.rubro,
    'provincia',  v_sol.provincia,
    'created_at', v_sol.created_at,
    'respuestas', coalesce(v_resps, '[]'::jsonb)
  );
end $$;

-- El home lo ve todo el mundo, con sesión y sin ella.
revoke all on function public.cotiz_ejemplo_home() from public;
grant execute on function public.cotiz_ejemplo_home() to anon, authenticated;

revoke all on function public.eg_iniciales(text) from public;
grant execute on function public.eg_iniciales(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;


-- =====================================================================
-- COMPROBACIONES. Mirar que todas digan BIEN.
-- =====================================================================
drop table if exists prueba_ejemplo;
create temp table prueba_ejemplo (que text, resultado text);

do $$
declare
  v jsonb;
  v_txt text;
begin
  -- a) la función existe y es SECURITY DEFINER
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname = 'cotiz_ejemplo_home' and pr.prosecdef
  ) then
    insert into prueba_ejemplo values ('a) funcion SECURITY DEFINER', 'BIEN: existe');
  else
    insert into prueba_ejemplo values ('a) funcion SECURITY DEFINER', 'MAL: no esta o no es definer');
  end if;

  -- b) search_path fijo (sin esto, un schema malicioso puede secuestrarla)
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname='public' and pr.proname='cotiz_ejemplo_home'
      and array_to_string(pr.proconfig, ',') like '%search_path%'
  ) then
    insert into prueba_ejemplo values ('b) search_path fijo', 'BIEN: fijado');
  else
    insert into prueba_ejemplo values ('b) search_path fijo', 'MAL: sin fijar');
  end if;

  -- c) anon la puede ejecutar (el home lo ve gente sin sesion)
  if has_function_privilege('anon', 'public.cotiz_ejemplo_home()', 'execute') then
    insert into prueba_ejemplo values ('c) anon puede ejecutarla', 'BIEN: otorgado');
  else
    insert into prueba_ejemplo values ('c) anon puede ejecutarla', 'MAL: falta el grant');
  end if;

  -- d) las iniciales limpian los caracteres raros
  if public.eg_iniciales('@VisioWipe') = 'VI' and public.eg_iniciales('EMA IMPORTADORA') = 'EM' then
    insert into prueba_ejemplo values ('d) iniciales sin caracteres raros', 'BIEN: "@VisioWipe" -> VI');
  else
    insert into prueba_ejemplo values ('d) iniciales sin caracteres raros',
      'MAL: dio "' || public.eg_iniciales('@VisioWipe') || '"');
  end if;

  -- e) corre y devuelve algo con la forma esperada (o null si no hay ejemplo)
  v := public.cotiz_ejemplo_home();
  if v is null then
    insert into prueba_ejemplo values ('e) devuelve un ejemplo',
      'OJO: todavia no hay ningun pedido abierto con 2+ cotizaciones. El bloque no se va a pintar, y esta bien.');
  elsif (v ? 'titulo') and (v ? 'respuestas') then
    insert into prueba_ejemplo values ('e) devuelve un ejemplo',
      'BIEN: ' || jsonb_array_length(v->'respuestas') || ' respuestas');
  else
    insert into prueba_ejemplo values ('e) devuelve un ejemplo', 'MAL: forma inesperada');
  end if;

  -- f) NO se escapa el nombre del proveedor
  v_txt := coalesce(v::text, '');
  if v is null then
    insert into prueba_ejemplo values ('f) sin nombres de proveedor', 'no aplica: no hay ejemplo todavia');
  elsif exists (
    select 1 from public.proveedores p
    where p.estado='aprobado' and length(btrim(p.nombre)) > 3
      and v_txt ilike '%' || btrim(p.nombre) || '%'
  ) then
    insert into prueba_ejemplo values ('f) sin nombres de proveedor', 'MAL: se filtro un nombre completo');
  else
    insert into prueba_ejemplo values ('f) sin nombres de proveedor', 'BIEN: solo iniciales');
  end if;

  -- g) NO se escapa nada del comprador
  if v is null then
    insert into prueba_ejemplo values ('g) sin datos del comprador', 'no aplica: no hay ejemplo todavia');
  elsif (v ? 'comprador_nombre') or (v ? 'usuario_id') or (v ? 'comprador_foto') then
    insert into prueba_ejemplo values ('g) sin datos del comprador', 'MAL: viaja algo del comprador');
  else
    insert into prueba_ejemplo values ('g) sin datos del comprador', 'BIEN: no viaja nada');
  end if;
end $$;

select * from prueba_ejemplo;


-- =====================================================================
-- PARA DESHACER. Descomentar y correr:
--
--   drop function if exists public.cotiz_ejemplo_home();
--   drop function if exists public.eg_iniciales(text);
--   notify pgrst, 'reload schema';
--
-- No rompe el home: cargarComoFunciona() falla, lo registra en la consola y
-- deja el bloque oculto, que es como se ve hasta que esto se corra.
-- =====================================================================
