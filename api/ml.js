import { applyRateLimit, esUUID } from './_ratelimit.js';

const ALLOWED_ORIGINS = [
  'https://emprendego.com.ar',
  'https://www.emprendego.com.ar',
  'https://emprende-go.vercel.app'
];

// Cache en memoria de la instancia para las tendencias del mercado.
// Clave = categoria ('' = sitio completo).
const trendsCache = new Map();
const TRENDS_TTL_MS = 30 * 60 * 1000;

// Rubro de EmprendeGO -> categoria de Mercado Libre, por NOMBRE y no por id.
// Los ids se resuelven contra /sites/MLA/categories en vivo, asi no quedan
// numeros magicos que se pudran si ML reacomoda el arbol.
// `hijo` es una coincidencia parcial dentro de las subcategorias de `top`,
// para los rubros que en ML viven un nivel mas abajo (calzado, bazar, etc).
const RUBRO_ML = {
  'indumentaria': { top: 'ropa y accesorios' },
  'calzado': { top: 'ropa y accesorios', hijo: 'calzado' },
  'marroquineria y bolsos': { top: 'ropa y accesorios', hijo: 'bolso' },
  'hogar y deco': { top: 'hogar, muebles y jardin' },
  'bazar': { top: 'hogar, muebles y jardin', hijo: 'bazar' },
  'blanqueria': { top: 'hogar, muebles y jardin', hijo: 'textil' },
  'limpieza': { top: 'hogar, muebles y jardin', hijo: 'limpieza' },
  'tecnologia': { top: 'celulares y telefonos' },
  'electronica': { top: 'electronica, audio y video' },
  'bebes y ninos': { top: 'bebes' },
  'belleza y salud': { top: 'belleza y cuidado personal' },
  'jugueteria': { top: 'juegos y juguetes' },
  'deportes': { top: 'deportes y fitness' },
  'libreria y papeleria': { top: 'arte, libreria y merceria' },
  'packaging': { top: 'industrias y oficinas', hijo: 'embalaje' },
  'mascotas': { top: 'animales y mascotas' }
};

const sinTildes = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// El ranking de ML mezcla productos con nombres de tiendas y cadenas
// ("dell tienda oficial", "fravega", "mayorista bazar"). Para un revendedor eso
// es ruido: no puede salir a comprar "Fravega". Los sacamos del ranking.
// Ojo: nada de filtrar "oficial" suelto — "camiseta oficial argentina" es un
// producto de verdad. Solo la frase completa "tienda oficial".
const TIENDA_FRASES = [
  'tienda oficial', 'outlet', 'mayorista', 'distribuidora',
  'importadora', 'store', 'shop', 'showroom', 'liquidacion'
];
const CADENAS = new Set([
  'fravega', 'garbarino', 'musimundo', 'coto', 'carrefour', 'jumbo', 'dia',
  'easy', 'sodimac', 'farmacity', 'falabella', 'walmart', 'changomas',
  'cetrogar', 'ribeiro', 'naldo', 'dexter', 'sportline', 'megatone',
  'mercado libre', 'mercadolibre', 'temu', 'shein', 'amazon', 'aliexpress'
]);
function esProducto(keyword) {
  const k = sinTildes(keyword);
  if (!k) return false;
  if (CADENAS.has(k)) return false;
  return !TIENDA_FRASES.some(f => k.includes(f));
}

let mlCatsCache = null;                 // categorias raiz de MLA
const rubroIdCache = new Map();         // rubro normalizado -> id de ML | null

