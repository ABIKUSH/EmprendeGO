-- 2026-10-08 — EL BOTON DE WHATSAPP ESTUVO ROTO SIETE DIAS. Una palabra.
--
-- QUE PASO: `whatsapp_de_proveedor()` se creó el 2026-10-01 declarada STABLE y
-- adentro hace un INSERT en `contactos_revelados`. PostgreSQL no permite
-- escribir desde una función no volátil: la corta con
--   ERROR: INSERT is not allowed in a non-volatile function
-- y la tira SIEMPRE, en la primera llamada de cualquier persona.
--
-- O sea que desde el 1 de octubre NADIE pudo obtener un solo número de
-- WhatsApp. El frente lo atrapa con un `catch` y muestra "No pudimos obtener el
-- WhatsApp", así que no hubo pantalla rota, no hubo error en consola del lado
-- del servidor y nadie se quejó: simplemente dejó de funcionar lo único que
-- EmprendeGO hace de verdad.
--
-- LAS DOS PRUEBAS, por si hace falta volver a leer esto:
--   . `contactos_revelados` tenía CERO filas. La función nunca llegó al final.
--   . El evento `contact_whatsapp` de GA4 venía con ~35 por día y se corta seco
--     el 2026-10-01: 18 ese día y después siete días en cero.
-- Son ~245 contactos perdidos, que es la mercadería que esta aplicación entrega.
--
-- ⚠️ POR QUE NO SE VIO ANTES, que es la parte que importa:
--   1. La prueba `test/permisos-publicos.test.js` le pregunta a producción qué
--      se puede leer SIN sesión. Esta función exige sesión, así que queda
--      fuera de su alcance por diseño: contestaba `sin_sesion` -la respuesta
--      correcta- sin llegar nunca al INSERT que rompe.
--   2. El `catch` del frente convierte cualquier falla en un cartelito gris.
--      Una función que devuelve `{ok:false, motivo:...}` para los casos
--      previstos y TIRA para los imprevistos necesita que alguien mire el
--      camino feliz con una sesión de verdad, y eso no lo hace ninguna prueba.
--
-- EL ARREGLO: volátil. Es el valor por omisión y es lo que esta función siempre
-- debió ser, porque escribe. STABLE le promete al motor que no modifica nada.
--
-- No se toca una sola línea del cuerpo: ni el control de sesión, ni el de email
-- confirmado, ni el freno de 60 por hora, ni el filtro de aprobados. Lo único
-- que cambia es la volatilidad.
--
-- PARA DESHACER: volver a poner STABLE. (No hacerlo: vuelve a romper.)

create or replace function public.whatsapp_de_proveedor(p_proveedor_id uuid)
returns jsonb
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
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

-- Los permisos se vuelven a declarar porque `create or replace` los conserva,
-- pero si alguna vez se corre esto sobre una base donde la funcion no existe,
-- sin estas dos lineas nadie puede llamarla y el sintoma es el mismo cartel.
revoke all on function public.whatsapp_de_proveedor(uuid) from public, anon;
grant execute on function public.whatsapp_de_proveedor(uuid) to authenticated;
