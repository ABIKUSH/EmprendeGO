-- ===========================================================================
-- Guardar los atributos de la publicación de Mercado Libre  (2026-09-07)
-- ===========================================================================
--
-- PARA QUÉ
--
-- Es la pieza que hace posible el circuito compra → publicación de Mi Negocio,
-- que es el diferencial del producto: el comprador encuentra un producto de un
-- proveedor y lo publica en SU cuenta de Mercado Libre sin volver a cargar nada.
--
-- Medido el 2026-09-07 contra la API pública de ML, categoría por categoría:
--
--   Sábanas (MLA30059)      72 atributos,  4 obligatorios
--   Zapatillas (MLA109027)  96 atributos,  5 obligatorios
--   Remeras (MLA109042)     83 atributos,  7 obligatorios
--   Perfumes (MLA1271)      82 atributos,  3 obligatorios
--
-- Son pocos, pero NINGUNO existe en el catálogo de EmprendeGO: la tabla
-- productos tiene nombre, precio, stock, descripción e imágenes, y nada de
-- marca, modelo, color, talle, género ni material.
--
-- Pedírselos al comprador producto por producto rompe la promesa entera. Y no
-- hace falta: el proveedor YA los cargó, porque sin ellos no habría podido
-- publicar en Mercado Libre. Estaban en la respuesta de la API y los tirábamos
-- en el momento de importar, porque el multi-get de api/ml.js no los pedía.
--
-- Ver mesa/08-claude-publicar-en-ml.md.
--
-- ===========================================================================

alter table public.productos
  add column if not exists ml_atributos jsonb;

comment on column public.productos.ml_atributos is
  'Atributos de la publicación de ML del proveedor ({id, value_id, value_name}), '
  'los que ML exige para publicar. Se llenan solos en el sync. '
  'Ver sql/2026-09-07_ml_atributos.sql';

-- ⚠️ ALTER TABLE ADD COLUMN NO hereda los grants de la tabla. Sin esto,
-- PostgREST devuelve 403 al leer la columna y el síntoma es una pantalla vacía,
-- no un error. Es el tropiezo clásico de este proyecto.
--
-- Solo `authenticated`: son datos de ficha de producto (marca, color, talle),
-- nada sensible — de hecho están a la vista en la publicación del proveedor en
-- Mercado Libre. Pero no hay motivo para que viajen en el catálogo público:
-- api/catalogo.js elige sus columnas de forma explícita, así que esta no entra
-- ahí y no engorda el JSON de ~1 MB que se sirve en cada visita.
grant select (ml_atributos) on public.productos to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Cómo se llena
-- ---------------------------------------------------------------------------
-- Sola, en la próxima sincronización de cada proveedor Pro conectado a ML.
-- No hace falta backfill: el sync hace upsert sobre (proveedor_id, ml_item_id)
-- y reescribe la fila entera.
--
-- Para ver cuánto se llenó:
--
--   select count(*) filter (where ml_atributos is not null) as con_atributos,
--          count(*) as total
--   from productos where ml_item_id is not null;

-- ---------------------------------------------------------------------------
-- Para deshacer
-- ---------------------------------------------------------------------------
--   alter table public.productos drop column if exists ml_atributos;
--   notify pgrst, 'reload schema';
