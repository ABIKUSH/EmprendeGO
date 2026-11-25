/* =====================================================================
   PRUEBAS DEL AVISO POR WHATSAPP CUANDO LE ESCRIBEN AL PROVEEDOR POR EL CHAT

   Correr:   node test/aviso-chat-wa.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin red y sin base.

   A diferencia de informe-wa.test.js, aca SI se corre el handler entero con
   fetch fingido. Lo que se quiere vigilar no es una funcion pura sino las
   puertas: este endpoint es publico y manda mensajes PAGOS a numeros reales,
   asi que lo que importa es que NO salga cuando no debe. Cada prueba arma la
   respuesta de Supabase/Meta que necesita y mira si llego a llamar a Meta.
   ===================================================================== */
process.env.SUPABASE_URL = 'https://base.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.WHATSAPP_TOKEN = 'tok';
process.env.WHATSAPP_PHONE_ID = '123';
process.env.WHATSAPP_TEMPLATE_CHAT = 'aviso_mensaje_chat';
delete process.env.WHATSAPP_TEST_TO;

const PROV = '11111111-1111-4111-8111-111111111111';
let ok = 0; const fallas = [];

// Mediodia en Argentina (15 UTC) para que el horario comercial no moleste.
const MEDIODIA = Date.UTC(2026, 10, 25, 15, 0, 0);
const ahoraReal = Date.now;

function escenario(o) {
  const llamadas = { meta: [], reservas: [] };
  const base = Object.assign({
    usuario: { ok: true, email: 'ana@x.com' },
    mensajes: [{ de_tipo: 'usuario', texto: 'Busco 50 remeras', created_at: new Date(MEDIODIA - 60e3).toISOString() }],
    proveedor: { id: PROV, nombre: 'Textil Once', whatsapp: '5491122334455', notif_wa: true, estado: 'aprobado' },
    previos: [], reservaStatus: 201, metaOk: true
  }, o);
  global.fetch = async (url, init) => {
    url = String(url);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('/auth/v1/user')) return base.usuario.ok ? json(200, { email: base.usuario.email }) : json(401, {});
    if (url.includes('/rest/v1/mensajes')) { llamadas.urlMensajes = url; return json(200, base.mensajes); }
    if (url.includes('/rest/v1/proveedores')) return json(200, base.proveedor ? [base.proveedor] : []);
    if (url.includes('/rest/v1/avisos_chat_wa') && (!init || !init.method || init.method === 'GET')) return json(200, base.previos);
    if (url.includes('/rest/v1/avisos_chat_wa') && init.method === 'POST') { llamadas.reservas.push(JSON.parse(init.body)); return json(base.reservaStatus, [{ id: 'r1' }]); }
    if (url.includes('/rest/v1/avisos_chat_wa') && init.method === 'PATCH') { llamadas.cierre = JSON.parse(init.body); return json(204, {}); }
    if (url.includes('graph.facebook.com')) { llamadas.meta.push(JSON.parse(init.body)); return base.metaOk ? json(200, { messages: [{ id: 'wamid.1' }] }) : json(400, { error: { message: 'Business eligibility payment issue' } }); }
    return json(404, {});
  };
  return llamadas;
}