// Resuelve el rubro de EmprendeGO al id de categoria de ML. Devuelve null si no
// hay equivalencia: en ese caso se cae a las tendencias del sitio completo.
async function idCategoriaML(rubro, accessToken) {
  const key = sinTildes(rubro);
  if (!key) return null;
  if (rubroIdCache.has(key)) return rubroIdCache.get(key);
  const conf = RUBRO_ML[key];
  if (!conf) { rubroIdCache.set(key, null); return null; }

  try {
    if (!mlCatsCache) {
      const r = await fetch('https://api.mercadolibre.com/sites/MLA/categories',
        { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) return null;
      mlCatsCache = await r.json();
    }
    const raiz = (mlCatsCache || []).find(c => sinTildes(c.name) === conf.top)
      || (mlCatsCache || []).find(c => sinTildes(c.name).includes(conf.top));
    if (!raiz) { rubroIdCache.set(key, null); return null; }

    let id = raiz.id;
    if (conf.hijo) {
      const r2 = await fetch(`https://api.mercadolibre.com/categories/${raiz.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r2.ok) {
        const det = await r2.json();
        const hijo = (det.children_categories || []).find(c => sinTildes(c.name).includes(conf.hijo));
        if (hijo) id = hijo.id;
      }
    }
    rubroIdCache.set(key, id);
    return id;
  } catch (e) { return null; }
}

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache para reducir llamadas repetidas al mismo producto
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
}

export default async function handler(req, res) {
  // Callback de OAuth Mercado Libre (proveedor conectando su cuenta).
  // Detectamos por state + (code | error) — siempre llega por GET desde mercadolibre.com
  if (req.method === 'GET' && req.query.state && (req.query.code || req.query.error)) {
    return handleMLOAuthCallback(req, res);
  }

  // Inicio de OAuth: dashboard del proveedor pide conectar su cuenta de ML.
  // GET /api/ml?proveedor_id=<uuid>  -> redirige a la pantalla de autorizacion de ML.
  if (req.method === 'GET' && req.query.proveedor_id && !req.query.id) {
    return handleMLOAuthStart(req, res);
  }

  // Sincronizar productos desde ML al catalogo del proveedor.
  // POST /api/ml?action=sync  body: { proveedor_id }
  if (req.method === 'POST' && req.query.action === 'sync') {
    return handleMLSync(req, res);
  }

  // Tendencias del mercado (seccion "Mercado" — lo mas buscado en ML).
  // GET /api/ml?action=trends[&category=MLAxxxx]  ->  { trends: [...], source }
  // Nunca tira error: si algo falla devuelve { trends: [] } para que el front use su fallback.
  if (req.method === 'GET' && req.query.action === 'trends') {
    return handleMLTrends(req, res);
  }

  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Anti-flood del proxy público de productos ML.
  if (!applyRateLimit(req, res, { bucket: 'ml-proxy', limit: 30, windowMs: 60000 })) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el ID' });

  const cleanId = String(id).replace(/\D/g, '');
  if (!cleanId) return res.status(400).json({ error: 'ID inválido' });

  try {
    // Primario: OAuth2 si hay credenciales configuradas en Vercel
    if (process.env.ML_APP_ID && process.env.ML_APP_SECRET) {
      const data = await fetchViaAPI(cleanId);
      if (data) return res.status(200).json(data);
    }

    // Fallback: scraping de la página pública del producto
    const data = await scrapeProductPage(cleanId);
    if (data) return res.status(200).json(data);

    return res.status(404).json({ error: 'Producto no encontrado' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function fetchViaAPI(id) {
  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${process.env.ML_APP_ID}&client_secret=${process.env.ML_APP_SECRET}`,
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json();

    const r = await fetch(`https://api.mercadolibre.com/items/MLA${id}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      title: d.title,
      price: d.price,
      thumbnail: d.thumbnail?.replace(/-I\.(jpg|webp)$/, '-O.$1') || '',
      pictures: (d.pictures || []).slice(0, 5).map(p => ({ url: p.url || p.secure_url || '' })),
      subtitle: d.subtitle || '',
    };
  } catch {
    return null;
  }
}

async function scrapeProductPage(id) {
  const url = `https://articulo.mercadolibre.com.ar/MLA-${id}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
  });
  if (!r.ok) return null;
  const html = await r.text();

  // Title: og:title, strip trailing price "- $ 3.990"
  const ogTitleM = html.match(/og:title[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:title/s);
  const rawTitle = ogTitleM ? ogTitleM[1] : '';
  const title = rawTitle.replace(/\s*[-–]\s*\$[\s\d.,]+$/, '').trim();
  if (!title) return null;

  // Price: first "price": NUMBER in the page JSON
  const priceM = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
  const price = priceM ? parseFloat(priceM[1]) : 0;

  // Description: og:description
  const ogDescM = html.match(/og:description[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:description/s);
  const subtitle = ogDescM ? ogDescM[1].trim() : '';

  // Main image: og:image
  const ogImgM = html.match(/og:image[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:image/s);
  const thumbnail = ogImgM ? ogImgM[1] : '';

  // Additional images: all unique mlstatic product image URLs
  const imgSet = new Set();
  if (thumbnail) imgSet.add(thumbnail);
  for (const m of html.matchAll(/https:\/\/http2\.mlstatic\.com\/D_NQ_NP_[^"\\, ]+\.(?:jpg|webp|png)/g)) {
    if (!m[0].includes('_2X_') && !m[0].includes('-2X-')) imgSet.add(m[0]);
  }

  const pictures = [...imgSet].slice(0, 5).map(u => ({ url: u }));

  return { title, price, thumbnail, pictures, subtitle };
}

// ============================================================
// OAuth Mercado Libre — inicio (proveedor pide conectar)
// ============================================================
function handleMLOAuthStart(req, res) {
  const proveedorId = req.query.proveedor_id;
  console.log('[ml-auth] proveedor_id recibido:', proveedorId);

  const appId = process.env.ML_APP_ID;
  if (!appId) return res.status(500).json({ error: 'ML_APP_ID no configurado' });

  const redirectUri = process.env.ML_REDIRECT_URI || 'https://emprendego.com.ar/api/ml';

  // Solo pedimos los scopes mínimos: leer publicaciones + acceso offline para refresh tokens.
  // Esto limita los permisos que ve el proveedor al autorizar, reduciendo fricción.
  const authUrl =
    `https://auth.mercadolibre.com.ar/authorization` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent('read offline_access')}` +
    `&state=${encodeURIComponent(proveedorId)}`;

  console.log('[ml-auth] redirigiendo a:', authUrl);
  return res.redirect(302, authUrl);
}

// ============================================================
// OAuth Mercado Libre — callback (proveedor conecta su cuenta)
// ============================================================
async function handleMLOAuthCallback(req, res) {
  const { code, state, error, error_description } = req.query;
  const proveedorId = state;

  console.log('[ml-callback] params:', { code: code ? '***' : null, error, state });

  if (error) {
    console.error('[ml-callback] error desde ML:', error, error_description);
    return res.redirect(302, `https://emprendego.com.ar/?ml=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !esUUID(proveedorId)) {
    return res.status(400).send('Parámetros inválidos');
  }

  const appId = process.env.ML_APP_ID;
  const clientSecret = process.env.ML_APP_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI || 'https://emprendego.com.ar/api/ml';
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!appId || !clientSecret) {
    console.error('[ml-callback] ML_APP_ID o ML_APP_SECRET no configurados');
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=server');
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error('[ml-callback] credenciales Supabase no configuradas');
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=server');
  }

  // Intercambiar code por access_token + refresh_token
  let tokenData;
  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      }).toString()
    });

    if (!tokenRes.ok) {
      const errTxt = await tokenRes.text();
      console.error('[ml-callback] error token ML:', tokenRes.status, errTxt);
      return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=token');
    }
    tokenData = await tokenRes.json();
  } catch (e) {
    console.error('[ml-callback] fetch token fallo:', e.message);
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=network');
  }

  const { access_token, refresh_token, expires_in, user_id } = tokenData;
  console.log('[ml-callback] token ML ok — user_id:', user_id, '| expires_in:', expires_in);

  if (!access_token || !refresh_token || !user_id) {
    console.error('[ml-callback] respuesta ML incompleta:', JSON.stringify(tokenData));
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=token');
  }

  const expiresAt = new Date(Date.now() + (Number(expires_in) || 21600) * 1000).toISOString();

  // Pedir nickname (opcional, mejora UX en el dashboard)
  let nickname = null;
  try {
    const userRes = await fetch(`https://api.mercadolibre.com/users/${user_id}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (userRes.ok) {
      const u = await userRes.json();
      nickname = u.nickname || null;
    }
  } catch (e) {
    console.warn('[ml-callback] no se pudo obtener nickname:', e.message);
  }

  // Guardar credenciales en proveedores
  const patchUrl = `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      ml_user_id: String(user_id),
      ml_access_token: access_token,
      ml_refresh_token: refresh_token,
      ml_token_expires_at: expiresAt,
      ml_nickname: nickname,
      ml_connected: true
    })
  });

  if (!patchRes.ok) {
    const errBody = await patchRes.text();
    console.error('[ml-callback] error PATCH Supabase:', patchRes.status, errBody);
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=save');
  }

  console.log(`[ml-callback] proveedor ${proveedorId} conectado a ML user ${user_id}`);
  return res.redirect(302, 'https://emprendego.com.ar/?ml=ok');
}

