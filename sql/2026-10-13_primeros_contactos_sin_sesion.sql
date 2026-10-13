-- 2026-10-13 — LOS PRIMEROS DOS CONTACTOS, SIN CUENTA.
--
-- QUE SE DECIDE Y POR QUE. El 2026-10-01 se cerro el telefono del proveedor
-- detras de una sesion. Era necesario -antes, con un solo pedido y sin cuenta,
-- cualquiera se bajaba los 164 telefonos de un saque- pero costaba algo que no
-- se podia medir, porque la funcion estuvo rota siete dias y tapo el efecto.
--
-- Con el arreglo del 2026-10-08 el numero quedo a la vista:
--     28 al 30 de septiembre, sin muro:  39 a 49 contactos por dia
--      9 al 12 de octubre,   con muro:   13 a 20 contactos por dia
-- y el trafico en ese mismo lapso cayo solo 12%. O sea que el muro se come
-- cerca del 60% de lo unico que esta aplicacion entrega.
--
-- Decision del founder, 2026-10-13: el muro empieza en el TERCER proveedor. El
-- que mira uno o dos pasa libre; el que quiere la lista se choca con el muro.
-- Un comprador real contacta 1,97 mayoristas en promedio (medido sobre los 29
-- primeros compradores), asi que dos gratis deja pasar a la mayoria de la
-- gente de verdad y frena al que esta juntando la base.
--
-- ---------------------------------------------------------------------------
-- ⚠️ LA TRAMPA: `X-Forwarded-For` LA PUEDE ESCRIBIR EL QUE LLAMA.
-- ---------------------------------------------------------------------------
-- Para contar sin cuenta hace falta algo que identifique a quien pide, y lo
-- unico que hay es la direccion IP del encabezado. Pero ese encabezado es una
-- LISTA y el cliente puede mandar la suya: queda "lo que invento el cliente,
-- ..., la IP real que agrego el proxy". Si se toma el PRIMER elemento -que es
-- lo que hace casi todo el mundo- alcanza con mandar un valor distinto en cada
-- pedido para saltearse el limite entero y el muro no protege de nada.
--
-- POR ESO SE TOMA EL ULTIMO, que es el que agrega el proxy de Supabase y el
-- cliente no puede escribir. Si alguna vez se cambia esta linea por el primero,
-- el limite se vuelve decorativo. Hay una prueba que lo vigila.
--
-- ⚠️ Y SI NO HAY IP, SE PIDE SESION. Sin con que contar no se puede dar nada
-- gratis: equivocarse para ese lado cuesta un contacto; para el otro, la lista.
--
-- ⚠️ LA IP NO SE GUARDA: se guarda un md5 con sal. La tabla sirve para contar,
-- no para saber quien es nadie. Una IP es un dato personal y no hay ningun
-- motivo para tenerla escrita.
--
-- ⚠️ Y LOS CONTACTOS ANONIMOS NO ENTRAN EN `contactos_revelados`. Esa tabla
-- alimenta la medicion de recurrencia ("¿el que contacto a un mayorista vuelve
-- y contacta a otro?"), que cuenta PERSONAS con cuenta. Mezclarle filas sin
-- usuario romperia el unico numero que dice si esto es un marketplace o un
-- directorio. Por eso el anonimo va a una tabla aparte.
--
-- PARA DESHACER: volver a la version del 2026-10-08 (whatsapp_volatile) y
-- revocar el execute a anon. La tabla puede quedar; no molesta.

-- ── La cuenta de los anonimos ────────────────────────────────────────────
create table if not exists public.contactos_anonimos (
  id          bigserial primary key,
  ip_hash     text        not null,
  revelado_at timestamptz not null default now()
);

create index if not exists contactos_anonimos_ventana
  on public.contactos_anonimos (ip_hash, revelado_at desc);

-- ⚠️ RLS PRENDIDA, CERO POLICIES Y CERO GRANTS, igual que `avisos_wa`. Solo la
-- toca la funcion de abajo, que es SECURITY DEFINER. Nadie la lee desde el
-- navegador: adentro hay un rastro de quien pidio que, aunque sea hasheado.
alter table public.contactos_anonimos enable row level security;
revoke all on public.contactos_anonimos from anon, authenticated;
revoke all on sequence public.contactos_anonimos_id_seq from anon, authenticated;

create or replace function public.whatsapp_de_proveedor(p_proveedor_id uuid)
returns jsonb
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- Cuantos proveedores puede ver alguien SIN cuenta, por IP y por dia.
  -- En 2 porque el comprador real contacta 1,97 mayoristas en promedio.
  c_libres  constant int := 2;
  v_usuario uuid := auth.uid();
  v_wa      text;
  v_pedidos int;
  v_xff     text;
  v_ip      text;
  v_hash    text;
begin
  -- ── Camino con sesion: como estaba ────────────────────────────────────
  if v_usuario is not null then
    if not exists (
      select 1 from auth.users u
      where u.id = v_usuario and u.email_confirmed_at is not null
    ) then
      return jsonb_build_object('ok', false, 'motivo', 'email_sin_confirmar');
    end if;

    select count(*) into v_pedidos
    from public.contactos_revelados
    where usuario_id = v_usuario
      and revelado_at > now() - interval '1 hour';

    if v_pedidos >= 60 then
      return jsonb_build_object('ok', false, 'motivo', 'demasiados_pedidos');
    end if;

    select p.whatsapp into v_wa
    from public.proveedores p
    where p.id = p_proveedor_id and p.estado = 'aprobado';

    if v_wa is null or btrim(v_wa) = '' then
      return jsonb_build_object('ok', false, 'motivo', 'sin_whatsapp');
    end if;

    insert into public.contactos_revelados (usuario_id, proveedor_id)
    values (v_usuario, p_proveedor_id);

    return jsonb_build_object('ok', true, 'whatsapp', v_wa);
  end if;

  -- ── Camino sin sesion: los primeros dos del dia ───────────────────────
  v_xff := nullif(btrim(coalesce(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', '')), '');

  -- ⚠️ EL ULTIMO ELEMENTO, NO EL PRIMERO. Ver el encabezado de este archivo:
  -- el primero lo puede escribir el que llama y rotarlo en cada pedido.
  if v_xff is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  v_ip := btrim(split_part(v_xff, ',', array_length(string_to_array(v_xff, ','), 1)));
  if v_ip = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;

  v_hash := md5('eg_contacto_anonimo_v1|' || v_ip);

  select count(*) into v_pedidos
  from public.contactos_anonimos
  where ip_hash = v_hash
    and revelado_at > now() - interval '24 hours';

  if v_pedidos >= c_libres then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;

  select p.whatsapp into v_wa
  from public.proveedores p
  where p.id = p_proveedor_id and p.estado = 'aprobado';

  if v_wa is null or btrim(v_wa) = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_whatsapp');
  end if;

  -- ⚠️ SE ANOTA ACA Y NO EN `contactos_revelados`: esa tabla cuenta personas
  -- con cuenta y alimenta la medicion de recurrencia.
  insert into public.contactos_anonimos (ip_hash) values (v_hash);

  return jsonb_build_object('ok', true, 'whatsapp', v_wa);
end;
$function$;

-- ⚠️ ANON PUEDE EJECUTARLA, Y TODA LA DEFENSA VIVE ADENTRO. Es a proposito y es
-- la unica forma de que los dos primeros sean gratis. Lo que `anon` NO tiene es
-- la columna `proveedores.whatsapp` ni ninguna de las dos tablas de registro.
revoke all on function public.whatsapp_de_proveedor(uuid) from public;
grant execute on function public.whatsapp_de_proveedor(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
