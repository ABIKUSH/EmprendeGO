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
  'descripcion,imagen_url,imagenes,proveedores(id,nombre,rubro,provincia,plan,plan_hasta,whatsapp)';

const PAGE = 1000;
const MAX_FILAS = 50000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  // El CDN cachea por URL completa, así que alguien podría reventar el caché
  // pidiendo ?x=1, ?x=2, ?x=3... y hacer pegar cada request contra Supabase.
  // El rate limit le pone techo a ese abuso.
  if (!applyRateLimit(req, res, { bucket: 'catalogo', limit: 60, windowMs: 60000 })) return;

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
