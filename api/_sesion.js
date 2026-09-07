// Helpers de sesión y de state de OAuth, compartidos por api/ml.js y api/tiendanube.js.
//
// ⚠️ El nombre arranca con guion bajo A PROPÓSITO: Vercel no cuenta como función
// serverless los archivos de api/ que empiezan con "_". Este módulo NO consume
// uno de los 12 lugares del plan Hobby (hoy van 10). Si algún día se renombra
// sin el guion, el deploy empieza a fallar por el tope de funciones.
//
// Por qué existe (2026-09-07): hasta hoy el flujo de OAuth de Mercado Libre y de
// Tienda Nube mandaba el proveedor_id como `state`, sin sesión ni comprobación de
// pertenencia. Eso permitía dos cosas:
//   1) que un atacante armara el link con SU proveedor_id y, al hacerlo abrir a un
//      vendedor real, se quedara con el access_token y el refresh_token de la víctima;
//   2) que tomara el proveedor_id ajeno —que es público: viaja en /api/catalogo—
//      y le dejara sus propias credenciales adentro, envenenándole el catálogo.
// El agujero lo encontró Codex revisando api/ml.js el 2026-09-07.

import { randomBytes } from 'node:crypto';

// Minutos que vive un state antes de considerarse vencido.
export const STATE_VIGENCIA_MIN = 15;

// Devuelve el Bearer token del header Authorization, o '' si no vino.
export function tokenDeReq(req) {
  const raw = req.headers?.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}

// Valida el token contra Supabase Auth y devuelve el email en minúsculas, o null.
// Mismo patrón que verificarAdmin() en notificar-mensaje.js: se le pregunta a
// /auth/v1/user en vez de decodificar el JWT a mano, así no hay que sumar una
// dependencia (el proyecto no tiene package.json ni build step).
export async function emailDeSesion(req, base, serviceKey) {
  const token = tokenDeReq(req);
  if (!token) return null;
  try {
    const r = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return null;
    const user = await r.json();
    const email = String(user?.email || '').toLowerCase().trim();
    return email || null;
  } catch (e) {
    console.error('[sesion] no se pudo validar el token:', e.message);
    return null;
  }
}

