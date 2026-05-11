const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  // Solo GET (invocado por Vercel cron) o POST con secreto admin para pruebas manuales
  const adminSecret = process.env.ADMIN_SECRET;
  const isVercelCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET || adminSecret}`;
  const isAdminPost = req.method === 'POST' && adminSecret && req.headers['x-admin-secret'] === adminSecret;

  if (!isVercelCron && !isAdminPost) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !SUPABASE_BASE) {
    console.error('[recordatorio-planes] configuración incompleta');
    return res.status(503).json({ error: 'Configuración incompleta' });
  }

  try {
    const ahora = new Date();
    const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Buscar proveedores Pro cuyo plan vence en los próximos 7 días
    const url = `${SUPABASE_BASE}/rest/v1/proveedores?plan=eq.pro&plan_hasta=gte.${ahora.toISOString().split('T')[0]}&plan_hasta=lte.${en7dias.toISOString().split('T')[0]}&estado=eq.aprobado&select=id,nombre,email,whatsapp,plan_hasta`;

    const supaRes = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      }
    });

    if (!supaRes.ok) {
      const err = await supaRes.text();
      console.error('[recordatorio-planes] error Supabase:', supaRes.status, err);
      return res.status(500).json({ error: 'Error consultando DB' });
    }

    const expirando = await supaRes.json();
    console.log(`[recordatorio-planes] proveedores por vencer: ${expirando.length}`);
    expirando.forEach(p => {
      const dias = Math.ceil((new Date(p.plan_hasta) - ahora) / 86400000);
      console.log(`[recordatorio-planes]  • ${p.nombre} (${p.email}) vence en ${dias} días (${p.plan_hasta}) | WA: ${p.whatsapp || 'no'}`);
    });

    return res.status(200).json({
      ok: true,
      total: expirando.length,
      proveedores: expirando.map(p => ({
        id: p.id,
        nombre: p.nombre,
        email: p.email,
        whatsapp: p.whatsapp,
        plan_hasta: p.plan_hasta,
        dias_restantes: Math.ceil((new Date(p.plan_hasta) - ahora) / 86400000)
      }))
    });
  } catch (err) {
    console.error('[recordatorio-planes] error inesperado:', err.message);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
}
