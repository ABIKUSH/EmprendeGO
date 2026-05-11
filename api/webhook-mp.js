import { createHmac, timingSafeEqual } from 'crypto';

function verificarFirmaMP(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    // Sin secreto configurado: se permite el paso pero se loguea advertencia.
    // Para producción: configurar MP_WEBHOOK_SECRET en Vercel y en el panel de MP.
    console.warn('[webhook-mp] MP_WEBHOOK_SECRET no configurado — verificación de firma omitida');
    return true;
  }

  const xSignature = req.headers['x-signature'] || '';
  const xRequestId = req.headers['x-request-id'] || '';
  const dataId = req.body?.data?.id;
  if (!xSignature || !dataId) {
    console.warn('[webhook-mp] firma requerida pero faltan headers o data.id');
    return false;
  }

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

  console.log('[webhook-mp] body recibido:', JSON.stringify(req.body));
  console.log('[webhook-mp] query params:', JSON.stringify(req.query));
  console.log('[webhook-mp] headers x-signature:', req.headers['x-signature'] || '(none)');

  if (!verificarFirmaMP(req)) {
    console.warn('[webhook-mp] firma inválida — rechazado');
    return res.status(401).send('Unauthorized');
  }

  try {
    // Soporta formato nuevo (JSON body: type + data.id)
    // y formato viejo IPN (query params: topic + id)
    const type = req.body?.type || req.query?.topic;
    const dataId = String(req.body?.data?.id || req.query?.id || '').trim();

    console.log(`[webhook-mp] type="${type}" dataId="${dataId}"`);

    if (type === 'payment' && dataId) {
      const paymentRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${dataId}`,
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      );
      const payment = await paymentRes.json();
      console.log(`[webhook-mp] pago id=${dataId} status=${payment.status}`);
      console.log(`[webhook-mp] external_reference: ${payment.external_reference}`);
      console.log(`[webhook-mp] metadata.proveedor_id: ${payment.metadata?.proveedor_id}`);

      if (payment.status === 'approved') {
        const proveedorId = (payment.metadata?.proveedor_id || payment.external_reference || '').trim();
        console.log(`[webhook-mp] proveedorId resuelto: "${proveedorId}"`);

        if (!proveedorId) {
          console.error('[webhook-mp] pago aprobado pero sin proveedorId — no se puede actualizar');
          return res.status(200).send('OK');
        }

        const toDate = d => new Date(d).toISOString().slice(0, 10);
        const now = new Date();

        // Leer plan_hasta actual para sumar 30 días encima si ya tenía Pro vigente
        const getRes = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/proveedores?id=eq.${proveedorId}&select=plan_hasta`,
          {
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        const rows = await getRes.json();
        console.log(`[webhook-mp] rows Supabase:`, JSON.stringify(rows));

        if (!Array.isArray(rows) || rows.length === 0) {
          console.error(`[webhook-mp] proveedor ${proveedorId} no encontrado en Supabase`);
          return res.status(200).send('OK');
        }

        const currentHasta = rows[0]?.plan_hasta ? new Date(rows[0].plan_hasta) : null;
        const base = (currentHasta && currentHasta > now) ? currentHasta : now;
        const fechaVencimiento = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

        console.log(`[webhook-mp] plan_hasta actual=${currentHasta?.toISOString() ?? 'null'} → nuevo=${toDate(fechaVencimiento)}`);

        const patchRes = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/proveedores?id=eq.${proveedorId}`,
          {
            method: 'PATCH',
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal'
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
          console.log(`[webhook-mp] ✅ proveedor ${proveedorId} actualizado a Pro hasta ${toDate(fechaVencimiento)}`);
        }
      } else {
        console.log(`[webhook-mp] pago con status="${payment.status}" — no se actualiza`);
      }
    } else {
      console.log(`[webhook-mp] notificación ignorada (type="${type}", dataId="${dataId}")`);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook-mp] error inesperado:', err.message, err.cause);
    return res.status(200).send('OK');
  }
}
