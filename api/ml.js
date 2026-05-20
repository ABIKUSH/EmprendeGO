const ALLOWED_ORIGINS = [
  'https://emprendego.com.ar',
  'https://www.emprendego.com.ar',
  'https://emprende-go.vercel.app'
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache para reducir llamadas repetidas al mismo producto
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
}

export default async function handler(req, res) {
  // Callback de OAuth Mercado Libre (proveedor conectando su cuenta).
  // Detectamos por state + (code | error) — siempre llega por GET desde mercadolibre.com
  if (req.method === 'GET' && req.query.state && (req.query.code || req.query.error)) {
    return handleMLOAuthCallback(req, res);
  }

  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el ID' });

  const cleanId = String(id).replace(/\D/g, '');
  if (!cleanId) return res.status(400).json({ error: 'ID inválido' });

  try {
    // Primario: OAuth2 si hay credenciales configuradas en Vercel
    if (process.env.ML_APP_ID && process.env.ML_APP_SECRET) {
      const data = await fetchViaAPI(cleanId);
      if (data) return res.status(200).json(data);
    }

    // Fallback: scraping de la página pública del producto
    const data = await scrapeProductPage(cleanId);
    if (data) return res.status(200).json(data);

    return res.status(404).json({ error: 'Producto no encontrado' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function fetchViaAPI(id) {
  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${process.env.ML_APP_ID}&client_secret=${process.env.ML_APP_SECRET}`,
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json();

    const r = await fetch(`https://api.mercadolibre.com/items/MLA${id}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      title: d.title,
      price: d.price,
      thumbnail: d.thumbnail?.replace(/-I\.(jpg|webp)$/, '-O.$1') || '',
      pictures: (d.pictures || []).slice(0, 5).map(p => ({ url: p.url || p.secure_url || '' })),
      subtitle: d.subtitle || '',
    };
  } catch {
    return null;
  }
}

async function scrapeProductPage(id) {
  const url = `https://articulo.mercadolibre.com.ar/MLA-${id}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
  });
  if (!r.ok) return null;
  const html = await r.text();

  // Title: og:title, strip trailing price "- $ 3.990"
  const ogTitleM = html.match(/og:title[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:title/s);
  const rawTitle = ogTitleM ? ogTitleM[1] : '';
  const title = rawTitle.replace(/\s*[-–]\s*\$[\s\d.,]+$/, '').trim();
  if (!title) return null;

  // Price: first "price": NUMBER in the page JSON
  const priceM = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
  const price = priceM ? parseFloat(priceM[1]) : 0;

  // Description: og:description
  const ogDescM = html.match(/og:description[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:description/s);
  const subtitle = ogDescM ? ogDescM[1].trim() : '';

  // Main image: og:image
  const ogImgM = html.match(/og:image[^>]+content="([^"]+)"/s)
    || html.match(/content="([^"]+)"[^>]*og:image/s);
  const thumbnail = ogImgM ? ogImgM[1] : '';

  // Additional images: all unique mlstatic product image URLs
  const imgSet = new Set();
  if (thumbnail) imgSet.add(thumbnail);
  for (const m of html.matchAll(/https:\/\/http2\.mlstatic\.com\/D_NQ_NP_[^"\\, ]+\.(?:jpg|webp|png)/g)) {
    if (!m[0].includes('_2X_') && !m[0].includes('-2X-')) imgSet.add(m[0]);
  }

  const pictures = [...imgSet].slice(0, 5).map(u => ({ url: u }));

  return { title, price, thumbnail, pictures, subtitle };
}

// ============================================================
// OAuth Mercado Libre — callback (proveedor conecta su cuenta)
// ============================================================
async function handleMLOAuthCallback(req, res) {
  const { code, state, error, error_description } = req.query;
  const proveedorId = state;

  console.log('[ml-callback] params:', { code: code ? '***' : null, error, state });

  if (error) {
    console.error('[ml-callback] error desde ML:', error, error_description);
    return res.redirect(302, `https://emprendego.com.ar/?ml=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !proveedorId) {
    return res.status(400).send('Parámetros inválidos');
  }

  const appId = process.env.ML_APP_ID;
  const clientSecret = process.env.ML_APP_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI || 'https://emprendego.com.ar/api/ml';
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!appId || !clientSecret) {
    console.error('[ml-callback] ML_APP_ID o ML_APP_SECRET no configurados');
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=server');
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error('[ml-callback] credenciales Supabase no configuradas');
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=server');
  }

  // Intercambiar code por access_token + refresh_token
  let tokenData;
  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      }).toString()
    });

    if (!tokenRes.ok) {
      const errTxt = await tokenRes.text();
      console.error('[ml-callback] error token ML:', tokenRes.status, errTxt);
      return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=token');
    }
    tokenData = await tokenRes.json();
  } catch (e) {
    console.error('[ml-callback] fetch token fallo:', e.message);
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=network');
  }

  const { access_token, refresh_token, expires_in, user_id } = tokenData;
  console.log('[ml-callback] token ML ok — user_id:', user_id, '| expires_in:', expires_in);

  if (!access_token || !refresh_token || !user_id) {
    console.error('[ml-callback] respuesta ML incompleta:', JSON.stringify(tokenData));
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=token');
  }

  const expiresAt = new Date(Date.now() + (Number(expires_in) || 21600) * 1000).toISOString();

  // Pedir nickname (opcional, mejora UX en el dashboard)
  let nickname = null;
  try {
    const userRes = await fetch(`https://api.mercadolibre.com/users/${user_id}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (userRes.ok) {
      const u = await userRes.json();
      nickname = u.nickname || null;
    }
  } catch (e) {
    console.warn('[ml-callback] no se pudo obtener nickname:', e.message);
  }

  // Guardar credenciales en proveedores
  const patchUrl = `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      ml_user_id: String(user_id),
      ml_access_token: access_token,
      ml_refresh_token: refresh_token,
      ml_token_expires_at: expiresAt,
      ml_nickname: nickname,
      ml_connected: true
    })
  });

  if (!patchRes.ok) {
    const errBody = await patchRes.text();
    console.error('[ml-callback] error PATCH Supabase:', patchRes.status, errBody);
    return res.redirect(302, 'https://emprendego.com.ar/?ml=error&reason=save');
  }

  console.log(`[ml-callback] proveedor ${proveedorId} conectado a ML user ${user_id}`);
  return res.redirect(302, 'https://emprendego.com.ar/?ml=ok');
}
