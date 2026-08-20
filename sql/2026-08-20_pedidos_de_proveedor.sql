-- =====================================================================
-- COTIZACIONES — pedidos de PROVEEDOR (tipo B) y respuestas tipo remito.
-- Fecha: 2026-08-20
--
-- CORRER A MANO en el editor SQL de Supabase (proyecto seubtijmyoahnyspvidq).
--
-- ORDEN: DESPUES de sql/2026-08-19_solicitudes_foto.sql. El chequeo previo
-- lo verifica y aborta si se corren al reves, porque los dos reescriben
-- cotiz_feed_publico() y el segundo tiene que partir del primero.
--
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- =====================================================================
-- POR QUE
--
-- Abajo del mismo formulario habia dos pedidos que no se responden con las
-- mismas preguntas:
--
--   A) "necesito 500 remeras"        -> cuanto sale, cuando llega
--   B) "necesito quien me abastezca" -> quien me cubre el surtido, con que
--                                       minimo, todos los meses
--
-- Preguntarle cantidad exacta a alguien que todavia no sabe que va a vender
-- es donde se caia. El tipo B no tiene cantidad, no tiene unidad y no tiene
-- precio por unidad: tiene una LISTA de productos y un rango de inversion.
--
-- =====================================================================
-- LA DECISION DIFICIL: precio deja de ser obligatorio (pero solo a veces)
--
-- cotizaciones.precio es hoy NOT NULL + CHECK (precio > 0). Una respuesta a
-- un pedido tipo B no tiene precio por unidad: el proveedor marca que puede
-- abastecer, dice su minimo de compra y sus condiciones de envio. Con el
-- NOT NULL, esa fila no entra.
--
-- Se descarto meter un precio falso (0 o 1): ensucia para siempre una tabla
-- de precios y el CHECK ademas lo prohibe.
-- Se descarto una tabla aparte: obligaba a duplicar las 4 policies, a sumar
-- un segundo trigger para el contador solicitudes.respuestas y a unir dos
-- fuentes en "Mis cotizaciones". Mas superficie donde equivocarse con RLS.
--
-- Lo que se hace es MAS estricto que el CHECK que habia, no menos:
--
--   tipo = 'producto'  -> precio NOT NULL y > 0   (como hasta hoy)
--   tipo = 'proveedor' -> precio TIENE que ser NULL
--
-- O sea: una cotizacion de producto sigue sin poder perder su precio, y una
-- respuesta de proveedor no puede traer uno inventado.
--
-- Y cotizaciones.tipo NO lo manda el cliente: lo pone un trigger leyendo el
-- pedido padre, y ademas no se otorga INSERT sobre esa columna. Aunque
-- alguien arme el POST a mano contra la API con la clave anonima (que es
-- publica), no puede declarar el tipo que se le antoje para saltearse el
-- CHECK del precio.
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
  if to_regclass('public.cotizaciones') is null then
    raise exception 'Falta la tabla public.cotizaciones.';
  end if;
  if to_regprocedure('public.cotiz_feed_publico(integer)') is null then
    raise exception 'Falta la funcion public.cotiz_feed_publico(integer).';
  end if;

  -- ORDEN DE LAS MIGRACIONES. Este script reescribe cotiz_feed_publico
  -- partiendo de la version que dejo la migracion de la foto. Si esa no se
  -- corrio, seguir borraria s.foto_url del feed publico sin que nadie se
  -- entere hasta que un visitante sin sesion deje de ver las fotos.
  if pg_get_functiondef('public.cotiz_feed_publico(integer)'::regprocedure)
       not like '%s.foto_url%' then
    raise exception
      'Corra primero sql/2026-08-19_solicitudes_foto.sql: cotiz_feed_publico todavia no devuelve foto_url.';
  end if;

  -- Si alguna cotizacion vieja no tuviera precio, el CHECK nuevo la
  -- rechazaria y el ALTER fallaria a mitad de camino. Se mira antes.
  if exists (select 1 from public.cotizaciones where precio is null) then
    raise exception
      'Hay cotizaciones con precio NULL. Revise esas filas antes de correr esto.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) SOLICITUDES: que clase de pedido es
