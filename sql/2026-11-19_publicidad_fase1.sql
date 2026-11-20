-- =====================================================================
-- PUBLICIDAD — FASE 1 (2026-11-19)
--
-- Espacios publicitarios por mes dentro del marketplace. En esta fase los
-- anuncios los carga el founder a mano desde admin.html (los vende por
-- WhatsApp y cobra por fuera). La pagina publica /publicidad, el pago por
-- Mercado Pago y las metricas son las fases 2 y 3.
--
-- Piezas:
--   ad_spaces            los tres espacios, con precio y cupo editables
--   ad_orders            cada anuncio vendido (una fila por contratacion)
--   ad_controlar_cupo()  disparador: nunca mas anuncios a la vez que el cupo
--   anuncios_vigentes()  lo UNICO que lee la app: solo campos publicos
--   bucket "publicidad"  las piezas; sube solo un admin
--
-- ⚠️ ACTIVO / VENCIDO NO ES UN ESTADO GUARDADO. Se calcula por fecha cada vez
-- que se consulta (hora argentina). No depende de ningun cron: los crons de
-- este proyecto hoy no corren (falta CRON_SECRET en Vercel) y un anuncio que
-- vence tiene que desaparecer solo igual.
--
-- ⚠️ El rango es [inicia_el, termina_el): termina_el es el primer dia en que
-- el anuncio YA NO se muestra. Un mes del 1/12 es [2026-12-01, 2027-01-01).
--
-- ⚠️ ad_orders tiene telefonos y mails de los anunciantes: anon y
-- authenticated NO la leen nunca. RLS activada y la unica policy es la del
-- admin. La app entra por anuncios_vigentes(), SECURITY DEFINER, que devuelve
-- solo lo que se ve en pantalla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Espacios
-- ---------------------------------------------------------------------
create table if not exists public.ad_spaces (
  id              text primary key,                -- clave: inicio | resultados | novedades
  nombre          text not null,
  donde           text not null,                   -- explicacion corta para el panel
  ancho           int  not null check (ancho > 0), -- medida pedida de la pieza, en px
  alto            int  not null check (alto  > 0),
  cupo            int  not null default 1 check (cupo between 1 and 10),
  precio_mensual  numeric(12,2) not null check (precio_mensual >= 0),
  descuento_3m    numeric(5,2)  not null default 0 check (descuento_3m between 0 and 90),
  descuento_6m    numeric(5,2)  not null default 0 check (descuento_6m between 0 and 90),
  activo          boolean not null default true,
  orden           int not null default 0,
  actualizado_el  timestamptz not null default now()
);

insert into public.ad_spaces (id, nombre, donde, ancho, alto, cupo, precio_mensual, orden) values
  ('inicio',     'Carrusel del inicio',  'Pantalla de inicio, debajo del bloque verde. Rotan hasta 3 anunciantes.', 1080, 1080, 3, 45000, 1),
  ('resultados', 'Tarjeta patrocinada',  'Buscar > Productos, en la posición 3 de la grilla.',                       1080, 1350, 1, 60000, 2),
  ('novedades',  'Tarjeta en Novedades', 'Feed de Novedades, después del 4.º elemento.',                            1080, 1080, 1, 30000, 3)
on conflict (id) do nothing;

alter table public.ad_spaces enable row level security;

-- Precios y cupos son publicos (la pagina /publicidad de la fase 2 los
-- muestra). Escribir, solo un admin.
drop policy if exists ad_spaces_select on public.ad_spaces;
create policy ad_spaces_select on public.ad_spaces
  for select to anon, authenticated using (true);

drop policy if exists ad_spaces_admin on public.ad_spaces;
create policy ad_spaces_admin on public.ad_spaces
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.ad_spaces from anon, authenticated;
grant select on public.ad_spaces to anon, authenticated;
grant update on public.ad_spaces to authenticated;

