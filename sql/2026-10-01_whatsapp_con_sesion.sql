-- ============================================================================
-- EL TELEFONO DEL PROVEEDOR DEJA DE SER PUBLICO
--
-- EL PROBLEMA. `proveedores.whatsapp` se devuelve a cualquiera sin sesion: por
-- `/api/catalogo` (que lo pide en COLS) y por la consulta directa de
-- `cargarProveedores()` en js/app.js. Con UN pedido HTTP, sin cuenta, se baja la
-- lista completa de proveedores con sus telefonos. Es el activo del negocio y
-- esta en la vereda.
--
-- Ademas, mientras el numero viaje en el catalogo, TODO control de contacto es
-- decorativo: da igual que la tarjeta pida iniciar sesion si el dato ya esta en
-- la respuesta que la pinto.
--
-- LA DECISION (Abraham, 2026-10-01): para ver el WhatsApp hay que tener sesion.
-- No hace falta ser Pro; alcanza con estar registrado.
--
-- ⚠️ ESTO SE ARREGLA EN LA BASE Y NO EN EL FRONTEND, a proposito. Sacar la
-- columna de `COLS` en api/catalogo.js esconde el dato de UNA de las dos
-- puertas; la clave anonima sigue siendo publica (esta en index.html desde
-- siempre) y cualquiera puede pedirle la columna a PostgREST directamente. El
-- unico lugar donde "no se puede ver" significa algo es el permiso.
--
-- ⚠️ Y SE HACE POR COLUMNA, QUE TIENE UNA TRAMPA. Un `grant select` sobre la
-- TABLA anula cualquier `revoke` por columna (ver project_grant_columna_vs_
-- revocada / el caso de resenas.usuario_email). Entonces no alcanza con revocar
-- `whatsapp`: hay que revocar la tabla entera para `anon` y volver a otorgar
-- columna por columna, todas menos esa. Por eso el bloque de abajo recorre
-- information_schema en vez de listar nombres a mano: una columna nueva que se
-- agregue despues NO queda otorgada sola, y eso es lo correcto -se otorga
-- explicitamente cuando se decide que es publica-.
--
-- Para deshacer, al final del archivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Anon pierde la columna del telefono, y solo esa
-- ----------------------------------------------------------------------------
do $$
declare
  v_col text;
  v_otorgadas int := 0;
begin
  revoke select on public.proveedores from anon;

  for v_col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'proveedores'
      and column_name <> 'whatsapp'
    order by ordinal_position
  loop
    execute format('grant select (%I) on public.proveedores to anon', v_col);
    v_otorgadas := v_otorgadas + 1;
  end loop;

  raise notice 'anon: % columnas de proveedores otorgadas, whatsapp excluida', v_otorgadas;
end $$;

-- ⚠️ `authenticated` CONSERVA LA COLUMNA. La decision fue "con sesion se puede
-- ver", y el panel del propio proveedor necesita leer y editar su numero. El
-- control de quien ve el telefono de QUIEN lo hace la RPC de abajo, que es la
-- que ademas lo registra.

-- ----------------------------------------------------------------------------
-- 2. El registro de contactos
-- ----------------------------------------------------------------------------
-- Ya existe `consultas` para medir el embudo. Esta tabla es otra cosa: es el
-- control de abuso. Sirve para responder "este usuario pidio 300 telefonos en
-- una hora", que es exactamente la forma que tomaria el scraping una vez que
-- pedir sesion sea obligatorio.
create table if not exists public.contactos_revelados (
  id            bigserial primary key,
  usuario_id    uuid not null,
  proveedor_id  uuid not null,
  revelado_at   timestamptz not null default now()
);

alter table public.contactos_revelados enable row level security;
revoke all on public.contactos_revelados from anon, authenticated;

comment on table public.contactos_revelados is
  'Un pedido de telefono por fila. No la lee el navegador: solo la RPC que la escribe y el panel por service_role.';

create index if not exists contactos_revelados_usuario_idx
  on public.contactos_revelados (usuario_id, revelado_at desc);

-- ----------------------------------------------------------------------------
-- 3. La unica puerta al telefono
-- ----------------------------------------------------------------------------
-- ⚠️ DEVUELVE UN TELEFONO, NUNCA UNA LISTA. Recibe un id y devuelve ese numero.
-- Una funcion que aceptara un arreglo de ids volveria a habilitar la descarga
-- masiva con un paso mas, que es justamente lo que se esta cerrando.
create or replace function public.whatsapp_de_proveedor(p_proveedor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $function$
declare
  v_usuario uuid := auth.uid();
  v_wa      text;
  v_pedidos int;
begin
  -- Sin sesion no hay telefono. Es la decision tomada.
  if v_usuario is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;

  -- ⚠️ EL EMAIL TIENE QUE ESTAR CONFIRMADO. Sin esto, "hay que tener cuenta" se
  -- resuelve con cualquier direccion inventada y el control no filtra a nadie.
  if not exists (
    select 1 from auth.users u
    where u.id = v_usuario and u.email_confirmed_at is not null
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'email_sin_confirmar');
  end if;

  -- Freno de abuso: 60 telefonos por hora por persona. Nadie contacta a 60
  -- proveedores en una hora mirando sus fichas; un script si.
  select count(*) into v_pedidos
  from public.contactos_revelados
  where usuario_id = v_usuario
    and revelado_at > now() - interval '1 hour';

  if v_pedidos >= 60 then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_pedidos');
  end if;

  -- Solo proveedores aprobados, igual que el resto del catalogo publico.
  select p.whatsapp into v_wa
  from public.proveedores p
  where p.id = p_proveedor_id
    and p.estado = 'aprobado';

  if v_wa is null or btrim(v_wa) = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_whatsapp');
  end if;

  insert into public.contactos_revelados (usuario_id, proveedor_id)
  values (v_usuario, p_proveedor_id);

  return jsonb_build_object('ok', true, 'whatsapp', v_wa);
end;
$function$;

comment on function public.whatsapp_de_proveedor(uuid) is
  'Devuelve el WhatsApp de UN proveedor aprobado a un usuario con sesion y email confirmado, y lo registra. Unica via de acceso al telefono desde el navegador.';

-- ⚠️ `anon` NO LA PUEDE EJECUTAR. La funcion es SECURITY DEFINER: si anon
-- pudiera llamarla, devolveria el telefono igual que antes -con un paso mas- y
-- toda esta migracion no habria servido para nada.
revoke all on function public.whatsapp_de_proveedor(uuid) from public, anon;
grant execute on function public.whatsapp_de_proveedor(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- PARA DESHACER
-- ============================================================================
-- do $$
-- declare v_col text;
-- begin
--   for v_col in select column_name from information_schema.columns
--     where table_schema='public' and table_name='proveedores'
--   loop execute format('revoke select (%I) on public.proveedores from anon', v_col); end loop;
--   grant select on public.proveedores to anon;
-- end $$;
-- drop function if exists public.whatsapp_de_proveedor(uuid);
-- drop table if exists public.contactos_revelados;
-- notify pgrst, 'reload schema';
--
-- ⚠️ DESHACER ESTO VUELVE A PUBLICAR TODOS LOS TELEFONOS. Antes de correrlo,
-- el frontend tiene que estar devuelto a su version anterior, o va a pedir una
-- funcion que ya no existe.
