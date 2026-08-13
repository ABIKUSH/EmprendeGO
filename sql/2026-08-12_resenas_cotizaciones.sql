-- =====================================================================
-- RESEÑAS ENGANCHADAS AL FLUJO DE COTIZACIONES.
-- Fecha: 2026-08-12
--
-- Se corre UNA sola vez, en el SQL editor de Supabase (proyecto
-- seubtijmyoahnyspvidq), con el rol por defecto (postgres).
--
-- POR QUE
--
-- Hoy public.resenas tiene 4 filas en toda la base. Cuatro. El motivo no
-- es que a nadie le importe la reputacion: es que la unica puerta para
-- dejar una reseña es entrar al perfil de un proveedor, bajar hasta el
-- fondo y decidir por cuenta propia que uno quiere calificarlo. Nadie
-- hace eso.
--
-- En Cotizaciones ese momento SI existe y ademas esta datado: cuando el
-- comprador cierra su pedido, acaba de terminar (o de descartar) una
-- operacion. Y la base sabe algo que el perfil no sabe: QUIEN le cotizo
-- a quien. Esa es la diferencia entre "una estrella que puso cualquiera"
-- y "una estrella que puso alguien a quien este proveedor efectivamente
-- le paso un precio".
--
-- Este archivo hace tres cosas:
--   1. Guarda ese vinculo (resenas.solicitud_id) y lo hace unico, para
--      que un pedido no pueda calificar dos veces al mismo proveedor.
--   2. Lo hace VERDADERO, no decorativo: una policy RESTRICTIVE obliga a
--      que la solicitud sea del que escribe y a que ese proveedor le
--      haya cotizado de verdad. Sin esto, solicitud_id seria un adorno
--      que cualquiera podria rellenar con el uuid que se le antoje.
--   3. Cierra un agujero que aparecio mirando esto: el rol anon (sin
--      ninguna sesion) tiene GRANT de INSERT sobre public.resenas.
--
-- LO QUE NO HACE
--   No toca el sello "Verificado" ni el modelo de confianza del
--   proveedor. Eso esta decidido y se queda como esta.
--
-- COMO SE COMPROBO EL AGUJERO DE anon (para que quede escrito)
--   POST /rest/v1/resenas con body {} y la clave publica, sin sesion,
--   no responde 42501 (permiso denegado): responde
--     23502 null value in column "proveedor_id" ... violates not-null
--   En PostgreSQL el chequeo de privilegios corre ANTES que el de
--   constraints. Que la peticion llegue a morir en el NOT NULL prueba
--   que el privilegio de INSERT estaba concedido.
-- =====================================================================


-- =====================================================================
-- PASO 0 — FOTO DE COMO ESTA HOY.
--
-- Correr ESTO SOLO (seleccionarlo y ejecutar) ANTES de correr el resto,
-- y guardar la salida. Es la unica forma de poder volver atras con
-- exactitud si algo sale mal, porque mas abajo se revocan privilegios
-- que no se pueden adivinar despues.
--
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'resenas'
--    union all
--   select grantee, privilege_type, '(tabla entera)'
--     from information_schema.table_privileges
--    where table_schema = 'public' and table_name = 'resenas'
--    order by 1, 2, 3;
--
--   select policyname, cmd, permissive, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'resenas';
--
-- =====================================================================


begin;

-- ---------------------------------------------------------------------
-- 1) CHEQUEO PREVIO
--
-- Que las tres tablas existan, que tengan las columnas de las que se
-- cuelga todo esto, y que los uuid sean uuid de verdad. Si algo no esta,
-- se corta aca y no queda la base a medio migrar.
-- ---------------------------------------------------------------------
do $$
declare
  v_col  text;
  v_tipo text;