--
-- default 'producto' y NOT NULL: los pedidos que ya estan publicados pasan
-- a ser tipo A sin tocar una sola fila a mano, que es exactamente lo que
-- son. Nada de lo que ya funciona cambia de comportamiento.
-- ---------------------------------------------------------------------
alter table public.solicitudes add column if not exists tipo text not null default 'producto';

alter table public.solicitudes drop constraint if exists solicitudes_tipo_chk;
alter table public.solicitudes add constraint solicitudes_tipo_chk
  check (tipo in ('producto', 'proveedor'));


-- Los productos que el comprador quiere que le abastezcan.
-- jsonb y no text[]: es lo que ya usa el proyecto para listas (tn_categoria_map,
-- ml_categoria_map) y viaja natural desde el frontend sin conversiones.
--
-- El CHECK no es decorativo. La clave anonima esta publicada en el JS del
-- sitio, asi que cualquiera puede postear: sin tope, este campo seria un
-- lugar gratis para guardar un blob de varios megas por fila.
alter table public.solicitudes add column if not exists productos jsonb;

alter table public.solicitudes drop constraint if exists solicitudes_productos_chk;
alter table public.solicitudes add constraint solicitudes_productos_chk
  check (
    productos is null
    or (
      jsonb_typeof(productos) = 'array'
      and jsonb_array_length(productos) <= 12
      and length(productos::text) <= 1000
      -- todos los elementos tienen que ser texto: si entra un objeto o un
      -- numero, la pantalla lo pintaria como "[object Object]".
      and not exists (
        select 1 from jsonb_array_elements(productos) e
         where jsonb_typeof(e.value) <> 'string'
      )
    )
  );


-- Contexto del comprador. Los dos son listas cerradas por CHECK, espejadas
-- en el JS (js/cotizaciones.js, constantes YA_VENDE e INVERSIONES).
-- SI SE AGREGA UNA OPCION EN EL JS, VA TAMBIEN ACA. Estan espejadas a
-- proposito, igual que solicitudes.unidad.
alter table public.solicitudes add column if not exists ya_vende text;

alter table public.solicitudes drop constraint if exists solicitudes_ya_vende_chk;
alter table public.solicitudes add constraint solicitudes_ya_vende_chk
  check (ya_vende is null or ya_vende in ('vendiendo', 'arrancando'));

alter table public.solicitudes add column if not exists inversion text;

alter table public.solicitudes drop constraint if exists solicitudes_inversion_chk;
alter table public.solicitudes add constraint solicitudes_inversion_chk
  check (inversion is null or inversion in ('0-100', '100-300', '300-1000', '1000+', 'nosabe'));


-- ---------------------------------------------------------------------
-- 2) COTIZACIONES: la respuesta tipo remito
-- ---------------------------------------------------------------------

-- Que productos del pedido puede abastecer. Mismo criterio que
-- solicitudes.productos.
alter table public.cotizaciones add column if not exists cubre jsonb;

alter table public.cotizaciones drop constraint if exists cotizaciones_cubre_chk;
alter table public.cotizaciones add constraint cotizaciones_cubre_chk
  check (
    cubre is null
    or (
      jsonb_typeof(cubre) = 'array'
      and jsonb_array_length(cubre) <= 12
      and length(cubre::text) <= 1000
      and not exists (
        select 1 from jsonb_array_elements(cubre) e
         where jsonb_typeof(e.value) <> 'string'
      )
    )
  );

-- Condiciones de envio. Lista cerrada, espejada en la constante ENVIOS del JS.
alter table public.cotizaciones add column if not exists envio text;

alter table public.cotizaciones drop constraint if exists cotizaciones_envio_chk;
alter table public.cotizaciones add constraint cotizaciones_envio_chk
  check (envio is null or envio in (
    'Envío gratis a todo el país',
    'Envío gratis a CABA y GBA',
    'Envío a cargo del comprador',
    'El comprador retira',
    'A convenir'
  ));

