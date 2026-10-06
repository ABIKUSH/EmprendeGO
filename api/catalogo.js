// Catálogo público cacheado en el CDN de Vercel.
//
// Problema que resuelve: el catálogo entero (~2.000 productos, ~1 MB) salía de
// Supabase en CADA visita, y encima en 2-3 viajes porque PostgREST corta de a
// 1.000 filas. Con s-maxage=60 el CDN sirve la copia cacheada y Supabase recibe
// ~1 consulta por minuto en vez de una por visitante.
//
// ⚠️ Usa la clave ANÓNIMA a propósito, no la service_role. Es lo que mantiene
// RLS en funcionamiento: para anon, Postgres filtra productos a visible=true y
// proveedores a estado='aprobado'. Con service_role RLS no se aplica y habría
// que replicar esas reglas acá a mano — incluido no exponer el WhatsApp de
// proveedores sin aprobar, que viaja en el join. Reutilizar RLS es más seguro
// que reimplementarla. La clave anónima es pública (está en index.html desde
// siempre), así que no hay secreto que proteger.

import { applyRateLimit } from './_ratelimit.js';

const SUPABASE_BASE = (process.env.SUPABASE_URL || 'https://seubtijmyoahnyspvidq.supabase.co')
  .trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA';

// Mismas columnas que pedía el frontend. Explícitas en vez de '*': el catálogo
// viaja entero, así que cada columna de más se multiplica por todas las visitas.
const COLS = 'id,proveedor_id,nombre,precio,stock,categoria,categoria_principal,' +
  'descripcion,imagen_url,imagenes,proveedores(id,nombre,rubro,provincia,plan,plan_hasta)';

const PAGE = 1000;
const MAX_FILAS = 50000;

// ---------------------------------------------------------------------------
// CONTRATO COMPRA → PUBLICACIÓN  (?ficha=<id>,<id>,...)
//
// Es la puerta por la que EmprendeGO Negocios lee los datos que hacen falta
// para publicar un producto en un canal. Va SEPARADA del catálogo general y
// eso no es un capricho: de 5.811 productos sólo 96 tienen `ml_atributos`.
// Sumar esa columna al listado general engordaría la respuesta que reciben
// TODAS las visitas por un dato que usa el 1,6% de las filas, y el catálogo
// cacheado en CDN es lo que hace que la búsqueda tarde 0,25s en vez de 2,3s.
//
// ⚠️ Usa la MISMA clave anónima que el listado, a propósito: así RLS sigue
// filtrando a visible=true y proveedores aprobados. Nunca service_role.
//
// ⚠️ Los nombres dicen de quién es cada cosa. `precio_proveedor` y
// `stock_proveedor` se llaman así porque NO son el precio de venta ni el
// stock del comerciante: el comprador recibe existencias cuando recibe su
// compra, no cuando el proveedor las tiene.
// ---------------------------------------------------------------------------
const CONTRATO_VERSION = '1.0.0';

const COLS_FICHA = 'id,proveedor_id,nombre,descripcion,precio,stock,categoria,' +
  'categoria_principal,subcategoria,categoria_ml,ml_item_id,ml_atributos,imagenes,imagen_url,' +
  'created_at,proveedores(id,nombre,rubro,provincia)';

const MAX_FICHAS = 50;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lo que todavía no existe en EmprendeGO y sin lo cual no se puede publicar.
// Se calcula acá, en un solo lugar, para que ningún consumidor tenga que
// reimplementar la regla de "listo para publicar" y llegar a otra conclusión.
export function faltantesParaPublicar(p) {
  const faltan = [];
  const atributos = Array.isArray(p?.ml_atributos) ? p.ml_atributos : [];
  const fotos = Array.isArray(p?.imagenes) ? p.imagenes : [];

  if (!atributos.length) faltan.push('atributos');
  if (!p?.categoria_ml) faltan.push('categoria_ml');
  if (!fotos.length) faltan.push('imagenes');

  // Estos cuatro no dependen del producto: no existen en EmprendeGO para
  // NINGUNO, y son los que hacen fallar la publicación en Mercado Libre.
  faltan.push('medidas_paquete');       // alto, ancho, largo y peso reales
  faltan.push('precio_venta');          // el de acá es el costo del proveedor
  faltan.push('variantes');             // EmprendeGO no tiene variantes
  faltan.push('autorizacion_imagenes'); // origen conocido, permiso no declarado
  return faltan;
}

