import { applyRateLimit, esUUID, escHtml } from './_ratelimit.js';
// La equivalencia de rubros vive en _rubros.js para que el fan-out por
// WhatsApp use exactamente la misma regla que matchesCat() de app.js, que es
// con la que se le promete al comprador cuantos proveedores lo van a ver.
import { rubroCoincide, rubroEsCiego } from './_rubros.js';

const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  /* El webhook de WhatsApp va ANTES del chequeo de metodo: Meta valida la URL
     con un GET (hub.challenge) y despues manda los eventos por POST. Si se
     dejara abajo, la verificacion inicial se comeria un 405 y nunca quedaria
     configurado. Entra por el rewrite /api/wa-webhook de vercel.json. */
  if (req.query?.action === 'wa_webhook') return handlerWaWebhook(req, res);

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // Rama de anuncios manuales del panel de admin (?action=anuncio).
  // Va ACA y no en un archivo propio porque api/ ya tiene las 12 funciones
  // que permite el plan Hobby de Vercel: un archivo mas rompe el deploy.
  // No comparte nada con el flujo de abajo salvo el cliente de Resend.
  if (req.query?.action === 'anuncio') return handlerAnuncio(req, res);

  // Rama de "le cotizaron su pedido" (?action=cotizacion). Va aca por el mismo
  // motivo que la de arriba: no entra un archivo mas en api/.
  if (req.query?.action === 'cotizacion') return handlerCotizacion(req, res);

  // Rama de "hay un pedido nuevo de su rubro" (?action=wa_pedido), por
  // WhatsApp y hacia el PROVEEDOR. Es la unica de las tres que sale por
  // WhatsApp y no por mail; comparte archivo por el cupo de funciones.
  if (req.query?.action === 'wa_pedido') return handlerWaPedido(req, res);

  // Endpoint público que dispara emails: limitar para evitar spam masivo.
  if (!applyRateLimit(req, res, { bucket: 'notificar', limit: 10, windowMs: 60000 })) return;

  const { proveedor_id, de_nombre, texto } = req.body || {};
  if (!esUUID(proveedor_id) || !de_nombre || !texto) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey || !SUPABASE_BASE) {
    return res.status(500).json({ error: 'server config error' });
  }

  try {
    // Obtener datos del proveedor y verificar cooldown
    const provRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/proveedores?id=eq.${encodeURIComponent(proveedor_id)}&select=email,nombre,notif_email,last_notified_at`,
      { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } }
    );
    const provData = await provRes.json();
    const proveedor = provData?.[0];

    if (!proveedor) return res.status(404).json({ error: 'provider not found' });
    if (!proveedor.notif_email) return res.status(200).json({ ok: true, skipped: 'notif_disabled' });
    if (!proveedor.email) return res.status(200).json({ ok: true, skipped: 'no_email' });

    // Cooldown de 15 minutos por proveedor
    if (proveedor.last_notified_at) {
      const minutesSince = (Date.now() - new Date(proveedor.last_notified_at).getTime()) / 60000;
      if (minutesSince < 15) return res.status(200).json({ ok: true, skipped: 'cooldown' });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[notificar-mensaje] RESEND_API_KEY no configurado');
      return res.status(200).json({ ok: false, error: 'no_resend_key' });
    }

    const appUrl = (process.env.APP_URL || 'https://emprendego.vercel.app').replace(/\/$/, '');
    const unsubUrl = `${appUrl}/api/unsub?id=${proveedor_id}`;
    // Escapar lo que viene del usuario antes de meterlo en el HTML del email
    // (evita inyección de etiquetas/links de phishing en la casilla del proveedor).
    const textoPreviewRaw = texto.length > 300 ? texto.slice(0, 300) + '...' : texto;
    const textoPreview = escHtml(textoPreviewRaw);
    const deNombreSafe = escHtml(de_nombre);

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EmprendeGO <notificaciones@emprendego.com.ar>',
        to: [proveedor.email],
        subject: `Nuevo mensaje de ${de_nombre} en EmprendeGO`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
            <div style="background:white;border-radius:10px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
              <h2 style="color:#6366f1;margin:0 0 8px;">Tenés un nuevo mensaje 💬</h2>
              <p style="color:#374151;margin:0 0 20px;"><strong>${deNombreSafe}</strong> te escribió en EmprendeGO:</p>
              <div style="background:#f3f4f6;border-left:4px solid #6366f1;padding:14px 18px;border-radius:6px;margin-bottom:24px;">
                <p style="margin:0;color:#374151;font-style:italic;">"${textoPreview}"</p>
              </div>
              <a href="${appUrl}" style="display:inline-block;background:#6366f1;color:white;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                Responder en la app →
              </a>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#9ca3af;text-align:center;">
              Recibís este mail porque tenés una cuenta activa en EmprendeGO.<br>
              <a href="${unsubUrl}" style="color:#9ca3af;">Desuscribirme de estas notificaciones</a>
            </p>
          </div>
        `
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      console.error('[notificar-mensaje] Resend error:', JSON.stringify(err));
      return res.status(200).json({ ok: false, error: 'email_send_failed' });
    }

    // Actualizar last_notified_at para el cooldown
    await fetch(`${SUPABASE_BASE}/rest/v1/proveedores?id=eq.${encodeURIComponent(proveedor_id)}`, {
      method: 'PATCH',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ last_notified_at: new Date().toISOString() })
    });

    console.log(`[notificar-mensaje] ✅ email enviado a proveedor ${proveedor_id}`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[notificar-mensaje] error inesperado:', err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}


/* =====================================================================
   "LE COTIZARON SU PEDIDO"  (?action=cotizacion)
   =====================================================================

   POST /api/notificar-mensaje?action=cotizacion
     body: { solicitud_id: "<uuid>" }

   Lo dispara el frontend despues de que un proveedor manda una cotizacion.
   El comprador publica su pedido, se va, y sin esto no se entera nunca:
   no importa cuantas cotizaciones lleguen si nadie vuelve a mirarlas.

   El contenido NO viaja en el request: lo arma el backend con lo que hay
   en la base. Asi el endpoint no sirve para mandar texto arbitrario.

   Tres frenos, porque el solicitud_id lo elige quien llama:

     1. Solo se manda si REALMENTE entro una cotizacion en los ultimos 3
        minutos. Sin esto, alguien podria pedir mails en loop para pedidos
        ajenos con solo tener el id.
     2. Enfriamiento de 15 minutos por comprador, igual que el de
        proveedores: si le cotizan cinco veces seguidas, recibe un mail.
     3. Limite de tasa por IP, como el resto del endpoint.

   La baja se respeta por email contra email_optouts, que es la misma tabla
   que usa el "Cancelar suscripcion" de los anuncios.
   ===================================================================== */

async function handlerCotizacion(req, res) {
  if (!applyRateLimit(req, res, { bucket: 'cotiz-notif', limit: 20, windowMs: 60000 })) return;

  const { solicitud_id } = req.body || {};
  if (!esUUID(solicitud_id)) return res.status(400).json({ error: 'missing fields' });

  // El service-role es obligatorio: solicitudes.usuario_email esta revocado de
  // la API a proposito (es PII) y email_optouts no tiene policy de lectura.
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !SUPABASE_BASE) {
    console.error('[notificar-cotiz] falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_URL');
    return res.status(500).json({ error: 'server config error' });
  }
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  // Todo lo que no corresponde mandar sale con 200: no es un error del que
  // llama, y devolver 4xx solo llenaria la consola del navegador.
  const saltear = motivo => res.status(200).json({ ok: true, skipped: motivo });

  try {
    const solRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/solicitudes?id=eq.${encodeURIComponent(solicitud_id)}` +
      `&select=usuario_id,usuario_email,titulo,respuestas`, { headers });
    const sol = (await solRes.json())?.[0];
    if (!sol) return res.status(404).json({ error: 'not found' });
    if (!sol.usuario_email) return saltear('sin_email');

    // Freno 1: que haya una cotizacion de verdad, y recien.
    const desde = new Date(Date.now() - 3 * 60000).toISOString();
    const cotRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/cotizaciones?solicitud_id=eq.${encodeURIComponent(solicitud_id)}` +
      `&created_at=gte.${encodeURIComponent(desde)}&select=id&limit=1`, { headers });
    if (!(await cotRes.json())?.[0]) return saltear('sin_cotizacion_reciente');

    // Baja: guardada por email para que sobreviva a borrar y recrear la cuenta.
    const outRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/email_optouts?email=eq.${encodeURIComponent(sol.usuario_email)}` +
      `&select=email&limit=1`, { headers });
    if ((await outRes.json())?.[0]) return saltear('dado_de_baja');

    // Freno 2: enfriamiento por comprador.
    if (sol.usuario_id) {
      const uRes = await fetch(
        `${SUPABASE_BASE}/rest/v1/usuarios?id=eq.${encodeURIComponent(sol.usuario_id)}` +
        `&select=last_notified_at`, { headers });
      const usuario = (await uRes.json())?.[0];
      if (usuario?.last_notified_at) {
        const minutos = (Date.now() - new Date(usuario.last_notified_at).getTime()) / 60000;
        if (minutos < 15) return saltear('cooldown');
      }
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[notificar-cotiz] RESEND_API_KEY no configurado');
      return res.status(200).json({ ok: false, error: 'no_resend_key' });
    }

    const appUrl = (process.env.APP_URL || 'https://emprendego.com.ar').replace(/\/$/, '');
    const unsubUrl = sol.usuario_id
      ? `${appUrl}/api/unsub?u=${encodeURIComponent(sol.usuario_id)}&c=cotizaciones`
      : appUrl;
    // El titulo lo escribio el comprador: se escapa antes de meterlo en el HTML.
    const tituloSafe = escHtml(String(sol.titulo || 'su pedido').slice(0, 120));
    const n = Number(sol.respuestas) || 1;
    const cuantas = n === 1 ? 'una cotización' : `${n} cotizaciones`;
    const VERDE = '#006039';

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'EmprendeGO <notificaciones@emprendego.com.ar>',
        to: [sol.usuario_email],
        subject: `Le cotizaron “${String(sol.titulo || 'su pedido').slice(0, 60)}”`,
        // Gmail muestra el boton nativo de baja con estas dos cabeceras, y
        // api/unsub ya acepta el POST de un solo clic que exige la segunda.
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        },
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f4f5f3;">
            <div style="background:#fff;border-radius:14px;padding:30px 28px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:700;color:${VERDE};margin-bottom:20px;">EmprendeGO</div>
              <h2 style="margin:0 0 10px;font-size:19px;color:#2c3330;">Ya tiene ${cuantas}</h2>
              <p style="margin:0 0 8px;font-size:14.5px;line-height:1.6;color:#5c6661;">
                Su pedido <strong style="color:#2c3330;">${tituloSafe}</strong> recibió respuesta de proveedores mayoristas.
              </p>
              <p style="margin:0 0 24px;font-size:14.5px;line-height:1.6;color:#5c6661;">
                Entre a comparar precio, mínimo de compra y tiempo de entrega, y contacte al que le sirva.
              </p>
              <a href="${appUrl}" style="display:inline-block;background:${VERDE};color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14.5px;">
                Ver las cotizaciones
              </a>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#9aa5a0;text-align:center;line-height:1.5;">
              Recibe este correo porque publicó un pedido de cotización en EmprendeGO.<br>
              <a href="${unsubUrl}" style="color:#9aa5a0;">Dejar de recibir estos avisos</a>
            </p>
          </div>`
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}));
      console.error('[notificar-cotiz] Resend error:', JSON.stringify(err));
      return res.status(200).json({ ok: false, error: 'email_send_failed' });
    }

    if (sol.usuario_id) {
      await fetch(`${SUPABASE_BASE}/rest/v1/usuarios?id=eq.${encodeURIComponent(sol.usuario_id)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ last_notified_at: new Date().toISOString() })
      });
    }

    console.log(`[notificar-cotiz] email enviado por la solicitud ${solicitud_id}`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[notificar-cotiz] error inesperado:', err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}


/* =====================================================================
   ANUNCIOS MANUALES DESDE EL PANEL DE ADMIN  (?action=anuncio)
   =====================================================================

   POST /api/notificar-mensaje?action=anuncio
     headers: Authorization: Bearer <access_token de la sesion del admin>
     body:    { usuario_id: "<uuid>" }

   Manda UN mail a UN usuario. El contenido NO viaja en el request: lo
   arma el backend a partir de la campana. Asi este endpoint no sirve
   para mandar texto arbitrario aunque alguien consiga un token de admin.

   Diferencia clave con el flujo de arriba: aquel es publico a proposito
   (lo dispara el chat). Este exige sesion de admin, porque si no seria
   un relay abierto para spamear la base entera y quemar la cuota de
   Resend.
   ===================================================================== */

// Identificador de la campana. Si el dia de mañana se manda otro anuncio
// distinto, se cambia esta constante (y la de admin.html) y el historial
// del anuncio viejo queda intacto: los botones vuelven a habilitarse
// solo para la campana nueva.
const CAMPANA = 'anuncio_cotizaciones';

// Tope diario auto-impuesto. El plan free de Resend corta en 100/dia; se
// deja margen a proposito. Se valida ACA ademas de en la UI: el contador
// del panel es una comodidad, esto es el limite real.
const LIMITE_DIARIO = 60;

const APP_URL = (process.env.APP_URL || 'https://emprendego.com.ar').replace(/\/$/, '');

// Argentina no aplica horario de verano, asi que siempre es UTC-3.
// Devuelve el instante ISO en que empezo el dia de HOY en hora argentina,
// para que "enviados hoy" corte a la medianoche de aca y no a la de UTC
// (que en Argentina caen a las 21:00 del dia anterior).
function inicioDelDiaAR() {
  const ar = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate(), 3, 0, 0)).toISOString();
}

function emailValido(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

// Verifica que quien llama sea admin de verdad. Dos chequeos independientes:
//   1) el token es valido y su JWT trae app_metadata.role === 'admin'
//   2) ese email ademas figura en la tabla public.admins
// Se piden los dos porque cada uno cubre el agujero del otro: un claim
// viejo que quedo pegado en un token, o una fila de admins sin el rol.
// Devuelve el email del admin, o null.
async function verificarAdmin(req, serviceKey) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  if (!token) return null;

  try {
    const userRes = await fetch(`${SUPABASE_BASE}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) return null;

    const user = await userRes.json();
    const email = String(user?.email || '').toLowerCase().trim();
    if (!email || user?.app_metadata?.role !== 'admin') return null;

    const adminRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/admins?email=eq.${encodeURIComponent(email)}&select=email&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!adminRes.ok) return null;
    const filas = await adminRes.json();
    return filas?.length ? email : null;
  } catch (e) {
    console.error('[anuncio] verificarAdmin fallo:', e.message);
    return null;
  }
}

