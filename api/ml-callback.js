import { createHmac, timingSafeEqual } from 'crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REDIRECT_BASE = 'https://emprendego.com.ar';
const CALLBACK_URL = `${REDIRECT_BASE}/api/ml-callback`;

export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Parámetros inválidos');

  const stateSecret = process.env.ML_STATE_SECRET;
  if (!stateSecret) {
    console.error('[ml-callback] ML_STATE_SECRET no configurado');
    return res.redirect(`${REDIRECT_BASE}/?ml=error`);
  }

  // Verificar firma HMAC del state (previene CSRF)
  const dotIdx = state.lastIndexOf('.');
  if (dotIdx === -1) return res.status(400).send('State inválido');

  const proveedorId = state.slice(0, dotIdx);
  const receivedSig = state.slice(dotIdx + 1);
  const expectedSig = createHmac('sha256', stateSecret).update(proveedorId).digest('hex').slice(0, 32);

  let sigOk = false;
  try {
    sigOk = timingSafeEqual(Buffer.from(receivedSig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
  } catch { sigOk = false; }

  if (!sigOk || !UUID_RE.test(proveedorId)) {
    console.warn('[ml-callback] firma inválida o proveedorId no UUID — rechazado');
    return res.status(400).send('State inválido');
  }

  const appId = process.env.ML_APP_ID;
  const appSecret = process.env.ML_APP_SECRET;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!appId || !appSecret) return res.status(500).send('Credenciales ML no configuradas');
  if (!supabaseUrl || !supabaseKey) return res.status(500).send('Credenciales Supabase no configuradas');

  // Intercambiar code por tokens
  const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: CALLBACK_URL
    }).toString()
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('[ml-callback] error token ML:', tokenRes.status, err);
    return res.redirect(`${REDIRECT_BASE}/?ml=error`);
  }

  const tokenData = await tokenRes.json();
  const { access_token, refresh_token, user_id } = tokenData;

  if (!access_token || !user_id) {
    console.error('[ml-callback] token o user_id faltante:', JSON.stringify(tokenData));
    return res.redirect(`${REDIRECT_BASE}/?ml=error`);
  }

  // Guardar tokens en proveedores
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        ml_user_id: String(user_id),
        ml_access_token: access_token,
        ml_refresh_token: refresh_token || null
      })
    }
  );

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error('[ml-callback] error PATCH Supabase:', patchRes.status, err);
    return res.redirect(`${REDIRECT_BASE}/?ml=error`);
  }

  console.log(`[ml-callback] proveedor ${proveedorId} conectado exitosamente — user_id=${user_id}`);
  return res.redirect(`${REDIRECT_BASE}/?ml=ok`);
}