// ============================================================
// Tendencias del mercado (Mercado Libre) — para la seccion "Mercado"
// Usa el token de cualquier proveedor conectado (las tendencias son
// a nivel del sitio, no del proveedor). Refresca si esta por vencer.
// ============================================================
async function handleMLTrends(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!applyRateLimit(req, res, { bucket: 'ml-trends', limit: 30, windowMs: 60000 })) return;

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || !process.env.ML_APP_ID) {
    return res.status(200).json({ trends: [], source: 'unavailable' });
  }

  // `category` = id de ML directo. `rubro` = rubro de EmprendeGO, que se traduce
  // a id contra el arbol de categorias de ML.
  const catDirecta = (req.query.category || '').toString().replace(/[^A-Za-z0-9]/g, '');
  const rubro = (req.query.rubro || '').toString().slice(0, 60);
  const clave = catDirecta || (rubro ? 'r:' + sinTildes(rubro) : '');

  // Las tendencias del sitio se mueven de a dias, no de a minutos: cacheamos
  // en memoria de la instancia para no pegarle a ML en cada visita.
  const cached = trendsCache.get(clave);
  if (cached && Date.now() - cached.at < TRENDS_TTL_MS) {
    const { at, ...payload } = cached;
    return res.status(200).json({ ...payload, cached: true });
  }

  try {
    // Candidatos ordenados del token mas fresco al mas viejo. El refresh_token de
    // ML es de un solo uso, asi que el de un proveedor que hace rato no sincroniza
    // puede estar consumido; probamos varios antes de darnos por vencidos.
    const provRes = await fetch(
      `${supabaseUrl}/rest/v1/proveedores` +
      `?ml_connected=eq.true&ml_refresh_token=not.is.null` +
      `&select=id,ml_access_token,ml_refresh_token,ml_token_expires_at` +
      `&order=ml_token_expires_at.desc.nullslast&limit=5`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const provs = provRes.ok ? await provRes.json() : [];
    if (!provs.length) return res.status(200).json({ trends: [], source: 'no_token' });

    let ultimoEstado = null;

    for (const prov of provs) {
      let accessToken = prov.ml_access_token;
      const expiresAt = prov.ml_token_expires_at ? new Date(prov.ml_token_expires_at) : null;
      const vigente = accessToken && expiresAt && expiresAt.getTime() > Date.now() + 5 * 60 * 1000;

      if (!vigente) {
        // Ojo: sin marcarMLDesconectado. Este endpoint es publico y sin login;
        // no puede desconectar la integracion de un proveedor como efecto colateral.
        const refreshed = await refreshMLTrendsToken(prov.ml_refresh_token, prov.id, supabaseUrl, supabaseKey);
        if (!refreshed) { ultimoEstado = 'refresh_failed'; continue; }
        accessToken = refreshed.access_token;
      }

      // Con token en mano ya se puede resolver el rubro a id de categoria.
      let catId = catDirecta;
      if (!catId && rubro) catId = await idCategoriaML(rubro, accessToken) || '';
      const url = catId
        ? `https://api.mercadolibre.com/trends/MLA/${catId}`
        : 'https://api.mercadolibre.com/trends/MLA';

      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) { ultimoEstado = 'ml_error_' + r.status; continue; }

      const data = await r.json();
      const trends = (Array.isArray(data) ? data : [])
        .map(x => (x && x.keyword ? String(x.keyword) : ''))
        .filter(Boolean)
        .filter(esProducto)
        .slice(0, 30);

      // Historial: comparamos contra la ultima foto guardada ANTES de guardar la
      // de hoy, para no compararnos contra nosotros mismos.
      // Solo guardamos historial de claves de nuestra lista (los 16 rubros y el
      // sitio completo). `category` es un id de ML libre que manda el visitante:
      // si lo aceptaramos como clave, cualquiera podria inflar la tabla con
      // miles de categorias y llenarnos la base sin estar logueado.
      const rubroValido = rubro && RUBRO_ML[sinTildes(rubro)];
      const claveRubro = (catId && rubroValido) ? sinTildes(rubro) : (catId ? null : '');
      const movimiento = claveRubro === null ? {}
        : await variacionTendencias(claveRubro, trends, supabaseUrl, supabaseKey);
      if (claveRubro !== null) await guardarSnapshot(claveRubro, trends, supabaseUrl, supabaseKey);

      const payload = {
        trends, source: 'ml',
        rubro: rubro || undefined,
        // `alcance` le dice al front si de verdad pudo filtrar por rubro o si le
        // esta devolviendo las tendencias del sitio completo.
        alcance: catId ? 'rubro' : 'sitio',
        ...movimiento
      };
      if (trends.length) trendsCache.set(clave, { ...payload, at: Date.now() });
      return res.status(200).json(payload);
    }

    return res.status(200).json({ trends: [], source: ultimoEstado || 'no_token' });
  } catch (e) {
    return res.status(200).json({ trends: [], source: 'error' });
  }
}

