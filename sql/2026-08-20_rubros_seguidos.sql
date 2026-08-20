-- =====================================================================
-- COTIZACIONES — el proveedor sigue rubros (como un follow de Instagram).
-- Fecha: 2026-08-20
--
-- CORRER A MANO en el editor SQL de Supabase (proyecto seubtijmyoahnyspvidq).
--
-- ORDEN: es independiente de las dos migraciones de Cotizaciones. No toca
-- solicitudes ni cotizaciones: agrega UNA columna a proveedores.
--
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- =====================================================================
-- POR QUE
--
-- El feed de Cotizaciones le muestra a cada proveedor TODOS los pedidos
-- abiertos. Un proveedor de indumentaria baja por pedidos de electronica,
-- ferreteria y alimentos para encontrar el suyo. Cuanto mas crece el feed,
-- peor: el exito de la seccion la vuelve inservible para el que la usa.
--
-- Aca se guarda a que rubros le presta atencion cada proveedor. Hoy eso
-- filtra su feed. Cuando existan las notificaciones, es la lista que dice a
-- quien avisarle: por eso el indice GIN, que sirve justamente para la
-- pregunta "quienes siguen este rubro" (rubros_seguidos && array['X']).
--
-- =====================================================================
-- POR QUE UNA COLUMNA Y NO UNA TABLA proveedor_rubros
--
-- Una tabla nueva obliga a escribir sus 4 policies de RLS, sus GRANT y su
-- indice, y a mantener todo eso en sincronia con proveedores. Esto es una
-- PREFERENCIA del proveedor sobre su propia fila, del mismo tamaño que
-- ml_categoria_map o tn_categoria_map, que ya viven como columna ahi.
--
-- Y sobre todo: la policy prov_update_propio ya deja que el proveedor
-- modifique su propia fila (email = auth.email()), asi que no hay ni una
-- policy nueva que escribir ni que revisar.
--
-- =====================================================================
-- NULL NO ES LO MISMO QUE ARRAY VACIO
--
--   NULL          -> "todavia no eligio nada" -> el feed le muestra TODO.
--   array vacio   -> lo prohibe el CHECK, justamente para que no exista un
--                    segundo estado que signifique lo mismo que NULL.
--
-- La columna nace en NULL para TODOS los proveedores de hoy, a proposito: a
-- nadie se le esconde nada por una migracion que no pidio. El filtro recien
-- empieza a actuar cuando la persona elige su primer rubro.
--
-- NO se siembra el rubro propio del proveedor como seguido. Un mayorista de
-- Blanqueria puede querer ver tambien Textil y Hogar y Deco; sembrarle un
-- solo rubro le esconderia los otros dos sin que se entere. La pantalla se
-- lo OFRECE marcado como sugerencia, pero guardar es decision suya.
--
-- =====================================================================
-- QUIEN LO PUEDE VER
--
-- Se otorga SELECT y UPDATE de la columna a authenticated, no a anon: el
-- visitante sin sesion no tiene por que llevarse las preferencias de nadie.
--
-- OJO con lo que igual va a aparecer: anon queda con INSERT y REFERENCES
-- sobre esta columna sin que nadie se los de. Los tiene sobre la TABLA
-- (el registro de un proveedor pasa sin sesion) y un grant de tabla cubre
-- toda columna nueva sola. Los SELECT de proveedores, en cambio, estan
-- otorgados columna por columna, asi que la nueva no hereda lectura, que es
-- lo unico que importaba. Ver la comprobacion l) al pie.
--
-- OJO, sinceridad sobre el alcance: prov_select_auth deja que CUALQUIER
-- usuario logueado lea las filas de los proveedores aprobados, y la RLS no
-- filtra por columna. O sea que otro proveedor logueado puede leer que
-- rubros sigue un competidor. Se acepta: es "que rubros me interesan", no
-- un dato de contacto ni comercial. Si algun dia molesta, la solucion no es
-- sacar el GRANT (romperia la lectura del propio dueño), es moverlo a una
-- tabla aparte con su propia policy.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.proveedores') is null then
    raise exception 'Falta la tabla public.proveedores.';
  end if;

  -- Sin esta policy, el proveedor podria leer la columna pero nunca
  -- guardarla, y la pantalla quedaria con un boton que no hace nada.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'proveedores'
      and policyname = 'prov_update_propio'
  ) then
    raise exception
      'Falta la policy prov_update_propio en proveedores: sin ella el proveedor no puede guardar sus rubros.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) LA COLUMNA
-- ---------------------------------------------------------------------
alter table public.proveedores
  add column if not exists rubros_seguidos text[];

comment on column public.proveedores.rubros_seguidos is
  'Rubros que el proveedor eligio seguir en Cotizaciones. NULL = no eligio nada, ve todo el feed. Lo usa el filtro del feed y, mas adelante, a quien notificar.';

