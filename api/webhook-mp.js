import { createHmac, timingSafeEqual } from 'crypto';

const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

async function logWebhook(entry) {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!key || !SUPABASE_BASE) return;
    await fetch(`${SUPABASE_BASE}/rest/v1/webhook_logs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(entry)
    });
  } catch (e) {
    console.warn('[webhook-mp] log failed (non-critical):', e.message);
  }
}

function verificarFirmaMP(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook-mp] CRÍTICO: MP_WEBHOOK_SECRET no configurado — request rechazado');
    return false;
  }

  const xSignature = req.headers['x-signature'] || '';
  const xRequestId = req.headers['x-request-id'] || '';
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
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: null, rpc_ok: false, error_detail: 'missing_proveedor_id', raw_body: req.body });
          return res.status(200).send('OK');
        }

        const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!apiKey) {
          console.error('[webhook-mp] CRÍTICO: ninguna Supabase key configurada');
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: false, error_detail: 'missing_supabase_key', raw_body: req.body });
          return res.status(200).send('OK');
        }

        const usingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        console.log(`[webhook-mp] usando ${usingServiceRole ? 'SERVICE ROLE KEY ✅' : 'ANON KEY ⚠️'}`);

        const rpcUrl = `${SUPABASE_BASE}/rest/v1/rpc/activar_plan_pro`;
        console.log(`[webhook-mp] RPC URL: "${rpcUrl}"`);

        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ p_id: proveedorId })
        });

        const rpcData = await rpcRes.json();
        const rpcOk = rpcRes.ok && rpcData?.ok !== false;

        if (!rpcOk) {
          console.error(`[webhook-mp] error RPC: ${rpcRes.status}`, JSON.stringify(rpcData));
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: false, error_detail: JSON.stringify(rpcData), raw_body: req.body });
        } else {
          console.log(`[webhook-mp] ✅ proveedor ${proveedorId} activado a Pro hasta ${rpcData?.plan_hasta}`);
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: true, error_detail: null, raw_body: req.body });
        }
      } else {
        console.log(`[webhook-mp] pago con status="${payment.status}" — no se actualiza`);
        await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: null, rpc_ok: null, error_detail: null, raw_body: req.body });
      }
    } else {
      console.log(`[webhook-mp] notificación ignorada (type="${type}", dataId="${dataId}")`);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook-mp] error inesperado:', err.message, err.cause);
    await logWebhook({ payment_id: null, payment_status: null, proveedor_id: null, rpc_ok: false, error_detail: err.message, raw_body: req.body });
    return res.status(200).send('OK');
  }
}
