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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { proveedor_id, nickname } = req.body || {};
  if (!proveedor_id || !nickname) return res.status(400).json({ error: 'Faltan parámetros' });

  const cleanNickname = String(nickname).trim().replace(/\s+/g, '').toUpperCase();
  if (!cleanNickname) return res.status(400).json({ error: 'Nickname inválido' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Configuración Supabase faltante' });

  // Verificar que el proveedor existe
  const verifyRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=id`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const verifyRows = await verifyRes.json();
  if (!Array.isArray(verifyRows) || !verifyRows.length) {
    return res.status(400).json({ error: 'Proveedor no encontrado' });
  }

  // Paginado de la API pública de ML (sin auth, datos públicos)
  const limit = 50;
  const maxProducts = 500;
  let offset = 0;
  let totalML = Infinity;
  let sellerId = null;
  let allItems = [];

  while (offset < totalML && offset < maxProducts) {
    // Si es numérico lo tratamos como seller_id; si no, como nickname
    const isNumeric = /^\d+$/.test(cleanNickname);
    const mlUrl = isNumeric
      ? `https://api.mercadolibre.com/sites/MLA/search?seller_id=${cleanNickname}&limit=${limit}&offset=${offset}`
      : `https://api.mercadolibre.com/sites/MLA/search?nickname=${encodeURIComponent(cleanNickname)}&limit=${limit}&offset=${offset}`;

    const mlRes = await fetch(mlUrl, {
      headers: { 'User-Agent': 'EmprendeGO/1.0 (soporte@emprendego.com.ar)' }
    });

    if (!mlRes.ok) {
      const errText = await mlRes.text();
      console.error('[ml-bulk] ML API error:', mlRes.status, errText);
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

  // Upsert de productos en Supabase usando el índice único (proveedor_id, ml_item_id)
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

    if (upsertRes.ok || upsertRes.status === 201) {
      importados++;
    } else {
      const errTxt = await upsertRes.text();
      console.warn('[ml-bulk] upsert error:', upsertRes.status, errTxt);
    }
  }

  // Guardar nickname y seller_id en el proveedor para futuras sincronizaciones
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
  return res.status(200).json({
    importados,
    total: allItems.length,
    seller_id: sellerId,
    nickname: cleanNickname
  });
}
