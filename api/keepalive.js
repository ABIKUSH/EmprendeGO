const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  const isVercelCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET || process.env.ADMIN_SECRET}`;
  if (!isVercelCron) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !SUPABASE_BASE) {
    return res.status(503).json({ error: 'Configuración incompleta' });
  }

  try {
    const url = `${SUPABASE_BASE}/rest/v1/proveedores?select=id&limit=1`;
    const supaRes = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!supaRes.ok) {
      console.error('[keepalive] Supabase respondió con status', supaRes.status);
      return res.status(502).json({ ok: false, status: supaRes.status });
    }

    console.log('[keepalive] Supabase activa OK');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[keepalive] error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