// El origen importa: hoy las fotos de los productos importados viven en el CDN
// de Mercado Libre, colgando de la publicación del proveedor. Republicarlas es
// una decisión que no toma el código.
export function describirImagen(u) {
  const url = typeof u === 'string' ? u : (u && u.url) || null;
  if (!url) return null;
  let origen = 'proveedor';
  try {
    const host = new URL(url).hostname;
    if (/mlstatic\.com$/.test(host)) origen = 'mercadolibre';
    else if (/supabase\.(co|in)$/.test(host)) origen = 'emprendego';
  } catch { origen = 'desconocido'; }
  return { url, origen, autorizacion: 'no_declarada' };
}

export function armarFicha(p) {
  return {
    id: p.id,
    proveedor: p.proveedores
      ? { id: p.proveedores.id, nombre: p.proveedores.nombre, rubro: p.proveedores.rubro, provincia: p.proveedores.provincia }
      : { id: p.proveedor_id },
    nombre: p.nombre,
    descripcion: p.descripcion || null,
    // Nombres explícitos: esto es del proveedor, no del comerciante.
    precio_proveedor: { valor: p.precio == null ? null : Number(p.precio), moneda: 'ARS' },
    stock_proveedor: p.stock == null ? null : Number(p.stock),
    unidad: null,        // no existe en EmprendeGO todavía
    presentacion: null,  // no existe en EmprendeGO todavía
    categorias: {
      emprendego: p.categoria_principal || p.categoria || null,
      subcategoria: p.subcategoria || null,
      // ⚠️ Es el NOMBRE de la categoría ("Sábanas"), no el código MLA que pide
      // Mercado Libre. El código se resuelve desde el título al publicar.
      mercadolibre_nombre: p.categoria_ml || null,
      mercadolibre_id: null
    },
    mercadolibre: { item_id: p.ml_item_id || null, atributos: Array.isArray(p.ml_atributos) ? p.ml_atributos : [] },
    imagenes: (Array.isArray(p.imagenes) && p.imagenes.length ? p.imagenes : [p.imagen_url])
      .map(describirImagen).filter(Boolean),
    creado_at: p.created_at || null,
    // Todavía no existe `updated_at` en productos. Va null hasta la migración,
    // en vez de mentir con created_at, que no es lo mismo.
    actualizado_at: null,
    faltantes_para_publicar: faltantesParaPublicar(p)
  };
}

/* ---------------------------------------------------------------------
   CORS — la puerta por la que entra EmprendeGO Negocios  (2026-10-06)

   Negocios vive en otro dominio (negocios.emprendego.com.ar) y en otro
   proyecto de Supabase. Sin estas cabeceras, el navegador le niega la
   respuesta aunque el servidor la haya mandado entera.

   ⚠️ LA LISTA DE ORIGENES ES CERRADA, NO ES UN '*'. Lo que se sirve acá ya
   es publico (es el catalogo que ve cualquiera en la home), asi que un '*'
   no filtraria ningun dato nuevo. Se usa lista igual por una razon mas
   aburrida: con '*' cualquier sitio puede colgarse de este endpoint y
   gastarnos el rate limit y el ancho de banda del CDN.

   Localhost entra para poder desarrollar Negocios contra el catalogo real.
   --------------------------------------------------------------------- */
const ORIGENES = new Set([
  'https://negocios.emprendego.com.ar',
  'https://emprendego.com.ar',
  'https://www.emprendego.com.ar',
  'http://localhost:3000'
]);