// ============================================================
// Historial del ranking (tabla tendencias_snapshot)
// ML no da volumen ni historico: la unica forma honesta de decir "subio 3
// puestos" es guardar nosotros la foto de cada dia y comparar posiciones.
// ============================================================

// Fecha de hoy en Argentina, que es la que usa el default de la tabla.
function hoyAR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Movimiento de cada termino contra la ULTIMA foto anterior a hoy.
// Devuelve { delta: {termino: +/-n|null}, comparadoCon: 'YYYY-MM-DD' } o {}.
async function variacionTendencias(rubro, trends, supaUrl, supaKey) {
  if (!trends.length) return {};
  try {
    const qs = `rubro=eq.${encodeURIComponent(rubro)}&fecha=lt.${hoyAR()}` +
      `&select=fecha,termino,posicion&order=fecha.desc&limit=200`;
    const r = await fetch(`${supaUrl}/rest/v1/tendencias_snapshot?${qs}`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } });
    if (!r.ok) return {};
    const filas = await r.json();
    if (!Array.isArray(filas) || !filas.length) return {};

    // El order trae varias fechas mezcladas: nos quedamos con la mas reciente.
    const fecha = filas[0].fecha;
    const previo = new Map();
    filas.filter(f => f.fecha === fecha).forEach(f => previo.set(sinTildes(f.termino), f.posicion));

    const delta = {};
    trends.forEach((t, i) => {
      const antes = previo.get(sinTildes(t));
      // Posicion menor = mejor. Subir en el ranking da numero positivo.
      delta[t] = (antes == null) ? null : antes - (i + 1);
    });
    return { delta, comparadoCon: fecha };
  } catch (e) { return {}; }
}

