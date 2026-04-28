const ALLOWED_ORIGINS = [
  'https://emprendego.com.ar',
  'https://www.emprendego.com.ar',
  'https://emprende-go.vercel.app'
];

const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://emprendego.com.ar';

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { email, proveedorId } = req.body || {};
  if (!email || !proveedorId) {
    return res.status(400).json({ error: 'Faltan email o proveedorId' });
  }

  // Validar formato de email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Validar que proveedorId sea un entero positivo
  const provId = parseInt(proveedorId, 10);
  if (!provId || provId <= 0) {
    return res.status(400).json({ error: 'proveedorId inválido' });
  }

  console.log('[crear-pago] MP_ACCESS_TOKEN configurado:', !!process.env.MP_ACCESS_TOKEN);

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        items: [{
          title: 'EmprendeGo Plan Pro - 1 mes',
          description: 'WhatsApp directo, badge verificado, productos ilimitados, estadísticas',
          quantity: 1,
          currency_id: 'ARS',
          unit_price: 20000
        }],
        payer: { email },
        metadata: { proveedor_id: provId, email },
        back_urls: {
          success: `${BASE_URL}/?pago=ok`,
          failure: `${BASE_URL}/?pago=error`,
          pending: `${BASE_URL}/?pago=pendiente`
        },
        auto_return: 'approved',
        notification_url: `${BASE_URL}/api/webhook-mp`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: 'Error de Mercado Pago', detail: data });
    }

    return res.status(200).json({
      init_point: data.init_point
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
}