begin
  if to_regclass('public.resenas') is null then
    raise exception 'Falta la tabla public.resenas.';
  end if;
  if to_regclass('public.solicitudes') is null then
    raise exception 'Falta la tabla public.solicitudes.';
  end if;
  if to_regclass('public.cotizaciones') is null then
    raise exception 'Falta la tabla public.cotizaciones.';
  end if;

  foreach v_col in array array['id','proveedor_id','usuario_nombre','estrellas','texto','created_at'] loop
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = 'public.resenas'::regclass
         and a.attname = v_col and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception 'A public.resenas le falta la columna %', v_col;
    end if;
  end loop;

  -- solicitudes.usuario_id es el que se compara contra auth.uid() en la
  -- policy de mas abajo. Si no fuera uuid, la comparacion explotaria en
  -- tiempo de insert (o peor, compararia texto) en vez de aca.
  select format_type(a.atttypid, null) into v_tipo
    from pg_attribute a
   where a.attrelid = 'public.solicitudes'::regclass and a.attname = 'usuario_id';
  if v_tipo is distinct from 'uuid' then
    raise exception 'public.solicitudes.usuario_id deberia ser uuid y es %', coalesce(v_tipo, '(no existe)');
  end if;

  select format_type(a.atttypid, null) into v_tipo
    from pg_attribute a
   where a.attrelid = 'public.resenas'::regclass and a.attname = 'proveedor_id';
  if v_tipo is distinct from 'uuid' then
    raise exception 'public.resenas.proveedor_id deberia ser uuid y es %', coalesce(v_tipo, '(no existe)');
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2) LA COLUMNA
--
-- De que pedido nacio esta reseña. NULL = reseña suelta, dejada desde el
-- perfil del proveedor como se hizo siempre. Las 4 filas viejas quedan
-- en NULL y siguen funcionando igual.
--
-- on delete set null y no cascade: si el comprador borra su pedido, la
-- reseña sobrevive. Borrar un pedido no puede ser una forma de borrarle
-- la reputacion a un proveedor que ya laburo.
--
-- La contra, dicha: al soltarse el vinculo, el indice unico de mas abajo
-- deja de proteger esa fila, asi que borrar el pedido y volver a
-- publicarlo permitiria calificar de nuevo al mismo proveedor. Se acepta:
-- el otro camino (on delete restrict) rompe cotizEliminar, que es una
-- funcion que el comprador usa todos los dias.
-- ---------------------------------------------------------------------
alter table public.resenas
  add column if not exists solicitud_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.resenas'::regclass
       and conname  = 'resenas_solicitud_id_fkey'
  ) then
    alter table public.resenas
      add constraint resenas_solicitud_id_fkey
      foreign key (solicitud_id) references public.solicitudes(id) on delete set null;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3) UNA SOLA RESEÑA POR PEDIDO Y PROVEEDOR
--
-- Parcial (where solicitud_id is not null) para que no choque con las
-- reseñas sueltas: sin el where, todas las filas viejas tendrian la misma
-- clave (null, proveedor) y en un indice unico de PostgreSQL los NULL no
-- chocan entre si, pero (null, mismo_proveedor) tampoco es una clave que
-- quiera indexar. El where lo deja explicito y ademas achica el indice.
--
-- Un pedido es de un solo comprador, asi que "un pedido no puede
-- calificar dos veces al mismo proveedor" es, en los hechos, "una
-- persona no puede inflar a un proveedor repitiendo la misma operacion".
-- ---------------------------------------------------------------------
create unique index if not exists uq_resenas_solicitud_proveedor
  on public.resenas (solicitud_id, proveedor_id)
  where solicitud_id is not null;


-- ---------------------------------------------------------------------
-- 4) EL VINCULO TIENE QUE SER CIERTO
--
-- Responde: "esta persona es la dueña de este pedido, y este proveedor
-- le cotizo ahi?".
--
-- SECURITY DEFINER a proposito. Una policy corre con los permisos de
-- quien inserta, y ni anon ni authenticated tienen SELECT sobre
-- public.cotizaciones (anon recibe 42501 al leerla). Una policy que
-- consultara esas tablas de forma directa fallaria para todo el mundo
-- por falta de permiso, no por falta de derecho — que es exactamente el
-- bug que ya nos comimos con resenas.usuario_email y las lecturas en
-- cero. Metiendo la consulta en una funcion del dueño, la policy
-- pregunta lo que necesita sin que nadie gane acceso a las tablas.
--
-- Devuelve boolean y nada mas: no filtra ni una fila ni un dato. Lo peor
-- que puede hacer alguien con esto es averiguar, de a un uuid por vez y
-- teniendo que adivinar dos uuid al mismo tiempo, si le cotizaron un
-- pedido que ademas tiene que ser suyo.
-- ---------------------------------------------------------------------
create or replace function public.resena_de_operacion(p_solicitud uuid, p_proveedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.solicitudes s
      join public.cotizaciones c on c.solicitud_id = s.id
     where s.id = p_solicitud
       and s.usuario_id = auth.uid()
       and c.proveedor_id = p_proveedor
  );