-- ---------------------------------------------------------------------
-- 2. Anuncios
-- ---------------------------------------------------------------------
create table if not exists public.ad_orders (
  id              uuid primary key default gen_random_uuid(),
  space_id        text not null references public.ad_spaces(id),
  empresa         text not null check (length(trim(empresa)) between 1 and 80),
  contacto        text,
  whatsapp        text,
  email           text,
  duracion_meses  int  not null check (duracion_meses between 1 and 24),
  monto           numeric(12,2) not null default 0 check (monto >= 0),
  -- borrador -> pagado | pendiente_pago -> en_revision -> aprobado
  -- (activo y vencido NO se guardan: salen de la fecha)
  estado          text not null default 'aprobado'
                  check (estado in ('borrador','pendiente_pago','pagado','en_revision',
                                    'aprobado','rechazado','cancelado','reembolsado')),
  pago_ref        text,
  pago_manual     boolean not null default false,
  inicia_el       date not null,
  termina_el      date not null,
  imagen_url      text,
  destino_url     text not null,
  alt_text        text check (alt_text is null or length(alt_text) <= 160),
  necesita_ayuda  boolean not null default false,
  motivo_revision text,
  notas           text,
  token_acceso    text not null unique
                  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  creado_el       timestamptz not null default now(),
  actualizado_el  timestamptz not null default now(),
  constraint ad_orders_rango check (termina_el > inicia_el),
  -- Solo https. Nunca javascript:, data: ni http plano. Un WhatsApp se
  -- guarda ya convertido a https://wa.me/<numero>.
  constraint ad_orders_destino check (destino_url ~* '^https://[a-z0-9.-]+\.[a-z]{2,}(/|$|\?|#)'),
  -- Un anuncio aprobado se muestra: tiene que tener pieza.
  constraint ad_orders_aprobado_con_pieza check (estado <> 'aprobado' or imagen_url is not null)
);

create index if not exists ad_orders_space_fechas on public.ad_orders (space_id, inicia_el, termina_el);

alter table public.ad_orders enable row level security;

drop policy if exists ad_orders_admin on public.ad_orders;
create policy ad_orders_admin on public.ad_orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.ad_orders from anon, authenticated;
grant select, insert, update on public.ad_orders to authenticated;   -- la policy deja pasar solo al admin

-- ---------------------------------------------------------------------
-- 3. El cupo, garantizado en la base
--
-- Los estados que OCUPAN lugar son los que ya tienen el espacio tomado:
-- pagado, en_revision y aprobado. Un borrador o un pendiente de pago no
-- reservan (si reservaran, un pago abandonado bloquearia el espacio).
--
-- Se bloquea la fila del espacio (FOR UPDATE) para que dos altas
-- simultaneas no puedan pasar las dos el control: la segunda espera a que
-- termine la primera y despues cuenta con ella adentro.
--
-- Se mide la ocupacion MAXIMA en cualquier dia del rango, no la cantidad de
-- anuncios que lo tocan: en el carrusel, uno de enero y otro de marzo no
-- estan nunca juntos y no deben sumar dos para uno que va de enero a marzo.
-- El maximo de solapamiento siempre ocurre en el dia en que empieza algun
-- anuncio, asi que alcanza con mirar esos dias.
-- ---------------------------------------------------------------------
create or replace function public.ad_controlar_cupo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cupo   int;
  v_max    int;
  v_dia    date;