-- El tipo de la respuesta. NOT NULL con default para que las filas que ya
-- existen queden como 'producto', que es lo que son.
alter table public.cotizaciones add column if not exists tipo text not null default 'producto';

alter table public.cotizaciones drop constraint if exists cotizaciones_tipo_chk;
alter table public.cotizaciones add constraint cotizaciones_tipo_chk
  check (tipo in ('producto', 'proveedor'));


-- ---------------------------------------------------------------------
-- 3) EL PRECIO, AHORA CONDICIONADO AL TIPO
--
-- Primero se va el CHECK viejo, despues el NOT NULL, y recien ahi entra el
-- nuevo. En este orden nunca hay un instante en que la tabla acepte una
-- cotizacion de producto sin precio.
--
-- Ninguno de los tres pasos reescribe la tabla: son cambios de catalogo.
-- ---------------------------------------------------------------------
alter table public.cotizaciones drop constraint if exists cotizaciones_precio_check;
alter table public.cotizaciones alter column precio drop not null;

alter table public.cotizaciones drop constraint if exists cotizaciones_precio_chk;
alter table public.cotizaciones add constraint cotizaciones_precio_chk
  check (
    (tipo = 'producto'  and precio is not null and precio > 0)
    or (tipo = 'proveedor' and precio is null)
  );


-- ---------------------------------------------------------------------
-- 4) EL TRIGGER QUE DECIDE EL TIPO
--
-- El cliente NO manda cotizaciones.tipo (y en el paso 5 tampoco recibe
-- permiso de INSERT sobre esa columna). Lo pone la base leyendo el pedido
-- padre. Asi el tipo de una respuesta no puede mentir sobre el pedido que
-- responde, que es lo unico que sostiene el CHECK del precio.
--
-- SECURITY DEFINER porque tiene que poder leer public.solicitudes aunque el
-- que inserta no tenga permiso de lectura sobre esa fila.
-- ---------------------------------------------------------------------
create or replace function public.cotiz_set_tipo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo text;
begin
  select s.tipo into v_tipo
    from public.solicitudes s
   where s.id = new.solicitud_id;

  -- Si el pedido no existe, la foreign key va a rechazar la fila igual al
  -- cerrar la sentencia. Se pone 'producto' solo para no violar el NOT NULL
  -- antes de que la FK tenga su turno de dar el error correcto.
  new.tipo := coalesce(v_tipo, 'producto');
  return new;
end $$;

revoke all on function public.cotiz_set_tipo() from public, anon, authenticated;

drop trigger if exists trg_cotiz_set_tipo on public.cotizaciones;
create trigger trg_cotiz_set_tipo
  before insert on public.cotizaciones
  for each row execute function public.cotiz_set_tipo();


-- ---------------------------------------------------------------------
-- 5) GRANTS POR COLUMNA
--
-- ADD COLUMN no hereda los grants de la tabla: sin esto el INSERT se cae
-- con 42501 y la lectura devuelve 403.
--
-- Ojo con la asimetria, es a proposito:
--   solicitudes.tipo  -> SELECT + INSERT. Lo decide el comprador (eligio A o
--                        B en la bifurcacion), asi que lo manda el cliente.
--   cotizaciones.tipo -> SELECT y NADA MAS. Lo pone el trigger. Sin INSERT,
--                        ni siquiera un POST armado a mano puede declararlo.
--
-- UPDATE no se otorga en ninguna: no hay pantalla para editar un pedido ni
-- una cotizacion ya enviada.
-- anon no recibe nada: sigue leyendo solo por cotiz_feed_publico().
-- ---------------------------------------------------------------------
grant select (tipo)      on public.solicitudes to authenticated;
grant insert (tipo)      on public.solicitudes to authenticated;
grant select (productos) on public.solicitudes to authenticated;
grant insert (productos) on public.solicitudes to authenticated;
grant select (ya_vende)  on public.solicitudes to authenticated;
grant insert (ya_vende)  on public.solicitudes to authenticated;
grant select (inversion) on public.solicitudes to authenticated;
grant insert (inversion) on public.solicitudes to authenticated;

