export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el ID' });
  try {
    const r = await fetch(
      `https://api.mercadolibre.com/items/MLA${id}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EmprendeGo/1.0)',
          'Accept': 'application/json'
        }
      }
    );
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody });
    }
    const data = await r.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