begin
  if new.estado not in ('pagado','en_revision','aprobado') then
    return new;
  end if;

  select cupo into v_cupo from public.ad_spaces where id = new.space_id for update;
  if v_cupo is null then
    raise exception 'El espacio % no existe', new.space_id;
  end if;

  select d, n into v_dia, v_max from (
    select p.d,
           (select count(*) from public.ad_orders o
             where o.space_id = new.space_id
               and o.id <> new.id
               and o.estado in ('pagado','en_revision','aprobado')
               and o.inicia_el <= p.d and o.termina_el > p.d) as n
      from (
        select new.inicia_el as d
        union
        select o.inicia_el from public.ad_orders o
         where o.space_id = new.space_id and o.id <> new.id
           and o.estado in ('pagado','en_revision','aprobado')
           and o.inicia_el > new.inicia_el and o.inicia_el < new.termina_el
      ) p
  ) t
  order by n desc, d
  limit 1;

  if coalesce(v_max, 0) + 1 > v_cupo then
    raise exception 'ESPACIO_OCUPADO: el espacio % ya tiene % anuncio(s) el %', new.space_id, v_max, to_char(v_dia, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists ad_orders_cupo on public.ad_orders;
create trigger ad_orders_cupo
  before insert or update of space_id, inicia_el, termina_el, estado on public.ad_orders
  for each row execute function public.ad_controlar_cupo();

create or replace function public.ad_tocar_actualizado()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.actualizado_el := now(); return new; end; $$;

drop trigger if exists ad_orders_actualizado on public.ad_orders;
create trigger ad_orders_actualizado before update on public.ad_orders
  for each row execute function public.ad_tocar_actualizado();

drop trigger if exists ad_spaces_actualizado on public.ad_spaces;
create trigger ad_spaces_actualizado before update on public.ad_spaces
  for each row execute function public.ad_tocar_actualizado();

-- ---------------------------------------------------------------------
-- 4. Lo que lee la app
--
-- Solo anuncios aprobados, vigentes HOY en hora argentina, de espacios
-- activos. Solo campos que igual se ven en pantalla. Ni contacto, ni
-- whatsapp, ni email, ni monto, ni token.
-- ---------------------------------------------------------------------
create or replace function public.anuncios_vigentes()
returns table (id uuid, space_id text, empresa text, imagen_url text, destino_url text, alt_text text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, o.space_id, o.empresa, o.imagen_url, o.destino_url, o.alt_text
    from public.ad_orders o
    join public.ad_spaces s on s.id = o.space_id and s.activo
   where o.estado = 'aprobado'
     and o.imagen_url is not null
     and o.inicia_el <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
     and o.termina_el > (now() at time zone 'America/Argentina/Buenos_Aires')::date
   order by o.space_id, o.inicia_el, o.creado_el;
$$;

revoke all on function public.anuncios_vigentes() from public;
grant execute on function public.anuncios_vigentes() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Las piezas
--
-- Bucket publico (la app las muestra por URL) con tope de 2 MB y solo
-- JPG/PNG/WebP. Subir y borrar, solo un admin. Nombre de archivo siempre
-- irrepetible: la app las cachea un ano (ver CACHE_FOTOS en js/app.js).
--
-- ⚠️ EL BUCKET NO PUEDE LLAMARSE "publicidad" (ni anuncios, ads, banners).
-- EasyList, la lista de casi todos los bloqueadores, frena toda imagen con
-- /publicidad/ en la direccion. Paso en la primera prueba (2026-11-19): la
-- pieza no cargaba y el anuncio se escondia solo. Por eso se llama vitrina.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vitrina', 'vitrina', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists vitrina_subir_admin on storage.objects;
create policy vitrina_subir_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vitrina' and public.is_admin());

drop policy if exists vitrina_borrar_admin on storage.objects;
create policy vitrina_borrar_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'vitrina' and public.is_admin());

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Para deshacer:
--   drop function if exists public.anuncios_vigentes();
--   drop table if exists public.ad_orders;
--   drop table if exists public.ad_spaces;
--   drop function if exists public.ad_controlar_cupo();
--   drop function if exists public.ad_tocar_actualizado();
--   drop policy if exists publicidad_subir_admin on storage.objects;
--   drop policy if exists publicidad_borrar_admin on storage.objects;
--   (el bucket se borra desde el panel de Supabase una vez vacio)
-- ---------------------------------------------------------------------
