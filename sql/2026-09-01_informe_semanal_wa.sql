-- =====================================================================
-- RESUMEN SEMANAL POR WHATSAPP AL PROVEEDOR
-- Fecha: 2026-09-01
--
-- QUE AGREGA
--   1. public.informes_wa        -> bitacora + anti-duplicado de cada resumen
--   2. proveedores.notif_informe -> la baja, que el proveedor apaga desde la app
--
-- POR QUE EXISTE
--   Medido el 2026-09-01 sobre la base real: en 30 dias se entregaron 2.680
--   contactos de compradores a 152 proveedores, y hubo 1.380 intentos de ver
--   un catalogo repartidos en 132 proveedores. De los 157 aprobados, 4 pagan.
--
--   El problema no es que no haya valor entregado: es que el proveedor NUNCA
--   se entera. "Todo Tienda" recibio 140 contactos en 30 dias, esta en plan
--   gratis y no tiene forma de saberlo. Y de los 13 proveedores que alguna vez
--   tuvieron Pro quedan 4 vigentes: los otros 9 pagaron, no vieron un numero, y
--   no renovaron.
--
--   Esta tabla es el registro de la unica pieza que faltaba: decirselo.
--
-- QUE **NO** TOCA
--   - Ninguna policy existente.
--   - avisos_wa, notif_wa, last_wa_at: son del aviso de PEDIDOS y siguen
--     igual. Son dos mensajes distintos con dos bajas distintas a proposito
--     (ver el comentario de notif_informe mas abajo).
--
-- SEGURIDAD DE informes_wa
--   Mismo criterio que avisos_wa: RLS activada, CERO policies y CERO grants.
--   Adentro hay telefonos. Solo la ve el service-role.
--
-- ORDEN CORRECTO: correr este SQL PRIMERO, pushear el codigo DESPUES.
-- Igual el codigo degrada solo si esto no se corrio (devuelve sin_bitacora).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- CHEQUEO PREVIO. Si alguna suposicion no se cumple, aborta todo.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.proveedores') is null then
    raise exception 'ABORTA: no existe public.proveedores';
  end if;

  if (select data_type from information_schema.columns
       where table_schema='public' and table_name='proveedores' and column_name='id') <> 'uuid' then
    raise exception 'ABORTA: proveedores.id no es uuid; revisar antes de crear la FK';
  end if;

  -- Las dos tablas de las que sale el numero del mensaje. Si falta alguna, el
  -- resumen se mandaria con un cero que no es cierto, que es peor que no
  -- mandarlo: le estariamos diciendo al proveedor que no lo busco nadie.
  if to_regclass('public.consultas') is null then
    raise exception 'ABORTA: no existe public.consultas; es de donde sale el numero del resumen';
  end if;
  if to_regclass('public.intentos_catalogo') is null then
    raise exception 'ABORTA: no existe public.intentos_catalogo; es la segunda linea del resumen';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) BITACORA DE RESUMENES
-- ---------------------------------------------------------------------
create table if not exists public.informes_wa (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id) on delete cascade,
  semana         date not null,
  telefono       text,
  contactos      integer not null default 0,
  catalogo       integer not null default 0,
  estado         text not null default 'reservado',
  wa_message_id  text,
  error          text,
  created_at     timestamptz not null default now(),
  constraint informes_wa_estado_chk check (estado in ('reservado','enviado','fallo'))
);

comment on table public.informes_wa is
  'Un resumen semanal por (proveedor, semana). Es bitacora Y anti-duplicado: la fila se RESERVA antes de mandar, igual que avisos_wa y email_logs. Solo la toca el service-role desde api/notificar-mensaje?action=wa_informe.';

comment on column public.informes_wa.semana is
  'Lunes de la semana que se le esta contando, en hora argentina. Es la mitad del anti-duplicado: dos corridas del cron el mismo lunes calculan el mismo valor y la segunda choca contra el indice unico.';

comment on column public.informes_wa.contactos is
  'Cuantos contactos se le informaron. Se guarda el numero MANDADO y no se recalcula despues: es la unica forma de auditar que le dijimos, y de cruzar despues quien convirtio a Pro con que numero habia visto.';

comment on column public.informes_wa.catalogo is
  'Cuantos intentos de ver su catalogo se le informaron, de public.intentos_catalogo.';

comment on column public.informes_wa.telefono is
  'A que numero salio realmente. Se guarda aca y no se lee de proveedores porque el proveedor puede cambiarlo despues y se perderia el rastro.';