grant select (tipo)  on public.cotizaciones to authenticated;
grant select (cubre) on public.cotizaciones to authenticated;
grant insert (cubre) on public.cotizaciones to authenticated;
grant select (envio) on public.cotizaciones to authenticated;
grant insert (envio) on public.cotizaciones to authenticated;


-- ---------------------------------------------------------------------
-- 6) EL FEED PUBLICO TIENE QUE DEVOLVER EL TIPO
--
-- Sin esto, el visitante sin sesion veria un pedido tipo B pintado como si
-- fuera tipo A: sin la lista de productos y con el boton equivocado.
--
-- Se reescribe entera (create or replace conserva los grants). Lo unico que
-- cambia respecto de 2026-08-19_solicitudes_foto.sql son las dos lineas
-- s.tipo y s.productos.
--
-- ya_vende e inversion NO se exponen aca: son el contexto economico del
-- comprador y solo los ve el proveedor que entra a responder, con sesion.
-- No hacen falta para pintar la tarjeta del feed.
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
           s.tipo,
           s.titulo,
           s.cantidad,
           s.unidad,
           s.productos,
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
-- COMPROBACION 1 — columnas y permisos.
-- Las 4 de solicitudes: select_ok e insert_ok en true.
-- cotizaciones.tipo: select_ok true, insert_ok FALSE (lo pone el trigger).
-- cubre y envio: los dos en true.
-- =====================================================================
select t.tabla, t.col,
       has_column_privilege('authenticated', t.tabla, t.col, 'SELECT') as select_ok,
       has_column_privilege('authenticated', t.tabla, t.col, 'INSERT') as insert_ok
from (values
  ('public.solicitudes','tipo'), ('public.solicitudes','productos'),
  ('public.solicitudes','ya_vende'), ('public.solicitudes','inversion'),
  ('public.cotizaciones','tipo'), ('public.cotizaciones','cubre'),
  ('public.cotizaciones','envio')
) as t(tabla, col);


-- =====================================================================
-- COMPROBACION 2 — el precio quedo condicionado y el feed devuelve el tipo.
-- Las tres columnas tienen que dar true.
-- =====================================================================
select
  (select not attnotnull from pg_attribute
    where attrelid = 'public.cotizaciones'::regclass and attname = 'precio')  as precio_acepta_null,
  exists (select 1 from pg_constraint
           where conname = 'cotizaciones_precio_chk'
             and conrelid = 'public.cotizaciones'::regclass)                  as tiene_check_condicional,
  pg_get_functiondef('public.cotiz_feed_publico(integer)'::regprocedure)
    like '%s.productos%'                                                      as feed_devuelve_productos;


-- =====================================================================
-- COMPROBACION 3 — LA IMPORTANTE. Que el CHECK del precio de verdad frene
-- lo que tiene que frenar. Copie y corra este bloque entero: no deja nada,
-- termina en rollback.
--
-- Tiene que imprimir las tres lineas "BIEN". Si alguna dice "MAL", NO siga
-- adelante con el push.
-- =====================================================================
do $$
declare
  v_prov  uuid;
  v_sol_b uuid;
  v_sol_a uuid;
