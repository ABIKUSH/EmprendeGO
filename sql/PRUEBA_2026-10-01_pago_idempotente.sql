-- ============================================================================
-- PRUEBA de 2026-10-01_pago_idempotente.sql
--
-- Corre DESPUES de aplicar la migración. No deja nada: todo pasa dentro de una
-- transacción que termina en ROLLBACK, así que ningún proveedor real queda
-- tocado y ningún pago inventado queda registrado.
--
-- ⚠️ ANTES DE EMPEZAR, mirá la firma real de activar_plan_pro. Si la migración
-- se negó a aplicarse, la respuesta está acá:
--
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname = 'activar_plan_pro';
--
-- Qué tiene que pasar: las 6 comprobaciones imprimen OK. Si alguna imprime
-- FALLA, no toques el webhook y avisá.
-- ============================================================================

begin;

do $$
declare
  v_prov   uuid;
  v_pago   text := 'PRUEBA-' || gen_random_uuid()::text;
  v_r1     jsonb;
  v_r2     jsonb;
  v_hasta1 timestamptz;
  v_hasta2 timestamptz;
  v_filas  int;
begin
  -- Un proveedor real cualquiera, para no inventar un uuid que no existe.
  select id into v_prov from public.proveedores where estado = 'aprobado' limit 1;
  if v_prov is null then
    raise notice 'FALLA: no hay ningún proveedor aprobado para probar';
    return;
  end if;
  raise notice 'Probando con el proveedor %', v_prov;

  -- ---- 1) El primer aviso activa ----
  v_r1 := public.activar_plan_pro_pago(v_pago, v_prov, 20000, 'ARS', 'approved');
  if (v_r1->>'ok')::boolean and (v_r1->>'duplicado')::boolean = false then
    raise notice 'OK   1) el primer aviso activa el plan';
  else
    raise notice 'FALLA 1) el primer aviso devolvió %', v_r1;
  end if;

  select plan_hasta into v_hasta1 from public.proveedores where id = v_prov;

  -- ---- 2) El segundo aviso del MISMO pago no activa ----
  v_r2 := public.activar_plan_pro_pago(v_pago, v_prov, 20000, 'ARS', 'approved');
  if (v_r2->>'duplicado')::boolean then
    raise notice 'OK   2) el aviso repetido se reconoce como duplicado';
  else
    raise notice 'FALLA 2) el aviso repetido NO se detectó: %', v_r2;
  end if;

  -- ---- 3) Y, sobre todo, NO movió la fecha ----
  select plan_hasta into v_hasta2 from public.proveedores where id = v_prov;
  if v_hasta1 is not distinct from v_hasta2 then
    raise notice 'OK   3) la fecha de vencimiento no se movió (%)', v_hasta2;
  else
    raise notice 'FALLA 3) la fecha se extendió de % a % — ES EL BUG', v_hasta1, v_hasta2;
  end if;

  -- ---- 4) Quedó una sola fila por pago ----
  select count(*) into v_filas from public.mp_pagos_procesados where payment_id = v_pago;
  if v_filas = 1 then
    raise notice 'OK   4) quedó una sola fila para ese pago';
  else
    raise notice 'FALLA 4) quedaron % filas', v_filas;
  end if;

  -- ---- 5) Un payment_id vacío no rompe nada ----
  v_r1 := public.activar_plan_pro_pago('', v_prov, 20000, 'ARS', 'approved');
  if (v_r1->>'ok')::boolean = false then
    raise notice 'OK   5) un pago sin id se rechaza en vez de activar';
  else
    raise notice 'FALLA 5) un pago sin id devolvió %', v_r1;
  end if;
end $$;

-- ---- 6) Que nadie con sesión pueda llamarla ----
-- ⚠️ ESTA ES LA MÁS IMPORTANTE DE LAS SEIS. Si `authenticated` puede ejecutar
-- esta función, cualquiera con una cuenta se regala el Plan Pro inventando un
-- payment_id. La función activa un plan pago y es SECURITY DEFINER.
do $$
declare v_mal text;
begin
  select string_agg(grantee, ', ')
    into v_mal
  from information_schema.role_routine_grants
  where specific_schema = 'public'
    and routine_name = 'activar_plan_pro_pago'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  if v_mal is null then
    raise notice 'OK   6) ni anon ni authenticated pueden ejecutarla';
  else
    raise notice 'FALLA 6) la pueden ejecutar: % — REVOCAR ANTES DE SEGUIR', v_mal;
  end if;
end $$;

-- ---- Y que la tabla no sea legible desde el navegador ----
do $$
declare v_mal text;
begin
  select string_agg(grantee, ', ')
    into v_mal
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'mp_pagos_procesados'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  if v_mal is null then
    raise notice 'OK   7) la tabla de pagos no es legible desde el navegador';
  else
    raise notice 'FALLA 7) la pueden leer: %', v_mal;
  end if;
end $$;

rollback;

-- ⚠️ TERMINA EN ROLLBACK. Nada de lo anterior quedó escrito: ni el pago de
-- prueba, ni el cambio de plan del proveedor que se usó. Si por algún motivo
-- corrés las sentencias sueltas en vez del archivo entero, acordate de deshacer
-- a mano.