-- ---------------------------------------------------------------------
-- 2) VALIDACION DE FORMA (no de contenido)
--
-- Un CHECK de Postgres no admite subconsultas, y para saber si un array
-- trae repetidos hace falta una: por eso la validacion vive en una funcion
-- IMMUTABLE y el CHECK solo la llama. Es el mismo recurso que ya usa
-- cotiz_lista_de_textos() en la migracion de los pedidos tipo B.
--
-- A PROPOSITO no se valida contra RUBROS_LISTA. Esa lista vive en app.js y
-- cambia cuando el founder agrega un rubro; un CHECK que la espeje
-- rechazaria el rubro nuevo hasta que alguien se acuerde de correr un SQL,
-- y el sintoma seria un boton que no guarda sin decir por que. Se valida la
-- FORMA (cuantos, que no vengan vacios, que no se repitan) y nada mas.
--
-- El tope de 10 no es estetico: sin el, nada impide que alguien mande un
-- array de miles de entradas contra la API y lo deje ahi para siempre.
-- Con 27 rubros en la app, quien sigue mas de 10 en realidad quiere ver
-- todo, y para eso ya esta NULL.
-- ---------------------------------------------------------------------
create or replace function public.prov_rubros_seguidos_ok(v text[])
returns boolean
language sql
immutable
as $$
  select v is null
      or (
        cardinality(v) between 1 and 10
        and not exists (
          select 1 from unnest(v) as x
          where x is null or btrim(x) = '' or length(x) > 60
        )
        and cardinality(v) = (select count(distinct x) from unnest(v) as x)
      );
$$;

alter table public.proveedores
  drop constraint if exists proveedores_rubros_seguidos_chk;

alter table public.proveedores
  add constraint proveedores_rubros_seguidos_chk
  check (public.prov_rubros_seguidos_ok(rubros_seguidos));

-- ---------------------------------------------------------------------
-- 3) INDICE
--
-- Todavia no lo usa nadie: el filtro del feed corre en el navegador, sobre
-- la lista que ya esta en memoria. Es para la consulta de las
-- notificaciones, que va a ser al reves — dado un rubro, quienes lo siguen:
--
--   select id, nombre from proveedores
--    where rubros_seguidos && array['Indumentaria']::text[];
--
-- Sin el indice eso es un scan de la tabla entera por cada pedido nuevo.
-- ---------------------------------------------------------------------
create index if not exists proveedores_rubros_seguidos_gin
  on public.proveedores using gin (rubros_seguidos);

-- ---------------------------------------------------------------------
-- 4) GRANTS
--
-- IMPRESCINDIBLE: ALTER TABLE ADD COLUMN no hereda los permisos de la
-- tabla. proveedores tiene los GRANT otorgados COLUMNA POR COLUMNA (hoy 29
-- de SELECT y 36 de UPDATE para authenticated), asi que una columna nueva
-- nace sin ningun permiso y PostgREST devuelve 403 al leerla.
-- ---------------------------------------------------------------------
grant select (rubros_seguidos) on public.proveedores to authenticated;
grant update (rubros_seguidos) on public.proveedores to authenticated;

notify pgrst, 'reload schema';

commit;


-- =====================================================================
-- COMPROBACIONES. Se corren solas al terminar; mirar que TODAS digan BIEN.
--
-- No se inserta ningun proveedor de prueba: el CHECK no hace mas que llamar
-- a prov_rubros_seguidos_ok(), asi que probar la funcion prueba el CHECK,
-- y sin escribir una sola fila en una tabla de produccion.
-- =====================================================================
drop table if exists prueba_rubros;
create temp table prueba_rubros (que text, resultado text);

do $$
declare
  ok boolean;