// RESERVA el envio ANTES de mandarlo, escribiendo ya la fila como 'enviado'.
//
// Por que asi y no al reves: si el log se escribiera despues del envio, dos
// pedidos simultaneos (dos pestañas del panel, un doble clic que gane la
// carrera al disabled) pasarian los dos el chequeo de duplicado y el usuario
// recibiria el mail dos veces. Escribiendo primero, el indice unico parcial
// de email_logs arbitra: el segundo choca contra el 409 y no llega a enviar.
//
// El precio es que un envio que despues falle queda marcado de mas por un
// instante; por eso, si Resend rechaza, la fila se corrige a 'error' (ver
// marcarLogError) y el indice —que solo cubre estado='enviado'— vuelve a
// liberar el reintento.
//
// Devuelve { ok, id } | { duplicado: true } | { ok: false }
async function reservarEnvio(serviceKey, fila) {
  try {
    const r = await fetch(`${SUPABASE_BASE}/rest/v1/email_logs`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(fila)
    });
    if (r.status === 409) return { duplicado: true };
    if (!r.ok) {
      console.error('[anuncio] no se pudo reservar el envio:', r.status, await r.text());
      return { ok: false };
    }
    return { ok: true, id: (await r.json())?.[0]?.id || null };
  } catch (e) {
    console.error('[anuncio] no se pudo reservar el envio:', e.message);
    return { ok: false };
  }
}

