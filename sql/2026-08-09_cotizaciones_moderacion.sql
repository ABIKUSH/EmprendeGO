-- =====================================================================
-- COTIZACIONES (RFQ) — moderacion desde el panel de admin.
-- Fecha: 2026-08-09
--
-- Se corre UNA sola vez, en el SQL editor de Supabase (proyecto
-- seubtijmyoahnyspvidq), con el rol por defecto (postgres).
--
-- Todo es ADITIVO: no toca las tablas solicitudes / cotizaciones, ni sus
-- policies, ni sus grants. Solo agrega una tabla nueva, dos triggers y
-- nueve funciones (2 de trigger, 6 RPCs del admin y el guard).
--
--   1) Bitacora de borrados  -> un pedido borrado deja rastro.
--   2) Tope de 5 pedidos por usuario por dia.
--   3) RPCs SECURITY DEFINER para que el admin vea y modere.
--
-- Por que RPCs y no GRANT: solicitudes.usuario_email esta REVOCADO de la
-- API a proposito (es PII). Darle GRANT SELECT lo abriria para cualquier
-- usuario logueado. Estas funciones corren como el dueño de la tabla y
-- responden solo si is_admin(), igual que admin_proveedores_privados().
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
--
-- Todo esto corre dentro de una transaccion: si alguna suposicion no se
-- cumple, la excepcion aborta el script ENTERO y la base queda como
-- estaba. Es preferible a que quede a medio aplicar.
-- ---------------------------------------------------------------------
do $$
declare
  v_col text;
begin
  if to_regclass('public.solicitudes') is null or to_regclass('public.cotizaciones') is null then
    raise exception 'Faltan las tablas solicitudes / cotizaciones.';
  end if;

  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    raise exception 'Falta public.is_admin(); las RPCs del admin se apoyan en ella.';
  end if;

  foreach v_col in array array['usuario_id','usuario_email','estado','cierra_at','titulo','respuestas']
  loop
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = 'public.solicitudes'::regclass
         and a.attname = v_col and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception 'A public.solicitudes le falta la columna %', v_col;
    end if;
  end loop;

  foreach v_col in array array['solicitud_id','proveedor_id','precio']
  loop
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = 'public.cotizaciones'::regclass
         and a.attname = v_col and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception 'A public.cotizaciones le falta la columna %', v_col;
    end if;
  end loop;

  -- Aviso, no error: si el FK no borra en cascada, eliminar un pedido con
  -- cotizaciones va a fallar por integridad referencial.
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.cotizaciones'::regclass
       and c.contype = 'f' and c.confrelid = 'public.solicitudes'::regclass
       and c.confdeltype = 'c'
  ) then
    raise notice 'OJO: cotizaciones -> solicitudes no parece ser ON DELETE CASCADE.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) BITACORA DE BORRADOS
--
-- Guarda la fila entera del pedido (incluido usuario_email) y una copia
-- de las cotizaciones que se van con el en cascada. Por eso NO tiene
-- grants y tiene RLS prendida sin policies: no se lee desde la API con
-- ninguna clave. El admin la mira por admin_cotiz_borrados().
-- ---------------------------------------------------------------------
create table if not exists public.solicitudes_borradas (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null,
  borrado_at     timestamptz not null default now(),
  borrado_por    uuid,                                  -- auth.uid() del que borro
  por_admin      boolean not null default false,
  tipo           text not null default 'solicitud',     -- 'solicitud' | 'cotizacion'
  datos          jsonb not null,                        -- la fila completa
  cotizaciones   jsonb not null default '[]'::jsonb,    -- las que se fueron en cascada
  cotizaciones_n integer not null default 0
);

create index if not exists idx_sol_borradas_fecha
  on public.solicitudes_borradas (borrado_at desc);

alter table public.solicitudes_borradas enable row level security;
revoke all on public.solicitudes_borradas from anon, authenticated;

-- El trigger es SECURITY DEFINER: escribe en la bitacora aunque el que
-- borra no tenga ningun permiso sobre ella.
create or replace function public.log_solicitud_borrada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cots jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb)
    into v_cots
    from public.cotizaciones c
   where c.solicitud_id = old.id;

  insert into public.solicitudes_borradas
    (solicitud_id, borrado_por, por_admin, tipo, datos, cotizaciones, cotizaciones_n)
  values
    (old.id,
     auth.uid(),
     -- lo marca la RPC del admin con set_config(); no se consulta is_admin()
     -- aca adentro para que un fallo de esa funcion no pueda romper un borrado
     -- normal de un comprador.
     coalesce(current_setting('eg.borrado_admin', true), '') = '1',
     'solicitud',
     to_jsonb(old),
     v_cots,
     jsonb_array_length(v_cots));

  return old;
