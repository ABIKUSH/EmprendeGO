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

  const cleanNickname = String(nickname).trim().replace(/\s+/g, '').toUpperCase();
  if (!cleanNickname) return res.status(400).json({ error: 'Nickname inválido' });

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

  const scrapeHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9',
  };

  const limit = 50;
  const maxProducts = 500;
  let offset = 0;
  let totalML = Infinity;
  let sellerId = null;
  let allItems = [];

  const isNumeric = /^\d+$/.test(cleanNickname);
  if (!isNumeric) {
    // Scrapear la página pública del vendedor para obtener su seller_id numérico
    const pagesToTry = [
      `https://listado.mercadolibre.com.ar/pagina/${cleanNickname.toLowerCase()}/`,
      `https://www.mercadolibre.com.ar/perfil/${cleanNickname}`,
    ];
    for (const pageUrl of pagesToTry) {
      if (sellerId) break;
      try {
        const r = await fetch(pageUrl, { headers: scrapeHeaders, redirect: 'follow' });
        if (!r.ok) continue;
        const html = await r.text();
        const m = html.match(/"seller_id"\s*:\s*"?(\d+)"?/)
          || html.match(/"sellerId"\s*:\s*"?(\d+)"?/)
          || html.match(/[?&]seller_id=(\d+)/)
          || html.match(/"id"\s*:\s*(\d{7,})/);
        if (m) sellerId = m[1];
      } catch {}
    }

    if (!sellerId) {
      return res.status(502).json({ error: 'No se encontró ese usuario en MercadoLibre. Verificá tu nombre de usuario.' });
    }
  }

  const searchId = isNumeric ? cleanNickname : sellerId;

  while (offset < totalML && offset < maxProducts) {
    const mlUrl = `https://api.mercadolibre.com/sites/MLA/search?seller_id=${searchId}&limit=${limit}&offset=${offset}`;
    const mlRes = await fetch(mlUrl, { headers: { 'User-Agent': 'EmprendeGO/1.0 (soporte@emprendego.com.ar)' } });

    if (!mlRes.ok) {
      if (offset === 0) {
        return res.status(502).json({ error: 'No se encontró ese usuario en MercadoLibre. Verificá tu nombre de usuario.' });
      }
      break;
    }

    const mlData = await mlRes.json();
    if (!sellerId && mlData.seller?.id) sellerId = String(mlData.seller.id);
    totalML = mlData.paging?.total ?? 0;

    const items = mlData.results || [];
    if (!items.length) break;
    allItems = allItems.concat(items);
    offset += limit;
  }

  if (!allItems.length) {
    return res.status(200).json({ importados: 0, total: 0, seller_id: sellerId, nickname: cleanNickname });
  }

  let importados = 0;
  for (const item of allItems) {
    const mlItemId = String(item.id || '');
    if (!mlItemId) continue;

    const nombre = String(item.title || 'Sin nombre').substring(0, 255);
    const precio = typeof item.price === 'number' ? item.price : 0;
    const imagen_url = item.thumbnail
      ? item.thumbnail.replace(/-I\.(jpg|webp)$/, '-O.$1')
      : null;

    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/productos`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        proveedor_id,
        ml_item_id: mlItemId,
        nombre,
        precio,
        imagen_url,
        categoria_principal: 'Otro'
      })
    });

    if (upsertRes.ok || upsertRes.status === 201) importados++;
  }

  const patchBody = { ml_nickname: cleanNickname };
  if (sellerId) patchBody.ml_user_id = sellerId;

  await fetch(`${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(patchBody)
  });

  console.log(`[ml-bulk] proveedor=${proveedor_id} nickname=${cleanNickname} importados=${importados}/${allItems.length}`);
  return res.status(200).json({ importados, total: allItems.length, seller_id: sellerId, nickname: cleanNickname });
}
