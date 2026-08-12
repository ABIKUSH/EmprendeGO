-- =====================================================================
-- EMAIL DE ANUNCIOS — trazabilidad de envios manuales + bajas.
-- Fecha: 2026-08-11
--
-- Se corre UNA sola vez, en el SQL editor de Supabase (proyecto
-- seubtijmyoahnyspvidq), con el rol por defecto (postgres).
--
-- Para que sirve: en el panel de admin, seccion Usuarios, cada usuario
-- tiene un boton "Enviar" que le manda UN mail puntual (hoy: el anuncio
-- de la seccion Pedidos de Cotizacion). Estas dos tablas son las que
-- hacen que ese boton sepa a quien ya le mandamos y quien pidio no
-- recibir mas.
--
-- Por que DOS TABLAS NUEVAS y no columnas en public.usuarios:
--
--   public.usuarios la lee toda la app (la policy usuario_select corre en
--   cada carga de sesion). Agregarle columnas obliga a tocar grants sobre
--   una tabla caliente, y un GRANT mal puesto ahi tumba el login entero.
--   Dos tablas aparte no tienen ningun camino de codigo existente que las
--   toque: si algo sale mal, lo unico que falla es el boton nuevo.
--
-- Por que email_optouts va por EMAIL y no por usuario_id:
--
--   Si alguien se da de baja y despues se vuelve a registrar (fila nueva,
--   usuario_id nuevo), la baja tiene que seguir valiendo. La direccion de
--   correo es la identidad estable, no la fila.
--
-- Quien escribe: SOLO las funciones serverless, con el service-role key
-- (que se saltea RLS). Desde el navegador no hay INSERT posible ni para
-- el admin: la UI solo lee. Eso evita que un XSS en el panel pueda
-- falsificar el historial de envios.
--
-- Todo es ADITIVO: no toca tablas, ni policies, ni grants existentes.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
-- Si algo no esta como se espera, la excepcion aborta el script entero.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.usuarios') is null then
    raise exception 'Falta la tabla public.usuarios.';
  end if;

  -- La RLS de lectura se apoya en is_admin(). Si no existiera, las tablas
  -- quedarian creadas pero invisibles para el panel.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    raise exception 'Falta la funcion public.is_admin().';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) EMAIL_LOGS — que se mando, a quien, cuando y como salio.
--
-- Se graba TAMBIEN cuando el envio falla (estado='error'). Sirve para
-- distinguir "nunca se le mando" de "se intento y reboto", que es
-- justamente lo que no se puede saber si solo se guardan los exitos.
--
-- usuario_id es ON DELETE SET NULL a proposito: si se borra el usuario,
-- el registro de que le mandamos un mail no se pierde (queda el email).
-- ---------------------------------------------------------------------
create table if not exists public.email_logs (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references public.usuarios(id) on delete set null,
  email       text        not null,
  campana     text        not null,
  estado      text        not null check (estado in ('enviado','error')),
  error_msg   text,
  resend_id   text,
  admin_email text,
  enviado_at  timestamptz not null default now()
);

-- EL anti-duplicado de verdad. El boton gris en la UI es comodidad; esto
-- es lo que impide el doble envio aunque se hagan dos clics simultaneos,
-- se abran dos pestañas del panel o alguien reintente el POST a mano.
-- Es PARCIAL (solo estado='enviado') para que un intento fallido no
-- bloquee el reintento legitimo.
create unique index if not exists email_logs_unico_enviado
  on public.email_logs (usuario_id, campana)
  where estado = 'enviado';

-- Para el contador "Enviados hoy: N/60" y el pintado de la tabla.
create index if not exists email_logs_campana_fecha
  on public.email_logs (campana, enviado_at desc);


-- ---------------------------------------------------------------------
-- 2) EMAIL_OPTOUTS — quien pidio no recibir mas.
--
-- campana NULL = baja de todo. Hoy siempre se graba la campana puntual,
-- pero la columna deja la puerta abierta a una baja global sin migrar.
-- ---------------------------------------------------------------------
create table if not exists public.email_optouts (
  email      text primary key,
  campana    text,
  motivo     text,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3) RLS — lectura solo para el admin, escritura para nadie.
--
-- No se crea ninguna policy de INSERT/UPDATE/DELETE. Con RLS activa y
-- sin policy, esas operaciones quedan denegadas para anon y para
-- authenticated. El service-role key que usan las funciones serverless
-- ignora RLS por diseño, asi que el backend sigue pudiendo escribir.
-- ---------------------------------------------------------------------
alter table public.email_logs    enable row level security;
alter table public.email_optouts enable row level security;

drop policy if exists email_logs_admin_select    on public.email_logs;
drop policy if exists email_optouts_admin_select on public.email_optouts;

create policy email_logs_admin_select
  on public.email_logs
  for select
  to authenticated
  using (public.is_admin());

create policy email_optouts_admin_select
  on public.email_optouts
  for select
  to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 4) GRANTS
--
-- La RLS filtra filas, pero sin GRANT la tabla ni siquiera se puede
-- nombrar: PostgREST devuelve 403 antes de llegar a evaluar la policy.
-- Hacen falta las dos cosas.
--
-- anon no recibe nada: el panel siempre lee con la sesion del admin.
-- ---------------------------------------------------------------------
revoke all on public.email_logs    from anon, authenticated;
revoke all on public.email_optouts from anon, authenticated;

grant select on public.email_logs    to authenticated;
grant select on public.email_optouts to authenticated;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACION
-- Tienen que salir las dos tablas con rls_activa = true, y el listado de
-- policies tiene que mostrar UNICAMENTE las dos de SELECT.
-- =====================================================================
select c.relname::text as tabla,
       c.relrowsecurity as rls_activa,
       coalesce(array_to_string(array(
         select p.polname::text from pg_policy p where p.polrelid = c.oid
       ), ', '), '(ninguna)') as policies,
       coalesce(array_to_string(array(
         select r.rolname::text from pg_roles r
          where has_table_privilege(r.oid, c.oid, 'SELECT')
            and r.rolname in ('anon','authenticated')
       ), ', '), '(ninguno)') as puede_leer
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('email_logs','email_optouts')
 order by 1;


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   drop table if exists public.email_logs;
--   drop table if exists public.email_optouts;
--   notify pgrst, 'reload schema';
--
-- El panel degrada solo: sin estas tablas, cargarUsuarios() sigue
-- pintando la tabla igual que siempre y el boton de mail no aparece.
-- =====================================================================
