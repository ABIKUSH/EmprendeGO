import { createHmac } from 'crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  const proveedorId = req.query.proveedor_id;
  if (!proveedorId || !UUID_RE.test(proveedorId)) {
    return res.status(400).json({ error: 'proveedor_id inválido' });
  }

  const appId = process.env.ML_APP_ID;
  const stateSecret = process.env.ML_STATE_SECRET;
  if (!appId) return res.status(500).json({ error: 'ML_APP_ID no configurado' });
  if (!stateSecret) return res.status(500).json({ error: 'ML_STATE_SECRET no configurado' });

  const sig = createHmac('sha256', stateSecret).update(proveedorId).digest('hex').slice(0, 32);
  const state = `${proveedorId}.${sig}`;

  const callbackUrl = 'https://emprendego.com.ar/api/ml-callback';

  const authUrl =
    `https://auth.mercadolibre.com.ar/authorization` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&state=${encodeURIComponent(state)}`;

  console.log('[ml-auth] redirigiendo — proveedor_id:', proveedorId);
  return res.redirect(302, authUrl);
}
