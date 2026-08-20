-- =====================================================================
-- COTIZACIONES — foto del pedido.
-- Fecha: 2026-08-19
--
-- CORRER A MANO en el editor SQL de Supabase (proyecto seubtijmyoahnyspvidq)
-- ANTES de pushear la rama. Es idempotente: se puede correr dos veces.
--
-- POR QUE
-- El formulario ahora deja adjuntar una foto. No es un adorno: es la salida
-- para el comprador que no sabe como se llama tecnicamente lo que necesita.
-- "Una de esas cosas que van abajo de la mesa para que no raye el piso" no
-- se puede cotizar; una foto de un fieltro autoadhesivo si.
--
-- La imagen ya vive en Storage (bucket 'productos', carpeta 'pedidos/{uid}/').
-- Lo unico que falta es la columna donde guardar su URL.
--
-- SI ESTA MIGRACION NO SE CORRE
-- El frontend NO se rompe. Esta escrito para tolerarlo: al publicar, si la
-- base contesta que la columna no existe, reintenta el insert sin la foto y
-- avisa; y al leer el feed, si el select falla por lo mismo, lo repite sin
-- pedir la columna. Se pierde la foto, nunca el pedido.
--
-- Todo es ADITIVO: no toca datos, ni policies, ni grants existentes. Los
-- pedidos ya publicados quedan con foto_url NULL, que es lo que el frontend
-- ya sabe mostrar (o sea: nada).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
-- Si algo no esta como se espera, la excepcion aborta el script entero y no
-- queda la mitad aplicada.
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

  -- El paso 3 reescribe la funcion del feed publico. Si alguien le agrego
  -- columnas despues de 2026-08-12, este script se las borraria sin avisar.
  -- Mejor abortar y que alguien mire, antes que perder un campo en silencio.
  if (select count(*)
        from pg_get_functiondef('public.cotiz_feed_publico(integer)'::regprocedure) d
       where d like '%s.presupuesto%' and d like '%s.unidad%') = 0 then
    raise exception
      'cotiz_feed_publico no es la version esperada (2026-08-12). Revisela antes de reescribirla.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) LA COLUMNA
--
-- Con CHECK, y no texto libre. La clave anonima esta publicada en el JS del
-- sitio: cualquiera puede postear contra la API. Sin restriccion, este campo
-- seria un lugar gratis para colgar una URL arbitraria y que la app se la
-- muestre a los proveedores como si fuera parte de un pedido legitimo
-- (phishing con nuestra cara). Solo se aceptan URLs del Storage propio.
--
-- Es el mismo criterio que solicitudes.unidad: lo unico que garantiza de
-- verdad la forma del dato es la base, nunca el formulario.
-- ---------------------------------------------------------------------
alter table public.solicitudes add column if not exists foto_url text;

alter table public.solicitudes drop constraint if exists solicitudes_foto_url_chk;
alter table public.solicitudes add constraint solicitudes_foto_url_chk
  check (
    foto_url is null
    or (
      foto_url like 'https://seubtijmyoahnyspvidq.supabase.co/storage/v1/object/public/productos/pedidos/%'
      and length(foto_url) <= 500
    )
  );


-- ---------------------------------------------------------------------
-- 2) GRANTS POR COLUMNA
--
-- ADD COLUMN no hereda los grants de la tabla: sin esto el INSERT del
-- frontend se cae con 42501 y la lectura devuelve 403.
--
-- UPDATE no se otorga: hoy no hay forma de editar un pedido publicado, y el
-- unico UPDATE que puede hacer el dueño es estado -> 'cerrada'.
-- anon no recibe nada: sigue leyendo solo por cotiz_feed_publico(), que es
-- SECURITY DEFINER y por eso no necesita el grant.
-- ---------------------------------------------------------------------
grant select (foto_url) on public.solicitudes to authenticated;
grant insert (foto_url) on public.solicitudes to authenticated;


-- ---------------------------------------------------------------------
-- 3) EL FEED PUBLICO TIENE QUE DEVOLVERLA
--
-- La funcion lista las columnas una por una, asi que una columna nueva no
-- aparece sola: sin esto, el visitante sin sesion veria el pedido sin la
-- foto mientras que el que si tiene sesion la ve.
--
-- Se reescribe entera (create or replace conserva los grants). Lo unico que
-- cambia respecto de 2026-08-12_solicitudes_unidad.sql es la linea
-- s.foto_url. El chequeo del paso 0 se asegura de que se este reescribiendo
-- justo esa version y no otra mas nueva.
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
           s.foto_url,
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
-- Tiene que devolver UNA fila con:
--   columna = 'foto_url', select_ok = true, insert_ok = true,
--   anon_no_lee = false, tiene_check = true, feed_la_devuelve = true
-- =====================================================================
select 'foto_url' as columna,
       has_column_privilege('authenticated', 'public.solicitudes', 'foto_url', 'SELECT') as select_ok,
       has_column_privilege('authenticated', 'public.solicitudes', 'foto_url', 'INSERT') as insert_ok,
       has_column_privilege('anon',          'public.solicitudes', 'foto_url', 'SELECT') as anon_no_lee,
       exists (select 1 from pg_constraint
                where conname = 'solicitudes_foto_url_chk'
                  and conrelid = 'public.solicitudes'::regclass)                        as tiene_check,
       pg_get_functiondef('public.cotiz_feed_publico(integer)'::regprocedure)
         like '%s.foto_url%'                                                            as feed_la_devuelve;


-- =====================================================================
-- PRUEBA DEL CHECK (opcional, para convencerse de que filtra).
-- La primera tiene que FALLAR con "viola la restriccion de verificacion";
-- la segunda tiene que pasar. Correr las dos dentro de un rollback para no
-- dejar basura:
--
--   begin;
--     insert into public.solicitudes (titulo, foto_url)
--     values ('prueba check', 'https://sitio-cualquiera.com/foto.jpg');   -- debe fallar
--   rollback;
--
--   begin;
--     insert into public.solicitudes (titulo, foto_url)
--     values ('prueba check',
--       'https://seubtijmyoahnyspvidq.supabase.co/storage/v1/object/public/productos/pedidos/x/y.jpg');
--   rollback;
-- =====================================================================


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   alter table public.solicitudes drop constraint if exists solicitudes_foto_url_chk;
--   alter table public.solicitudes drop column if exists foto_url;
--   -- y volver a correr sql/2026-08-12_solicitudes_unidad.sql, que deja la
--   -- funcion del feed publico sin s.foto_url.
--   notify pgrst, 'reload schema';
--
-- Ojo: dropear la columna borra las fotos ya adjuntadas a pedidos abiertos.
-- Los archivos quedan en Storage (el bucket no tiene policy de DELETE), pero
-- se pierde el vinculo con el pedido.
-- =====================================================================