$$;

revoke all on function public.resena_de_operacion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resena_de_operacion(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5) LA POLICY, COMO RESTRICTIVE
--
-- RESTRICTIVE y no PERMISSIVE por una razon concreta: las policies
-- permissive se suman con OR, asi que agregar una no restringe NADA si
-- ya existe otra que deja pasar. Las restrictive se cruzan con AND
-- contra todo lo demas. Es decir: esta se aplica ADEMAS de lo que ya
-- haya, sin necesidad de saber que hay ni de borrarlo.
--
-- Lee: una reseña con solicitud_id tiene que venir de una operacion
-- real. Una reseña sin solicitud_id (la de siempre, desde el perfil)
-- pasa como pasaba — este archivo no cambia esa puerta.
-- ---------------------------------------------------------------------
drop policy if exists resenas_insert_vinculo_real on public.resenas;

create policy resenas_insert_vinculo_real
  on public.resenas
  as restrictive
  for insert
  to authenticated
  with check (
    solicitud_id is null
    or public.resena_de_operacion(solicitud_id, proveedor_id)
  );

-- Si NO habia ninguna policy de insert, la tabla quedaria sin ninguna
-- permissive y no entraria ni una reseña (una restrictive sola no
-- habilita nada, solo recorta). Se crea la permissive minima solo en ese
-- caso, para no pisar la que pueda existir.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'resenas'
       and cmd = 'INSERT' and permissive = 'PERMISSIVE'
  ) then
    create policy resenas_insert_con_cuenta
      on public.resenas
      for insert
      to authenticated
      with check (true);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 6) CERRAR EL INSERT DE anon
--
-- Reseñar es un acto de alguien con cuenta. anon no tiene por que poder
-- escribir aca, y hoy puede.
--
-- Se revoca de anon y tambien de PUBLIC: un privilegio otorgado a PUBLIC
-- lo hereda anon igual, y revocarselo solo a anon no serviria de nada.
-- Se revoca a nivel tabla y a nivel columna porque son dos concesiones
-- distintas y una no arrastra a la otra de forma confiable.
--
-- Despues se devuelve explicitamente lo que si tiene que poder escribir
-- cada rol, columna por columna. id y created_at no se listan: los pone
-- el default y no hace falta privilegio sobre una columna que el insert
-- no menciona.
-- ---------------------------------------------------------------------
revoke insert on public.resenas from anon;
revoke insert on public.resenas from public;
revoke insert (solicitud_id, proveedor_id, usuario_nombre, usuario_email, estrellas, texto)
  on public.resenas from anon;

grant insert (solicitud_id, proveedor_id, usuario_nombre, usuario_email, estrellas, texto)
  on public.resenas to authenticated;

-- service_role lo usan los endpoints de api/ (notificar-mensaje, etc.).
-- El revoke a PUBLIC de arriba le pudo sacar lo que heredaba, asi que se
-- le devuelve de forma explicita y no por herencia.
grant insert on public.resenas to service_role;


