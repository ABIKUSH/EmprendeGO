export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el ID' });
  try {
    const r = await fetch(`https://api.mercadolibre.com/items/MLA${id}`);
    if (!r.ok) throw new Error('ML error');
    const data = await r.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: 'No se pudo obtener el producto' });
  }
}
