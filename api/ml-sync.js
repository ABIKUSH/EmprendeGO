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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ML_BATCH = 20;
const ML_PAGE = 50;

async function fetchItemIdsByStatus(mlUserId, status, authHeader) {
  const ids = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `https://api.mercadolibre.com/users/${mlUserId}/items/search?status=${status}&limit=${ML_PAGE}&offset=${offset}`,
      { headers: authHeader }
    );
    if (!res.ok) {
      console.warn(`[ml-sync] error buscando status=${status}:`, res.status);
      break;
    }
    const { results = [] } = await res.json();
    if (results.length === 0) break;
    ids.push(...results);
    if (results.length < ML_PAGE) break;
    offset += ML_PAGE;
  }
  return ids;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { proveedor_id } = req.body || {};
  if (!proveedor_id || !UUID_RE.test(String(proveedor_id))) {
    return res.status(400).json({ error: 'proveedor_id inválido' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const getRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=ml_user_id,ml_access_token,plan`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );

  const rows = await getRes.json();
  const prov = rows?.[0];

  if (!prov?.ml_user_id || !prov?.ml_access_token) {
    return res.status(400).json({ error: 'MercadoLibre no conectado para este proveedor' });
  }
  if (prov.plan !== 'pro') {
    return res.status(403).json({ error: 'Solo disponible en Plan Pro' });
  }

  const { ml_user_id, ml_access_token } = prov;
  const authHeader = { Authorization: `Bearer ${ml_access_token}` };

  // Recolectar IDs de publicaciones activas y pausadas (dedup con Set)
  const [activeIds, pausedIds] = await Promise.all([
    fetchItemIdsByStatus(ml_user_id, 'active', authHeader),
    fetchItemIdsByStatus(ml_user_id, 'paused', authHeader)
  ]);

  const allIds = [...new Set([...activeIds, ...pausedIds])];

  if (allIds.length === 0) {
    return res.status(200).json({ importados: 0, total: 0 });
  }

  let importados = 0;

  for (let i = 0; i < allIds.length; i += ML_BATCH) {
    const batch = allIds.slice(i, i + ML_BATCH);
    const idsParam = batch.join(',');

    const itemsRes = await fetch(
      `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,price,available_quantity,thumbnail,pictures,description`,
      { headers: authHeader }
    );
    if (!itemsRes.ok) {
      console.warn('[ml-sync] error multiget batch:', itemsRes.status);
      continue;
    }

    const itemsData = await itemsRes.json();

    for (const entry of itemsData) {
      if (entry.code !== 200) continue;
      const item = entry.body;

      const ml_item_id = String(item.id);
      const nombre = item.title || 'Sin nombre';
      const precio = item.price ? parseFloat(item.price) : 0;
      const stock = item.available_quantity ?? null;

      // Imagen: primera foto en alta calidad → fallback a thumbnail mejorado
      const picUrl = item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || null;
      const imagen_url = picUrl || item.thumbnail?.replace(/-I\.(jpg|webp)$/, '-O.$1') || null;

      // Descripción: puede ser string o { plain_text }
      let descripcion = null;
      if (typeof item.description === 'string') {
        descripcion = item.description.trim() || null;
      } else if (item.description?.plain_text) {
        descripcion = item.description.plain_text.trim() || null;
      }

      const upsertRes = await fetch(
        `${supabaseUrl}/rest/v1/productos?on_conflict=proveedor_id,ml_item_id`,
        {
          method: 'POST',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            proveedor_id,
            ml_item_id,
            nombre,
            precio,
            stock,
            imagen_url,
            descripcion,
            categoria_principal: 'Otros'
          })
        }
      );

      if (upsertRes.ok || upsertRes.status === 201) {
        importados++;
      } else {
        const errText = await upsertRes.text();
        console.warn('[ml-sync] error upsert:', upsertRes.status, errText);
      }
    }
  }

  console.log(`[ml-sync] proveedor=${proveedor_id} user=${ml_user_id} importados=${importados}/${allIds.length} (activas=${activeIds.length} pausadas=${pausedIds.length})`);
  return res.status(200).json({ importados, total: allIds.length });
}
