-- ===========================================================================
-- Recategorizar los productos que el modal mandó a Tecnología  (2026-09-07)
-- ===========================================================================
--
-- QUÉ PASÓ
--
-- El modal de mapeo de categorías (Mercado Libre y Tienda Nube) buscaba 'Otros'
-- como valor por defecto del desplegable, pero en TN_CATEGORIAS_EG la opción se
-- llama 'Otro', en singular. Al no coincidir con ninguna opción, ninguna quedaba
-- marcada con `selected` y el navegador elegía la primera de la lista: que es
-- justamente 'Tecnología'.
--
-- El proveedor sincronizaba, se le abría el modal, no tocaba nada, apretaba
-- Confirmar, y se le guardaba el catálogo entero como Tecnología. Peor: el mapa
-- quedaba persistido en proveedores.ml_categoria_map / tn_categoria_map, así que
-- cada sincronización siguiente lo volvía a aplicar.
--
-- El bug de código se arregló en la rama fix/mapeo-categorias-default. Este
-- archivo limpia los datos que dejó.
--
-- ⚠️ HAY QUE CORREGIR LAS DOS COSAS: los productos Y el mapa guardado. Si solo
-- se tocaran los productos, la próxima sincronización los devolvería a
-- Tecnología y no quedaría ni rastro de por qué.
--
-- ALCANCE MEDIDO ANTES DE TOCAR NADA
--
--   Libreria Integral MAYA   109 productos
--   importadora electro       53
--   Luxury Blanco             22
--   Sevana26                   6
--   Torito home                1
--   -----------------------------
--                            191
--
-- No todos estaban mal. "importadora electro" vende electrónica, así que ahí
-- Tecnología era correcto por casualidad; y MAYA vende librería PERO TAMBIÉN
-- informática, así que una parte de sus productos también estaba bien. Por eso
-- la corrección va categoría por categoría y no de una.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Los tres casos sin ambigüedad
-- ---------------------------------------------------------------------------

update public.productos p set categoria_principal = 'Blanquería'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Luxury Blanco'
  and p.categoria_principal = 'Tecnología'
  and p.categoria_ml in ('Sábanas','Toallones','Almohadas','Fundas para Sommier','Toallas de Playa','Repasadores');

update public.productos p set categoria_principal = 'Bazar'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Sevana26'
  and p.categoria_principal = 'Tecnología' and p.categoria_tn = 'Bazar';

update public.productos p set categoria_principal = 'Hogar y Deco'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Torito home'
  and p.categoria_principal = 'Tecnología' and p.categoria_tn = 'Alfombras';

-- ---------------------------------------------------------------------------
-- 2. importadora electro: casi todo queda como está
-- ---------------------------------------------------------------------------
-- Accesorios para celular, Auriculares, SmartWatch y Gaming SÍ son Tecnología.
-- Solo se separa el audio y video.

update public.productos p set categoria_principal = 'Electrónica'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'importadora electro'
  and p.categoria_principal = 'Tecnología' and p.categoria_tn = 'Tv, audio & video';

-- ---------------------------------------------------------------------------
-- 3. Libreria Integral MAYA: es la mezclada
-- ---------------------------------------------------------------------------
-- Vende librería e informática. Mouses, Teclados, Kits de Mouse y Teclado,
-- Mouse Pads, Auriculares y Mercado Point se quedan en Tecnología porque ahí
-- están bien. El resto se reparte.

update public.productos p set categoria_principal = 'Librería y Papelería'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Libreria Integral MAYA'
  and p.categoria_principal = 'Tecnología'
  and p.categoria_ml in ('Cintas','Tóners','Kits Escolares','Correctores','Trituradoras');

update public.productos p set categoria_principal = 'Alimentos'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Libreria Integral MAYA'
  and p.categoria_principal = 'Tecnología' and p.categoria_ml = 'Galletitas';

update public.productos p set categoria_principal = 'Limpieza'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Libreria Integral MAYA'
  and p.categoria_principal = 'Tecnología'
  and p.categoria_ml in ('Trapos y Paños de Limpieza','Servilletas de Papel');

update public.productos p set categoria_principal = 'Juguetería'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Libreria Integral MAYA'
  and p.categoria_principal = 'Tecnología' and p.categoria_ml = 'Masas y Plastilina';

update public.productos p set categoria_principal = 'Deportes'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Libreria Integral MAYA'
  and p.categoria_principal = 'Tecnología' and p.categoria_ml = 'Bicicletas Eléctricas';

update public.productos p set categoria_principal = 'Otro'
from public.proveedores v
where v.id = p.proveedor_id and v.nombre = 'Libreria Integral MAYA'
  and p.categoria_principal = 'Tecnología' and p.categoria_ml = 'Otros';

-- ---------------------------------------------------------------------------
-- 4. Reconstruir el mapa guardado A PARTIR de los productos ya corregidos
-- ---------------------------------------------------------------------------
-- Se arma desde los productos en vez de escribirlo a mano: así el mapa y el
-- catálogo no pueden quedar diciendo cosas distintas.

update public.proveedores v set ml_categoria_map = m.mapa
from (
  select proveedor_id, jsonb_object_agg(categoria_ml, categoria_principal) as mapa
  from (select distinct proveedor_id, categoria_ml, categoria_principal
        from public.productos where categoria_ml is not null) x
  group by proveedor_id
) m
where m.proveedor_id = v.id and v.ml_categoria_map is not null;

update public.proveedores v set tn_categoria_map = m.mapa
from (
  select proveedor_id, jsonb_object_agg(categoria_tn, categoria_principal) as mapa
  from (select distinct proveedor_id, categoria_tn, categoria_principal
        from public.productos where categoria_tn is not null) x
  group by proveedor_id
) m
where m.proveedor_id = v.id and v.tn_categoria_map is not null;

-- ---------------------------------------------------------------------------
-- Para deshacer
-- ---------------------------------------------------------------------------
-- No hay vuelta atrás automática, porque el estado anterior era el error: todo
-- en 'Tecnología'. Si hiciera falta reproducirlo:
--
--   update public.productos p set categoria_principal = 'Tecnología'
--   from public.proveedores v
--   where v.id = p.proveedor_id
--     and v.nombre in ('Libreria Integral MAYA','importadora electro',
--                      'Luxury Blanco','Sevana26','Torito home')
--     and (p.categoria_ml is not null or p.categoria_tn is not null);
--
-- y después volver a correr el bloque 4 para que el mapa lo acompañe.