begin
  -- a) la columna existe
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proveedores'
      and column_name = 'rubros_seguidos' and data_type = 'ARRAY'
  ) then
    insert into prueba_rubros values ('a) columna rubros_seguidos text[]', 'BIEN: existe');
  else
    insert into prueba_rubros values ('a) columna rubros_seguidos text[]', 'MAL: no esta');
  end if;

  -- b) NULL se acepta: es el estado "ve todo el feed"
  ok := public.prov_rubros_seguidos_ok(null);
  insert into prueba_rubros values ('b) NULL (ve todo)',
    case when ok then 'BIEN: se acepta' else 'MAL: lo rechaza' end);

  -- c) una lista normal se acepta
  ok := public.prov_rubros_seguidos_ok(array['Indumentaria','Textil y Telas','Blanquería']);
  insert into prueba_rubros values ('c) tres rubros distintos',
    case when ok then 'BIEN: se acepta' else 'MAL: lo rechaza' end);

  -- d) array vacio NO: seria un segundo estado que significa lo mismo que NULL
  ok := public.prov_rubros_seguidos_ok(array[]::text[]);
  insert into prueba_rubros values ('d) array vacio',
    case when ok then 'MAL: entra y no deberia' else 'BIEN: rebota' end);

  -- e) repetidos NO
  ok := public.prov_rubros_seguidos_ok(array['Indumentaria','Indumentaria']);
  insert into prueba_rubros values ('e) rubro repetido',
    case when ok then 'MAL: entra y no deberia' else 'BIEN: rebota' end);

  -- f) vacios o solo espacios NO
  ok := public.prov_rubros_seguidos_ok(array['Indumentaria','   ']);
  insert into prueba_rubros values ('f) entrada en blanco',
    case when ok then 'MAL: entra y no deberia' else 'BIEN: rebota' end);

  -- g) mas de 10 NO
  ok := public.prov_rubros_seguidos_ok(
    array['r1','r2','r3','r4','r5','r6','r7','r8','r9','r10','r11']);
  insert into prueba_rubros values ('g) once rubros',
    case when ok then 'MAL: entra y no deberia' else 'BIEN: rebota' end);

  -- h) una entrada larguisima NO
  ok := public.prov_rubros_seguidos_ok(array[repeat('x', 61)]);
  insert into prueba_rubros values ('h) entrada de 61 caracteres',
    case when ok then 'MAL: entra y no deberia' else 'BIEN: rebota' end);

  -- i) el CHECK de la tabla realmente llama a esa funcion
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.proveedores'::regclass
      and conname = 'proveedores_rubros_seguidos_chk'
      and pg_get_constraintdef(oid) ilike '%prov_rubros_seguidos_ok%'
  ) then
    insert into prueba_rubros values ('i) CHECK enganchado a la funcion', 'BIEN: enganchado');
  else
    insert into prueba_rubros values ('i) CHECK enganchado a la funcion', 'MAL: no esta');
  end if;

  -- j) GRANT de lectura (sin esto, PostgREST devuelve 403)
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'proveedores'
      and column_name = 'rubros_seguidos'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    insert into prueba_rubros values ('j) GRANT SELECT a authenticated', 'BIEN: otorgado');
  else
    insert into prueba_rubros values ('j) GRANT SELECT a authenticated', 'MAL: falta');
  end if;

  -- k) GRANT de escritura
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'proveedores'
      and column_name = 'rubros_seguidos'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) then
    insert into prueba_rubros values ('k) GRANT UPDATE a authenticated', 'BIEN: otorgado');
  else
    insert into prueba_rubros values ('k) GRANT UPDATE a authenticated', 'MAL: falta');
  end if;

  /* l) anon NO la tiene que poder LEER.

     Se pregunta por SELECT y no por "algun permiso". Verificado el
     2026-08-20 contra produccion: anon tiene INSERT y REFERENCES sobre esta
     columna, pero no porque se los haya dado nadie — los tiene sobre la
     TABLA, y un grant de tabla cubre toda columna nueva automaticamente.
     Los SELECT, en cambio, estan otorgados columna por columna (26 de 37),
     asi que la columna nueva no hereda ninguno. Que es lo que se queria.

     Ese INSERT heredado no es un agujero: el registro de un proveedor pasa
     SIN sesion (prov_insert es TO anon, authenticated), el CHECK acota el
     array, la fila nace en estado='pendiente' e invisible, y sin sesion no
     hay forma de leerla de vuelta. Sacarlo obligaria a revocarle el INSERT
     de tabla a anon y re-otorgar las 37 columnas: romper el registro de
     proveedores para arreglar nada. Ademas un GRANT de tabla le gana a un
     REVOKE por columna, asi que el revoke puntual ni siquiera andaria. */
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'proveedores'
      and column_name = 'rubros_seguidos'
      and grantee = 'anon' and privilege_type = 'SELECT'
  ) then
    insert into prueba_rubros values ('l) anon no la puede leer', 'MAL: anon tiene SELECT');
  else
    insert into prueba_rubros values ('l) anon no la puede leer', 'BIEN: anon no la ve');
  end if;

  -- m) el indice para las notificaciones que vienen
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'proveedores'
      and indexname = 'proveedores_rubros_seguidos_gin'
  ) then
    insert into prueba_rubros values ('m) indice GIN', 'BIEN: creado');
  else
    insert into prueba_rubros values ('m) indice GIN', 'MAL: no esta');
  end if;

  -- n) nadie quedo con rubros sembrados sin pedirlo
  if not exists (
    select 1 from public.proveedores where rubros_seguidos is not null
  ) then
    insert into prueba_rubros values ('n) nadie arranca con filtro',
      'BIEN: todos en NULL, ven todo el feed');
  else
    insert into prueba_rubros values ('n) nadie arranca con filtro',
      'OJO: ya hay proveedores con rubros elegidos (esperable si esto ya se uso)');
  end if;
end $$;

select * from prueba_rubros;


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   drop index if exists public.proveedores_rubros_seguidos_gin;
--   alter table public.proveedores drop constraint if exists proveedores_rubros_seguidos_chk;
--   drop function if exists public.prov_rubros_seguidos_ok(text[]);
--   -- OJO: esto tira a la basura lo que cada proveedor haya elegido seguir.
--   alter table public.proveedores drop column if exists rubros_seguidos;
--   notify pgrst, 'reload schema';
--
-- Nada de esto rompe el frontend: cotizaciones.js pide la columna en una
-- consulta aparte y, si falla, apaga el filtro y muestra el feed completo,
-- que es como funcionaba antes.
-- =====================================================================