// Degrada la reserva a 'error' cuando el envio no salio. Nunca lanza: si esto
// falla, lo peor que pasa es que el boton quede en "Enviado" sin estarlo, y
// eso se ve en la tabla email_logs.
async function marcarLogError(serviceKey, id, motivo) {
  if (!id) return;
  try {
    await fetch(`${SUPABASE_BASE}/rest/v1/email_logs?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ estado: 'error', error_msg: String(motivo).slice(0, 500) })
    });
  } catch (e) {
    console.error('[anuncio] no se pudo marcar el log como error:', e.message);
  }
}

async function handlerAnuncio(req, res) {
  // Aun con sesion de admin, un tope de ráfaga: protege de un bucle
  // accidental en el panel (o de un token filtrado) contra la base entera.
  if (!applyRateLimit(req, res, { bucket: 'anuncio', limit: 30, windowMs: 60000 })) return;

  // Se exige el service-role: email_logs no tiene policy de INSERT, asi que
  // con la anon key el envio saldria pero el registro no, y se perderia el
  // anti-duplicado. Mejor fallar de entrada que mandar sin trazabilidad.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !SUPABASE_BASE) {
    console.error('[anuncio] falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_URL');
    return res.status(500).json({ error: 'config', detalle: 'Falta configuración del servidor.' });
  }

  const adminEmail = await verificarAdmin(req, serviceKey);
  if (!adminEmail) return res.status(401).json({ error: 'no_autorizado', detalle: 'Sesión de admin inválida o vencida.' });

  const { usuario_id } = req.body || {};
  if (!esUUID(usuario_id)) return res.status(400).json({ error: 'usuario_invalido', detalle: 'ID de usuario inválido.' });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[anuncio] RESEND_API_KEY no configurado');
    return res.status(500).json({ error: 'config', detalle: 'Falta la clave de Resend.' });
  }

  const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Declarada afuera del try para que el catch pueda liberar la reserva si
  // algo estalla despues de haberla tomado.
  let reserva = null;

  try {
    const userRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/usuarios?id=eq.${encodeURIComponent(usuario_id)}&select=id,nombre,email&limit=1`,
      { headers: authHeaders }
    );
    const usuario = (await userRes.json())?.[0];
    if (!usuario) return res.status(404).json({ error: 'no_existe', detalle: 'El usuario ya no existe.' });

    const destino = String(usuario.email || '').trim().toLowerCase();
    if (!emailValido(destino)) {
      return res.status(400).json({ error: 'email_invalido', detalle: 'La dirección de correo no es válida.' });
    }

    // --- Chequeos previos, del mas barato al mas caro ---

    // 1) ¿Pidió no recibir mas? (por email, no por id: la baja sobrevive a
    //    que se borre y se vuelva a crear la cuenta)
    const outRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/email_optouts?email=eq.${encodeURIComponent(destino)}&select=email&limit=1`,
      { headers: authHeaders }
    );
    if (outRes.ok && (await outRes.json())?.length) {
      return res.status(409).json({ error: 'baja', detalle: 'Este usuario se dio de baja de estos avisos.' });
    }

    // 2) ¿Ya se le mandó esta campaña? El indice unico parcial de la base es
    //    la garantia final; esto evita gastar un envio para despues chocar.
    const yaRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/email_logs?usuario_id=eq.${encodeURIComponent(usuario_id)}` +
      `&campana=eq.${encodeURIComponent(CAMPANA)}&estado=eq.enviado&select=enviado_at&limit=1`,
      { headers: authHeaders }
    );
    if (yaRes.ok) {
      const previo = (await yaRes.json())?.[0];
      if (previo) return res.status(409).json({ error: 'duplicado', detalle: 'Ya se le envió este anuncio.', enviado_at: previo.enviado_at });
    }

    // 3) Tope diario.
    const cuentaRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/email_logs?campana=eq.${encodeURIComponent(CAMPANA)}` +
      `&estado=eq.enviado&enviado_at=gte.${encodeURIComponent(inicioDelDiaAR())}&select=id`,
      { headers: { ...authHeaders, Prefer: 'count=exact', Range: '0-0' } }
    );
    const enviadosHoy = parseInt(String(cuentaRes.headers.get('content-range') || '').split('/')[1], 10) || 0;
    if (enviadosHoy >= LIMITE_DIARIO) {
      return res.status(429).json({ error: 'limite_diario', detalle: `Ya se enviaron ${enviadosHoy} de ${LIMITE_DIARIO} hoy.`, enviados_hoy: enviadosHoy });
    }

    // 4) Reserva del cupo. A partir de aca el envio esta "tomado": cualquier
    //    pedido simultaneo para el mismo usuario choca contra el indice unico
    //    y se va por la rama de duplicado sin mandar un segundo mail.
    reserva = await reservarEnvio(serviceKey, {
      usuario_id, email: destino, campana: CAMPANA, estado: 'enviado', admin_email: adminEmail
    });
    if (reserva.duplicado) {
      return res.status(409).json({ error: 'duplicado', detalle: 'Ya se le envió este anuncio.' });
    }
    if (!reserva.ok) {
      // Sin trazabilidad no se manda: es preferible no enviar a enviar sin
      // poder registrarlo (seria imposible saber despues a quien le llego).
      return res.status(500).json({ error: 'sin_registro', detalle: 'No se pudo registrar el envío. No se mandó nada.' });
    }

    // --- Envío ---
    const unsubUrl = `${APP_URL}/api/unsub?u=${encodeURIComponent(usuario_id)}&c=${encodeURIComponent(CAMPANA)}`;
    const mail = plantillaAnuncioCotizaciones(usuario.nombre, unsubUrl);

    const payload = {
      from: 'EmprendeGO <notificaciones@emprendego.com.ar>',
      to: [destino],
      subject: mail.asunto,
      html: mail.html,
      text: mail.texto,
      // List-Unsubscribe deja el enlace de baja en la cabecera: Gmail y
      // Outlook lo muestran como boton nativo. Pesa para no caer en spam,
      // y da una salida al que no quiere leer todo el mail.
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    };
    // Casilla opcional para las respuestas. Sin esto, contestan a
    // notificaciones@ (que igual llega, pero puede no leerse a diario).
    if (emailValido(process.env.ANUNCIO_REPLY_TO)) payload.reply_to = process.env.ANUNCIO_REPLY_TO.trim();

    const envioRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const envioBody = await envioRes.json().catch(() => ({}));

    if (!envioRes.ok) {
      const motivo = envioBody?.message || envioBody?.error?.message || `HTTP ${envioRes.status}`;
      console.error('[anuncio] Resend rechazó el envío:', JSON.stringify(envioBody));
      // Se libera la reserva: el indice unico solo cubre estado='enviado',
      // asi que al pasar a 'error' el boton vuelve a habilitarse.
      await marcarLogError(serviceKey, reserva.id, motivo);
      return res.status(502).json({ error: 'envio_fallido', detalle: motivo });
    }

    // Se completa la fila reservada con el id que devolvio Resend (sirve para
    // rastrear rebotes despues, en el panel de Resend).
    if (reserva.id && envioBody?.id) {
      await fetch(`${SUPABASE_BASE}/rest/v1/email_logs?id=eq.${encodeURIComponent(reserva.id)}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ resend_id: envioBody.id })
      }).catch(e => console.error('[anuncio] no se pudo guardar el resend_id:', e.message));
    }

    console.log(`[anuncio] enviado a ${usuario_id} por ${adminEmail} (${enviadosHoy + 1}/${LIMITE_DIARIO})`);
    return res.status(200).json({ ok: true, enviados_hoy: enviadosHoy + 1, limite: LIMITE_DIARIO, enviado_at: new Date().toISOString() });

  } catch (err) {
    console.error('[anuncio] error inesperado:', err.message);
    // Si ya se habia reservado el cupo pero algo estallo despues, se libera:
    // de lo contrario el usuario quedaria marcado como "Enviado" para siempre
    // sin haber recibido nada.
    if (reserva?.id) await marcarLogError(serviceKey, reserva.id, err.message || 'error inesperado');
    return res.status(500).json({ error: 'inesperado', detalle: 'Error inesperado al enviar.' });
  }
}


/* ---------------------------------------------------------------------
   PLANTILLA — anuncio de la seccion Pedidos de Cotizacion.

   Trato de USTED y sin emojis, como el resto del copy de cara al usuario.
   Verde de marca (#006039) en el boton.

   Va en HTML y en texto plano: mandar solo HTML es una de las señales que
   mas pesa para terminar en la carpeta de spam.

   Estilos en linea y fuente de sistema a proposito: los clientes de correo
   descartan las hojas de estilo y no cargan webfonts.
   --------------------------------------------------------------------- */
