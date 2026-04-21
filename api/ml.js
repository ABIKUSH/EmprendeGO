export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

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
    // Skip 2X upscale variants (unnecessarily large)
    if (!m[0].includes('_2X_') && !m[0].includes('-2X-')) imgSet.add(m[0]);
  }

  const pictures = [...imgSet].slice(0, 5).map(u => ({ url: u }));

  return { title, price, thumbnail, pictures, subtitle };
}
