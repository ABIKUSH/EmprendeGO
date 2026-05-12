const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { proveedor_id, de_nombre, texto } = req.body || {};
  if (!proveedor_id || !de_nombre || !texto) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey || !SUPABASE_BASE) {
    return res.status(500).json({ error: 'server config error' });
  }

  try {
    // Obtener datos del proveedor y verificar cooldown
    const provRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/proveedores?id=eq.${encodeURIComponent(proveedor_id)}&select=email,nombre,notif_email,last_notified_at`,
      { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } }
    );
    const provData = await provRes.json();
    const proveedor = provData?.[0];

    if (!proveedor) return res.status(404).json({ error: 'provider not found' });
    if (!proveedor.notif_email) return res.status(200).json({ ok: true, skipped: 'notif_disabled' });
    if (!proveedor.email) return res.status(200).json({ ok: true, skipped: 'no_email' });

    // Cooldown de 15 minutos por proveedor
    if (proveedor.last_notified_at) {
      const minutesSince = (Date.now() - new Date(proveedor.last_notified_at).getTime()) / 60000;
      if (minutesSince < 15) return res.status(200).json({ ok: true, skipped: 'cooldown' });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[notificar-mensaje] RESEND_API_KEY no configurado');
      return res.status(200).json({ ok: false, error: 'no_resend_key' });
    }

    const appUrl = (process.env.APP_URL || 'https://emprendego.vercel.app').replace(/\/$/, '');
    const unsubUrl = `${appUrl}/api/unsub?id=${proveedor_id}`;
    const textoPreview = texto.length > 300 ? texto.slice(0, 300) + '...' : texto;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EmprendeGO <notificaciones@emprendego.com.ar>',
        to: [proveedor.email],
        subject: `Nuevo mensaje de ${de_nombre} en EmprendeGO`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
            <div style="background:white;border-radius:10px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
              <h2 style="color:#6366f1;margin:0 0 8px;">Tenés un nuevo mensaje 💬</h2>
              <p style="color:#374151;margin:0 0 20px;"><strong>${de_nombre}</strong> te escribió en EmprendeGO:</p>
              <div style="background:#f3f4f6;border-left:4px solid #6366f1;padding:14px 18px;border-radius:6px;margin-bottom:24px;">
                <p style="margin:0;color:#374151;font-style:italic;">"${textoPreview}"</p>
              </div>
              <a href="${appUrl}" style="display:inline-block;background:#6366f1;color:white;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                Responder en la app →
              </a>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#9ca3af;text-align:center;">
              Recibís este mail porque tenés una cuenta activa en EmprendeGO.<br>
              <a href="${unsubUrl}" style="color:#9ca3af;">Desuscribirme de estas notificaciones</a>
            </p>
          </div>
        `
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      console.error('[notificar-mensaje] Resend error:', JSON.stringify(err));
      return res.status(200).json({ ok: false, error: 'email_send_failed' });
    }

    // Actualizar last_notified_at para el cooldown
    await fetch(`${SUPABASE_BASE}/rest/v1/proveedores?id=eq.${encodeURIComponent(proveedor_id)}`, {
      method: 'PATCH',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ last_notified_at: new Date().toISOString() })
    });

    console.log(`[notificar-mensaje] ✅ email enviado a proveedor ${proveedor_id}`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[notificar-mensaje] error inesperado:', err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
