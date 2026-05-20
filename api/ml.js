const ALLOWED_ORIGINS = [
  'https://emprendego.com.ar',
  'https://www.emprendego.com.ar',
  'https://emprende-go.vercel.app'
];

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

  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

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

  const authUrl =
    `https://auth.mercadolibre.com.ar/authorization` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
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

  if (!code || !proveedorId) {
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
// Sincronizacion de productos desde Mercado Libre
// ============================================================
async function handleMLSync(req, res) {
  const body = await readJsonBody(req);
  const proveedorId = body.proveedor_id;
  if (!proveedorId) return res.status(400).json({ error: 'Falta proveedor_id' });

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
      const pic = it.pictures?.[0]?.secure_url || it.pictures?.[0]?.url || it.thumbnail || '';
      return {
        proveedor_id: proveedorId,
        ml_item_id: String(it.id),
        nombre: it.title || 'Sin nombre',
        precio: parseFloat(it.price) || 0,
        stock: parseInt(it.available_quantity, 10) || 0,
        imagen_url: pic.replace(/^http:/, 'https:'),
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