function plantillaAnuncioCotizaciones(nombreCrudo, unsubUrl) {
  // Solo el primer nombre, y si no hay nada usable se saluda sin nombre.
  const primero = String(nombreCrudo || '').trim().split(/\s+/)[0] || '';
  const saludo = primero && primero.length <= 20 ? `Hola ${primero},` : 'Hola,';
  const saludoHtml = escHtml(saludo);
  const cta = `${APP_URL}/?ir=cotizaciones`;

  const asunto = 'Ahora puede pedirle presupuesto a varios proveedores de una sola vez';

  const texto = [
    saludo,
    '',
    'Le escribo desde EmprendeGO porque abrimos una seccion nueva que le puede ahorrar bastante tiempo: Pedidos de Cotizacion.',
    '',
    'La idea es simple. En vez de escribirle uno por uno a diez proveedores para preguntar precio, publica una sola vez lo que esta buscando y los proveedores que lo tienen le pasan su cotizacion.',
    '',
    'Como se usa:',
    '1. Entra a la seccion Pedidos de Cotizacion.',
    '2. Escribe que necesita comprar (por ejemplo: "500 pares de medias deportivas blancas") y la cantidad aproximada.',
    '3. Elige el rubro y la provincia.',
    '4. Publica. Las respuestas le van llegando ahi mismo y usted compara.',
    '',
    'Dos cosas que nos parecen importantes:',
    '- Es gratis, y no hace falta que tenga la compra decidida. Puede publicar un pedido solo para tantear precios.',
    '- Su telefono y su email no quedan a la vista. Los proveedores ven el pedido, no sus datos de contacto. Usted decide con quien sigue la conversacion.',
    '',
    `Publicar mi primer pedido: ${cta}`,
    '',
    'Si lo prueba y algo no le cierra, responda este mail y lo vemos.',
    '',
    'Equipo EmprendeGO',
    '',
    '---',
    'Recibe este mail porque tiene una cuenta en EmprendeGO.',
    `Si no quiere recibir mas avisos como este, puede darse de baja aca: ${unsubUrl}`
  ].join('\n');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(asunto)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f3;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Publique una vez lo que necesita y reciba cotizaciones de varios proveedores.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f3;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#006039;padding:22px 32px;">
          <span style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;letter-spacing:-.01em;">EmprendeGO</span>
        </td></tr>
        <tr><td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2c3330;">

          <p style="margin:0 0 18px;">${saludoHtml}</p>

          <p style="margin:0 0 18px;">Le escribo desde EmprendeGO porque abrimos una sección nueva que le puede ahorrar bastante tiempo: <strong style="color:#006039;">Pedidos de Cotización</strong>.</p>

          <p style="margin:0 0 22px;">La idea es simple. En vez de escribirle uno por uno a diez proveedores para preguntar precio, publica <strong>una sola vez</strong> lo que está buscando y los proveedores que lo tienen le pasan su cotización.</p>

          <p style="margin:0 0 10px;font-weight:700;color:#006039;">Cómo se usa</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="padding:0 10px 8px 0;color:#8a9490;font-weight:700;vertical-align:top;">1.</td><td style="padding:0 0 8px;">Entra a la sección Pedidos de Cotización.</td></tr>
            <tr><td style="padding:0 10px 8px 0;color:#8a9490;font-weight:700;vertical-align:top;">2.</td><td style="padding:0 0 8px;">Escribe qué necesita comprar (por ejemplo: &ldquo;500 pares de medias deportivas blancas&rdquo;) y la cantidad aproximada.</td></tr>
            <tr><td style="padding:0 10px 8px 0;color:#8a9490;font-weight:700;vertical-align:top;">3.</td><td style="padding:0 0 8px;">Elige el rubro y la provincia.</td></tr>
            <tr><td style="padding:0 10px 0 0;color:#8a9490;font-weight:700;vertical-align:top;">4.</td><td style="padding:0;">Publica. Las respuestas le van llegando ahí mismo y usted compara.</td></tr>
          </table>

          <p style="margin:0 0 10px;font-weight:700;color:#006039;">Dos cosas que nos parecen importantes</p>
          <p style="margin:0 0 10px;">Es gratis, y no hace falta que tenga la compra decidida. Puede publicar un pedido solo para tantear precios.</p>
          <p style="margin:0 0 26px;">Su teléfono y su email <strong>no quedan a la vista</strong>. Los proveedores ven el pedido, no sus datos de contacto. Usted decide con quién sigue la conversación.</p>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 26px;"><tr><td align="center" style="background:#006039;border-radius:10px;">
            <a href="${cta}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;">Publicar mi primer pedido</a>
          </td></tr></table>

          <p style="margin:0;color:#5c6661;">Si lo prueba y algo no le cierra, responda este mail y lo vemos.</p>
          <p style="margin:18px 0 0;font-weight:700;">Equipo EmprendeGO</p>

        </td></tr>
        <tr><td style="padding:18px 32px 26px;border-top:1px solid #eceeeb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#8a9490;">
          Recibe este mail porque tiene una cuenta en EmprendeGO.<br>
          <a href="${unsubUrl}" style="color:#8a9490;text-decoration:underline;">Si no quiere recibir más avisos como este, puede darse de baja acá.</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { asunto, html, texto };
}


/* =====================================================================
   AVISO POR WHATSAPP AL PROVEEDOR  (?action=wa_pedido)
   =====================================================================

   POST /api/notificar-mensaje?action=wa_pedido
     body: { solicitud_id: "<uuid>" }

   Lo dispara el navegador del COMPRADOR apenas publica un pedido, sin
   esperar la respuesta (igual que ?action=cotizacion). Manda un WhatsApp de
   plantilla a los proveedores aprobados de ese rubro con el link directo al
   pedido.

   POR QUE EXISTE: entre el 6 y el 21 de agosto entraron 9 pedidos y hubo 2
   cotizaciones en toda la historia de la seccion. El pedido se publica y el
   proveedor no se entera nunca, porque tendria que entrar a mirar por su
   cuenta. Esto es lo unico que falta para que el circuito cierre.

   ---------------------------------------------------------------------
   ARRANCA APAGADO, A PROPOSITO
   ---------------------------------------------------------------------
   Sin WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en las variables de entorno, esto
   no manda NADA y devuelve {skipped:'wa_apagado'}. Asi el codigo se puede
   desplegar antes de que Meta apruebe la plantilla, sin ningun riesgo. El
   interruptor de encendido son las variables, no un deploy.

   WHATSAPP_TEST_TO es la segunda red: mientras tenga un numero, TODOS los
   mensajes van a ese numero en vez de al proveedor real. Es lo que hace que
   la prueba manual no pueda terminar en 150 WhatsApp mandados por error.

   ---------------------------------------------------------------------
   POR QUE ES SEGURO QUE LO LLAME EL NAVEGADOR
   ---------------------------------------------------------------------
   El que llama solo manda un uuid. No elige destinatarios, ni texto, ni
   cuantos. Y hay cinco frenos, del mas barato al mas caro:
     1. rate limit por IP;
     2. el pedido tiene que existir, estar abierto y haberse creado hace
        menos de WA_VENTANA_MIN minutos (un uuid viejo no reenvia nada);
     3. tope diario global de mensajes;
     4. enfriamiento de 24 h por proveedor;
     5. el indice unico de avisos_wa, que es la garantia final: la fila se
        RESERVA antes de mandar, asi que dos llamadas simultaneas no pueden
        mandar dos mensajes al mismo proveedor por el mismo pedido.

   ---------------------------------------------------------------------
   FASES FUTURAS (documentadas, NO implementadas)
   ---------------------------------------------------------------------
   - Estructurar el pedido con IA: iria en el armado de params de enviarUno(),
     convirtiendo el texto libre del comprador en datos comparables antes de
     armar el mensaje.
   - Ranking por desempeño del proveedor: iria en el .sort() de
     elegirDestinatarios(), reemplazando el orden por provincia + antiguedad.
     Hoy no hay con que medir desempeño (2 cotizaciones en toda la historia).
   - Muro medido (Pro se entera antes que Free): la constante
     WA_RETARDO_FREE_MIN ya esta puesta en cero justo para eso. Cuando valga
     mas que cero, los Free salen en una segunda tanda demorada. Esta ahora
     para no tener que reescribir el reparto despues.
   - Botones y respuestas dentro de WhatsApp: necesitan un webhook de entrada,
     que no existe y no entra en el alcance de este MVP.
   ===================================================================== */

/* A cuantos proveedores como maximo se avisa por pedido.

   En 8 a proposito, y NO porque sea el numero correcto: es el arranque
   prudente. El numero de EmprendeGO ya fue restringido una vez por presentar
   proveedores en masa, asi que se empieza chico, se mira la calificacion de
   calidad en el panel de Meta unos dias, y recien ahi se sube.

   El techo natural es 25: el rubro mas poblado (Indumentaria) tiene 35
   aprobados y con 25 el orden por provincia todavia decide quien entra. */
