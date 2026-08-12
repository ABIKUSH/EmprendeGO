-- =====================================================================
-- COTIZACIONES — carril "buscado sin respuesta".
-- Fecha: 2026-08-12
--
-- Se corre UNA sola vez, en el SQL editor de Supabase (proyecto
-- seubtijmyoahnyspvidq), con el rol por defecto (postgres).
--
-- Idea: la seccion Cotizaciones se ve vacia porque depende de que alguien
-- se decida a publicar. Pero la demanda YA esta registrada: en los ultimos
-- 30 dias hubo ~13.500 busquedas y ~59% no devolvieron un solo resultado.
-- Eso vive en public.busquedas y no lo ve nadie. Este carril lo muestra.
--
-- IMPORTANTE — esto NO inventa pedidos. Lo que se muestra son BUSQUEDAS,
-- y en la pantalla se dice asi con todas las letras. Fabricar pedidos de
-- cotizacion falsos para que el feed parezca vivo seria mentirle a los
-- proveedores, que son los que despues ponen precio.
--
-- Por que una funcion y no abrir la tabla:
--   public.busquedas tiene RLS y la unica policy de lectura es de admin.
--   Los GRANT de tabla, en cambio, estan abiertos (anon tiene SELECT y
--   UPDATE sobre todas las columnas); hoy lo unico que lo contiene es la
--   RLS. No se toca nada de eso aca, pero conviene saberlo.
--   Con esta funcion anon no gana ningun permiso sobre la tabla.
--
-- Lo que devuelve es agregado y con piso: un termino aparece solo si lo
-- buscaron 5+ veces en 3+ dias distintos. Un termino que alguien escribio
-- una vez (y que podria ser un dato personal) nunca llega a la pantalla.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) CHEQUEO PREVIO
-- ---------------------------------------------------------------------
do $$
declare v_col text;
begin
  if to_regclass('public.busquedas') is null then
    raise exception 'Falta la tabla public.busquedas.';
  end if;
  foreach v_col in array array['termino','resultados','created_at'] loop
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = 'public.busquedas'::regclass
         and a.attname = v_col and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception 'A public.busquedas le falta la columna %', v_col;
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 1) RAIZ DE UN TERMINO
--
-- Sirve para dos cosas: agrupar variantes y comparar contra la lista de
-- ocultos. Sin esto, el carril mostraba "electrodomésticos",
-- "electrodomesticos" y "electrodomestico" como tres chips distintos de
-- lo mismo, que es exactamente lo que hace que un producto se vea roto.
--
-- Baja a minusculas, colapsa espacios, saca acentos y corta el plural.
--   "Electrodomésticos" / "electrodomestico"  -> "electrodomestico"
--   "Yerbas"            / "yerba"             -> "yerba"
--
-- No intenta arreglar faltas de ortografia ("basar" por "bazar"): mezclar
-- s con z uniria tambien "casa" con "caza".
-- ---------------------------------------------------------------------
create or replace function public.cotiz_raiz(p_texto text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(
           translate(
             lower(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'))),
             'áéíóúüàèìòùâêîôûäëïöñ',
             'aeiouuaeiouaeiouaeioun'),
           '(es|s)$', '');
$$;


-- ---------------------------------------------------------------------
-- 2) LISTA DE OCULTOS
--
-- Va en una tabla y no clavada en la funcion para que se pueda tapar un
-- termino sin tocar codigo ni redeployar:
--
--   insert into public.demanda_oculta(raiz, motivo)
--   values (public.cotiz_raiz('lo que sea'), 'por que');
--
-- y para destapar:
--
--   delete from public.demanda_oculta where raiz = public.cotiz_raiz('vaper');
--
-- Sin grants y con RLS prendida: no se lee ni se escribe desde la API con
-- ninguna clave. Solo desde el editor SQL.
-- ---------------------------------------------------------------------
create table if not exists public.demanda_oculta (
  raiz      text primary key,
  motivo    text,
  creado_at timestamptz not null default now()
);

alter table public.demanda_oculta enable row level security;
revoke all on public.demanda_oculta from anon, authenticated;

insert into public.demanda_oculta (raiz, motivo)
select public.cotiz_raiz(v.termino), v.motivo
  from (values
    -- Lugares: la gente busca por zona, pero no es un producto que se pueda pedir.
    ('buenos aires','lugar'),('caba','lugar'),('capital federal','lugar'),
    ('catamarca','lugar'),('chaco','lugar'),('chubut','lugar'),('cordoba','lugar'),
    ('corrientes','lugar'),('entre rios','lugar'),('formosa','lugar'),('jujuy','lugar'),
    ('la pampa','lugar'),('la rioja','lugar'),('mendoza','lugar'),('misiones','lugar'),
    ('neuquen','lugar'),('rio negro','lugar'),('salta','lugar'),('san juan','lugar'),
    ('san luis','lugar'),('santa cruz','lugar'),('santa fe','lugar'),
    ('santiago del estero','lugar'),('tierra del fuego','lugar'),('tucuman','lugar'),
    ('argentina','lugar'),('rosario','lugar'),('mar del plata','lugar'),('la plata','lugar'),
    ('bahia blanca','lugar'),('quilmes','lugar'),('avellaneda','lugar'),('lanus','lugar'),
    ('moron','lugar'),('pilar','lugar'),('tigre','lugar'),('merlo','lugar'),('moreno','lugar'),
    ('resistencia','lugar'),('posadas','lugar'),('parana','lugar'),('once','lugar'),
    ('flores','lugar'),('liniers','lugar'),

    -- Marcas: pedirle esto a un mayorista argentino es, en los hechos,
    -- pedir replicas. No se promueve desde la pantalla.
    ('nike','marca'),('adidas','marca'),('puma','marca'),('reebok','marca'),
    ('apple','marca'),('samsung','marca'),('jbl','marca'),('xiaomi','marca'),
    ('lacoste','marca'),('tommy','marca'),('levis','marca'),('zara','marca'),
    ('disney','marca'),('marvel','marca'),('gucci','marca'),('converse','marca'),
    ('vans','marca'),('fila','marca'),('topper','marca'),('umbro','marca'),
    ('crocs','marca'),('stanley','marca'),

    -- Prohibido o restringido en Argentina. Si no estan de acuerdo, se
    -- borra la fila y vuelve a aparecer.
    ('vaper','ANMAT prohibe el cigarrillo electronico'),
    ('vape','ANMAT prohibe el cigarrillo electronico'),
    ('cigarrillo electronico','ANMAT prohibe el cigarrillo electronico'),
    ('pod','cigarrillo electronico'),

    -- Genericos: no describen nada que se pueda cotizar.
    ('mayorista','generico'),('proveedor','generico'),('todo','generico'),
    ('vario','generico'),('producto','generico'),('cosa','generico'),
    ('negocio','generico'),('emprendimiento','generico'),('emprendedor','generico'),
    ('catalogo','generico'),('precio','generico'),('oferta','generico'),
    ('venta','generico'),('comprar','generico'),('barato','generico')
  ) as v(termino, motivo)
on conflict (raiz) do nothing;


-- ---------------------------------------------------------------------
-- 3) EL CARRIL
--
-- SECURITY DEFINER: corre como el dueño, asi que ve la tabla aunque la
-- RLS no deje a nadie leerla. Por eso todos los filtros van ACA ADENTRO y
-- no se pueden eludir; quien llama solo elige cuantos quiere, y topeado.
--
-- Que tiene que cumplir un termino para salir publicado:
--   - entre 3 y 40 caracteres, solo letras/numeros/espacios
--   - sin 4 digitos seguidos (telefonos, codigos, DNI)
--   - 5 busquedas o mas, en 3 dias distintos o mas
--   - 85% o mas de esas busquedas sin ningun resultado
--   - al menos un cero en los ultimos 7 dias (que siga vigente)
--   - que no este en demanda_oculta
--
-- El 85% y no el 100%: un termino con 200 ceros y 3 aciertos sigue siendo
-- un agujero de catalogo, y exigir el 100% lo dejaba afuera.
-- ---------------------------------------------------------------------
create or replace function public.cotiz_demanda_sin_respuesta(p_limit integer default 10)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with limpio as (
    select lower(btrim(regexp_replace(b.termino, '\s+', ' ', 'g'))) as t,
           public.cotiz_raiz(b.termino) as raiz,
           b.resultados,
           b.created_at
      from public.busquedas b
     where b.created_at > now() - interval '30 days'
       and b.termino is not null
       and b.resultados is not null
       and length(btrim(b.termino)) between 3 and 40
       and lower(btrim(b.termino)) ~ '^[a-z0-9áéíóúüñ][a-z0-9áéíóúüñ ]*$'
       and b.termino !~ '[0-9]{4,}'
  ),
  agg as (
    select l.raiz,
           mode() within group (order by l.t) as etiqueta,
           count(*)                                        as veces,
           count(distinct l.created_at::date)              as dias,
           count(*) filter (where l.resultados = 0)        as ceros,
           max(l.created_at) filter (where l.resultados = 0) as ultimo_cero
      from limpio l
     where l.raiz <> ''
       and not exists (select 1 from public.demanda_oculta o where o.raiz = l.raiz)
     group by l.raiz
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.busquedas desc), '[]'::jsonb)
    from (
      select a.etiqueta as termino,
             a.ceros    as busquedas
        from agg a
       where a.veces >= 5
         and a.dias  >= 3
         and a.ceros::numeric / a.veces >= 0.85
         and a.ultimo_cero > now() - interval '7 days'
       order by a.ceros desc
       limit greatest(1, least(coalesce(p_limit, 10), 30))
    ) x;
