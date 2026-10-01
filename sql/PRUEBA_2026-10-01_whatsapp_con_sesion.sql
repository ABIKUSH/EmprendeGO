-- ============================================================================
-- PRUEBA de 2026-10-01_whatsapp_con_sesion.sql
--
-- Corre DESPUÉS de aplicar la migración. No escribe nada permanente.
-- Las 5 comprobaciones tienen que imprimir OK.
--
-- ⚠️ LA PRUEBA 1 ES LA QUE IMPORTA. Si esa falla, el teléfono sigue siendo
-- público y la migración no sirvió de nada, por más que las otras pasen.
-- ============================================================================

-- ---- 1) anon NO puede leer el teléfono, pero sí el resto ----
do $$
declare v_wa int; v_nombre int;
begin
  select count(*) into v_wa
  from information_schema.column_privileges
  where table_schema='public' and table_name='proveedores'
    and column_name='whatsapp' and grantee='anon' and privilege_type='SELECT';

  select count(*) into v_nombre
  from information_schema.column_privileges
  where table_schema='public' and table_name='proveedores'
    and column_name='nombre' and grantee='anon' and privilege_type='SELECT';

  if v_wa = 0 and v_nombre > 0 then
    raise notice 'OK   1) anon perdió whatsapp y conserva el resto del catálogo';
  elsif v_wa > 0 then
    raise notice 'FALLA 1) anon TODAVÍA puede leer whatsapp — el teléfono sigue público';
  else
    raise notice 'FALLA 1) anon perdió también las columnas públicas: el catálogo va a aparecer vacío';
  end if;
end $$;

-- ---- 2) Y que no haya quedado un grant de tabla que anule todo lo anterior ----
-- ⚠️ Un `grant select` sobre la tabla entera le devuelve TODAS las columnas a
-- anon, incluida whatsapp, sin que ningún revoke por columna lo impida.
do $$
declare v_tabla int;
begin
  select count(*) into v_tabla
  from information_schema.role_table_grants
  where table_schema='public' and table_name='proveedores'
    and grantee='anon' and privilege_type='SELECT';

  if v_tabla = 0 then
    raise notice 'OK   2) no quedó un permiso de tabla que anule el de columna';
  else
    raise notice 'FALLA 2) anon tiene SELECT sobre la tabla entera — eso devuelve whatsapp igual';
  end if;
end $$;

-- ---- 3) anon no puede ejecutar la función ----
do $$
declare v_mal text;
begin
  select string_agg(grantee, ', ') into v_mal
  from information_schema.role_routine_grants
  where specific_schema='public' and routine_name='whatsapp_de_proveedor'
    and grantee in ('anon','PUBLIC');

  if v_mal is null then
    raise notice 'OK   3) anon no puede llamar a whatsapp_de_proveedor';
  else
    raise notice 'FALLA 3) la puede ejecutar: % — sería el mismo agujero con un paso más', v_mal;
  end if;
end $$;

-- ---- 4) authenticated sí puede ----
do $$
declare v_ok int;
begin
  select count(*) into v_ok
  from information_schema.role_routine_grants
  where specific_schema='public' and routine_name='whatsapp_de_proveedor'
    and grantee='authenticated';

  if v_ok > 0 then
    raise notice 'OK   4) un usuario con sesión puede pedir un teléfono';
  else
    raise notice 'FALLA 4) nadie puede llamarla: el botón de contactar no va a funcionar';
  end if;
end $$;

-- ---- 5) Sin sesión, la función se niega ----
-- En el editor SQL no hay auth.uid(), así que esto simula a un anónimo.
do $$
declare v_r jsonb;
begin
  select public.whatsapp_de_proveedor(
    (select id from public.proveedores where estado='aprobado' limit 1)
  ) into v_r;

  if (v_r->>'ok')::boolean = false and v_r->>'motivo' = 'sin_sesion' then
    raise notice 'OK   5) sin sesión devuelve sin_sesion y ningún teléfono';
  else
    raise notice 'FALLA 5) sin sesión devolvió % — REVISAR ANTES DE SEGUIR', v_r;
  end if;
end $$;

-- ---- 6) El catálogo público sigue funcionando ----
-- ⚠️ Esto es lo que hay que mirar en la app después de aplicar: que las fichas
-- se sigan viendo. Si la prueba 1 hubiera revocado de más, acá se nota.
select count(*) as proveedores_aprobados_visibles
from public.proveedores where estado = 'aprobado';
