export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  const proveedorId = req.query.proveedor_id;
  console.log('[ml-auth] proveedor_id recibido:', proveedorId, '| tipo:', typeof proveedorId);
  if (!proveedorId) return res.status(400).json({ error: 'Falta proveedor_id' });

  const appId = process.env.ML_APP_ID;
  if (!appId) return res.status(500).json({ error: 'ML_APP_ID no configurado' });

  const redirectUri = process.env.ML_REDIRECT_URI || 'https://emprendego.com.ar/api/ml';

  const authUrl =
    `https://auth.mercadolibre.com.ar/authorization` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(proveedorId)}`;

  console.log('[ml-auth] redirigiendo a:', authUrl);
  return res.redirect(302, authUrl);
}
