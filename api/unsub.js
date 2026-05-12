const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send('ID requerido');

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey || !SUPABASE_BASE) return res.status(500).send('Error de configuración');

  try {
    await fetch(`${SUPABASE_BASE}/rest/v1/proveedores?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ notif_email: false })
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><title>Desuscripción — EmprendeGO</title></head>
      <body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;">
        <div style="max-width:400px;margin:0 auto;background:white;padding:40px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <h2 style="color:#6366f1;">✅ Listo</h2>
          <p style="color:#374151;">Ya no vas a recibir notificaciones de mensajes por email.</p>
          <a href="/" style="display:inline-block;margin-top:16px;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Volver a EmprendeGO
          </a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[unsub] error:', err.message);
    return res.status(500).send('Error al procesar la solicitud');
  }
}
