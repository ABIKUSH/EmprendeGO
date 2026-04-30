export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  const proveedorId = req.query.proveedor_id;
  console.log('[tn-auth] proveedor_id recibido:', proveedorId, '| tipo:', typeof proveedorId);
  if (!proveedorId) return res.status(400).json({ error: 'Falta proveedor_id' });

  const appId = process.env.TN_APP_ID;
  if (!appId) return res.status(500).json({ error: 'TN_APP_ID no configurado' });

  const callbackUrl = 'https://emprendego.com.ar/api/tiendanube-callback';

  const authUrl =
    `https://www.tiendanube.com/apps/${appId}/authorize` +
    `?scope=read_products` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&state=${encodeURIComponent(proveedorId)}`;

  console.log('[tn-auth] redirigiendo a:', authUrl);
  return res.redirect(302, authUrl);
}