end;
$$;

-- BEFORE DELETE y no AFTER: con AFTER, el borrado en cascada de
-- cotizaciones ya podria haber corrido y la copia saldria vacia.
drop trigger if exists trg_log_solicitud_borrada on public.solicitudes;
create trigger trg_log_solicitud_borrada
  before delete on public.solicitudes
  for each row execute function public.log_solicitud_borrada();


-- ---------------------------------------------------------------------
-- 2) TOPE DE PEDIDOS POR DIA (5 por usuario)
--
-- El mensaje de la excepcion se le muestra tal cual al usuario, asi que
-- esta escrito para que se entienda. El hint 'limite_diario' es lo que
-- mira js/cotizaciones.js para distinguirlo de un error de red.
-- ---------------------------------------------------------------------
create or replace function public.limite_solicitudes_por_dia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := new.usuario_id;
  v_desde timestamptz;
  v_n     integer;
begin
  if v_uid is null then
    return new;
  end if;

  -- Dia calendario argentino. Con UTC el tope se reiniciaria a las 21 hs.
  v_desde := date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
             at time zone 'America/Argentina/Buenos_Aires';

  select count(*) into v_n from (
    select s.created_at
      from public.solicitudes s
     where s.usuario_id = v_uid
       and s.created_at >= v_desde
    union all
    -- Los borrados cuentan igual: si no, alcanza con borrar y volver a
    -- publicar para saltarse el tope.
    select b.borrado_at
      from public.solicitudes_borradas b
     where b.tipo = 'solicitud'
       and b.datos->>'usuario_id' = v_uid::text
       and b.borrado_at >= v_desde
  ) t;

  if v_n >= 5 then
    raise exception 'Alcanzó el máximo de 5 pedidos por día. Puede volver a publicar mañana.'
      using errcode = 'P0001', hint = 'limite_diario';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limite_solicitudes on public.solicitudes;
create trigger trg_limite_solicitudes
  before insert on public.solicitudes
  for each row execute function public.limite_solicitudes_por_dia();


-- ---------------------------------------------------------------------
-- 3) RPCs DEL ADMIN
--
-- Devuelven jsonb en vez de una tabla tipada a proposito: asi un cambio
-- de tipo de columna en solicitudes no rompe la funcion con el clasico
-- "structure of query does not match function result type".
-- ---------------------------------------------------------------------

-- Corta la ejecucion si el que llama no es admin.
create or replace function public.admin_cotiz_guard()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un administrador puede hacer esto.' using errcode = '42501';
  end if;
end;
$$;

