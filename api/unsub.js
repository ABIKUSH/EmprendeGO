import { esUUID } from './_ratelimit.js';

const SUPABASE_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export default async function handler(req, res) {
  // Baja de un USUARIO de los anuncios del panel (?u=<uuid>&c=<campana>).
  // Rama nueva y aislada: el flujo historico de abajo (?id=<proveedor>)
  // queda exactamente como estaba.
  if (req.query?.u) return bajaUsuario(req, res);

  const { id } = req.query;
  if (!id) return res.status(400).send('ID requerido');

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey || !SUPABASE_BASE) return res.status(500).send('Error de configuración');

  try {
    await fetch(`${SUPABASE_BASE}/rest/v1/proveedores?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ notif_email: false })
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><title>Desuscripción — EmprendeGO</title></head>
      <body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;">
        <div style="max-width:400px;margin:0 auto;background:white;padding:40px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <h2 style="color:#6366f1;">✅ Listo</h2>
          <p style="color:#374151;">Ya no vas a recibir notificaciones de mensajes por email.</p>
          <a href="/" style="display:inline-block;margin-top:16px;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Volver a EmprendeGO
          </a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[unsub] error:', err.message);
    return res.status(500).send('Error al procesar la solicitud');
  }
}


/* =====================================================================
   BAJA DE UN USUARIO  (?u=<usuario_id>&c=<campana>)

   Por que el GET NO da de baja y muestra un boton:

     Gmail, Outlook y varios antivirus corporativos PRECARGAN los enlaces
     de un mail para escanearlos. Si la baja ocurriera en el GET, esos
     escaneos darian de baja solos a usuarios que nunca hicieron clic, y
     el panel los mostraria como excluidos sin que ellos lo hayan pedido.
     Con la confirmacion, la baja solo ocurre ante una accion real.

     La excepcion es el POST: lo hace el boton de esta misma pagina, y
     tambien el "Cancelar suscripcion" nativo de Gmail (cabecera
     List-Unsubscribe-Post, un solo clic). Ahi la intencion es explicita.

   La baja se guarda por EMAIL, para que sobreviva a que la cuenta se
   borre y se vuelva a crear.
   ===================================================================== */

const VERDE = '#006039';

function paginaBaja({ titulo, cuerpo, accion }) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} — EmprendeGO</title></head>
<body style="margin:0;background:#f4f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <div style="max-width:440px;margin:0 auto;padding:64px 20px;">
    <div style="background:#fff;border-radius:14px;padding:36px 32px;text-align:center;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:700;color:${VERDE};margin-bottom:22px;">EmprendeGO</div>
      <h1 style="margin:0 0 12px;font-size:19px;color:#2c3330;">${titulo}</h1>
      <p style="margin:0 0 26px;font-size:14.5px;line-height:1.6;color:#5c6661;">${cuerpo}</p>
      ${accion}
    </div>
  </div>
</body></html>`;
}

const BOTON_VOLVER = `<a href="/" style="display:inline-block;padding:13px 26px;background:${VERDE};color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:14.5px;">Volver a EmprendeGO</a>`;

async function bajaUsuario(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const usuarioId = String(req.query.u || '').trim();
  const campana = String(req.query.c || '').trim().slice(0, 60) || null;

  if (!esUUID(usuarioId)) {
    return res.status(400).send(paginaBaja({
      titulo: 'Enlace inválido',
      cuerpo: 'El enlace de baja no es válido o está incompleto. Si llegó hasta acá desde un mail nuestro, respóndalo y lo damos de baja a mano.',
      accion: BOTON_VOLVER
    }));
  }

  // El service-role es obligatorio: email_optouts no tiene policy de INSERT,
  // asi que con la anon key la baja no se guardaria y le estariamos diciendo
  // "listo" a alguien que va a seguir recibiendo mails.
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !SUPABASE_BASE) {
    console.error('[unsub:usuario] falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_URL');
    return res.status(500).send(paginaBaja({
      titulo: 'No pudimos procesar la baja',
      cuerpo: 'Hubo un problema de nuestro lado. Responda el mail que recibió y lo damos de baja a mano.',
      accion: BOTON_VOLVER
    }));
  }

  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };

  // GET: solo se pregunta. Nada se escribe (ver el comentario de arriba).
  if (req.method !== 'POST') {
    return res.status(200).send(paginaBaja({
      titulo: '¿Confirma la baja?',
      cuerpo: 'Si confirma, dejamos de enviarle avisos por correo sobre novedades de EmprendeGO. Su cuenta y sus pedidos siguen funcionando igual.',
      accion: `<form method="POST" action="/api/unsub?u=${encodeURIComponent(usuarioId)}${campana ? `&c=${encodeURIComponent(campana)}` : ''}" style="margin:0;">
        <button type="submit" style="display:block;width:100%;padding:13px 26px;background:${VERDE};color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14.5px;font-family:inherit;cursor:pointer;">Sí, darme de baja</button>
        <a href="/" style="display:block;margin-top:12px;padding:12px;color:#5c6661;text-decoration:none;font-size:14px;">No, quiero seguir recibiéndolos</a>
      </form>`
    }));
  }

  try {
    const userRes = await fetch(
      `${SUPABASE_BASE}/rest/v1/usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=email&limit=1`,
      { headers }
    );
    const email = String((await userRes.json())?.[0]?.email || '').trim().toLowerCase();

    // Sin email no hay a quien dar de baja, pero tampoco tiene sentido
    // mostrarle un error: si la cuenta ya no existe, tampoco va a recibir nada.
    if (!email) {
      return res.status(200).send(paginaBaja({
        titulo: 'Listo',
        cuerpo: 'No vamos a enviarle más avisos de este tipo.',
        accion: BOTON_VOLVER
      }));
    }

    // on_conflict + merge-duplicates: si ya estaba dado de baja, no falla.
    const upRes = await fetch(`${SUPABASE_BASE}/rest/v1/email_optouts?on_conflict=email`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email, campana, motivo: 'link_email' })
    });
    if (!upRes.ok) throw new Error(`PostgREST ${upRes.status}: ${await upRes.text()}`);

    console.log(`[unsub:usuario] baja registrada para ${usuarioId} (campana: ${campana || 'todas'})`);

    // El "un clic" de Gmail no abre un navegador: espera un 2xx a secas.
    if (!String(req.headers.accept || '').includes('text/html')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send('OK');
    }

    return res.status(200).send(paginaBaja({
      titulo: 'Listo, lo dimos de baja',
      cuerpo: 'No vamos a enviarle más avisos por correo sobre novedades. Su cuenta de EmprendeGO sigue funcionando normalmente.',
      accion: BOTON_VOLVER
    }));

  } catch (err) {
    console.error('[unsub:usuario] error:', err.message);
    return res.status(500).send(paginaBaja({
      titulo: 'No pudimos procesar la baja',
      cuerpo: 'Hubo un problema de nuestro lado. Responda el mail que recibió y lo damos de baja a mano.',
      accion: BOTON_VOLVER
    }));
  }
}
