const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  // Solo GET (invocado por Vercel cron) o POST con secreto admin para pruebas manuales
  const adminSecret = process.env.ADMIN_SECRET;
  const isVercelCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET || adminSecret}`;
  const isAdminPost = req.method === 'POST' && adminSecret && req.headers['x-admin-secret'] === adminSecret;

  if (!isVercelCron && !isAdminPost) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !SUPABASE_BASE) {
    console.error('[recordatorio-planes] configuración incompleta');
    return res.status(503).json({ error: 'Configuración incompleta' });
  }

  try {
    const ahora = new Date();
    const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Buscar proveedores Pro cuyo plan vence en los próximos 7 días
    const url = `${SUPABASE_BASE}/rest/v1/proveedores?plan=eq.pro&plan_hasta=gte.${ahora.toISOString().split('T')[0]}&plan_hasta=lte.${en7dias.toISOString().split('T')[0]}&estado=eq.aprobado&select=id,nombre,email,whatsapp,plan_hasta`;

    const supaRes = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      }
    });

    if (!supaRes.ok) {
      const err = await supaRes.text();
      console.error('[recordatorio-planes] error Supabase:', supaRes.status, err);
      return res.status(500).json({ error: 'Error consultando DB' });
    }

    const expirando = await supaRes.json();
    console.log(`[recordatorio-planes] proveedores por vencer: ${expirando.length}`);
    expirando.forEach(p => {
      const dias = Math.ceil((new Date(p.plan_hasta) - ahora) / 86400000);
      console.log(`[recordatorio-planes]  • ${p.nombre} (${p.email}) vence en ${dias} días (${p.plan_hasta}) | WA: ${p.whatsapp || 'no'}`);
    });

    // Los lunes, ademas, dispara el resumen semanal por WhatsApp.
    const informe = await dispararInformeSemanal(ahora);

    return res.status(200).json({
      ok: true,
      total: expirando.length,
      informe,
      proveedores: expirando.map(p => ({
        id: p.id,
        nombre: p.nombre,
        email: p.email,
        whatsapp: p.whatsapp,
        plan_hasta: p.plan_hasta,
        dias_restantes: Math.ceil((new Date(p.plan_hasta) - ahora) / 86400000)
      }))
    });
  } catch (err) {
    console.error('[recordatorio-planes] error inesperado:', err.message);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
}


/* =====================================================================
   EL DISPARO DEL RESUMEN SEMANAL, COLGADO DE ESTE CRON
   =====================================================================

   POR QUE ACA Y NO EN SU PROPIO CRON, que seria lo obvio:

   El plan Hobby de Vercel limita la cantidad de cron jobs por proyecto, y
   vercel.json ya tiene DOS (este y keepalive). La documentacion publica de
   Vercel no dice cual es el tope —exactamente el mismo caso que el limite de
   12 funciones anotado en CLAUDE.md, que tampoco figura en la doc y solo
   aparece como error de build—, asi que agregar un tercero es apostar a que
   el build de PRODUCCION no se rompa. No vale la pena: este cron ya corre
   todos los dias y el resumen necesita correr uno.

   Si algun dia el proyecto pasa a un plan con mas crons, esto se reemplaza
   por una entrada en vercel.json y se borra esta funcion:

     { "path": "/api/notificar-mensaje?action=wa_informe", "schedule": "0 13 * * 1" }

   El endpoint ya acepta el Bearer del cron, asi que no habria que tocar nada
   mas. Y si el envio falla, se traga el error a proposito: el recordatorio de
   planes es lo que este cron vino a hacer y no se puede caer por esto.
   ===================================================================== */
async function dispararInformeSemanal(ahora) {
  // Lunes en hora argentina (siempre UTC-3, no hay horario de verano). Se
  // calcula sobre la fecha corrida y no con getDay() local: la funcion corre
  // en un servidor en UTC, donde el cron de las 12:00 UTC del lunes todavia
  // es lunes, pero uno de las 02:00 UTC ya seria domingo en Argentina.
  const ar = new Date(ahora.getTime() - 3 * 3600 * 1000);
  if (ar.getUTCDay() !== 1) return { corrio: false, motivo: 'no_es_lunes' };

  const secreto = process.env.CRON_SECRET || process.env.ADMIN_SECRET;
  if (!secreto) return { corrio: false, motivo: 'sin_cron_secret' };

  const appUrl = (process.env.APP_URL || 'https://emprendego.com.ar').replace(/\/$/, '');

  try {
    const r = await fetch(`${appUrl}/api/notificar-mensaje?action=wa_informe`, {
      headers: { Authorization: `Bearer ${secreto}` }
    });
    const cuerpo = await r.json().catch(() => ({}));
    console.log('[recordatorio-planes] resumen semanal:', JSON.stringify(cuerpo));
    return { corrio: true, ...cuerpo };
  } catch (e) {
    console.error('[recordatorio-planes] no se pudo disparar el resumen:', e.message);
    return { corrio: false, motivo: e.message };
  }
}
