-- =====================================================================
-- COTIZACIONES — unidad de medida del pedido.
-- Fecha: 2026-08-12
--
-- YA APLICADA en el proyecto seubtijmyoahnyspvidq. Queda en el repo como
-- registro: NO hace falta correrla a mano. Es idempotente igual.
--
-- Problema real, con un pedido en la mano: entro "textil, 100 unidades,
-- hasta $100.000/u". "100 unidades" de textil no quiere decir nada. Podian
-- ser 100 metros, 100 rollos o 100 prendas, y cada una es una operacion
-- distinta (y un precio por unidad distinto). El proveedor no puede cotizar
-- eso sin preguntar, y preguntar no puede: no ve el contacto del comprador.
--
-- La palabra "unidades" estaba hardcodeada en el frontend al lado de la
-- cantidad. Esta columna la reemplaza por lo que el comprador elija.
--
-- Todo es ADITIVO: no toca datos, ni policies, ni grants existentes. Los
-- pedidos ya publicados quedan con unidad NULL y el frontend los sigue
-- mostrando como "unidades", que es lo que decian antes.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
-- Si algo no esta como se espera, la excepcion aborta el script entero.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.solicitudes') is null then
    raise exception 'Falta la tabla public.solicitudes.';
  end if;
  -- to_regprocedure (no to_regproc): la firma con argumentos solo la resuelve
  -- esta. Con to_regproc devuelve NULL siempre y el chequeo aborta de gusto.
  if to_regprocedure('public.cotiz_feed_publico(integer)') is null then
    raise exception 'Falta la funcion public.cotiz_feed_publico(integer).';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) LA COLUMNA
--
-- Lista cerrada por CHECK y no una tabla aparte: son nueve valores que no
-- cambian, los elige un <select> del frontend y nunca se muestran fuera de
-- esa lista. El CHECK es la unica garantia real de que no entre texto libre
-- por la API (la clave anonima es publica: cualquiera puede postear).
-- ---------------------------------------------------------------------
alter table public.solicitudes add column if not exists unidad text;

alter table public.solicitudes drop constraint if exists solicitudes_unidad_chk;
alter table public.solicitudes add constraint solicitudes_unidad_chk
  check (unidad is null or unidad in
    ('unidades','pares','metros','rollos','kilos','cajas','docenas','packs','litros'));


-- ---------------------------------------------------------------------
-- 2) GRANTS POR COLUMNA
--
-- ADD COLUMN no hereda los grants de la tabla: sin esto, el INSERT del
-- frontend se cae con 42501 y la lectura devuelve 403 (es exactamente lo
-- que le pasa hoy a cierra_at, que a proposito no tiene INSERT).
--
-- UPDATE no se otorga: hoy no hay forma de editar un pedido publicado, y
-- el unico UPDATE que puede hacer el dueño es estado -> 'cerrada'.
-- anon no recibe nada: sigue leyendo solo por cotiz_feed_publico().
-- ---------------------------------------------------------------------
grant select (unidad) on public.solicitudes to authenticated;
grant insert (unidad) on public.solicitudes to authenticated;


-- ---------------------------------------------------------------------
-- 3) EL FEED PUBLICO TIENE QUE DEVOLVERLA
--
-- La funcion lista las columnas una por una, asi que una columna nueva no
-- aparece sola: sin esto, el visitante sin sesion veria "100 unidades"
-- donde el dueño del pedido ve "100 rollos".
--
-- Se reescribe entera (create or replace conserva los grants). Lo unico
-- que cambia respecto de 2026-08-11_cotizaciones_feed_publico.sql es la
-- linea s.unidad.
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
           s.unidad,
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

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACION
-- Tiene que devolver una fila: unidad, con select_ok e insert_ok en true.
-- =====================================================================
select 'unidad' as columna,
       has_column_privilege('authenticated', 'public.solicitudes', 'unidad', 'SELECT') as select_ok,
       has_column_privilege('authenticated', 'public.solicitudes', 'unidad', 'INSERT') as insert_ok,
       has_column_privilege('anon', 'public.solicitudes', 'unidad', 'SELECT') as anon_no_lee;


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   alter table public.solicitudes drop constraint if exists solicitudes_unidad_chk;
--   alter table public.solicitudes drop column if exists unidad;
--   -- y volver a correr 2026-08-11_cotizaciones_feed_publico.sql, que
--   -- deja la funcion sin s.unidad.
--   notify pgrst, 'reload schema';
--
-- Ojo: dropear la columna borra la unidad de los pedidos ya publicados.
-- =====================================================================
