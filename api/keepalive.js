const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SITE = 'https://emprendego.com.ar';

export default async function handler(req, res) {
  // Sitemap público (sin auth). Se sirve en /sitemap.xml vía rewrite en vercel.json.
  // Retorna antes del chequeo del cron, así que NO altera el comportamiento de keepalive.
  if (req.query && req.query.mode === 'sitemap') {
    return await serveSitemap(res);
  }

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

// Genera el sitemap.xml con home + productos visibles + proveedores aprobados.
// Si algo falla, devuelve al menos el home (nunca rompe).
async function serveSitemap(res) {
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const urls = [SITE + '/'];
  try {
    if (apiKey && SUPABASE_BASE) {
      const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
      const [prodRes, provRes] = await Promise.all([
        fetch(`${SUPABASE_BASE}/rest/v1/productos?select=id&or=(visible.eq.true,visible.is.null)&limit=5000`, { headers }),
        fetch(`${SUPABASE_BASE}/rest/v1/proveedores?select=id&estado=eq.aprobado&limit=2000`, { headers }),
      ]);
      if (prodRes.ok) {
        const prods = await prodRes.json();
        for (const p of prods) if (p && p.id) urls.push(`${SITE}/?p=${encodeURIComponent(p.id)}`);
      }
      if (provRes.ok) {
        const provs = await provRes.json();
        for (const p of provs) if (p && p.id) urls.push(`${SITE}/?prov=${encodeURIComponent(p.id)}`);
      }
    }
  } catch (err) {
    console.error('[sitemap] error:', err.message);
  }
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')
    + '\n</urlset>\n';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
  return res.status(200).send(body);
}
