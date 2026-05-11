const ALLOWED_ORIGINS = [
  'https://emprendego.com.ar',
  'https://www.emprendego.com.ar',
  'https://emprende-go.vercel.app'
];

const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  // Verificar secreto de admin
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.error('[reactivar-pro] ADMIN_SECRET no configurado');
    return res.status(503).json({ error: 'Servicio no disponible' });
  }
  if (req.headers['x-admin-secret'] !== adminSecret) {
    console.warn('[reactivar-pro] intento sin secreto válido');
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { proveedorId } = req.body || {};
  if (!proveedorId || typeof proveedorId !== 'string' || !proveedorId.trim()) {
    return res.status(400).json({ error: 'proveedorId requerido' });
  }
  const provId = proveedorId.trim();

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey) {
    console.error('[reactivar-pro] SUPABASE_SERVICE_ROLE_KEY no configurado');
    return res.status(503).json({ error: 'Configuración incompleta' });
  }

  try {
    const rpcUrl = `${SUPABASE_BASE}/rest/v1/rpc/activar_plan_pro`;
    console.log(`[reactivar-pro] activando proveedorId="${provId}"`);

    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_id: provId })
    });

    const rpcData = await rpcRes.json();

    if (!rpcRes.ok || rpcData?.ok === false) {
      console.error(`[reactivar-pro] error RPC: ${rpcRes.status}`, JSON.stringify(rpcData));
      return res.status(500).json({ error: 'Error al activar', detail: rpcData });
    }

    console.log(`[reactivar-pro] ✅ proveedor ${provId} reactivado hasta ${rpcData?.plan_hasta}`);
    return res.status(200).json({ ok: true, plan_hasta: rpcData?.plan_hasta });
  } catch (err) {
    console.error('[reactivar-pro] error inesperado:', err.message);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
}
