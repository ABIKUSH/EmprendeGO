const ALLOWED_ORIGINS = [
  'https://emprendego.com.ar',
  'https://www.emprendego.com.ar',
  'https://emprende-go.vercel.app'
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  const paymentId = req.query?.payment_id;
  if (!paymentId || !/^\d+$/.test(String(paymentId))) {
    return res.status(400).json({ error: 'payment_id inválido' });
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await mpRes.json();
    console.log('[verificar-pago] status:', payment.status, 'external_reference:', payment.external_reference);

    if (!mpRes.ok) {
      return res.status(500).json({ error: 'Error al consultar el pago' });
    }

    if (payment.status !== 'approved') {
      return res.status(200).json({ ok: false, status: payment.status });
    }

    const proveedorId = payment.metadata?.proveedor_id || payment.external_reference;
    if (!proveedorId || !UUID_RE.test(proveedorId)) {
      return res.status(200).json({ ok: false, error: 'Sin proveedor válido en el pago' });
    }

    // Leer estado actual del proveedor
    const getRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/proveedores?id=eq.${proveedorId}&select=plan_hasta,ultimo_payment_id`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const rows = await getRes.json();
    const row = rows?.[0];

    // Idempotencia: si este payment_id ya fue procesado, devolver estado actual sin modificar
    if (row?.ultimo_payment_id === String(paymentId)) {
      console.log(`[verificar-pago] payment ${paymentId} ya procesado — devolviendo estado actual`);
      const toDate = d => new Date(d).toISOString().slice(0, 10);
      return res.status(200).json({
        ok: true,
        plan: 'pro',
        plan_hasta: row.plan_hasta ? toDate(row.plan_hasta) : null
      });
    }

    const now = new Date();
    const currentHasta = row?.plan_hasta ? new Date(row.plan_hasta) : null;
    const base = (currentHasta && currentHasta > now) ? currentHasta : now;
    const fechaVencimiento = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    const toDate = d => new Date(d).toISOString().slice(0, 10);

    const patchRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/proveedores?id=eq.${proveedorId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          plan: 'pro',
          plan_desde: toDate(now),
          plan_hasta: toDate(fechaVencimiento),
          ultimo_payment_id: String(paymentId)
        })
      }
    );

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error('[verificar-pago] error PATCH:', patchRes.status, errText);
      return res.status(500).json({ error: 'Error al actualizar plan' });
    }

    console.log(`[verificar-pago] proveedor ${proveedorId} actualizado a Pro hasta ${toDate(fechaVencimiento)}`);
    return res.status(200).json({
      ok: true,
      plan: 'pro',
      plan_desde: toDate(now),
      plan_hasta: toDate(fechaVencimiento)
    });
  } catch (err) {
    console.error('[verificar-pago] error:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
}