// Guarda la foto de hoy si todavia no existe.
// OJO: hay que esperarlo. En Vercel la funcion se congela apenas se manda la
// respuesta, asi que un fetch sin await queda a medio camino y nunca escribe.
// Solo corre cuando falla el cache (una vez cada 30 min por instancia), y el
// unique (fecha,rubro,termino) hace que reintentar el mismo dia sea inofensivo.
async function guardarSnapshot(rubro, trends, supaUrl, supaKey) {
  if (!trends.length) return;
  const filas = trends.map((t, i) => ({ fecha: hoyAR(), rubro, termino: t, posicion: i + 1 }));
  try {
    const r = await fetch(`${supaUrl}/rest/v1/tendencias_snapshot`, {
      method: 'POST',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify(filas)
    });
    if (!r.ok) console.error('[ml-trends] snapshot:', r.status, await r.text());
  } catch (e) {
    console.error('[ml-trends] snapshot:', e.message);
  }
}

// Refresh acotado a tendencias: guarda el token nuevo (el refresh_token de ML es
// de un solo uso, hay que persistirlo) pero NUNCA marca al proveedor como
// desconectado, porque quien dispara esto es un visitante anonimo.
async function refreshMLTrendsToken(refreshToken, proveedorId, supaUrl, supaKey) {
  if (!refreshToken) return null;
  try {
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ML_APP_ID,
        client_secret: process.env.ML_APP_SECRET,
        refresh_token: refreshToken
      }).toString()
    });
    if (!r.ok) {
      console.error('[ml-trends-refresh] fallo:', proveedorId, r.status);
      return null;
    }
    const data = await r.json();
    if (!data.access_token) return null;

    const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 21600) * 1000).toISOString();
    const patch = {
      ml_access_token: data.access_token,
      ml_token_expires_at: expiresAt
    };
    if (data.refresh_token) patch.ml_refresh_token = data.refresh_token;

    await fetch(`${supaUrl}/rest/v1/proveedores?id=eq.${proveedorId}`, {
      method: 'PATCH',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(patch)
    });

    return data;
  } catch (e) {
    console.error('[ml-trends-refresh] error:', e.message);
    return null;
  }
}

