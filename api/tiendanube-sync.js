export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { proveedor_id } = req.body || {};
  if (!proveedor_id) return res.status(400).json({ error: 'Falta proveedor_id' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Leer tn_store_id y tn_access_token del proveedor
  const getRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=tn_store_id,tn_access_token`,
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

  const { tn_store_id, tn_access_token } = prov;

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
    return res.status(200).json({ importados: 0, mensaje: 'No hay productos en la tienda' });
  }

  let importados = 0;

  for (const product of products) {
    const nombre = product.name?.es || product.name || 'Sin nombre';
    const variant = product.variants?.[0];
    const precio = variant?.price ? parseFloat(variant.price) : 0;
    const stock = variant?.stock ?? null;
    const imagen_url = product.images?.[0]?.src || null;
    const tn_product_id = String(product.id);

    // Upsert por proveedor_id + tn_product_id para evitar duplicados
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
          categoria_principal: 'Otros'
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

  console.log(`[tn-sync] proveedor=${proveedor_id} store=${tn_store_id} importados=${importados}/${products.length}`);
  return res.status(200).json({ importados, total: products.length });
}
