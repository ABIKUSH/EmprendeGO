-- =====================================================================
-- AVISO POR WHATSAPP AL PROVEEDOR CUANDO HAY UN PEDIDO DE SU RUBRO
-- Fecha: 2026-08-24
--
-- QUE AGREGA
--   1. public.avisos_wa      -> bitacora + anti-duplicado de cada envio
--   2. proveedores.last_wa_at -> enfriamiento (maximo 1 aviso cada 24 h)
--   3. proveedores.notif_wa   -> la baja, que el proveedor apaga desde la app
--
-- QUE **NO** TOCA (a proposito, y es importante que siga asi)
--   - Ninguna policy existente. En particular sol_select, que hoy deja que
--     cualquier usuario con sesion vea todos los pedidos abiertos y sobre la
--     que esta construido el feed con "Ver todos". El alcance por rubro de
--     esta funcion vive en el SERVIDOR (api/notificar-mensaje?action=wa_pedido),
--     que arma la lista de destinatarios con el service-role. El proveedor
--     nunca elige a quien se le manda, y el link del WhatsApp no le da ningun
--     permiso que no tuviera ya entrando por su cuenta.
--   - Ninguna columna ni tabla que ya exista.
--
-- SEGURIDAD DE avisos_wa
--   Va con RLS activada y CERO policies y CERO grants, igual que
--   solicitudes_borradas: solo la ve el service-role (que se saltea RLS).
--   Adentro hay telefonos de proveedores; no tiene por que ser legible desde
--   el navegador ni con la clave anonima ni con una sesion cualquiera.
--
-- ORDEN CORRECTO: correr este SQL PRIMERO, pushear el codigo DESPUES.
-- Igual el codigo degrada solo si esto todavia no se corrio (ver el final).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- CHEQUEO PREVIO. Si alguna suposicion no se cumple, aborta todo.
-- ---------------------------------------------------------------------
do $$
declare
  faltan text := '';
begin
  if to_regclass('public.solicitudes') is null then
    faltan := faltan || ' public.solicitudes';
  end if;
  if to_regclass('public.proveedores') is null then
    faltan := faltan || ' public.proveedores';
  end if;
  if faltan <> '' then
    raise exception 'ABORTA: no existe(n) la(s) tabla(s):%', faltan;
  end if;

  -- El id de proveedores tiene que ser uuid: las FK de abajo dependen de eso.
  if (select data_type from information_schema.columns
       where table_schema='public' and table_name='proveedores' and column_name='id') <> 'uuid' then
    raise exception 'ABORTA: proveedores.id no es uuid; revisar antes de crear las FK';
  end if;

  if (select data_type from information_schema.columns
       where table_schema='public' and table_name='solicitudes' and column_name='id') <> 'uuid' then
    raise exception 'ABORTA: solicitudes.id no es uuid; revisar antes de crear las FK';
  end if;

  -- Si ya existiera una columna con estos nombres querria decir que alguien
  -- corrio otra cosa antes: mejor frenar que pisar algo.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='proveedores'
                and column_name in ('last_wa_at','notif_wa')) then
    raise notice 'AVISO: proveedores.last_wa_at o notif_wa ya existen; el ADD COLUMN IF NOT EXISTS las respeta';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) BITACORA DE ENVIOS
-- ---------------------------------------------------------------------
create table if not exists public.avisos_wa (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes(id) on delete cascade,
  proveedor_id   uuid not null references public.proveedores(id) on delete cascade,
  telefono       text,
  estado         text not null default 'reservado',
  wa_message_id  text,
  error          text,
  created_at     timestamptz not null default now(),
  constraint avisos_wa_estado_chk check (estado in ('reservado','enviado','fallo'))
);

comment on table public.avisos_wa is
  'Un aviso de WhatsApp por (pedido, proveedor). Es bitacora Y anti-duplicado: la fila se RESERVA antes de mandar, igual que email_logs. Solo la toca el service-role desde api/notificar-mensaje?action=wa_pedido.';

comment on column public.avisos_wa.telefono is
  'A que numero salio realmente. Se guarda aca y no se lee de proveedores porque el proveedor puede cambiarlo despues y se perderia el rastro de a donde fue.';

comment on column public.avisos_wa.estado is
  'reservado = se tomo el lugar y todavia no se mando (si queda asi, el envio se corto por la mitad). enviado = Meta lo acepto. fallo = Meta lo rechazo.';

-- EL ANTI-DUPLICADO. Es lo unico que impide que dos llamadas simultaneas
-- (dos pestañas, un reintento del navegador, alguien probando con curl)
-- manden dos WhatsApp por el mismo pedido al mismo proveedor.
--
-- Cubre TODOS los estados a proposito, no solo 'enviado': si un envio quedo
-- en 'fallo' no queremos reintentarlo solo, porque el motivo mas probable es
-- que ese numero rechace nuestros mensajes, y volver a intentar contra un
-- numero que nos rebota es justo lo que baja la calificacion de calidad.
create unique index if not exists avisos_wa_unico
  on public.avisos_wa (solicitud_id, proveedor_id);

