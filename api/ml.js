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

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') return handleBulkImport(req, res);
  if (req.method === 'GET') return handleSingleProduct(req, res);
  return res.status(405).json({ error: 'Método no permitido' });
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

  if (!process.env.ML_APP_ID || !process.env.ML_APP_SECRET) {
    return res.status(500).json({ error: 'Credenciales de MercadoLibre no configuradas en el servidor.' });
  }

  const verifyRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=id`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const verifyRows = await verifyRes.json();
  if (!Array.isArray(verifyRows) || !verifyRows.length) {
    return res.status(400).json({ error: 'Proveedor no encontrado' });
  }

  // Paso 1: obtener access token
  let accessToken;
  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${process.env.ML_APP_ID}&client_secret=${process.env.ML_APP_SECRET}`,
    });
    if (!tokenRes.ok) return res.status(502).json({ error: 'Error al autenticar con MercadoLibre.' });
    ({ access_token: accessToken } = await tokenRes.json());
  } catch {
    return res.status(502).json({ error: 'Error de conexión con MercadoLibre.' });
  }

  const mlAuth = { Authorization: `Bearer ${accessToken}` };

  // Paso 2: identificar al dueño de la app
  let mlUserId, mlNickname;
  try {
    const meRes = await fetch('https://api.mercadolibre.com/users/me', { headers: mlAuth });
    if (!meRes.ok) return res.status(502).json({ error: 'No se pudo identificar el usuario de MercadoLibre.' });
    const me = await meRes.json();
    mlUserId = String(me.id || '');
    mlNickname = String(me.nickname || '').toUpperCase();
    console.log(`[ml-bulk] app owner: ${mlNickname} (${mlUserId})`);
  } catch {
    return res.status(502).json({ error: 'Error al obtener datos del usuario de MercadoLibre.' });
  }

  if (!mlUserId) return res.status(502).json({ error: 'No se pudo obtener el ID de usuario de MercadoLibre.' });

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