-- ---------------------------------------------------------------------
-- 7) EL RITUAL DE LA COLUMNA NUEVA
--
-- ALTER TABLE ADD COLUMN no hereda los grants por columna que ya tenia
-- la tabla. Sin este bloque, el frontend pide solicitud_id y se come un
-- 403 de PostgREST. (El insert de solicitud_id ya se otorgo arriba.)
--
-- OJO: aca va SELECT por columna y NUNCA un `grant select on
-- public.resenas`, porque un grant de tabla entera pisa el revoke por
-- columna de usuario_email y lo volveria publico.
-- ---------------------------------------------------------------------
grant select (solicitud_id) on public.resenas to anon, authenticated;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACION — es la ultima consulta del archivo a proposito.
--
-- El editor de Supabase muestra solo el resultado del ULTIMO select, asi
-- que va todo junto en una sola tabla en vez de seis consultas sueltas.
-- Se corre sola con seleccionarla y ejecutar.
--
-- Lo que TIENE que verse:
--   grant-columna  anon           SELECT   -> todas menos usuario_email
--   grant-columna  anon           INSERT   -> NO tiene que aparecer
--   grant-columna  authenticated  INSERT   -> las 6 columnas
--   grant-tabla    anon/PUBLIC    INSERT   -> NO tiene que aparecer
--   policy         resenas_insert_vinculo_real  INSERT / RESTRICTIVE
--   indice         uq_resenas_solicitud_proveedor
--   fk             resenas_solicitud_id_fkey
--   filas          4 reseñas, 0 con pedido (las viejas quedan sueltas)
-- =====================================================================

select 'grant-columna'::text as que,
       g.grantee::text       as quien,
       g.privilege_type::text as permiso,
       string_agg(g.column_name::text, ', ' order by g.column_name::text) as detalle
  from information_schema.column_privileges g
 where g.table_schema = 'public' and g.table_name = 'resenas'
   and g.grantee::text in ('anon', 'authenticated')
 group by g.grantee::text, g.privilege_type::text

union all
select 'grant-tabla', t.grantee::text, t.privilege_type::text, '(tabla entera)'
  from information_schema.table_privileges t
 where t.table_schema = 'public' and t.table_name = 'resenas'
   and t.grantee::text in ('anon', 'authenticated', 'PUBLIC')

union all
select 'policy', p.policyname::text, (p.cmd || ' / ' || p.permissive)::text,
       coalesce(p.with_check, p.qual, '')::text
  from pg_policies p
 where p.schemaname = 'public' and p.tablename = 'resenas'

union all
select 'indice', i.indexname::text, '', i.indexdef::text
  from pg_indexes i
 where i.schemaname = 'public' and i.tablename = 'resenas'
   and i.indexname = 'uq_resenas_solicitud_proveedor'

union all
select 'fk', c.conname::text, '', pg_get_constraintdef(c.oid)::text
  from pg_constraint c
 where c.conrelid = 'public.resenas'::regclass and c.contype = 'f'

union all
select 'filas', 'resenas', count(*)::text,
       count(solicitud_id)::text || ' con pedido, ' ||
       (count(*) - count(solicitud_id))::text || ' sueltas'
  from public.resenas

order by 1, 2, 3;


-- =====================================================================
-- COMPROBACION DESDE AFUERA (no es SQL — es la que realmente vale).
--
-- Con la clave publica y sin sesion, esto TIENE que responder 42501
-- "permission denied", y hasta ahora respondia 23502:
--
--   curl -s -X POST 'https://seubtijmyoahnyspvidq.supabase.co/rest/v1/resenas' \
--     -H 'apikey: sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA' \
--     -H 'Authorization: Bearer sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA' \
--     -H 'Content-Type: application/json' -d '{}'
--
-- Y esto tiene que seguir dando 403 (usuario_email sigue tapado):
--
--   curl -s 'https://seubtijmyoahnyspvidq.supabase.co/rest/v1/resenas?select=*&limit=1' \
--     -H 'apikey: sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA' \
--     -H 'Authorization: Bearer sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA'
-- =====================================================================


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   begin;
--   drop policy if exists resenas_insert_vinculo_real on public.resenas;
--   drop policy if exists resenas_insert_con_cuenta   on public.resenas;
--   drop function if exists public.resena_de_operacion(uuid, uuid);
--   drop index if exists public.uq_resenas_solicitud_proveedor;
--   alter table public.resenas drop constraint if exists resenas_solicitud_id_fkey;
--   alter table public.resenas drop column if exists solicitud_id;
--   -- y devolver los privilegios de INSERT segun la foto del PASO 0.
--   commit;
--   notify pgrst, 'reload schema';
--
-- El frontend degrada solo: si la columna no esta, el insert de la
-- reseña falla, se avisa por toast y el pedido se cierra igual. Cerrar
-- el pedido nunca depende de que la reseña se haya guardado.
-- =====================================================================
