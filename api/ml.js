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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const ML_REDIRECT_URI = 'https://emprendego.com.ar/api/ml';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') return handleBulkImport(req, res);
  if (req.method === 'GET') {
    if (req.query.code !== undefined) return handleOAuthCallback(req, res);
    if (req.query.auth !== undefined) return handleAuthUrl(req, res);
    return handleSingleProduct(req, res);
  }
  return res.status(405).json({ error: 'Método no permitido' });
}

// ===== GET ?auth=1&proveedor_id=ID → devuelve URL de autorización ML =====
async function handleAuthUrl(req, res) {
  const { proveedor_id } = req.query;
  if (!proveedor_id || !process.env.ML_APP_ID) {
    return res.status(400).json({ error: 'Parámetros faltantes' });
  }
  const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${process.env.ML_APP_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}&state=${proveedor_id}&scope=read_items+offline_access+public`;
  return res.status(200).json({ url });
}

// ===== GET ?code=CODE&state=PROVEEDOR_ID → callback OAuth ML =====
async function handleOAuthCallback(req, res) {
  const { code, state: proveedor_id, error } = req.query;
  if (error || !code || !proveedor_id) {
    return res.redirect('https://emprendego.com.ar/?ml_error=1#perfil');
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Intercambiar code por token
  let accessToken, refreshToken, expiresIn, mlUserId;
  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=authorization_code&client_id=${process.env.ML_APP_ID}&client_secret=${process.env.ML_APP_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`,
    });
    if (!tokenRes.ok) return res.redirect('https://emprendego.com.ar/?ml_error=1#perfil');
    const t = await tokenRes.json();
    accessToken = t.access_token;
    refreshToken = t.refresh_token;
    expiresIn = t.expires_in || 21600;
    mlUserId = String(t.user_id || '');
  } catch {
    return res.redirect('https://emprendego.com.ar/?ml_error=1#perfil');
  }

  // Obtener nickname
  let mlNickname = '';
  try {
    const meRes = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      mlNickname = String(me.nickname || '').toUpperCase();
      if (!mlUserId) mlUserId = String(me.id || '');
    }
  } catch {}

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Guardar token en Supabase
  await fetch(`${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      ml_nickname: mlNickname,
      ml_user_id: mlUserId,
      ml_access_token: accessToken,
      ml_refresh_token: refreshToken,
      ml_token_expires_at: expiresAt,
    }),
  });

  return res.redirect('https://emprendego.com.ar/?ml_connected=1#perfil');
}

// ===== GET: producto individual por ID =====
async function handleSingleProduct(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el ID' });

  const cleanId = String(id).replace(/\D/g, '');
  if (!cleanId) return res.status(400).json({ error: 'ID inválido' });

  try {
    if (process.env.ML_APP_ID && process.env.ML_APP_SECRET) {
      const data = await fetchViaAPI(cleanId);
      if (data) return res.status(200).json(data);
    }

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

  const ogTitleM = html.match(/og:title[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:title/s);
  const rawTitle = ogTitleM ? ogTitleM[1] : '';
  const title = rawTitle.replace(/\s*[-–]\s*\$[\s\d.,]+$/, '').trim();
  if (!title) return null;

  const priceM = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
  const price = priceM ? parseFloat(priceM[1]) : 0;

  const ogDescM = html.match(/og:description[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:description/s);
  const subtitle = ogDescM ? ogDescM[1].trim() : '';

  const ogImgM = html.match(/og:image[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:image/s);
  const thumbnail = ogImgM ? ogImgM[1] : '';

  const imgSet = new Set();
  if (thumbnail) imgSet.add(thumbnail);
  for (const m of html.matchAll(/https:\/\/http2\.mlstatic\.com\/D_NQ_NP_[^"\\, ]+\.(?:jpg|webp|png)/g)) {
    if (!m[0].includes('_2X_') && !m[0].includes('-2X-')) imgSet.add(m[0]);
  }

  const pictures = [...imgSet].slice(0, 5).map(u => ({ url: u }));
  return { title, price, thumbnail, pictures, subtitle };
}

// ===== POST: importación masiva desde cuenta del vendedor =====
async function handleBulkImport(req, res) {
  const { proveedor_id, nickname } = req.body || {};
  if (!proveedor_id || !nickname) return res.status(400).json({ error: 'Faltan parámetros' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Configuración Supabase faltante' });

  const verifyRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=id`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const verifyRows = await verifyRes.json();
  if (!Array.isArray(verifyRows) || !verifyRows.length) {
    return res.status(400).json({ error: 'Proveedor no encontrado' });
  }

  // Paso 1: obtener token OAuth del proveedor desde Supabase
  const provRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=ml_access_token,ml_refresh_token,ml_token_expires_at,ml_user_id,ml_nickname`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const [prov] = await provRes.json();

  if (!prov?.ml_access_token) {
    return res.status(403).json({ error: 'Primero conectá tu cuenta de MercadoLibre desde tu perfil.' });
  }

  let accessToken = prov.ml_access_token;
  let mlUserId = prov.ml_user_id;
  let mlNickname = prov.ml_nickname || '';

  // Renovar token si está por vencer (menos de 1 hora)
  const expiresAt = prov.ml_token_expires_at ? new Date(prov.ml_token_expires_at) : null;
  if (!expiresAt || expiresAt - Date.now() < 3600000) {
    try {
      const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&client_id=${process.env.ML_APP_ID}&client_secret=${process.env.ML_APP_SECRET}&refresh_token=${prov.ml_refresh_token}`,
      });
      if (refreshRes.ok) {
        const t = await refreshRes.json();
        accessToken = t.access_token;
        const newExpires = new Date(Date.now() + (t.expires_in || 21600) * 1000).toISOString();
        await fetch(`${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}`, {
          method: 'PATCH',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ ml_access_token: t.access_token, ml_refresh_token: t.refresh_token, ml_token_expires_at: newExpires }),
        });
      }
    } catch {}
  }

  const mlAuth = { Authorization: `Bearer ${accessToken}` };

  // Fetch nickname/userId if missing
  if (!mlNickname || !mlUserId) {
    try {
      const meRes = await fetch('https://api.mercadolibre.com/users/me', { headers: mlAuth });
      if (meRes.ok) {
        const me = await meRes.json();
        if (!mlNickname) mlNickname = String(me.nickname || '').toUpperCase();
        if (!mlUserId) mlUserId = String(me.id || '');
      }
    } catch {}
  }

  console.log(`[ml-bulk] usando token OAuth de ${mlNickname} (${mlUserId})`);

  // Paso 3: obtener IDs de publicaciones activas
  const maxItems = 500;
  const limit = 100;
  let offset = 0;
  let allItemIds = [];
  let totalItems = Infinity;

  while (offset < totalItems && allItemIds.length < maxItems) {
    const searchRes = await fetch(
      `https://api.mercadolibre.com/users/${mlUserId}/items/search?status=active&limit=${limit}&offset=${offset}`,
      { headers: mlAuth }
    );
    if (!searchRes.ok) { console.log(`[ml-bulk] items/search error: ${searchRes.status}`); break; }
    const searchData = await searchRes.json();
    const ids = searchData.results || [];
    if (!ids.length) break;
    allItemIds = allItemIds.concat(ids);
    totalItems = searchData.paging?.total ?? 0;
    offset += limit;
  }

  console.log(`[ml-bulk] total IDs encontrados: ${allItemIds.length}`);

  if (!allItemIds.length) {
    return res.status(200).json({ importados: 0, total: 0, seller_id: mlUserId, nickname: mlNickname });
  }

  // Paso 4: traer detalles de items en lotes de 20
  const allItems = [];
  for (let i = 0; i < allItemIds.length; i += 20) {
    const batch = allItemIds.slice(i, i + 20).join(',');
    try {
      const itemsRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${batch}&attributes=id,title,price,thumbnail`,
        { headers: mlAuth }
      );
      if (!itemsRes.ok) continue;
      const entries = await itemsRes.json();
      for (const e of entries) {
        if (e.code === 200 && e.body) allItems.push(e.body);
      }
    } catch {}
  }

  // Paso 5: upsert en Supabase en un solo request
  const rows = allItems
    .map(item => ({
      proveedor_id,
      ml_item_id: String(item.id || ''),
      nombre: String(item.title || 'Sin nombre').substring(0, 255),
      precio: typeof item.price === 'number' ? item.price : 0,
      imagen_url: item.thumbnail ? item.thumbnail.replace(/-I\.(jpg|webp)$/, '-O.$1') : null,
      categoria_principal: 'Otro',
    }))
    .filter(r => r.ml_item_id);

  let importados = 0;
  if (rows.length > 0) {
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/productos`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (upsertRes.ok || upsertRes.status === 201) importados = rows.length;
  }

  await fetch(`${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ml_nickname: mlNickname, ml_user_id: mlUserId }),
  });

  console.log(`[ml-bulk] proveedor=${proveedor_id} nickname=${mlNickname} importados=${importados}/${allItems.length}`);
  return res.status(200).json({ importados, total: allItems.length, seller_id: mlUserId, nickname: mlNickname });
}
