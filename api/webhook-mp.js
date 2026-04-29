import { createHmac, timingSafeEqual } from 'crypto';

const SB_URL = process.env.SUPABASE_URL || 'https://seubtijmyoahnyspvidq.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function sbHeaders() {
  return {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
}

async function sbSelect(table, filters, select = '*') {
  const params = new URLSearchParams({ select });
  for (const [col, val] of Object.entries(filters)) params.set(col, `eq.${val}`);
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    headers: { ...sbHeaders(), 'Prefer': 'return=representation' }
  });
  if (!res.ok) throw new Error(`Supabase GET ${table}: ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function sbUpdate(table, filters, body) {
  const params = new URLSearchParams();
  for (const [col, val] of Object.entries(filters)) params.set(col, `eq.${val}`);
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase PATCH ${table}: ${res.status} ${detail}`);
  }
}

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

  if (!verificarFirmaMP(req)) {
    console.warn('Webhook MP: firma inválida o secreto no configurado');
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

      if (payment.status === 'approved') {
        const proveedorId = payment.metadata?.proveedor_id || payment.external_reference;

        if (proveedorId) {
          const now = new Date();
          const toDate = d => d.toISOString().slice(0, 10);

          // Si ya era Pro con fecha activa, sumar 30 días al vencimiento actual
          const prov = await sbSelect('proveedores', { id: proveedorId }, 'plan_hasta');
          const currentHasta = prov?.plan_hasta ? new Date(prov.plan_hasta) : null;
          const base = (currentHasta && currentHasta > now) ? currentHasta : now;
          const nuevaFechaHasta = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

          await sbUpdate('proveedores', { id: proveedorId }, {
            plan: 'pro',
            plan_desde: toDate(now),
            plan_hasta: toDate(nuevaFechaHasta)
          });

          console.log(`[webhook-mp] pago aprobado id=${payment.id} proveedor=${proveedorId} plan_hasta=${toDate(nuevaFechaHasta)}`);
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook MP: error inesperado', err);
    return res.status(200).send('OK');
  }
}
