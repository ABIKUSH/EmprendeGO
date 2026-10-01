-- ============================================================================
-- UN PAGO ACTIVA EL PLAN UNA SOLA VEZ
--
-- EL PROBLEMA, Y ES PLATA. `api/webhook-mp.js` llama a `activar_plan_pro(p_id)`
-- cada vez que Mercado Pago avisa de un pago aprobado. Mercado Pago NO avisa
-- una vez por pago: manda varios avisos del mismo pago (`payment.created`,
-- `payment.updated`, y reintentos si alguna vez no contestamos 200). Cada uno
-- de esos avisos extiende el plan 30 dias mas.
--
-- O sea: un pago de 20.000 puede convertirse en tres meses de Pro. No hace
-- falta que nadie ataque nada; alcanza con que Mercado Pago funcione como
-- funciona.
--
-- LA SOLUCION NO REESCRIBE `activar_plan_pro`, LA ENVUELVE. Esa funcion vive
-- solo en el tablero de Supabase (no esta en este repo) y hoy anda bien: es la
-- que sabe como se extiende un plan, que pasa si el proveedor ya era Pro y
-- desde cuando cuenta. Reimplementar esa logica aca seria arriesgar un error de
-- fechas sobre dinero real para resolver un problema que es de OTRA cosa: de
-- cuantas veces se la llama.
--
-- ⚠️ EL CANDADO ES EL `insert`, NO UN `select` PREVIO. Se intenta insertar el
-- payment_id en una tabla con restriccion unica: si entra, es la primera vez y
-- se activa; si choca, ya estaba y no se toca nada. Hacerlo al reves -mirar si
-- existe y despues insertar- deja una ventana entre las dos operaciones, y dos
-- avisos simultaneos de Mercado Pago pasan los dos. Es el mismo patron de
-- `avisos_wa` y `email_logs`, que ya esta probado en este proyecto.
--
-- Para deshacer, al final del archivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La tabla de pagos ya procesados
-- ----------------------------------------------------------------------------
-- ⚠️ NO LA LEE NADIE DESDE EL NAVEGADOR. Tiene importes y la relacion entre un
-- pago y un proveedor. RLS activada, cero policies y cero grants: solo la ve el
-- service_role, igual que `avisos_wa` e `informes_wa`.
create table if not exists public.mp_pagos_procesados (
  payment_id    text primary key,
  proveedor_id  uuid not null,
  importe       numeric(12,2),
  moneda        text,
  estado        text,
  procesado_at  timestamptz not null default now()
);

alter table public.mp_pagos_procesados enable row level security;
revoke all on public.mp_pagos_procesados from anon, authenticated;

comment on table public.mp_pagos_procesados is
  'Un pago de Mercado Pago por fila. La clave primaria sobre payment_id es lo que impide que un mismo pago active el plan dos veces.';

-- Para el panel: "que pagos entraron este mes" sin leer la tabla entera.
create index if not exists mp_pagos_procesados_fecha_idx
  on public.mp_pagos_procesados (procesado_at desc);

-- ----------------------------------------------------------------------------
-- 2. Antes de seguir: que `activar_plan_pro` exista y reciba un uuid
-- ----------------------------------------------------------------------------
-- ⚠️ ESTO FALLA RUIDOSAMENTE A PROPOSITO. Si la funcion no esta o tiene otra
-- firma, prefiero que la migracion se niegue a aplicarse antes que crear un
-- envoltorio que falle en produccion con el primer pago real.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'activar_plan_pro'
      and pg_get_function_identity_arguments(p.oid) ilike '%uuid%'
  ) then
    raise exception
      'No existe public.activar_plan_pro(uuid). Revise la firma real con: select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = ''activar_plan_pro'';';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. El envoltorio idempotente
-- ----------------------------------------------------------------------------
-- Devuelve jsonb con `ok`, `duplicado` y lo que haya devuelto activar_plan_pro.
-- El webhook distingue "se activo" de "ya estaba" por el campo `duplicado`.
create or replace function public.activar_plan_pro_pago(
  p_payment_id   text,
  p_proveedor_id uuid,
  p_importe      numeric default null,
  p_moneda       text    default null,
  p_estado       text    default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to public, pg_temp
as $function$
declare
  v_nuevo    boolean := false;
  v_resultado jsonb;
begin
  if p_payment_id is null or btrim(p_payment_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'payment_id_vacio');
  end if;
  if p_proveedor_id is null then
    return jsonb_build_object('ok', false, 'error', 'proveedor_vacio');
  end if;

  -- El candado. `on conflict do nothing` + `found` dice si esta fila es nueva.
  insert into public.mp_pagos_procesados (payment_id, proveedor_id, importe, moneda, estado)
  values (btrim(p_payment_id), p_proveedor_id, p_importe, p_moneda, p_estado)
  on conflict (payment_id) do nothing;

  get diagnostics v_nuevo = row_count;

  if not v_nuevo then
    -- Ya lo habiamos procesado. No se tocan fechas ni plan.
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  -- Primera vez: se activa con la funcion que ya existia y ya funcionaba.
  -- Si esto levanta una excepcion, la transaccion entera vuelve atras y el
  -- payment_id NO queda marcado como procesado, asi que el proximo aviso de
  -- Mercado Pago lo reintenta. Eso es exactamente lo que queremos.
  select public.activar_plan_pro(p_proveedor_id) into v_resultado;

  return coalesce(v_resultado, '{}'::jsonb) || jsonb_build_object('ok', true, 'duplicado', false);
end;
$function$;

comment on function public.activar_plan_pro_pago(text, uuid, numeric, text, text) is
  'Activa el Plan Pro por un pago de Mercado Pago, una sola vez por payment_id. Envuelve activar_plan_pro() sin reemplazarla.';

-- ⚠️ SOLO EL SERVIDOR. Es SECURITY DEFINER y activa un plan pago: si la pudiera
-- llamar `authenticated`, cualquiera con sesion se regala el Pro inventando un
-- payment_id.
revoke all on function public.activar_plan_pro_pago(text, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.activar_plan_pro_pago(text, uuid, numeric, text, text) to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- PARA DESHACER
-- ============================================================================
-- drop function if exists public.activar_plan_pro_pago(text, uuid, numeric, text, text);
-- drop table if exists public.mp_pagos_procesados;
-- notify pgrst, 'reload schema';
--
-- ⚠️ Si se borra la tabla, se pierde la memoria de que pagos ya se procesaron.
-- Un aviso viejo de Mercado Pago volveria a extender el plan. Antes de borrarla,
-- el webhook tiene que estar devuelto a su version anterior.
