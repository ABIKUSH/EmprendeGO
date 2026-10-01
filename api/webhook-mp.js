import { createHmac, timingSafeEqual } from 'crypto';

const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

// ⚠️ EL PRECIO VIVE EN UNA VARIABLE DE ENTORNO, NO EN EL CODIGO. Tiene que ser
// el MISMO numero que usa api/crear-pago.js al armar la preferencia: si los dos
// se separan, el webhook rechaza pagos legitimos o acepta pagos de menos. El
// valor por defecto es el que ya estaba escrito a mano, para que nada cambie si
// la variable no esta cargada.
const PRO_PRECIO_ARS = Number(process.env.MP_PRO_PRICE_ARS) || 20000;
const PRO_MONEDA = 'ARS';

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

  console.log('[webhook-mp] query params:', JSON.stringify(req.query));

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
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: null, rpc_ok: false, error_detail: 'missing_proveedor_id' });
          return res.status(200).send('OK');
        }

        const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!apiKey) {
          console.error('[webhook-mp] CRÍTICO: ninguna Supabase key configurada');
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: false, error_detail: 'missing_supabase_key' });
          return res.status(200).send('OK');
        }

        // ⚠️ FALLA CERRADA SI NO HAY SERVICE ROLE. Antes caia a la clave anonima,
        // que no puede ejecutar la RPC: el pago se perdia en silencio y el
        // proveedor pagaba sin recibir el plan. Mejor un error ruidoso en los
        // registros que un cobro sin contraprestacion.
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error('[webhook-mp] CRITICO: falta SUPABASE_SERVICE_ROLE_KEY — el pago NO se activo');
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: false, error_detail: 'sin_service_role' });
          return res.status(200).send('OK');
        }

        // ⚠️ SE VALIDA EL IMPORTE Y LA MONEDA CONTRA LO QUE ESPERAMOS COBRAR.
        // Hoy la preferencia la crea nuestro propio servidor con el precio fijo,
        // asi que un importe distinto no deberia llegar nunca. Se chequea igual
        // porque el dia que el precio se vuelva configurable, o que exista mas
        // de un plan, este es el unico lugar donde se puede notar que el pago
        // que activa un plan no es el pago de ese plan.
        const importe = Number(payment.transaction_amount);
        const moneda = String(payment.currency_id || '');
        if (moneda !== PRO_MONEDA || !Number.isFinite(importe) || importe < PRO_PRECIO_ARS) {
          console.error(`[webhook-mp] pago aprobado que NO corresponde al plan: ${importe} ${moneda} (esperado ${PRO_PRECIO_ARS} ${PRO_MONEDA})`);
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: false, error_detail: 'importe_o_moneda_inesperados' });
          return res.status(200).send('OK');
        }

        // ⚠️ ACA ESTA EL ARREGLO DEL COBRO DUPLICADO. Mercado Pago manda VARIOS
        // avisos por el mismo pago (payment.created, payment.updated, y
        // reintentos), y antes cada uno extendia el plan 30 dias mas: un pago
        // podia valer tres meses. Ahora la RPC inserta el payment_id en una
        // tabla con clave unica y solo activa si la fila es nueva. El candado es
        // el insert, no un select previo: dos avisos simultaneos pasarian los
        // dos por un select. Ver sql/2026-10-01_pago_idempotente.sql.
        const rpcRes = await fetch(`${SUPABASE_BASE}/rest/v1/rpc/activar_plan_pro_pago`, {
          method: 'POST',
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_payment_id: String(dataId),
            p_proveedor_id: proveedorId,
            p_importe: importe,
            p_moneda: moneda,
            p_estado: payment.status
          })
        });

        const rpcData = await rpcRes.json();
        const rpcOk = rpcRes.ok && rpcData?.ok !== false;

        if (!rpcOk) {
          console.error(`[webhook-mp] error RPC: ${rpcRes.status}`, JSON.stringify(rpcData));
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: false, error_detail: JSON.stringify(rpcData) });
        } else if (rpcData?.duplicado) {
          // No es un error: es Mercado Pago avisando de nuevo. Se registra para
          // poder distinguirlo de un pago que nunca llego.
          console.log(`[webhook-mp] aviso repetido del pago ${dataId} — el plan NO se extendio de nuevo`);
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: true, error_detail: 'duplicado_ignorado' });
        } else {
          console.log(`[webhook-mp] proveedor ${proveedorId} activado a Pro hasta ${rpcData?.plan_hasta}`);
          await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: proveedorId, rpc_ok: true, error_detail: null });
        }
      } else {
        console.log(`[webhook-mp] pago con status="${payment.status}" — no se actualiza`);
        await logWebhook({ payment_id: dataId, payment_status: payment.status, proveedor_id: null, rpc_ok: null, error_detail: null });
      }
    } else {
      console.log(`[webhook-mp] notificación ignorada (type="${type}", dataId="${dataId}")`);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook-mp] error inesperado:', err.message, err.cause);
    await logWebhook({ payment_id: null, payment_status: null, proveedor_id: null, rpc_ok: false, error_detail: err.message });
    return res.status(200).send('OK');
  }
}
