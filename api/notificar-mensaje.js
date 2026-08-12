import { applyRateLimit, esUUID, escHtml } from './_ratelimit.js';

const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // Rama de anuncios manuales del panel de admin (?action=anuncio).
  // Va ACA y no en un archivo propio porque api/ ya tiene las 12 funciones
  // que permite el plan Hobby de Vercel: un archivo mas rompe el deploy.
  // No comparte nada con el flujo de abajo salvo el cliente de Resend.
  if (req.query?.action === 'anuncio') return handlerAnuncio(req, res);

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