let ipN = 0;
async function llamar(handler, { auth = 'Bearer jwt', body = { proveedor_id: PROV }, hora = MEDIODIA } = {}) {
  Date.now = () => hora;
  const res = { code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
  const req = { method: 'POST', query: { action: 'wa_chat' }, body, headers: { authorization: auth, 'x-forwarded-for': '10.0.0.' + (++ipN) }, socket: {} };
  try { await handler(req, res); } finally { Date.now = ahoraReal; }
  return res;
}

async function test(nombre, fn) {
  try { await fn(); ok++; console.log('  ok    ' + nombre); }
  catch (e) { fallas.push(nombre); console.log('  FALLA ' + nombre + '\n        ' + e.message); }
}
function igual(a, b, m) { if (a !== b) throw new Error((m || '') + ' esperaba ' + JSON.stringify(b) + ' y vino ' + JSON.stringify(a)); }

(async () => {
  const { default: handler, ventanaChat } = await import('../api/notificar-mensaje.js');

  console.log('\n1) Quien puede dispararlo');
  await test('sin sesion: 401 y no sale nada', async () => {
    const l = escenario(); const r = await llamar(handler, { auth: '' });
    igual(r.code, 401); igual(l.meta.length, 0);
  });
  await test('sesion invalida: 401 y no sale nada', async () => {
    const l = escenario({ usuario: { ok: false } }); const r = await llamar(handler);
    igual(r.code, 401); igual(l.meta.length, 0);
  });
  await test('proveedor_id que no es un uuid: 400', async () => {
    escenario(); const r = await llamar(handler, { body: { proveedor_id: 'x' } }); igual(r.code, 400);
  });
  await test('sin un mensaje suyo reciente a ese proveedor: no sale', async () => {
    const l = escenario({ mensajes: [] }); const r = await llamar(handler);
    igual(r.body.skipped, 'sin_mensaje'); igual(l.meta.length, 0);
  });
  await test('busca el mensaje con el email de la SESION, no con uno del cuerpo', async () => {
    const l = escenario(); await llamar(handler, { body: { proveedor_id: PROV, email: 'otro@x.com' } });
    if (!l.urlMensajes.includes(encodeURIComponent('ana@x.com'))) throw new Error('no filtro por el email de la sesion');
  });
  await test('el texto del aviso sale de la base, no del navegador', async () => {
    const l = escenario(); await llamar(handler, { body: { proveedor_id: PROV, texto: 'TEXTO TRUCHO' } });
    igual(l.meta[0].template.components[0].parameters[1].text, 'Busco 50 remeras');
  });

  console.log('\n2) Cuidar el numero');
  await test('el proveedor esta contestando en esa conversacion: no se le avisa', async () => {
    const l = escenario({ mensajes: [{ de_tipo: 'proveedor', texto: 'hola', created_at: '' }, { de_tipo: 'usuario', texto: 'x', created_at: '' }] });
    const r = await llamar(handler); igual(r.body.skipped, 'activo'); igual(l.meta.length, 0);
  });
  await test('de noche no sale (23 h en Argentina)', async () => {
    const l = escenario(); const r = await llamar(handler, { hora: Date.UTC(2026, 10, 26, 2, 0, 0) });
    igual(r.body.skipped, 'fuera_de_horario'); igual(l.meta.length, 0);
  });
  await test('el proveedor apago los avisos (notif_wa=false): no sale', async () => {
    const l = escenario({ proveedor: { id: PROV, nombre: 'X', whatsapp: '5491122334455', notif_wa: false } });
    const r = await llamar(handler); igual(r.body.skipped, 'baja'); igual(l.meta.length, 0);
  });
  await test('numero que no es argentino: no sale', async () => {
    const l = escenario({ proveedor: { id: PROV, nombre: 'X', whatsapp: '15551234567', notif_wa: true } });
    const r = await llamar(handler); igual(r.body.skipped, 'sin_numero'); igual(l.meta.length, 0);
  });
  await test('ya hubo un aviso en los ultimos 30 min: se agrupa', async () => {
    const l = escenario({ previos: [{ created_at: new Date(MEDIODIA - 10 * 60e3).toISOString() }] });
    const r = await llamar(handler); igual(r.body.skipped, 'agrupado'); igual(l.meta.length, 0);
  });
  await test('tope de 6 por dia', async () => {
    const viejos = Array.from({ length: 6 }, (_, i) => ({ created_at: new Date(MEDIODIA - (2 + i) * 3600e3).toISOString() }));
    const l = escenario({ previos: viejos }); const r = await llamar(handler);
    igual(r.body.skipped, 'tope_diario'); igual(l.meta.length, 0);
  });
  await test('dos llamadas a la vez: la segunda choca con el indice unico (409) y no manda', async () => {
    const l = escenario({ reservaStatus: 409 }); const r = await llamar(handler);
    igual(r.body.skipped, 'agrupado'); igual(l.meta.length, 0);
  });
  await test('la ventana es un bloque de 30 minutos', async () => {
    igual(ventanaChat(new Date(Date.UTC(2026, 0, 1, 10, 0))), ventanaChat(new Date(Date.UTC(2026, 0, 1, 10, 29))));
    if (ventanaChat(new Date(Date.UTC(2026, 0, 1, 10, 29))) === ventanaChat(new Date(Date.UTC(2026, 0, 1, 10, 31)))) throw new Error('10:29 y 10:31 no deberian compartir bloque');
  });

  console.log('\n3) El envio');
  await test('caso normal: reserva y manda UNA plantilla con los 3 parametros en orden', async () => {
    const l = escenario(); const r = await llamar(handler);
    igual(r.body.enviado, true); igual(l.meta.length, 1); igual(l.reservas.length, 1);
    const m = l.meta[0];
    igual(m.template.name, 'aviso_mensaje_chat'); igual(m.to, '5491122334455');
    const p = m.template.components[0].parameters.map(x => x.text);
    igual(p.length, 3); igual(p[0], 'Textil Once'); igual(p[2], 'https://emprendego.com.ar/?ir=mensajes&chat=nuevo');
    igual(l.cierre.estado, 'enviado');
  });
  await test('un mensaje con saltos de linea se aplana (Meta rechaza el envio entero si no)', async () => {
    const l = escenario({ mensajes: [{ de_tipo: 'usuario', texto: 'hola\n\n\tbusco    remeras', created_at: '' }] });
    await llamar(handler); igual(l.meta[0].template.components[0].parameters[1].text, 'hola busco remeras');
  });
  await test('si Meta rechaza (ej. falta de pago) la fila queda en fallo', async () => {
    const l = escenario({ metaOk: false }); const r = await llamar(handler);
    igual(r.body.ok, false); igual(l.cierre.estado, 'fallo');
  });
  await test('sin WHATSAPP_TEMPLATE_CHAT no manda nada (se prende cuando Meta apruebe)', async () => {
    // El modulo ya se cargo con la variable; se prueba leyendo el codigo.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'notificar-mensaje.js'), 'utf8');
    if (!/const CHAT_TEMPLATE = \(process\.env\.WHATSAPP_TEMPLATE_CHAT \|\| ''\)\.trim\(\);/.test(src)) throw new Error('CHAT_TEMPLATE tiene que no tener valor por defecto');
    if (!/if \(!CHAT_TEMPLATE\) return saltear\('sin_plantilla'\);/.test(src)) throw new Error('falta el corte sin_plantilla');
  });

  console.log('\n' + '='.repeat(60));
  if (fallas.length) { console.log(fallas.length + ' FALLAS de ' + (ok + fallas.length)); process.exit(1); }
  console.log((ok) + ' comprobaciones, todas en verde');
  console.log('='.repeat(60));
})();