function permitirOrigen(req, res) {
  const origen = req.headers.origin;
  if (origen && ORIGENES.has(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    // Sin esto, el CDN puede servirle a un origen la respuesta cacheada que
    // lleva la cabecera de otro, y el navegador la rechaza.
    res.setHeader('Vary', 'Origin');
  }
}

export default async function handler(req, res) {
  permitirOrigen(req, res);
  // El navegador pregunta primero con OPTIONS antes de hacer el GET real.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  // El CDN cachea por URL completa, así que alguien podría reventar el caché
  // pidiendo ?x=1, ?x=2, ?x=3... y hacer pegar cada request contra Supabase.
  // El rate limit le pone techo a ese abuso.
  if (!applyRateLimit(req, res, { bucket: 'catalogo', limit: 60, windowMs: 60000 })) return;

  /* -------------------------------------------------------------------
     ?proveedores=1 — la lista para elegir de quién importar  (2026-10-06)

     EmprendeGO Negocios arranca con la pantalla de proveedores vacía, y el
     primer día es donde se pierde a la gente: nadie carga sus proveedores y
     sus productos a mano. Esto es lo que le permite elegirlos de una lista
     en vez de escribirlos.

     ⚠️ VA SEPARADO DEL LISTADO GENERAL A PROPOSITO. El catálogo completo
     pesa cerca de 1 MB porque trae todos los productos; esto son unas
     decenas de filas. Pedir 1 MB para pintar una lista de 163 nombres es
     justo lo que hace que la pantalla tarde en un teléfono.

     ⚠️ NO DEVUELVE WHATSAPP NI EMAIL, y no es un olvido. El rol anónimo no
     los tiene otorgados (ver el incidente del 2026-10-06 en CLAUDE.md) y
     tampoco hacen falta: el que importa un proveedor a su sistema necesita
     saber quién es, no cómo contactarlo a espaldas del marketplace. Si
     alguna vez hace falta el contacto, va por una puerta con sesión.
     ------------------------------------------------------------------- */
  if (req.query?.proveedores !== undefined) {
    try {
      // `estado` no se filtra acá: RLS ya limita el rol anónimo a los
      // aprobados. Filtrar de nuevo sería duplicar la regla en dos lugares.
      const url = `${SUPABASE_BASE}/rest/v1/proveedores` +
        `?select=${encodeURIComponent('id,nombre,rubro,provincia,descripcion,logo_url,pedido_minimo,envios,instagram')}` +
        `&order=nombre.asc&limit=1000`;

      const r = await fetch(url, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Accept: 'application/json' }
      });
      if (!r.ok) {
        console.error('[catalogo/proveedores] Supabase respondió', r.status);
        return res.status(502).json({ error: 'No se pudo leer la lista de proveedores' });
      }
      const filas = await r.json();

      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        contrato: CONTRATO_VERSION,
        generado_at: new Date().toISOString(),
        proveedores: (Array.isArray(filas) ? filas : []).map(p => ({
          id: p.id,
          nombre: p.nombre,
          rubro: p.rubro || null,
          provincia: p.provincia || null,
          descripcion: p.descripcion || null,
          logo_url: p.logo_url || null,
          pedido_minimo: p.pedido_minimo ?? null,
          envios: p.envios ?? null,
          instagram: p.instagram || null
        }))
      });
    } catch (err) {
      console.error('[catalogo/proveedores] error:', err.message);
      return res.status(500).json({ error: 'Error al armar la lista de proveedores' });
    }
  }

  /* -------------------------------------------------------------------
     ?proveedor=<uuid> — el catálogo de UNO solo

     Segundo paso de la importación: ya eligió de quién, ahora elige qué.
     Usa la MISMA forma que `?ficha=`, con los mismos nombres explícitos
     (`precio_proveedor`, `stock_proveedor`) y las mismas advertencias.

     ⚠️ ESOS NOMBRES SON LA PIEZA MAS IMPORTANTE DE TODO EL CONTRATO. Del
     otro lado, `precio_proveedor` es el COSTO del comerciante, nunca su
     precio de venta. Si alguien lo toma como precio de venta, el margen de
     cada producto queda en cero y el sistema miente sin romperse.
     ------------------------------------------------------------------- */
  const unProveedor = typeof req.query?.proveedor === 'string' ? req.query.proveedor.trim() : null;
  if (unProveedor) {
    if (!RE_UUID.test(unProveedor)) return res.status(400).json({ error: 'Id de proveedor inválido' });
    try {
      const url = `${SUPABASE_BASE}/rest/v1/productos` +
        `?select=${encodeURIComponent(COLS_FICHA)}` +
        `&proveedor_id=eq.${unProveedor}` +
        `&or=(visible.eq.true,visible.is.null)` +
        `&order=nombre.asc&limit=${PAGE}`;

      const r = await fetch(url, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Accept: 'application/json' }
      });
      if (!r.ok) {
        console.error('[catalogo/proveedor] Supabase respondió', r.status);
        return res.status(502).json({ error: 'No se pudo leer el catálogo del proveedor' });
      }
      const filas = await r.json();
      const productos = (Array.isArray(filas) ? filas : []).map(armarFicha);

      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        contrato: CONTRATO_VERSION,
        generado_at: new Date().toISOString(),
        proveedor_id: unProveedor,
        devueltos: productos.length,
        // Se repiten las mismas advertencias que en ?ficha= en vez de
        // referenciarlas: el que lee esta respuesta puede no haber leído
        // nunca la otra.
        advertencias: [
          'precio_proveedor es el costo del proveedor, no un precio de venta.',
          'stock_proveedor es la existencia del proveedor, no la del comercio que importa.',
          'Las imágenes traen origen, y la autorización de uso no está declarada por nadie todavía.'
        ],
        productos
      });
    } catch (err) {
      console.error('[catalogo/proveedor] error:', err.message);
      return res.status(500).json({ error: 'Error al armar el catálogo del proveedor' });
    }
  }

  // Rama del contrato compra → publicación. Va antes del listado general.
  const ficha = typeof req.query?.ficha === 'string' ? req.query.ficha : null;
  if (ficha) {
    const ids = [...new Set(ficha.split(',').map(s => s.trim()).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'Sin ids' });
    if (ids.length > MAX_FICHAS) return res.status(400).json({ error: `Máximo ${MAX_FICHAS} productos por pedido` });
    // Validar el formato antes de armar la consulta: un id con coma o paréntesis
    // adentro se mete en el filtro `in.(...)` de PostgREST y cambia lo que pide.
    const malos = ids.filter(id => !RE_UUID.test(id));
    if (malos.length) return res.status(400).json({ error: 'Hay ids con formato inválido' });

    try {
      const url = `${SUPABASE_BASE}/rest/v1/productos` +
        `?select=${encodeURIComponent(COLS_FICHA)}` +
        `&id=in.(${ids.join(',')})` +
        `&or=(visible.eq.true,visible.is.null)` +
        `&limit=${MAX_FICHAS}`;

      const r = await fetch(url, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Accept: 'application/json' }
      });
      if (!r.ok) {
        console.error('[catalogo/ficha] Supabase respondió', r.status);
        return res.status(502).json({ error: 'No se pudieron leer las fichas' });
      }
      const filas = await r.json();
      const productos = (Array.isArray(filas) ? filas : []).map(armarFicha);

      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        contrato: CONTRATO_VERSION,
        generado_at: new Date().toISOString(),
        pedidos: ids.length,
        devueltos: productos.length,
        // Lo que el consumidor no puede deducir mirando los datos.
        advertencias: [
          'precio_proveedor es el costo del proveedor, no un precio de venta.',
          'stock_proveedor es la existencia del proveedor. El comerciante recibe stock cuando recibe su compra.',
          'categorias.mercadolibre_nombre es un nombre, no el código de categoría que pide Mercado Libre.',
          'Las imágenes traen origen, y la autorización de uso no está declarada por nadie todavía.'
        ],
        productos
      });
    } catch (err) {
      console.error('[catalogo/ficha] error:', err.message);
      return res.status(500).json({ error: 'Error al armar las fichas' });
    }
  }

  try {
    const filas = [];
    for (let desde = 0; desde < MAX_FILAS; desde += PAGE) {
      const url = `${SUPABASE_BASE}/rest/v1/productos` +
        `?select=${encodeURIComponent(COLS)}` +
        `&or=(visible.eq.true,visible.is.null)` +
        `&order=created_at.desc` +
        `&limit=${PAGE}&offset=${desde}`;

      const r = await fetch(url, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          Accept: 'application/json'
        }
      });

      if (!r.ok) {
        const err = await r.text();
        console.error('[catalogo] Supabase respondió', r.status, err.slice(0, 300));
        // Si ya juntamos algo, servimos lo que hay antes que romper la home.
        if (filas.length) break;
        return res.status(502).json({ error: 'No se pudo leer el catálogo' });
      }

      const page = await r.json();
      if (!Array.isArray(page) || page.length === 0) break;
      filas.push(...page);
      if (page.length < PAGE) break;
    }

    // max-age=0: el NAVEGADOR siempre revalida. Sin esto Vercel manda solo
    // "public" downstream y el navegador puede cachear por heurística un rato
    // impredecible — un proveedor cargaría un producto y no lo vería aparecer.
    // s-maxage=60: cuánto lo cachea el CDN, que es donde está la ganancia.
    // stale-while-revalidate: puede seguir sirviendo la copia vieja mientras
    // refresca por detrás, así ningún visitante paga la espera del refresco.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    console.log('[catalogo] filas servidas:', filas.length);
    return res.status(200).json(filas);
  } catch (err) {
    console.error('[catalogo] error:', err.message);
    return res.status(500).json({ error: 'Error al armar el catálogo' });
  }
}
