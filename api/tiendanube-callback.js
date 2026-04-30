export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Parámetros inválidos');
  }

  let proveedorId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    proveedorId = decoded.proveedor_id;
  } catch {
    return res.status(400).send('State inválido');
  }

  if (!proveedorId) return res.status(400).send('proveedor_id faltante en state');

  const appId = process.env.TN_APP_ID;
  const clientSecret = process.env.TN_CLIENT_SECRET;
  if (!appId || !clientSecret) {
    return res.status(500).send('Credenciales TN no configuradas');
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
    console.error('[tn-callback] error token:', err);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const storeId = String(tokenData.user_id);

  if (!accessToken || !storeId) {
    console.error('[tn-callback] token o store_id faltante:', tokenData);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  // Guardar en Supabase
  const patchRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/proveedores?id=eq.${proveedorId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tn_store_id: storeId, tn_access_token: accessToken })
    }
  );

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    console.error('[tn-callback] error PATCH Supabase:', patchRes.status, errText);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  console.log(`[tn-callback] proveedor ${proveedorId} conectado, store_id=${storeId}`);
  return res.redirect('https://emprendego.com.ar/?tn=ok');
}