-- Para la consulta "cuantos mande hoy" del tope diario.
create index if not exists avisos_wa_created_idx
  on public.avisos_wa (created_at desc);

-- RLS activada + cero policies = nadie lee ni escribe salvo el service-role.
alter table public.avisos_wa enable row level security;

-- Cinturon y tiradores: aunque a alguien se le escape un GRANT mas adelante,
-- que no herede permisos de PUBLIC.
revoke all on public.avisos_wa from anon, authenticated, public;


-- ---------------------------------------------------------------------
-- 2) ENFRIAMIENTO POR PROVEEDOR
-- ---------------------------------------------------------------------
-- Espejo exacto de usuarios.last_notified_at (el enfriamiento del mail al
-- comprador). NO lleva el ritual de GRANT de CLAUDE.md porque el frontend no
-- la lee ni la escribe: solo la toca el service-role, que se saltea grants y
-- RLS. Darle permiso a authenticated seria abrirla sin necesidad.
alter table public.proveedores
  add column if not exists last_wa_at timestamptz;

comment on column public.proveedores.last_wa_at is
  'Ultimo aviso de WhatsApp enviado. Enfriamiento de 24 h para no quemar el numero. Solo la escribe el service-role; a proposito NO tiene grant para anon ni authenticated.';


-- ---------------------------------------------------------------------
-- 3) LA BAJA
-- ---------------------------------------------------------------------
-- Esta SI la lee y la escribe el proveedor desde la app, asi que va con el
-- ritual de GRANT por columna que pide CLAUDE.md (un ALTER TABLE ADD COLUMN
-- no hereda los grants a nivel columna; sin esto, PostgREST devuelve 403).
--
-- Arranca en true: el proveedor dio su WhatsApp al registrarse para que le
-- lleguen pedidos. La baja es de UN clic y esta arriba de todo en la pantalla
-- a la que lleva el link del mensaje.
alter table public.proveedores
  add column if not exists notif_wa boolean not null default true;

comment on column public.proveedores.notif_wa is
  'false = el proveedor pidio no recibir mas avisos de pedidos por WhatsApp. Lo apaga el desde la app. Meta exige una via de baja y sin webhook de respuestas un "responda BAJA" no lo escucharia nadie.';

grant select (notif_wa) on public.proveedores to anon, authenticated;
grant update (notif_wa) on public.proveedores to authenticated;

notify pgrst, 'reload schema';

commit;


-- =====================================================================
-- COMPROBACION. Las tres cosas tienen que aparecer.
-- =====================================================================
select 'tabla avisos_wa' as que,
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='avisos_wa') || ' columnas' as resultado
union all
select 'indice unico', coalesce((select indexname from pg_indexes
         where schemaname='public' and indexname='avisos_wa_unico'), 'FALTA')
union all
select 'RLS en avisos_wa', (select case when relrowsecurity then 'activada' else 'FALTA' end
         from pg_class where oid = 'public.avisos_wa'::regclass)
union all
select 'policies en avisos_wa (tiene que ser 0)', (select count(*)::text
         from pg_policies where schemaname='public' and tablename='avisos_wa')
union all
select 'proveedores.last_wa_at', coalesce((select data_type from information_schema.columns
         where table_schema='public' and table_name='proveedores' and column_name='last_wa_at'), 'FALTA')
union all
select 'proveedores.notif_wa', coalesce((select data_type from information_schema.columns
         where table_schema='public' and table_name='proveedores' and column_name='notif_wa'), 'FALTA')
union all
select 'grant de notif_wa a authenticated', coalesce((select string_agg(privilege_type, '+')
         from information_schema.column_privileges
         where table_schema='public' and table_name='proveedores'
           and column_name='notif_wa' and grantee='authenticated'), 'FALTA');


-- =====================================================================
-- PARA DESHACER (pegar en el editor de SQL, no corre solo):
--
--   begin;
--   drop table if exists public.avisos_wa;
--   alter table public.proveedores drop column if exists last_wa_at;
--   alter table public.proveedores drop column if exists notif_wa;
--   notify pgrst, 'reload schema';
--   commit;
--
-- Deshacer esto NO rompe la app: sin avisos_wa el endpoint de envio se
-- apaga solo y devuelve {skipped:'sin_bitacora'}, y sin notif_wa la pantalla
-- del proveedor esconde el interruptor de baja. Publicar un pedido, cotizar
-- y todo lo demas sigue funcionando igual.
-- =====================================================================
