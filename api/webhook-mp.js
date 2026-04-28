import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

const supabase = createClient(
  'https://seubtijmyoahnyspvidq.supabase.co',
  'sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA'
);

function verificarFirmaMP(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  // Si no está configurado el secreto, rechazar (fail-closed)
  if (!secret) return false;

  const xSignature = req.headers['x-signature'] || '';
  const xRequestId = req.headers['x-request-id'] || '';
  const dataId = req.body?.data?.id;
  if (!xSignature || !dataId) return false;

  // Formato: "ts=<timestamp>,v1=<hash>"
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
          const { data: prov } = await supabase
            .from('proveedores')
            .select('plan_hasta')
            .eq('id', proveedorId)
            .maybeSingle();

          const currentHasta = prov?.plan_hasta ? new Date(prov.plan_hasta) : null;
          const base = (currentHasta && currentHasta > now) ? currentHasta : now;
          const nuevaFechaHasta = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

          const { error } = await supabase
            .from('proveedores')
            .update({
              plan: 'pro',
              plan_desde: toDate(now),
              plan_hasta: toDate(nuevaFechaHasta)
            })
            .eq('id', proveedorId);

          if (error) {
            console.error('Webhook MP: error actualizando plan en Supabase', error);
          } else {
            console.log(`[webhook-mp] pago aprobado id=${payment.id} proveedor=${proveedorId} plan_hasta=${toDate(nuevaFechaHasta)}`);
          }
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook MP: error inesperado', err);
    return res.status(200).send('OK');
  }
}