// ¿El que llama es dueño de ese proveedor?
//
// La propiedad de un proveedor es su columna `email`: checkSession() en app.js
// busca los proveedores del usuario con .eq('email', <email de la sesión>).
// Acá se comprueba lo mismo, pero del lado del servidor, que es el único que vale.
//
// Devuelve el email del dueño si coincide, o null.
export async function duenoDeProveedor(req, base, serviceKey, proveedorId) {
  const email = await emailDeSesion(req, base, serviceKey);
  if (!email) return null;

  try {
    const r = await fetch(
      `${base}/rest/v1/proveedores?id=eq.${encodeURIComponent(proveedorId)}&select=email&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!r.ok) return null;
    const filas = await r.json();
    if (!filas?.length) return null;
    const duenoEmail = String(filas[0].email || '').toLowerCase().trim();
    return duenoEmail && duenoEmail === email ? email : null;
  } catch (e) {
    console.error('[sesion] no se pudo verificar la pertenencia:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// State de OAuth
// ---------------------------------------------------------------------------

// Crea un state aleatorio, lo guarda en oauth_estados y devuelve el valor.
// El state NO codifica nada: es opaco. El proveedor_id vive solo en la base,
// así que mirar la URL no dice a quién pertenece el flujo.
export async function crearState(base, serviceKey, { proveedorId, proveedor, email }) {
  const state = randomBytes(32).toString('base64url');
  const r = await fetch(`${base}/rest/v1/oauth_estados`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ state, proveedor_id: proveedorId, proveedor, email })
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error('[oauth-state] no se pudo guardar el state:', r.status, txt.slice(0, 200));
    return null;
  }
  return state;
}

// Consume el state: lo marca usado y devuelve la fila, o null si no existe,
// ya se usó, venció o es de otra integración.
//
// ⚠️ El consumo es ATÓMICO a propósito. Es un solo UPDATE con las condiciones
// adentro del WHERE (`usado_at is null` + ventana de tiempo + proveedor), y
// PostgREST devuelve las filas afectadas. Si se hiciera en dos pasos —leer y
// después marcar— dos callbacks simultáneos con el mismo state pasarían los dos.
export async function consumirState(base, serviceKey, state, proveedor) {
  if (!state || typeof state !== 'string' || state.length > 200) return null;

  const desde = new Date(Date.now() - STATE_VIGENCIA_MIN * 60 * 1000).toISOString();
  const url = `${base}/rest/v1/oauth_estados` +
    `?state=eq.${encodeURIComponent(state)}` +
    `&proveedor=eq.${encodeURIComponent(proveedor)}` +
    `&usado_at=is.null` +
    `&creado_at=gte.${encodeURIComponent(desde)}`;

  try {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ usado_at: new Date().toISOString() })
    });
    if (!r.ok) {
      console.error('[oauth-state] no se pudo consumir el state:', r.status);
      return null;
    }
    const filas = await r.json();
    return filas?.length ? filas[0] : null;
  } catch (e) {
    console.error('[oauth-state] fallo consumiendo el state:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie que ata el flujo al navegador que lo empezó
// ---------------------------------------------------------------------------
//
// ⚠️ Esta cookie es lo único que frena el ataque de vinculación.
// Sin ella, un atacante puede pedir un state válido para SU proveedor (es dueño,
// así que pasa el control de pertenencia) y después hacerle abrir ese link a un
// vendedor de Mercado Libre: la víctima autoriza y sus tokens caen en la fila del
// atacante. Con la cookie, el navegador de la víctima no lleva el valor que se
// guardó en el del atacante y el callback lo rechaza.
//
// SameSite=Lax alcanza: el callback llega como navegación de primer nivel
// (mercadolibre.com redirige al navegador), y en ese caso Lax sí manda la cookie.

export function nombreCookie(proveedor) {
  return `eg_oauth_${proveedor}`;
}

// ⚠️ El Domain no es un detalle: sin él, un proveedor que empieza el flujo en
// www.emprendego.com.ar no puede terminarlo.
//
// La redirect_uri registrada en Mercado Libre y en Tienda Nube apunta al dominio
// SIN www, y una cookie sin Domain es "host-only": la que se guardó en
// www.emprendego.com.ar no se manda a emprendego.com.ar. El callback no la
// encontraría y rechazaría una conexión legítima.
//
// Se pone el Domain SOLO en el dominio real. En los previews de Vercel
// (*.vercel.app) y en local hay que omitirlo, porque un navegador descarta una
// cookie cuyo Domain no coincide con el host — y ahí es justo donde se prueba.
function dominioCookie(host) {
  const h = String(host || '').toLowerCase().split(':')[0];
  return (h === 'emprendego.com.ar' || h.endsWith('.emprendego.com.ar'))
    ? '; Domain=emprendego.com.ar'
    : '';
}

export function cabeceraCookie(proveedor, state, host) {
  return `${nombreCookie(proveedor)}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/` +
    dominioCookie(host) +
    `; Max-Age=${STATE_VIGENCIA_MIN * 60}`;
}

// El borrado tiene que repetir el mismo Domain: una cookie se pisa por
// (nombre, dominio, path). Si no coincide, la vieja queda viva.
export function cabeceraCookieBorrada(proveedor, host) {
  return `${nombreCookie(proveedor)}=; HttpOnly; Secure; SameSite=Lax; Path=/` +
    dominioCookie(host) +
    `; Max-Age=0`;
}

export function leerCookie(req, proveedor) {
  const raw = req.headers?.cookie || '';
  const buscado = nombreCookie(proveedor) + '=';
  for (const parte of raw.split(';')) {
    const t = parte.trim();
    if (t.startsWith(buscado)) return t.slice(buscado.length);
  }
  return '';
}

// Comparación en tiempo constante, para no filtrar el valor por cuánto tarda.
export function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}