const WA_LIMITE_DESTINATARIOS = 8;

/* Tope de avisos por proveedor en 24 h, en ventana movil.

   Estuvo en 1 y ESTABA MAL. El razonamiento original era: con 5 pedidos
   diarios, un proveedor de Indumentaria recibiria 3 mensajes por dia y nos
   bloquearia. El error fue calcular sobre un volumen inventado.

   Volumen real, medido el 2026-08-25 sobre los 19 pedidos reales: 1,58
   pedidos por dia, de los cuales el 42% cae en rubro ciego, o sea ~1,2
   pedidos con aviso por dia repartidos entre 17 rubros. Un proveedor recibe
   menos de un mensaje diario. El tope de 1 no protegia de nada y a cambio
   tiraba el segundo pedido del dia de cada rubro, que es perder ventas.

   En 4 funciona como cortacircuitos y no como filtro: con el volumen de hoy
   casi nunca se toca. Si el volumen se multiplica, frena la ráfaga.

   OJO: se cuenta contra avisos_wa, no contra proveedores.last_wa_at. Esa
   columna guarda solo el ULTIMO envio y no sirve para un tope de varios; se
   sigue escribiendo porque ordena el reparto (ver elegirDestinatarios). */
const WA_MAX_POR_DIA = 4;
const WA_VENTANA_TOPE_H = 24;

// Techo global por dia. Es un cortacircuitos, no una regla de negocio: si
// algo se va de control, el gasto y el daño al numero quedan acotados.
const WA_TOPE_DIARIO = 300;

// Fase futura: muro medido. En cero no hace nada (ver el bloque de arriba).
const WA_RETARDO_FREE_MIN = 0;

// Cuantos minutos despues de publicado se acepta avisar. El navegador llama
// a los 2 segundos; el margen es para una conexion lenta o un reintento.
const WA_VENTANA_MIN = 15;

const WA_API_VERSION = 'v21.0';

/* Nombre de la plantilla aprobada en Meta y su idioma. Si el dia de mañana
   se aprueba otra version del texto, se cambia la variable de entorno y no
   hace falta tocar codigo.

   EL TEXTO APROBADO POR EL FOUNDER (2026-08-24). Vive aca porque el cuerpo
   de la plantilla lo guarda Meta, no este repo, y sin esta copia no hay
   forma de saber que fue lo que se aprobo ni de rearmarla si se pierde:

     ¡Hola, {{1}}! Hay un pedido nuevo de {{2}} en EmprendeGO.

     {{3}}
     Cantidad: {{4}}

     Puede enviar su cotización desde este link:
     https://emprendego.com.ar/?ir=cotizaciones&pedido={{5}}

     Si no quiere recibir más avisos, puede desactivarlos en la misma pantalla.

   El link va con https:// escrito. WhatsApp casi siempre convierte en
   enlace un dominio pelado, pero "casi siempre" no alcanza cuando todo el
   MVP se juega en que el proveedor pueda TOCAR ese link. Con el protocolo
   adelante es clickeable si o si.

   Tres cosas mas del texto que NO son estilo y por eso no se tocan:

   1. UN SOLO signo de exclamacion, y en el saludo. La categoria del mensaje
      la decide Meta leyendo el texto: si suena promocional lo reclasifica de
      "utility" a "marketing", y en Argentina eso es pasar de USD 0,012 a
      USD 0,0618 por mensaje (cinco veces mas caro) por cada envio.
   2. NO termina en variable. Meta rechaza las plantillas cuyo cuerpo cierra
      con un {{n}}; por eso la ultima linea es fija.
   3. El dominio va escrito fijo y solo el id viaja como {{5}}. Una URL
      entera variable hace que revisen la plantilla con lupa. */
const WA_TEMPLATE = (process.env.WHATSAPP_TEMPLATE || 'pedido_nuevo_rubro').trim();
const WA_LANG = (process.env.WHATSAPP_LANG || 'es_AR').trim();


/* Los parametros de una plantilla de WhatsApp NO pueden tener saltos de
   linea, tabs, ni 4 espacios seguidos: Meta rechaza el envio entero con un
   131008. El titulo y la cantidad los escribe el comprador a mano, asi que
   pasan si o si por aca. */
// Se exportan limpiarParam, normalizarWa y elegirDestinatarios (y solo esas)
// para que test/aviso-wa.test.js las pruebe de verdad, sin red ni base. Son
// las tres que deciden A QUIEN se le manda y QUE dice: si alguna se rompe,
// el error sale por WhatsApp y no hay vuelta atras. Vercel ignora los
// exports con nombre; la funcion serverless es el export default.
export function limpiarParam(v, max = 120) {
  return String(v ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max) || '-';
}

/* Normaliza el telefono al formato que quiere Meta: solo digitos, con codigo
   de pais y SIN el signo mas.

   Los 150 proveedores aprobados ya lo tienen bien guardado (5491139295591),
   asi que esto no arregla datos: descarta los que no se puedan mandar. Un
   numero mal formado no se adivina —mandar a un numero equivocado es peor
   que no mandar— asi que si no cumple, se saltea y queda en el log. */
/* QUE VA EN LAS DOS LINEAS DEL MEDIO DEL MENSAJE.

   Hay dos clases de pedido y el mismo mensaje tiene que servir para las dos
   SIN cambiar la plantilla (cambiarla obliga a que Meta la vuelva a revisar).

   - Pedido de producto (tipo A): la linea es el titulo y la cantidad es la
     cantidad. Es el caso directo.

   - Pedido de proveedor (tipo B): NO tiene cantidad —verificado contra la
     base: los 5 que hay tienen cantidad vacia y lista de productos cargada—
     y ademas su titulo es generico, lo arma el formulario como "Busco
     proveedor de Indumentaria". Mandar eso deja un mensaje que dice el rubro
     dos veces y nada mas, y el proveedor no tiene por que tocar el link.
     Lo unico propio de ese pedido es la LISTA de productos, asi que va la
     lista donde iria el titulo, y el conteo donde iria la cantidad:

       ¡Hola, Koquit! Hay un pedido nuevo de Indumentaria en EmprendeGO.
       Ropa mujer, Deportiva, Accesorios de moda
       Cantidad: 3 productos

   Se decide por la lista de productos y no por sol.tipo a proposito: un
   pedido de producto nunca trae productos cargados, asi que la lista es la
   señal mas directa y no depende de que la columna tipo exista. */
export function textoPedido(sol) {
  const prods = Array.isArray(sol && sol.productos)
    ? sol.productos.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
    : [];

  /* NUNCA un numero en la cantidad de un pedido de proveedor.

     Version anterior: la lista en la linea y "2 productos" en la cantidad.
     Leido en el celular queda "Cantidad: 2 productos", y el proveedor entiende
     que le quieren comprar DOS PRENDAS. Descarta el pedido por chico y no
     cotiza, cuando en realidad del otro lado hay alguien que quiere surtirse
     de dos lineas enteras. Es el peor error posible: filtra justo los pedidos
     mas grandes. Lo detecto el founder leyendo un aviso real (2026-08-25,
     pedido de Bruno Di Yorio: "Ropa hombre, Deportiva").

     La cantidad no se puede omitir —la plantilla tiene "Cantidad: " fijo y un
     parametro vacio hace fallar el envio entero— asi que va "a convenir", que
     es la verdad: en un pedido de este tipo la cantidad se acuerda despues.
     El "Busca proveedor para:" adelante deja claro de que se trata. */
  if (prods.length) {
    return {
      linea: 'Busca proveedor para: ' + prods.join(', '),
      cantidad: 'a convenir'
    };
  }

  const c = [sol && sol.cantidad, sol && sol.unidad].filter(Boolean).join(' ').trim();
  return { linea: String((sol && sol.titulo) || ''), cantidad: c || 'a convenir' };
}

export function normalizarWa(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d.startsWith('54')) return null;      // solo Argentina
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

