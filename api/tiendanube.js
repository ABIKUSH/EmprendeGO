// Router unificado de Tienda Nube.
//
// Reemplaza a los cuatro archivos anteriores (tiendanube-auth.js,
// tiendanube-callback.js, tiendanube-sync.js y tn-privacy.js) para liberar
// lugares en el cupo de 12 funciones serverless del plan Hobby de Vercel.
//
// La lógica de negocio de cada handler está movida TAL CUAL: acá solo cambia
// el ruteo. Se ramifica por ?action=auth|callback|sync|privacy.
//
// URLs externas: /api/tiendanube-callback y /api/tn-privacy están registradas
// en el panel de Tienda Nube y NO pueden cambiar. Siguen respondiendo gracias
// a los rewrites de vercel.json, que apuntan acá con el action correspondiente.

import { applyRateLimit, esUUID } from './_ratelimit.js';

export default async function handler(req, res) {
  const q = req.query || {};

  // Red de seguridad: si el rewrite no propagara ?action, deducimos la acción
  // por la forma de la request. Verificado el 2026-08-13 en un preview: Vercel
  // SÍ fusiona los query params (llegan code, state y action juntos), así que
  // hoy esta rama no se usa. Queda como resguardo por si ese comportamiento
  // cambiara, para no romper la conexión de tiendas de los proveedores Pro.
  let action = q.action;
  if (!action) {
    if (q.code && q.state) action = 'callback';
    else if (q.proveedor_id) action = 'auth';
  }

  switch (action) {
    case 'auth':     return handlerAuth(req, res);
    case 'callback': return handlerCallback(req, res);
    case 'sync':     return handlerSync(req, res);
    case 'privacy':  return handlerPrivacy(req, res);
    default:
      return res.status(400).json({ error: 'action inválida' });
  }
}

// ---------------------------------------------------------------------------
// action=auth  (antes api/tiendanube-auth.js)
// ---------------------------------------------------------------------------
function handlerAuth(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  const proveedorId = req.query.proveedor_id;
  console.log('[tn-auth] proveedor_id recibido:', proveedorId, '| tipo:', typeof proveedorId);
  if (!proveedorId) return res.status(400).json({ error: 'Falta proveedor_id' });

  const appId = process.env.TN_APP_ID;
  if (!appId) return res.status(500).json({ error: 'TN_APP_ID no configurado' });

  // Esta URL está registrada en el panel de Tienda Nube. NO cambiar.
  const callbackUrl = 'https://emprendego.com.ar/api/tiendanube-callback';

  const authUrl =
    `https://www.tiendanube.com/apps/${appId}/authorize` +
    `?scope=read_products` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&state=${encodeURIComponent(proveedorId)}`;

  console.log('[tn-auth] redirigiendo a:', authUrl);
  return res.redirect(302, authUrl);
}

// ---------------------------------------------------------------------------
// action=callback  (antes api/tiendanube-callback.js)
// ---------------------------------------------------------------------------
async function handlerCallback(req, res) {
  console.log('[tn-callback] REQUEST RECIBIDA - query:', JSON.stringify(new URL(req.url, 'https://emprendego.com.ar').searchParams.toString()));
  console.log('[tn-callback] headers host:', req.headers.host);

  const { code, state } = req.query;

  console.log('[tn-callback] query params recibidos:', { code: code ? '***' : null, state });

  if (!code || !state) {
    return res.status(400).send('Parámetros inválidos');
  }

  const proveedorId = state;

  console.log('[tn-callback] proveedor_id del state:', proveedorId, '| tipo:', typeof proveedorId);

  if (!proveedorId) return res.status(400).send('proveedor_id faltante en state');

  const appId = process.env.TN_APP_ID;
  const clientSecret = process.env.TN_CLIENT_SECRET;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('[tn-callback] SUPABASE_URL (sin trailing slash):', supabaseUrl);
  console.log('[tn-callback] TN_APP_ID configurado:', !!appId);
  console.log('[tn-callback] SERVICE_ROLE_KEY primeros 20 chars:', supabaseKey ? supabaseKey.substring(0, 20) : 'NO CONFIGURADA');

  if (!appId || !clientSecret) {
    return res.status(500).send('Credenciales TN no configuradas');
  }
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).send('Credenciales Supabase no configuradas');
  }

  // Intercambiar code por access_token
  const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code
    })
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('[tn-callback] error token TN:', tokenRes.status, err);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const storeId = String(tokenData.user_id);

  console.log('[tn-callback] token TN ok — store_id:', storeId, '| access_token presente:', !!accessToken);

  if (!accessToken || !storeId) {
    console.error('[tn-callback] token o store_id faltante en respuesta TN:', JSON.stringify(tokenData));
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  // Verificar que el registro existe antes de hacer PATCH
  const getUrl = `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}&select=id`;

  const getRes = await fetch(getUrl, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const text = await getRes.text();
  console.log('[tn-callback] status:', getRes.status, 'body raw:', text);

  if (!getRes.ok || text === '[]') {
    console.error('[tn-callback] proveedor no encontrado en Supabase. id buscado:', proveedorId);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  // PATCH con Prefer: return=representation para ver la fila actualizada
  const patchUrl = `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}`;
  console.log('[tn-callback] PATCH URL:', patchUrl);

  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ tn_store_id: storeId, tn_access_token: accessToken })
  });

  const patchBody = await patchRes.text();
  console.log('[tn-callback] PATCH status:', patchRes.status, '| body:', patchBody);

  if (!patchRes.ok) {
    console.error('[tn-callback] error PATCH Supabase:', patchRes.status, patchBody);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  console.log(`[tn-callback] proveedor ${proveedorId} conectado exitosamente — store_id=${storeId}`);
  return res.redirect('https://emprendego.com.ar/?tn=ok');
}

// ---------------------------------------------------------------------------
// action=sync  (antes api/tiendanube-sync.js)
// ---------------------------------------------------------------------------
async function handlerSync(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  // Sync es pesado: limitar ráfagas por IP.
  if (!applyRateLimit(req, res, { bucket: 'tn-sync', limit: 10, windowMs: 60000 })) return;

  const { proveedor_id } = req.body || {};
  if (!esUUID(proveedor_id)) return res.status(400).json({ error: 'proveedor_id inválido' });

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
    const imagenesArr = (product.images || []).map(im => im?.src).filter(Boolean).slice(0, 8);
    const imagen_url = imagenesArr[0] || null;
    const imagenes = imagenesArr.length ? imagenesArr : null;
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
          imagenes,
          categoria_tn,
          categoria_principal,
          visible: true
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

// ---------------------------------------------------------------------------
// action=privacy  (antes api/tn-privacy.js)
// ---------------------------------------------------------------------------
function handlerPrivacy(req, res) {
  return res.status(200).send('OK');
}
