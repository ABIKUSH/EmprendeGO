import { createHmac, timingSafeEqual } from 'crypto';

function verificarFirmaMP(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const xSignature = req.headers['x-signature'] || '';
  const xRequestId = req.headers['x-request-id'] || '';
  const dataId = req.body?.data?.id;
  if (!xSignature || !dataId) return false;

  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.split('=').map(s => s.trim()))
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  if (!process.env.MP_WEBHOOK_SECRET) {
    console.error('[webhook-mp] MP_WEBHOOK_SECRET no configurado — rechazando request');
    return res.status(503).send('Service unavailable');
  }

  // Ignorar eventos que no son pagos (ej: topic_merchant_order_wh)
  const eventType = req.body?.type;
  if (eventType && eventType !== 'payment') {
    console.log(`[webhook-mp] tipo no procesado: ${eventType} — OK sin acción`);
    return res.status(200).send('OK');
  }

  const firmaOk = verificarFirmaMP(req);
  if (!firmaOk) {
    console.warn('[webhook-mp] firma inválida — rechazando');
    return res.status(401).send('Unauthorized');
  }

  try {
    const { type, data } = req.body || {};

    if (type === 'payment') {
      const paymentId = data?.id;
      if (!paymentId) return res.status(200).send('OK');

      const paymentRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      );
      const payment = await paymentRes.json();
      console.log(`[webhook-mp] pago id=${paymentId} status=${payment.status}`);
      console.log(`[webhook-mp] external_reference recibido: ${payment.external_reference}`);
      console.log(`[webhook-mp] metadata.proveedor_id: ${payment.metadata?.proveedor_id}`);

      if (payment.status === 'approved') {
        const proveedorId = payment.metadata?.proveedor_id || payment.external_reference;
        console.log(`[webhook-mp] proveedorId resuelto: ${proveedorId}`);

        if (proveedorId) {
          const toDate = d => new Date(d).toISOString().slice(0, 10);
          const now = new Date();

          // Leer plan_hasta actual para sumar 30 días si ya era Pro activo
          const getRes = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/proveedores?id=eq.${proveedorId}&select=plan_hasta`,
            {
              headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
              }
            }
          );
          const rows = await getRes.json();
          const currentHasta = rows?.[0]?.plan_hasta ? new Date(rows[0].plan_hasta) : null;
          const base = (currentHasta && currentHasta > now) ? currentHasta : now;
          const fechaVencimiento = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

          console.log(`[webhook-mp] plan_hasta actual=${currentHasta?.toISOString() ?? 'null'} → nuevo=${toDate(fechaVencimiento)}`);

          const patchRes = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/proveedores?id=eq.${proveedorId}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                plan: 'pro',
                plan_desde: toDate(now),
                plan_hasta: toDate(fechaVencimiento)
              })
            }
          );

          if (!patchRes.ok) {
            const errText = await patchRes.text();
            console.error(`[webhook-mp] error PATCH Supabase: ${patchRes.status} ${errText}`);
          } else {
            console.log(`[webhook-mp] proveedor ${proveedorId} actualizado a Pro hasta ${toDate(fechaVencimiento)}`);
          }
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook-mp] error inesperado:', err.message, err.cause);
    return res.status(200).send('OK');
  }
}