/* El numero al que se desvian TODOS los envios mientras se prueba
   (WHATSAPP_TEST_TO). Se limpia pero NO pasa por normalizarWa().

   POR QUE NO, aunque parezca que deberia: un celular argentino se puede
   escribir de dos formas validas y son el MISMO numero.
     54  9 11 6445 7134  -> 13 digitos, la forma estandar de WhatsApp
     54 11 15 6445 7134  -> 14 digitos, la forma vieja con el 15
   normalizarWa() exige 12-13 porque asi estan guardados los 150 proveedores
   aprobados, y esta bien que sea estricta con datos que vienen de la base.

   Pero la lista de destinatarios permitidos del numero de PRUEBA de Meta
   guardo el numero en la forma vieja de 14 digitos, y compara texto contra
   texto: mandarle la forma estandar rebota con "(#131030) Recipient phone
   number not in allowed list" aunque el numero este cargado y verificado.
   Nos costo tres intentos descubrirlo.

   Este valor lo pone el operador a mano en una variable de entorno, no viene
   de la base ni de un usuario, asi que alcanza con un piso de largo para
   atajar un dedazo. Nada de esto afecta a produccion: cuando se saque
   WHATSAPP_TEST_TO, los proveedores reciben en su formato de siempre. */
export function numeroDePrueba(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

async function handlerWaPedido(req, res) {
  if (!applyRateLimit(req, res, { bucket: 'wa-pedido', limit: 20, windowMs: 60000 })) return;

  const { solicitud_id, rubro: rubroForzado } = req.body || {};
  if (!esUUID(solicitud_id)) return res.status(400).json({ error: 'missing fields' });

  // Igual que en ?action=cotizacion: lo que no corresponde mandar sale con
  // 200 y un motivo. No es un error del que llama y un 4xx solo le llenaria
  // la consola al comprador, que no tiene nada que ver con esto.
  const saltear = (motivo, extra) => res.status(200).json({ ok: true, skipped: motivo, ...extra });

  const token = (process.env.WHATSAPP_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_ID || '').trim();
  if (!token || !phoneId) return saltear('wa_apagado');

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !SUPABASE_BASE) {
    console.error('[wa-pedido] falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_URL');
    return res.status(500).json({ error: 'server config error' });
  }
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    // --- 1) El pedido ---
    const solRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/solicitudes?id=eq.${encodeURIComponent(solicitud_id)}` +
      `&select=id,titulo,cantidad,unidad,rubro,provincia,estado,cierra_at,created_at,tipo,productos&limit=1`,
      { headers });
    const sol = (await solRes.json())?.[0];
    if (!sol) return res.status(404).json({ error: 'not found' });

    if (sol.estado !== 'abierta') return saltear('pedido_cerrado');
    if (sol.cierra_at && new Date(sol.cierra_at) <= new Date()) return saltear('pedido_vencido');

    /* Un admin puede forzar el rubro para reenviar a mano un pedido que cayo
       en "Otro" (son ~4 de cada 10). Solo en ese caso se acepta un pedido
       viejo: el founder los revisa cuando puede, no en los 15 minutos
       siguientes. Sin sesion de admin valida, el rubro forzado se IGNORA
       —no se rechaza el pedido entero— y sigue el camino normal. */
    let rubro = String(sol.rubro || '').trim();
    let porAdmin = false;
    if (rubroForzado) {
      const adminEmail = await verificarAdmin(req, serviceKey);
      if (adminEmail) {
        rubro = String(rubroForzado).trim();
        porAdmin = true;
        console.log(`[wa-pedido] ${adminEmail} fuerza el rubro ${rubro} en ${solicitud_id}`);
      }
    }

    if (!porAdmin) {
      const edadMin = (Date.now() - new Date(sol.created_at).getTime()) / 60000;
      if (edadMin > WA_VENTANA_MIN) return saltear('pedido_viejo');
    }

    // Un pedido sin rubro util no le sirve a nadie: se saltea y lo reenvia
    // una persona con el rubro correcto. Ver rubroEsCiego() en _rubros.js.
    if (rubroEsCiego(rubro)) return saltear('rubro_ciego', { rubro });

    // --- 2) Tope diario global ---
    const cuentaRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/avisos_wa?created_at=gte.${encodeURIComponent(inicioDelDiaAR())}&select=id`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
    if (!cuentaRes.ok) {
      // La tabla no existe -> la migracion todavia no se corrio. Sin bitacora
      // no se manda: es preferible no avisar a avisar sin poder registrarlo,
      // porque el registro ES el anti-duplicado.
      console.warn('[wa-pedido] falta correr sql/2026-08-24_aviso_wa_pedidos.sql');
      return saltear('sin_bitacora');
    }
    const enviadosHoy = parseInt(String(cuentaRes.headers.get('content-range') || '').split('/')[1], 10) || 0;
    if (enviadosHoy >= WA_TOPE_DIARIO) return saltear('tope_diario', { enviados_hoy: enviadosHoy });

    // --- 3) Los destinatarios ---
    const provRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/proveedores?estado=eq.aprobado` +
      `&select=id,nombre,rubro,provincia,whatsapp,last_wa_at,notif_wa,rubros_seguidos&limit=1000`,
      { headers });
    if (!provRes.ok) {
      // Pasa si last_wa_at / notif_wa todavia no existen: PostgREST rechaza
      // el select entero. Misma conclusion que arriba.
      console.warn('[wa-pedido] no se pudo leer proveedores:', provRes.status, await provRes.text());
      return saltear('sin_bitacora');
    }

    /* Cuantos avisos recibio CADA proveedor en las ultimas 24 h.

       Se cuenta contra avisos_wa y no contra proveedores.last_wa_at porque
       esa columna guarda un solo instante: sirve para "hace cuanto que no
       recibe" (que es como se ordena el reparto) pero no para un tope de
       varios por dia. Son unas pocas decenas de filas: pesa nada. */
    const desde24 = new Date(Date.now() - WA_VENTANA_TOPE_H * 3600 * 1000).toISOString();
    const recientesRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/avisos_wa?estado=eq.enviado` +
      `&created_at=gte.${encodeURIComponent(desde24)}&select=proveedor_id&limit=5000`,
      { headers });
    const enviados24 = new Map();
    if (recientesRes.ok) {
      for (const f of (await recientesRes.json()) || []) {
        enviados24.set(f.proveedor_id, (enviados24.get(f.proveedor_id) || 0) + 1);
      }
    }

    const destinatarios = elegirDestinatarios(await provRes.json(), rubro, sol.provincia, enviados24);
    if (!destinatarios.length) return saltear('sin_destinatarios', { rubro });

    const cupo = Math.max(0, WA_TOPE_DIARIO - enviadosHoy);
    const lote = destinatarios.slice(0, cupo);

    // --- 4) El envio ---
    const forzarA = numeroDePrueba(process.env.WHATSAPP_TEST_TO);

    let enviados = 0;
    const fallos = [];

    // De a 5 en paralelo: 25 mensajes secuenciales pueden pasarse del limite
    // de tiempo de la funcion, y 25 en paralelo es una rafaga que Meta puede
    // leer como abuso.
    for (let i = 0; i < lote.length; i += 5) {
      const tanda = lote.slice(i, i + 5);
      const rtas = await Promise.all(tanda.map(p => enviarUno(p, {
        headers, token, phoneId, forzarA, sol, rubro, solicitud_id
      })));
      rtas.forEach(r => {
        if (r.ok) enviados++;
        else if (r.motivo !== 'duplicado') fallos.push(r.motivo);
      });
    }

    console.log(`[wa-pedido] pedido ${solicitud_id} (${rubro}): ${enviados} de ${lote.length} enviados`);
    return res.status(200).json({
      ok: true, enviados, candidatos: destinatarios.length,
      fallos: fallos.slice(0, 5), rubro, prueba: !!forzarA
    });

  } catch (err) {
    console.error('[wa-pedido] error inesperado:', err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}


/* A QUIEN SE LE MANDA.
   El rubro es filtro DURO; la zona NO. Motivo, contra los datos reales: 93
   de los 150 proveedores aprobados estan en CABA y 35 en Buenos Aires. Si la
   provincia filtrara, un comprador de Cordoba se quedaria sin nadie a quien
   avisarle, cuando en la practica el mayorista de Once le vende igual y le
   manda por encomienda. Asi que la provincia ORDENA, no excluye. */
export function elegirDestinatarios(proveedores, rubro, provinciaPedido, enviados24) {
  const cuenta = enviados24 instanceof Map ? enviados24 : new Map();
  const candidatos = (proveedores || []).filter(p => {
    if (!p || p.notif_wa === false) return false;              // se dio de baja
    if (!normalizarWa(p.whatsapp)) return false;               // sin numero usable

    /* rubros_seguidos manda si el proveedor lo configuro; si no, se usa
       proveedores.rubro. Hoy lo configuro 1 de 150, asi que en los hechos
       casi todos entran por rubro, pero el que se tomo el trabajo de elegir
       sus rubros no tiene que recibir avisos de los otros. */
    const seguidos = Array.isArray(p.rubros_seguidos) ? p.rubros_seguidos.filter(Boolean) : null;
    const coincide = seguidos && seguidos.length
      ? seguidos.some(r => rubroCoincide(r, rubro))
      : rubroCoincide(p.rubro, rubro);
    if (!coincide) return false;

    // Tope de avisos en las ultimas 24 h. Ver WA_MAX_POR_DIA arriba: es un
    // cortacircuitos contra una rafaga, no un filtro de todos los dias.
    if ((cuenta.get(p.id) || 0) >= WA_MAX_POR_DIA) return false;
    return true;
  });

  return candidatos.sort((a, b) => {
    // 1) misma provincia que el comprador
    const pa = provinciaPedido && a.provincia === provinciaPedido ? 0 : 1;
    const pb = provinciaPedido && b.provincia === provinciaPedido ? 0 : 1;
    if (pa !== pb) return pa - pb;
    // 2) el que hace mas que no recibe uno (nunca recibio = primero de todos).
    //    Reparte el alcance en vez de golpear siempre a los mismos.
    //    FASE FUTURA: aca iria el ranking por desempeño.
    const ta = a.last_wa_at ? new Date(a.last_wa_at).getTime() : 0;
    const tb = b.last_wa_at ? new Date(b.last_wa_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    // 3) desempate estable, para que dos corridas den el mismo orden
    return String(a.id).localeCompare(String(b.id));
  }).slice(0, WA_LIMITE_DESTINATARIOS);
}


/* UN envio. Nunca lanza: un proveedor que falla no puede cortar la tanda.
   Devuelve { ok } | { ok:false, motivo }.

   El orden importa: RESERVAR -> mandar -> confirmar. Si se hiciera al reves,
   dos llamadas simultaneas pasarian las dos el chequeo y el proveedor
   recibiria dos WhatsApp iguales. */
async function enviarUno(p, ctx) {
  const { headers, token, phoneId, forzarA, sol, rubro, solicitud_id } = ctx;
  const telReal = normalizarWa(p.whatsapp);
  const destino = forzarA || telReal;

  // 1) Reserva. El 409 contra avisos_wa_unico es el anti-duplicado real.
  let reservaId = null;
  try {
    const r = await fetch(`${SUPABASE_BASE}/rest/v1/avisos_wa`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        solicitud_id, proveedor_id: p.id, telefono: destino, estado: 'reservado'
      })
    });
    if (r.status === 409) return { ok: false, motivo: 'duplicado' };
    if (!r.ok) {
      console.error('[wa-pedido] no se pudo reservar:', r.status, await r.text());
      return { ok: false, motivo: 'sin_registro' };
    }
    reservaId = (await r.json())?.[0]?.id || null;
  } catch (e) {
    console.error('[wa-pedido] no se pudo reservar:', e.message);
    return { ok: false, motivo: 'sin_registro' };
  }

  // 2) El mensaje.
  try {
    // Las dos lineas del medio cambian segun la clase de pedido. Ver textoPedido().
    const info = textoPedido(sol);
    const params = [
      limpiarParam(p.nombre, 40),
      limpiarParam(rubro, 40),
      limpiarParam(info.linea, 120),
      limpiarParam(info.cantidad, 40),
      // El link va partido: la plantilla tiene el dominio fijo y solo el id
      // viaja como parametro. Asi Meta no ve una URL entera variable, que es
      // lo que hace que revisen la plantilla con lupa.
      limpiarParam(solicitud_id, 40)
    ];

    const waRes = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: WA_TEMPLATE,
          language: { code: WA_LANG },
          components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }]
        }
      })
    });

    const cuerpo = await waRes.json().catch(() => ({}));
    if (!waRes.ok) {
      const motivo = cuerpo?.error?.message || `http_${waRes.status}`;
      console.error(`[wa-pedido] Meta rechazo el envio a ${p.id}:`, JSON.stringify(cuerpo?.error || cuerpo));
      await cerrarAviso(headers, reservaId, { estado: 'fallo', error: String(motivo).slice(0, 500) });
      return { ok: false, motivo };
    }

    await cerrarAviso(headers, reservaId, {
      estado: 'enviado', wa_message_id: cuerpo?.messages?.[0]?.id || null
    });

    /* El enfriamiento se marca sobre el proveedor REAL aunque el mensaje haya
       ido al numero de prueba: si no, probando con WHATSAPP_TEST_TO se
       gastaria el enfriamiento de nadie y el dia que se encienda de verdad
       los primeros pedidos saldrian todos juntos. */
    await fetch(`${SUPABASE_BASE}/rest/v1/proveedores?id=eq.${encodeURIComponent(p.id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ last_wa_at: new Date().toISOString() })
    }).catch(() => { });

    return { ok: true };

  } catch (e) {
    console.error('[wa-pedido] fallo el envio:', e.message);
    await cerrarAviso(headers, reservaId, { estado: 'fallo', error: String(e.message).slice(0, 500) });
    return { ok: false, motivo: e.message };
  }
}

// Cierra la reserva. Nunca lanza: si esto falla, lo peor que pasa es que la
// fila quede en 'reservado', que es justamente como se detecta un envio que
// se corto por la mitad.
async function cerrarAviso(headers, id, campos) {
  if (!id) return;
  try {
    await fetch(`${SUPABASE_BASE}/rest/v1/avisos_wa?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(campos)
    });
  } catch (e) {
    console.error('[wa-pedido] no se pudo cerrar el aviso:', e.message);
  }
}


