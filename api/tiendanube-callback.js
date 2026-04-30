export default async function handler(req, res) {
  const { code, state } = req.query;

  console.log('[tn-callback] query params recibidos:', { code: code ? '***' : null, state });

  if (!code || !state) {
    return res.status(400).send('Parámetros inválidos');
  }

  let proveedorId;
  let stateDecoded;
  try {
    stateDecoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    proveedorId = stateDecoded.proveedor_id;
  } catch (e) {
    console.error('[tn-callback] error decodificando state:', e.message, 'state raw:', state);
    return res.status(400).send('State inválido');
  }

  console.log('[tn-callback] state decodificado:', stateDecoded);
  console.log('[tn-callback] proveedor_id extraído:', proveedorId, '| tipo:', typeof proveedorId);

  if (!proveedorId) return res.status(400).send('proveedor_id faltante en state');

  const appId = process.env.TN_APP_ID;
  const clientSecret = process.env.TN_CLIENT_SECRET;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('[tn-callback] SUPABASE_URL (sin trailing slash):', supabaseUrl);
  console.log('[tn-callback] TN_APP_ID configurado:', !!appId);

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
  console.log('[tn-callback] verificando existencia — GET:', getUrl);

  const getRes = await fetch(getUrl, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const getBody = await getRes.text();
  console.log('[tn-callback] GET status:', getRes.status, '| body:', getBody);

  if (!getRes.ok || getBody === '[]') {
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
