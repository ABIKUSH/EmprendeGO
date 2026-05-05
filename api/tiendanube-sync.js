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

  // Leer datos del proveedor incluyendo mapa de categorías previo
  const getRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=tn_store_id,tn_access_token,tn_categoria_map`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    }
  );

  const rows = await getRes.json();
  const prov = rows?.[0];

  if (!prov?.tn_store_id || !prov?.tn_access_token) {
    return res.status(400).json({ error: 'Tienda Nube no conectada para este proveedor' });
  }

  const { tn_store_id, tn_access_token, tn_categoria_map } = prov;
  const categoriaMap = tn_categoria_map || {};

  // Obtener productos de Tienda Nube
  const tnRes = await fetch(
    `https://api.tiendanube.com/v1/${tn_store_id}/products?per_page=200`,
    {
      headers: {
        'Authentication': `bearer ${tn_access_token}`,
        'User-Agent': 'EmprendeGO (emprendego.soporte@gmail.com)'
      }
    }
  );

  if (!tnRes.ok) {
    const err = await tnRes.text();
    console.error('[tn-sync] error TN API:', tnRes.status, err);
    return res.status(502).json({ error: 'Error al obtener productos de Tienda Nube' });
  }

  const products = await tnRes.json();

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(200).json({ importados: 0, categorias_tn: [] });
  }

  let importados = 0;
  const categoriasSet = new Set();

  for (const product of products) {
    const nombre = product.name?.es || product.name || 'Sin nombre';
    const variant = product.variants?.[0];
    const precio = variant?.price ? parseFloat(variant.price) : 0;
    const stock = variant?.stock ?? null;
    const imagen_url = product.images?.[0]?.src || null;
    const tn_product_id = String(product.id);

    // Extraer categoría de TN
    const catRaw = product.categories?.[0];
    let categoria_tn = null;
    if (catRaw) {
      categoria_tn = typeof catRaw.name === 'object'
        ? (catRaw.name.es || catRaw.name.en || Object.values(catRaw.name)[0] || null)
        : (catRaw.name || null);
    }
    if (categoria_tn) categoriasSet.add(categoria_tn);

    // Aplicar mapa existente; si no hay mapeo previo, default 'Otros'
    const categoria_principal = categoria_tn && categoriaMap[categoria_tn]
      ? categoriaMap[categoria_tn]
      : 'Otros';

    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/productos`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          proveedor_id,
          tn_product_id,
          nombre,
          precio,
          stock,
          imagen_url,
          categoria_tn,
          categoria_principal
        })
      }
    );

    if (upsertRes.ok || upsertRes.status === 201) {
      importados++;
    } else {
      const errText = await upsertRes.text();
      console.warn('[tn-sync] error upsert producto:', upsertRes.status, errText);
    }
  }

  const categorias_tn = [...categoriasSet];
  console.log(`[tn-sync] proveedor=${proveedor_id} store=${tn_store_id} importados=${importados}/${products.length} categorias=${categorias_tn.join(',')}`);
  return res.status(200).json({ importados, total: products.length, categorias_tn });
}
