import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://seubtijmyoahnyspvidq.supabase.co',
  'sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA'
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

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
        const proveedorId = payment.metadata?.proveedor_id;
        const email = payment.metadata?.email;

        if (proveedorId) {
          await supabase
            .from('proveedores')
            .update({
              plan: 'pro',
              plan_desde: new Date().toISOString(),
              plan_hasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            })
            .eq('id', proveedorId);
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    return res.status(200).send('OK');
  }
}