/* =====================================================================
   WEBHOOK DE WHATSAPP  (?action=wa_webhook, via /api/wa-webhook)
   =====================================================================

   GET  /api/wa-webhook   -> verificacion inicial de Meta (hub.challenge)
   POST /api/wa-webhook   -> eventos: acuses de entrega y respuestas

   HACE DOS COSAS, y la primera vale mas que la segunda:

   1. ANOTA EL EMBUDO. Meta avisa cuando el mensaje se entrego y cuando se
      leyo. Sin eso sabemos que un aviso SALIO y nada mas, y si el proveedor
      no cotiza no podemos distinguir "lo leyo y no le sirvio" de "nunca le
      llego". Son dos problemas opuestos: uno se arregla cambiando el texto y
      el otro cambiando el canal. La hipotesis del MVP no se puede responder
      sin esa distincion.

   2. CONTESTA AL QUE RESPONDE. Un numero de la Cloud API no tiene app de
      WhatsApp donde leer nada: el proveedor que contesta el aviso le escribe
      al vacio y se queda esperando. Aca se le devuelve el link directo al
      pedido por el que se le habia escrito.

   ---------------------------------------------------------------------
   ARRANCA APAGADO, como todo lo demas
   ---------------------------------------------------------------------
   Meta no manda un solo evento hasta que la URL este configurada en el panel
   de la app. Y sin WHATSAPP_VERIFY_TOKEN, la verificacion se rechaza, asi que
   ni siquiera se puede configurar por accidente.

   ---------------------------------------------------------------------
   SOBRE LA FIRMA DE META, Y POR QUE NO SE VALIDA
   ---------------------------------------------------------------------
   Meta firma cada evento con X-Hub-Signature-256 sobre el cuerpo CRUDO. En
   Vercel el cuerpo ya viene parseado y el crudo se perdio; recuperarlo exige
   apagar el parseo, que es una opcion de ARCHIVO y romperia las otras tres
   ramas de este mismo archivo. Ponerlo aparte gastaria una de las 2 funciones
   que quedan del cupo de 12.

   Se eligio acotar el daño en vez de gastar el cupo. Un evento falsificado no
   puede hacer nada util:
     - Los acuses solo actualizan filas que YA existen, buscando por el id de
       mensaje que devolvio Meta al enviar. Un id inventado no matchea nada.
     - La respuesta automatica solo sale a numeros que estan en avisos_wa y a
       los que ya les escribimos en los ultimos 7 dias, y como maximo UNA vez
       por telefono por dia. O sea que el peor caso es un mensaje de mas a un
       proveedor al que ya le habiamos escrito.
   Si algun dia esto maneja algo mas sensible que acuses, va a archivo propio
   con el cuerpo crudo y firma validada.
   ===================================================================== */

// Cuanto para atras se busca el aviso al que corresponde una respuesta. Mas
// que esto y estariamos contestando sobre un pedido que probablemente ya
// cerro; el proveedor recibiria un link a algo que no puede cotizar.
const WA_RESPUESTA_VENTANA_DIAS = 7;