// ============================================================
// Sincronizacion de productos desde Mercado Libre
// ============================================================
async function handleMLSync(req, res) {
  // Sync es una operación pesada: limitar para que no se pueda abusar.
  if (!applyRateLimit(req, res, { bucket: 'ml-sync', limit: 10, windowMs: 60000 })) return;

  const body = await readJsonBody(req);
  const proveedorId = body.proveedor_id;
  if (!esUUID(proveedorId)) return res.status(400).json({ error: 'proveedor_id inválido' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Credenciales Supabase no configuradas' });
  }

  // 1) Leer proveedor (plan + credenciales ML + mapeo de categorias)
  const provRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}&select=id,plan,plan_hasta,ml_user_id,ml_access_token,ml_refresh_token,ml_token_expires_at,ml_categoria_map,ml_connected`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  if (!provRes.ok) {
    console.error('[ml-sync] no se pudo leer proveedor:', provRes.status);
    return res.status(500).json({ error: 'Error leyendo proveedor' });
  }
  const provs = await provRes.json();
  if (!provs.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const prov = provs[0];

  // 2) Validar Plan Pro en backend (no confiamos en la UI)
  const ahora = new Date();
  const planActivo = prov.plan === 'pro' &&
    (!prov.plan_hasta || new Date(prov.plan_hasta + 'T23:59:59Z') > ahora);
  if (!planActivo) {
    return res.status(403).json({ error: 'La integración con Mercado Libre requiere Plan Pro activo' });
  }

  // 3) Validar que esté conectado a ML
  if (!prov.ml_access_token || !prov.ml_user_id) {
    return res.status(400).json({ error: 'Conectá tu cuenta de Mercado Libre antes de sincronizar' });
  }

  // 4) Refrescar token si está a menos de 5 min de vencer
  let accessToken = prov.ml_access_token;
  const expiresAt = prov.ml_token_expires_at ? new Date(prov.ml_token_expires_at) : null;
  const margenMs = 5 * 60 * 1000;
  if (!expiresAt || expiresAt.getTime() < Date.now() + margenMs) {
    console.log('[ml-sync] token vencido o por vencer — refrescando');
    const refreshed = await refreshMLToken(prov.ml_refresh_token, proveedorId, supabaseUrl, supabaseKey);
    if (!refreshed) {
      return res.status(401).json({ error: 'No se pudo refrescar el token. Reconectá tu cuenta de Mercado Libre.' });
    }
    accessToken = refreshed.access_token;
  }

  // 5) Listar todos los items activos del usuario ML (paginado)
  const allItemIds = [];
  let offset = 0;
  const pageSize = 50;
  const maxItems = 1000; // tope de seguridad
  while (offset < maxItems) {
    const searchUrl = `https://api.mercadolibre.com/users/${prov.ml_user_id}/items/search?status=active&limit=${pageSize}&offset=${offset}`;
    const sr = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!sr.ok) {
      const errTxt = await sr.text();
      console.error('[ml-sync] error listar items:', sr.status, errTxt);
      return res.status(502).json({ error: 'Error consultando productos en Mercado Libre' });
    }
    const data = await sr.json();
    const ids = data.results || [];
    allItemIds.push(...ids);
    if (ids.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`[ml-sync] proveedor ${proveedorId} — ${allItemIds.length} items encontrados`);

  if (!allItemIds.length) {
    return res.status(200).json({ importados: 0, total: 0, categorias_ml: [] });
  }

  // 6) Traer detalles de items en batches de 20 (limite de multi-get de ML)
  const items = [];
  for (let i = 0; i < allItemIds.length; i += 20) {
    const batch = allItemIds.slice(i, i + 20);
    const detailUrl = `https://api.mercadolibre.com/items?ids=${batch.join(',')}&attributes=id,title,price,available_quantity,thumbnail,pictures,status,category_id`;
    const dr = await fetch(detailUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!dr.ok) {
      console.error('[ml-sync] error detalle batch:', dr.status);
      continue;
    }
    const detailData = await dr.json();
    for (const w of detailData) {
      if (w && w.code === 200 && w.body) items.push(w.body);
    }
  }

  // 7) Resolver nombres de categorias ML (cache en memoria por sync)
  const categoryIds = [...new Set(items.map(it => it.category_id).filter(Boolean))];
  const categoryNames = {};
  await Promise.all(categoryIds.map(async cid => {
    try {
      const cr = await fetch(`https://api.mercadolibre.com/categories/${cid}`);
      if (cr.ok) {
        const c = await cr.json();
        categoryNames[cid] = c.name || cid;
      } else {
        categoryNames[cid] = cid;
      }
    } catch {
      categoryNames[cid] = cid;
    }
  }));

  // 8) Construir filas para upsert
  const catMap = prov.ml_categoria_map || {};
  const rows = items
    .filter(it => it.status === 'active')
    .map(it => {
      const categoriaML = it.category_id ? categoryNames[it.category_id] || null : null;
      const pics = (it.pictures || [])
        .map(x => (x.secure_url || x.url || ''))
        .filter(Boolean)
        .map(u => u.replace(/^http:/, 'https:'))
        .slice(0, 8);
      const pic = pics[0] || (it.thumbnail || '').replace(/^http:/, 'https:');
      return {
        proveedor_id: proveedorId,
        ml_item_id: String(it.id),
        nombre: it.title || 'Sin nombre',
        precio: parseFloat(it.price) || 0,
        stock: parseInt(it.available_quantity, 10) || 0,
        imagen_url: pic,
        imagenes: pics.length ? pics : null,
        categoria_ml: categoriaML,
        categoria_principal: (categoriaML && catMap[categoriaML]) || 'Otros',
        visible: true
      };
    });

  // 9) Upsert por chunks (Supabase REST acepta payloads grandes, pero limitamos por las dudas)
  let importados = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/productos?on_conflict=proveedor_id,ml_item_id`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(chunk)
    });
    if (!upsertRes.ok) {
      const errTxt = await upsertRes.text();
      console.error('[ml-sync] error upsert chunk:', upsertRes.status, errTxt);
    } else {
      importados += chunk.length;
    }
  }

  const categoriasML = [...new Set(rows.map(r => r.categoria_ml).filter(Boolean))];
  console.log(`[ml-sync] proveedor ${proveedorId} — importados ${importados}/${rows.length}`);

  // 10) Ocultar productos cuyo ml_item_id ya no este en la lista activa de ML
  //     (pausados, finalizados o dados de baja en Mercado Libre).
  let ocultados = 0;
  const activeIds = rows.map(r => r.ml_item_id);
  if (activeIds.length > 0) {
    // PostgREST: not.in.(a,b,c) — coma-separados sin comillas para strings simples
    const notInList = activeIds.join(',');
    const hideRes = await fetch(
      `${supabaseUrl}/rest/v1/productos?proveedor_id=eq.${proveedorId}&ml_item_id=not.is.null&ml_item_id=not.in.(${notInList})&visible=eq.true`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ visible: false })
      }
    );
    if (hideRes.ok) {
      try { ocultados = (await hideRes.json()).length || 0; } catch { ocultados = 0; }
    } else {
      console.error('[ml-sync] error ocultando inactivos:', hideRes.status);
    }
  }

  return res.status(200).json({
    importados,
    total: rows.length,
    ocultados,
    categorias_ml: categoriasML
  });
}

// Refrescar access_token usando el refresh_token. Guarda los nuevos tokens en Supabase.
// Si ML rechaza el refresh (token revocado o vencido), marca ml_connected=false para
// que la UI le pida al proveedor reconectarse.
async function refreshMLToken(refreshToken, proveedorId, supaUrl, supaKey) {
  if (!refreshToken) {
    await marcarMLDesconectado(proveedorId, supaUrl, supaKey);
    return null;
  }
  let data;
  try {
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ML_APP_ID,
        client_secret: process.env.ML_APP_SECRET,
        refresh_token: refreshToken
      }).toString()
    });
    if (!r.ok) {
      console.error('[ml-refresh] fallo:', r.status, await r.text());
      // 400/401 de ML = refresh_token invalido. Marcamos desconectado.
      if (r.status === 400 || r.status === 401) {
        await marcarMLDesconectado(proveedorId, supaUrl, supaKey);
      }
      return null;
    }
    data = await r.json();
  } catch (e) {
    console.error('[ml-refresh] fetch error:', e.message);
    return null;
  }

  const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 21600) * 1000).toISOString();

  const patchRes = await fetch(`${supaUrl}/rest/v1/proveedores?id=eq.${proveedorId}`, {
    method: 'PATCH',
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      ml_access_token: data.access_token,
      ml_refresh_token: data.refresh_token || refreshToken,
      ml_token_expires_at: expiresAt
    })
  });
  if (!patchRes.ok) {
    console.error('[ml-refresh] no se pudo guardar token refrescado:', patchRes.status);
  }
  return data;
}

// Marca al proveedor como desconectado de ML (token revocado/expirado).
// La UI volvera a mostrar el boton "Conectar Mercado Libre".
async function marcarMLDesconectado(proveedorId, supaUrl, supaKey) {
  try {
    await fetch(`${supaUrl}/rest/v1/proveedores?id=eq.${proveedorId}`, {
      method: 'PATCH',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ ml_connected: false })
    });
    console.log(`[ml-refresh] proveedor ${proveedorId} marcado como desconectado`);
  } catch (e) {
    console.error('[ml-refresh] no se pudo marcar desconectado:', e.message);
  }
}

// Lee body JSON (Vercel parsea automaticamente si Content-Type es application/json,
// pero esto cubre el caso en que el body llega como stream sin parsear).
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}
