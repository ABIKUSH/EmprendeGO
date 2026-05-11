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
  // IPN antiguo: ID en query param. Webhook nuevo: ID en body.data.id
  const dataId = req.body?.data?.id || req.query?.id;
  if (!xSignature || !dataId) {
    console.warn('[webhook-mp] firma requerida pero faltan headers o payment id');
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

const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');

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

        const rpcUrl = `${SUPABASE_BASE}/rest/v1/rpc/activar_plan_pro`;
        console.log(`[webhook-mp] RPC URL completa (${rpcUrl.length} chars): "${rpcUrl}"`);

        // Usamos RPC (función SECURITY DEFINER) que bypassa RLS y permisos de columna.
        // La anon key es pública (está en index.html). La service role key en Vercel
        // devuelve PGRST125 por estar mal configurada; se usa la anon key directamente.
        const apiKey = process.env.SUPABASE_ANON_KEY ||
          'sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA';
        const rpcRes = await fetch(
          rpcUrl,
          {
            method: 'POST',
            headers: {
              apikey: apiKey,
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ p_id: proveedorId })
          }
        );

        const rpcData = await rpcRes.json();
        if (!rpcRes.ok || rpcData?.ok === false) {
          console.error(`[webhook-mp] error RPC: ${rpcRes.status}`, JSON.stringify(rpcData));
        } else {
          console.log(`[webhook-mp] ✅ proveedor ${proveedorId} activado a Pro hasta ${rpcData?.plan_hasta}`);
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