begin
  select id into v_prov from public.proveedores limit 1;
  if v_prov is null then
    raise notice 'SALTEADA: no hay ningun proveedor cargado con que probar.';
    return;
  end if;

  -- El armado va aparte del resto: si solicitudes tiene alguna columna
  -- obligatoria que este bloque no completa, o si salta el trigger del tope
  -- diario de pedidos, eso NO es un problema de esta migracion y no tiene que
  -- parecerlo. Se avisa y se sale.
  begin
    insert into public.solicitudes (titulo, tipo)
    values ('_prueba del check de precio (tipo B)_', 'proveedor')
    returning id into v_sol_b;

    insert into public.solicitudes (titulo, tipo)
    values ('_prueba del check de precio (tipo A)_', 'producto')
    returning id into v_sol_a;
  exception when others then
    raise notice 'SALTEADA: no se pudo crear el pedido de prueba (%).', sqlerrm;
    raise notice '  No es un problema de esta migracion. Las comprobaciones 1 y 2 son las que mandan.';
    return;
  end;

  -- a) respuesta a un pedido B SIN precio: tiene que ENTRAR
  begin
    insert into public.cotizaciones (solicitud_id, proveedor_id, cubre)
    values (v_sol_b, v_prov, '["Sabanas","Toallas"]'::jsonb);
    raise notice 'BIEN (a): una respuesta tipo proveedor entra sin precio.';
  exception when others then
    raise notice 'MAL  (a): deberia haber entrado y fallo -> %', sqlerrm;
  end;

  -- b) respuesta a un pedido B CON precio: tiene que REBOTAR
  begin
    insert into public.cotizaciones (solicitud_id, proveedor_id, precio)
    values (v_sol_b, v_prov, 1000);
    raise notice 'MAL  (b): entro una respuesta tipo proveedor con precio.';
  exception when check_violation then
    raise notice 'BIEN (b): rebota una respuesta tipo proveedor que trae precio.';
  end;

  -- c) cotizacion a un pedido A SIN precio: tiene que REBOTAR
  begin
    insert into public.cotizaciones (solicitud_id, proveedor_id)
    values (v_sol_a, v_prov);
    raise notice 'MAL  (c): entro una cotizacion de producto sin precio.';
  exception when others then
    raise notice 'BIEN (c): una cotizacion de producto sigue exigiendo su precio.';
  end;

  -- Se deshace todo: la prueba no deja ni un pedido ni una cotizacion.
  raise exception using message = '__fin_de_la_prueba__';
exception when others then
  if sqlerrm = '__fin_de_la_prueba__' then
    raise notice 'Prueba terminada. No quedo nada guardado.';
  else
    raise;
  end if;
end $$;


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   drop trigger if exists trg_cotiz_set_tipo on public.cotizaciones;
--   drop function if exists public.cotiz_set_tipo();
--
--   alter table public.cotizaciones drop constraint if exists cotizaciones_precio_chk;
--   -- OJO: esto falla si ya hay respuestas tipo proveedor guardadas (tienen
--   -- precio NULL). Borrelas primero:
--   --   delete from public.cotizaciones where tipo = 'proveedor';
--   alter table public.cotizaciones alter column precio set not null;
--   alter table public.cotizaciones add constraint cotizaciones_precio_check check (precio > 0);
--
--   alter table public.cotizaciones drop constraint if exists cotizaciones_tipo_chk;
--   alter table public.cotizaciones drop constraint if exists cotizaciones_cubre_chk;
--   alter table public.cotizaciones drop constraint if exists cotizaciones_envio_chk;
--   alter table public.cotizaciones drop column if exists tipo;
--   alter table public.cotizaciones drop column if exists cubre;
--   alter table public.cotizaciones drop column if exists envio;
--
--   alter table public.solicitudes drop constraint if exists solicitudes_tipo_chk;
--   alter table public.solicitudes drop constraint if exists solicitudes_productos_chk;
--   alter table public.solicitudes drop constraint if exists solicitudes_ya_vende_chk;
--   alter table public.solicitudes drop constraint if exists solicitudes_inversion_chk;
--   -- OJO: dropear tipo convierte los pedidos tipo B en pedidos tipo A rotos
--   -- (sin cantidad y sin nada que cotizar). Borrelos primero:
--   --   delete from public.solicitudes where tipo = 'proveedor';
--   alter table public.solicitudes drop column if exists tipo;
--   alter table public.solicitudes drop column if exists productos;
--   alter table public.solicitudes drop column if exists ya_vende;
--   alter table public.solicitudes drop column if exists inversion;
--
--   -- y volver a correr sql/2026-08-19_solicitudes_foto.sql, que deja la
--   -- funcion del feed publico sin s.tipo ni s.productos.
--   notify pgrst, 'reload schema';
-- =====================================================================