-- Listado de pedidos, mas nuevos primero, con el conteo real de
-- cotizaciones (no el contador denormalizado solicitudes.respuestas).
create or replace function public.admin_cotiz_solicitudes(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  perform public.admin_cotiz_guard();

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v
  from (
    select s.*,
           (select count(*) from public.cotizaciones c where c.solicitud_id = s.id) as cotizaciones_n
      from public.solicitudes s
     order by s.created_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) t;

  return v;
end;
$$;

-- Las cotizaciones de un pedido, con el nombre del proveedor que cotizo.
create or replace function public.admin_cotiz_cotizaciones(p_solicitud_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  perform public.admin_cotiz_guard();

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v
  from (
    select c.*,
           p.nombre    as proveedor_nombre,
           p.provincia as proveedor_provincia,
           p.whatsapp  as proveedor_whatsapp
      from public.cotizaciones c
      left join public.proveedores p on p.id = c.proveedor_id
     where c.solicitud_id = p_solicitud_id
  ) t;

  return v;
end;
$$;

-- La bitacora de borrados.
create or replace function public.admin_cotiz_borrados(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  perform public.admin_cotiz_guard();

  select coalesce(jsonb_agg(to_jsonb(t) order by t.borrado_at desc), '[]'::jsonb)
    into v
  from (
    select b.*
      from public.solicitudes_borradas b
     order by b.borrado_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) t;

  return v;
end;
$$;

-- Cerrar un pedido (deja de aparecer en el feed; las cotizaciones quedan).
create or replace function public.admin_cotiz_cerrar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_cotiz_guard();
  update public.solicitudes set estado = 'cerrada' where id = p_id;
end;
$$;

-- Eliminar un pedido. El trigger de la bitacora guarda la copia antes de
-- que se lo lleve el ON DELETE CASCADE.
create or replace function public.admin_cotiz_eliminar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_cotiz_guard();
  perform set_config('eg.borrado_admin', '1', true);   -- true = solo esta transaccion
  delete from public.solicitudes where id = p_id;
end;
$$;

-- Eliminar una sola cotizacion (ej: la nota tiene algo ofensivo).
-- Recalcula solicitudes.respuestas para que el contador no quede inflado.
create or replace function public.admin_cotiz_eliminar_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sol uuid;
  v_row jsonb;
begin
  perform public.admin_cotiz_guard();

  select c.solicitud_id, to_jsonb(c)
    into v_sol, v_row
    from public.cotizaciones c
   where c.id = p_id;

  if v_sol is null then
    return;
  end if;

  insert into public.solicitudes_borradas
    (solicitud_id, borrado_por, por_admin, tipo, datos)
  values
    (v_sol, auth.uid(), true, 'cotizacion', v_row);

  delete from public.cotizaciones where id = p_id;

  update public.solicitudes s
     set respuestas = (select count(*) from public.cotizaciones c where c.solicitud_id = s.id)
   where s.id = v_sol;
end;
$$;

-- Permisos: nadie sin sesion, y adentro cada funcion vuelve a chequear
-- is_admin(). El guard no se expone a la API.
revoke all on function public.admin_cotiz_guard()                     from public, anon, authenticated;
revoke all on function public.admin_cotiz_solicitudes(integer)        from public, anon;
revoke all on function public.admin_cotiz_cotizaciones(uuid)          from public, anon;
revoke all on function public.admin_cotiz_borrados(integer)           from public, anon;
revoke all on function public.admin_cotiz_cerrar(uuid)                from public, anon;
revoke all on function public.admin_cotiz_eliminar(uuid)              from public, anon;
revoke all on function public.admin_cotiz_eliminar_cotizacion(uuid)   from public, anon;

grant execute on function public.admin_cotiz_solicitudes(integer)      to authenticated;
grant execute on function public.admin_cotiz_cotizaciones(uuid)        to authenticated;
grant execute on function public.admin_cotiz_borrados(integer)         to authenticated;
grant execute on function public.admin_cotiz_cerrar(uuid)              to authenticated;
grant execute on function public.admin_cotiz_eliminar(uuid)            to authenticated;
grant execute on function public.admin_cotiz_eliminar_cotizacion(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACION
-- Esto se ejecuta solo y muestra en el panel de resultados lo que quedo
-- instalado. Tienen que aparecer 9 filas: 1 tabla, 6 funciones admin_cotiz_*
-- y 2 triggers.
-- =====================================================================
select 'tabla'   as tipo, 'solicitudes_borradas'::text as nombre
 where to_regclass('public.solicitudes_borradas') is not null
union all
select 'funcion', p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'admin\_cotiz%'
union all
select 'trigger', t.tgname::text
  from pg_trigger t
 where t.tgrelid = 'public.solicitudes'::regclass and not t.tgisinternal
order by 1, 2;

-- Nota: llamar a admin_cotiz_solicitudes() desde el SQL editor devuelve
-- "Solo un administrador puede hacer esto", porque is_admin() mira el JWT
-- y en el editor no hay ninguno. Eso confirma que el guard funciona; la
-- prueba de verdad es entrar a admin.html > Cotizaciones.


-- =====================================================================
-- PARA DESHACER TODO (solo si algo salio mal). Descomentar y correr:
--
--   drop trigger if exists trg_limite_solicitudes   on public.solicitudes;
--   drop trigger if exists trg_log_solicitud_borrada on public.solicitudes;
--   drop function if exists public.limite_solicitudes_por_dia();
--   drop function if exists public.log_solicitud_borrada();
--   drop function if exists public.admin_cotiz_solicitudes(integer);
--   drop function if exists public.admin_cotiz_cotizaciones(uuid);
--   drop function if exists public.admin_cotiz_borrados(integer);
--   drop function if exists public.admin_cotiz_cerrar(uuid);
--   drop function if exists public.admin_cotiz_eliminar(uuid);
--   drop function if exists public.admin_cotiz_eliminar_cotizacion(uuid);
--   drop function if exists public.admin_cotiz_guard();
--   -- La tabla va aparte y ultima: borrarla PIERDE el registro de borrados.
--   -- drop table if exists public.solicitudes_borradas;
--   notify pgrst, 'reload schema';
-- =====================================================================