-- EL ANTI-DUPLICADO. Un proveedor recibe UN resumen por semana, aunque el cron
-- se dispare dos veces, alguien lo llame a mano desde el panel, o Vercel
-- reintente la invocacion.
--
-- Cubre todos los estados a proposito, igual que avisos_wa_unico: si un envio
-- quedo en 'fallo', el motivo mas probable es que ese numero nos rebote, y
-- reintentar contra un numero que rebota es justo lo que baja la calificacion
-- de calidad del numero.
create unique index if not exists informes_wa_unico
  on public.informes_wa (proveedor_id, semana);

-- Para el tope diario y para el tablero.
create index if not exists informes_wa_created_idx
  on public.informes_wa (created_at desc);

-- RLS activada + cero policies = nadie lee ni escribe salvo el service-role.
alter table public.informes_wa enable row level security;

-- Cinturon y tiradores, igual que avisos_wa: que no herede permisos de PUBLIC
-- aunque mañana se escape un GRANT.
revoke all on public.informes_wa from anon, authenticated, public;


-- ---------------------------------------------------------------------
-- 2) LA BAJA
-- ---------------------------------------------------------------------
-- Columna PROPIA y no reutilizar notif_wa. Son dos mensajes distintos: el
-- aviso de pedidos es una oportunidad de venta puntual, el resumen semanal es
-- un habito. Un proveedor puede querer uno y no el otro, y meterlos en el
-- mismo interruptor obliga a apagar los dos.
--
-- Lo que SI se respeta: si apago notif_wa, no recibe tampoco el resumen. Esa
-- regla vive en el codigo (elegirParaInforme), no aca, porque "no me mandes
-- WhatsApp" se lee como todo, no como una categoria.
--
-- Va con el ritual de GRANT por columna que pide CLAUDE.md: un ALTER TABLE ADD
-- COLUMN no hereda los grants a nivel columna y PostgREST devolveria 403.
alter table public.proveedores
  add column if not exists notif_informe boolean not null default true;

comment on column public.proveedores.notif_informe is
  'false = el proveedor pidio no recibir mas el resumen semanal por WhatsApp. Lo apaga el desde la app. Independiente de notif_wa (que es el aviso de pedidos), pero notif_wa=false apaga los dos.';

grant select (notif_informe) on public.proveedores to anon, authenticated;
grant update (notif_informe) on public.proveedores to authenticated;

notify pgrst, 'reload schema';

commit;


-- =====================================================================
-- COMPROBACION. Todo tiene que aparecer.
-- =====================================================================
select 'tabla informes_wa' as que,
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='informes_wa') || ' columnas' as resultado
union all
select 'indice unico', coalesce((select indexname from pg_indexes
         where schemaname='public' and indexname='informes_wa_unico'), 'FALTA')
union all
select 'RLS en informes_wa', (select case when relrowsecurity then 'activada' else 'FALTA' end
         from pg_class where oid = 'public.informes_wa'::regclass)
union all
select 'policies en informes_wa (tiene que ser 0)', (select count(*)::text
         from pg_policies where schemaname='public' and tablename='informes_wa')
union all
select 'proveedores.notif_informe', coalesce((select data_type from information_schema.columns
         where table_schema='public' and table_name='proveedores' and column_name='notif_informe'), 'FALTA')
union all
select 'grant de notif_informe a authenticated', coalesce((select string_agg(privilege_type, '+')
         from information_schema.column_privileges
         where table_schema='public' and table_name='proveedores'
           and column_name='notif_informe' and grantee='authenticated'), 'FALTA');


-- =====================================================================
-- CUANTOS PROVEEDORES PASARIAN EL UMBRAL ESTA SEMANA
-- No hace falta para que funcione: sirve para saber cuantos mensajes va a
-- mandar el primer lunes antes de encenderlo.
-- =====================================================================
select count(*) as proveedores_que_recibirian,
       sum(n)   as contactos_totales
from (
  select c.proveedor_id, count(*) n
  from public.consultas c
  join public.proveedores p on p.id = c.proveedor_id
  where c.created_at > now() - interval '7 days'
    and p.estado = 'aprobado'
  group by c.proveedor_id
  having count(*) >= 3            -- INF_MINIMO_CONTACTOS en el codigo
) t;


-- =====================================================================
-- PARA DESHACER (pegar en el editor de SQL, no corre solo):
--
--   begin;
--   drop table if exists public.informes_wa;
--   alter table public.proveedores drop column if exists notif_informe;
--   notify pgrst, 'reload schema';
--   commit;
--
-- Deshacer esto NO rompe la app: sin informes_wa el endpoint se apaga solo y
-- devuelve {skipped:'sin_bitacora'}, y sin notif_informe la pantalla del
-- proveedor esconde el interruptor. El aviso de pedidos no se entera de nada.
-- =====================================================================