async function handlerWaWebhook(req, res) {
  // --- Verificacion inicial (GET con hub.challenge) ---
  if (req.method === 'GET') {
    const esperado = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
    const modo = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const reto = req.query['hub.challenge'];
    if (esperado && modo === 'subscribe' && token === esperado) {
      console.log('[wa-webhook] verificacion OK');
      // Meta espera el challenge crudo, sin comillas ni JSON.
      return res.status(200).send(String(reto || ''));
    }
    console.warn('[wa-webhook] verificacion rechazada');
    return res.status(403).send('forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  /* SE PROCESA PRIMERO Y SE CONTESTA DESPUES. Al reves NO funciona.

     La version anterior mandaba el 200 primero "para no hacer esperar a Meta"
     y hacia el trabajo despues. En Vercel eso no corre: apenas se manda la
     respuesta, la funcion se congela y lo que quedo pendiente se pierde. El
     sintoma fue exactamente ese —el webhook configurado y suscrito, los
     mensajes saliendo, y entregado_at / leido_at siempre en NULL— y no se ve
     en ninguna prueba local, porque local no congela nada.

     El riesgo del otro lado es real pero chico: si tardamos, Meta reintenta y
     puede terminar desactivando el webhook. Lo que hacemos son dos PATCH
     contra PostgREST, del orden de milisegundos. Y va todo envuelto: pase lo
     que pase se contesta 200, que es lo que Meta necesita para no reintentar. */
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && SUPABASE_BASE) {
      const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
      for (const valor of valoresDelEvento(req.body)) {
        for (const st of (valor.statuses || [])) await anotarAcuse(headers, st);
        for (const msg of (valor.messages || [])) await responderA(headers, msg);
      }
    }
  } catch (e) {
    console.error('[wa-webhook] error procesando el evento:', e.message);
  }

  return res.status(200).json({ ok: true });
}

/* Meta anida los eventos tres niveles: entry[].changes[].value. Se aplana
   con cuidado porque cualquier nivel puede faltar y un evento raro no puede
   tirar abajo el procesamiento de los otros que vengan en la misma tanda. */
export function valoresDelEvento(cuerpo) {
  const salida = [];
  const entries = cuerpo && Array.isArray(cuerpo.entry) ? cuerpo.entry : [];
  for (const e of entries) {
    const cambios = e && Array.isArray(e.changes) ? e.changes : [];
    for (const c of cambios) {
      if (c && c.value && typeof c.value === 'object') salida.push(c.value);
    }
  }
  return salida;
}

/* Acuse de entrega o de lectura.

   Se busca por wa_message_id, que es el id que Meta devolvio cuando mandamos
   el mensaje y que guardamos justamente para esto. Un acuse de un id que no
   conocemos se ignora: no es nuestro.

   Los estados llegan en orden pero no siempre: puede venir 'read' sin haber
   visto 'delivered'. Por eso cada uno escribe SU columna y no se asume nada
   del anterior. Y no se pisa un valor ya escrito: el primer acuse es el que
   vale, los reintentos de Meta traen el mismo evento varias veces. */
async function anotarAcuse(headers, st) {
  const id = st && st.id;
  const estado = st && st.status;
  if (!id || !estado) return;

  const columna = estado === 'delivered' ? 'entregado_at'
    : estado === 'read' ? 'leido_at'
      : null;

  // 'failed' merece quedar registrado aunque el envio se haya aceptado: el
  // mensaje salio, Meta lo tomo, y despues no se pudo entregar.
  if (estado === 'failed') {
    const motivo = (st.errors && st.errors[0] && (st.errors[0].title || st.errors[0].message)) || 'failed';
    await parchearAviso(headers, id, { estado: 'fallo', error: String(motivo).slice(0, 500) });
    return;
  }
  if (!columna) return;   // 'sent' no aporta: ya lo sabiamos al mandarlo

  const cuando = st.timestamp
    ? new Date(Number(st.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  await parchearAviso(headers, id, { [columna]: cuando }, `&${columna}=is.null`);
}

/* PATCH sobre la fila del aviso. El filtro extra evita pisar un valor que ya
   estaba: Meta reintenta y manda el mismo acuse mas de una vez. */
async function parchearAviso(headers, waMessageId, campos, filtroExtra) {
  try {
    const r = await fetch(
      `${SUPABASE_BASE}/rest/v1/avisos_wa?wa_message_id=eq.${encodeURIComponent(waMessageId)}` +
      (filtroExtra || ''),
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(campos)
      });
    if (!r.ok) console.warn('[wa-webhook] no se pudo anotar el acuse:', r.status);
  } catch (e) {
    console.error('[wa-webhook] acuse:', e.message);
  }
}

/* El proveedor contesto por WhatsApp en vez de tocar el link.

   Se le devuelve el link del pedido por el que se le escribio. Es un mensaje
   libre, no una plantilla: como el acaba de escribir, hay ventana abierta de
   24 h y se puede responder texto suelto.

   Tres frenos, en este orden:
     1. el telefono tiene que estar en avisos_wa (si no, no es un proveedor
        nuestro y no hay pedido que ofrecerle);
     2. el aviso tiene que ser de los ultimos 7 dias (mas viejo y el pedido
        probablemente ya cerro);
     3. una sola respuesta automatica por telefono por dia (respondio_at),
        para no entrar en un ida y vuelta con alguien que sigue escribiendo. */
async function responderA(headers, msg) {
  const de = String((msg && msg.from) || '').replace(/\D/g, '');
  if (!de) return;

  /* NO se busca por telefono exacto. El mismo celular argentino viaja escrito
     de dos formas —54 9 11 6445 7134 y 54 11 15 6445 7134— y no controlamos
     cual: nosotros guardamos la que se uso para mandar y Meta informa la
     canonica suya. Comparar texto contra texto no encuentra nada, que es
     exactamente lo que paso la primera vez que se probo (2026-08-26).

     Se compara por los ULTIMOS 8 DIGITOS, que en Argentina son el numero
     local y no cambian entre las dos formas. Que dos proveedores compartan
     los ultimos 8 es practicamente imposible, y si pasara el peor caso es
     una respuesta automatica al proveedor equivocado — que igual es un
     proveedor al que ya le habiamos escrito. */
  const cola = de.slice(-8);
  if (cola.length < 8) return;

  try {
    const desde = new Date(Date.now() - WA_RESPUESTA_VENTANA_DIAS * 86400000).toISOString();
    const r = await fetch(
      `${SUPABASE_BASE}/rest/v1/avisos_wa?telefono=like.*${encodeURIComponent(cola)}` +
      `&created_at=gte.${encodeURIComponent(desde)}` +
      `&select=id,solicitud_id,respondio_at&order=created_at.desc&limit=1`,
      { headers });
    if (!r.ok) return;
    const aviso = (await r.json())?.[0];
    if (!aviso) {
      console.log('[wa-webhook] respuesta de un numero que no esta en avisos_wa; se ignora');
      return;
    }

    // Ya le contestamos hoy por este aviso: no se insiste.
    if (aviso.respondio_at) {
      const horas = (Date.now() - new Date(aviso.respondio_at).getTime()) / 3600000;
      if (horas < 24) return;
    }

    // Se marca ANTES de mandar, igual que la reserva del envio: si el
    // proveedor manda tres mensajes seguidos, no le salen tres respuestas.
    await fetch(`${SUPABASE_BASE}/rest/v1/avisos_wa?id=eq.${encodeURIComponent(aviso.id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ respondio_at: new Date().toISOString() })
    });

    const token = (process.env.WHATSAPP_TOKEN || '').trim();
    const phoneId = (process.env.WHATSAPP_PHONE_ID || '').trim();
    if (!token || !phoneId) return;

    const appUrl = (process.env.APP_URL || 'https://emprendego.com.ar').replace(/\/$/, '');
    const link = `${appUrl}/?ir=cotizaciones&pedido=${encodeURIComponent(aviso.solicitud_id)}`;

    await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizarWa(de) || de,
        type: 'text',
        text: {
          preview_url: false,
          body: 'Gracias por responder. Este número es automático y no lee los mensajes.\n\n'
            + 'Para enviar su cotización, entre acá:\n' + link
            + '\n\nSi necesita ayuda, escríbanos desde la app.'
        }
      })
    });
    console.log(`[wa-webhook] respuesta automatica enviada por el aviso ${aviso.id}`);
  } catch (e) {
    console.error('[wa-webhook] respuesta automatica:', e.message);
  }
}