$$;


-- ---------------------------------------------------------------------
-- 3.b) INDICE
--
-- Hoy son ~14.000 filas y la consulta barre sin problema, pero entran
-- ~13.000 busquedas por mes y el carril filtra siempre por los ultimos 30
-- dias. Con el indice, la ventana se resuelve igual de rapido dentro de
-- un año.
-- ---------------------------------------------------------------------
create index if not exists idx_busquedas_created_at
  on public.busquedas (created_at desc);


-- ---------------------------------------------------------------------
-- 4) PERMISOS
--
-- Solo EXECUTE del carril. anon y authenticated siguen sin poder leer
-- public.busquedas: si se borrara esta funcion, el carril desaparece y no
-- se filtra nada de mas.
--
-- cotiz_raiz no se expone: se usa desde adentro, que corre como el dueño.
-- ---------------------------------------------------------------------
revoke all on function public.cotiz_raiz(text)                          from public, anon, authenticated;
revoke all on function public.cotiz_demanda_sin_respuesta(integer)      from public, anon, authenticated;

grant execute on function public.cotiz_demanda_sin_respuesta(integer) to anon, authenticated;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACION
-- =====================================================================
select jsonb_pretty(public.cotiz_demanda_sin_respuesta(10)) as lo_que_se_va_a_ver;

select count(*) as terminos_ocultos from public.demanda_oculta;


-- =====================================================================
-- PARA DESHACER (solo si algo salio mal). Descomentar y correr:
--
--   drop function if exists public.cotiz_demanda_sin_respuesta(integer);
--   drop table    if exists public.demanda_oculta;
--   drop function if exists public.cotiz_raiz(text);
--   notify pgrst, 'reload schema';
--
-- El frontend degrada solo: sin la funcion, el carril no se pinta y la
-- pantalla queda como estaba.
-- =====================================================================
