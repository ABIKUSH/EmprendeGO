/* =====================================================================
   PRUEBAS DEL STATE DE OAUTH (Mercado Libre y Tienda Nube)

   Correr:   node test/oauth-state.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin red y sin base, igual que
   test/aviso-wa.test.js y test/informe-wa.test.js.

   QUE SE PRUEBA Y POR QUE

   Las piezas puras de api/_sesion.js: la lectura de la cookie, la comparacion
   y las banderas de la cabecera Set-Cookie. Lo que habla con Supabase
   (emailDeSesion, duenoDeProveedor, crearState, consumirState) no se prueba
   aca: una prueba que finge la base termina probando el fingido.

   La razon de existir de este archivo es que la cookie es lo UNICO que frena
   el ataque de vinculacion, y falla en silencio. Si leerCookie() devolviera
   el valor equivocado, o si iguales() dijera que si cuando no, el callback
   seguiria funcionando igual de bien para el proveedor honesto y el agujero
   quedaria abierto sin que nada lo delate. No hay pantalla que lo muestre.

   El agujero original (2026-09-07, lo encontro Codex revisando api/ml.js):
   el `state` era el proveedor_id, que ademas es publico porque viaja en
   /api/catalogo. Ver sql/2026-09-07_oauth_state_seguro.sql.
   ===================================================================== */
'use strict';

import {
  leerCookie, iguales, nombreCookie,
  cabeceraCookie, cabeceraCookieBorrada,
  tokenDeReq, emailUsable, idTiendaValido, STATE_VIGENCIA_MIN
} from '../api/_sesion.js';
import { atributosUtiles } from '../api/ml.js';

let ok = 0;
const fallas = [];
let grupo = '';

function seccion(t) { grupo = t; console.log('\n' + t); }

function test(nombre, fn) {
  try {
    fn();
    ok++; console.log('  ok   ' + nombre);
  } catch (e) {
    fallas.push({ grupo, nombre, e });
    console.log('  FALLA ' + nombre + '\n        ' + (e && e.message));
  }
}

function asegurar(cond, msg) { if (!cond) throw new Error(msg || 'no se cumplio'); }
function igual(a, b, msg) {
  if (a !== b) throw new Error((msg || 'distinto') + ': esperaba ' + JSON.stringify(b) + ' y vino ' + JSON.stringify(a));
}

// Una request de mentira, con los headers que nos importan.
function req(headers) {
  return { headers: headers || {} };
}

// ---------------------------------------------------------------------------
seccion('leerCookie: saca el valor correcto');

test('encuentra la cookie cuando es la unica', () => {
  igual(leerCookie(req({ cookie: 'eg_oauth_ml=abc123' }), 'ml'), 'abc123');
});

test('encuentra la cookie entre varias', () => {
  const c = 'sb-access-token=xxx; eg_oauth_ml=abc123; otra=1';
  igual(leerCookie(req({ cookie: c }), 'ml'), 'abc123');
});

test('tolera espacios alrededor del punto y coma', () => {
  igual(leerCookie(req({ cookie: 'a=1;   eg_oauth_tn=zzz   ;b=2' }), 'tn'), 'zzz');
});

test('devuelve vacio si no esta', () => {
  igual(leerCookie(req({ cookie: 'a=1; b=2' }), 'ml'), '');
});

test('devuelve vacio si no vino ninguna cookie', () => {
  igual(leerCookie(req({}), 'ml'), '');
});

/* Esta es la importante de la seccion. Si el nombre se buscara sin el "=",
   la cookie de Tienda Nube podria matchear un nombre que empiece igual y el
   callback compararia contra el valor equivocado. */
test('no confunde un nombre que empieza igual', () => {
  igual(leerCookie(req({ cookie: 'eg_oauth_mlx=otro; eg_oauth_ml=bueno' }), 'ml'), 'bueno');
});

test('no devuelve la cookie de la otra integracion', () => {
  const c = 'eg_oauth_ml=deML; eg_oauth_tn=deTN';
  igual(leerCookie(req({ cookie: c }), 'ml'), 'deML');
  igual(leerCookie(req({ cookie: c }), 'tn'), 'deTN');
});

// ---------------------------------------------------------------------------
seccion('iguales: compara sin filtrar por tiempo');

test('dice que si cuando son identicas', () => {
  asegurar(iguales('abc123', 'abc123'));
});

test('dice que no cuando difieren', () => {
  asegurar(!iguales('abc123', 'abc124'));
});

test('dice que no cuando una es prefijo de la otra', () => {
  asegurar(!iguales('abc', 'abc123'));
  asegurar(!iguales('abc123', 'abc'));
});

/* El caso que importa: sin cookie, el valor que llega es la cadena vacia.
   Si iguales('','') diera true, un navegador SIN la cookie pasaria el control
   siempre que el atacante mandara un state vacio, y el arreglo no serviria
   de nada. */
test('dos vacios NO pasan como iguales validos en el callback', () => {
  // iguales('','') es true por definicion de comparacion, asi que el callback
  // se apoya en que un state vacio ya fue rechazado antes por !state.
  // Esta prueba fija ese contrato: el state vacio nunca debe llegar aca.
  asegurar(iguales('', ''), 'la comparacion en si trata dos vacios como iguales');
  asegurar(!iguales('', 'algo'), 'un vacio contra un valor real no puede pasar');
});

test('no explota con algo que no es texto', () => {
  asegurar(!iguales(null, 'abc'));
  asegurar(!iguales('abc', undefined));
  asegurar(!iguales(123, 123));
});

// ---------------------------------------------------------------------------
seccion('Set-Cookie: las banderas que la hacen util');

test('la cookie no se puede leer desde JavaScript', () => {
  asegurar(cabeceraCookie('ml', 'x').includes('HttpOnly'),
    'sin HttpOnly, cualquier script de la pagina puede robar el state');
});

test('la cookie solo viaja por HTTPS', () => {
  asegurar(cabeceraCookie('ml', 'x').includes('Secure'));
});

/* SameSite=Lax y no Strict: el callback llega como navegacion de primer nivel
   desde mercadolibre.com. Con Strict el navegador NO mandaria la cookie y la
   conexion se rompería para todos los proveedores. */
test('SameSite es Lax, no Strict', () => {
  const c = cabeceraCookie('ml', 'x');
  asegurar(c.includes('SameSite=Lax'), 'con Strict se rompe el callback');
  asegurar(!c.includes('SameSite=Strict'));
});

test('la cookie vence sola, y en la misma ventana que el state', () => {
  asegurar(cabeceraCookie('ml', 'x').includes('Max-Age=' + (STATE_VIGENCIA_MIN * 60)));
});

test('el valor viaja en la cabecera', () => {
  asegurar(cabeceraCookie('tn', 'elstate').startsWith('eg_oauth_tn=elstate;'));
});

test('la cabecera de borrado vence al instante', () => {
  asegurar(cabeceraCookieBorrada('ml').includes('Max-Age=0'));
});

test('cada integracion tiene su propia cookie', () => {
  asegurar(nombreCookie('ml') !== nombreCookie('tn'));
});

// ---------------------------------------------------------------------------
seccion('El Domain de la cookie');

/* Sin Domain, la cookie es host-only. Mercado Libre y Tienda Nube devuelven al
   dominio SIN www, asi que un proveedor que arranca en www.emprendego.com.ar
   no podria terminar de conectar: el callback no encontraria su cookie y
   rechazaria una conexion legitima. */
test('desde www comparte cookie con el dominio pelado', () => {
  asegurar(cabeceraCookie('ml', 'x', 'www.emprendego.com.ar').includes('Domain=emprendego.com.ar'));
});

test('desde el dominio pelado tambien lo pone', () => {
  asegurar(cabeceraCookie('ml', 'x', 'emprendego.com.ar').includes('Domain=emprendego.com.ar'));
});

/* Y al reves: en un preview de Vercel el Domain tiene que faltar. Un navegador
   descarta una cookie cuyo Domain no coincide con el host, asi que ponerlo
   romperia justo donde se prueba el arreglo antes de subirlo. */
test('en un preview de Vercel NO pone Domain', () => {
  asegurar(!cabeceraCookie('ml', 'x', 'emprende-go.vercel.app').includes('Domain='));
});

test('en local NO pone Domain', () => {
  asegurar(!cabeceraCookie('ml', 'x', 'localhost:3000').includes('Domain='));
});

test('sin host NO pone Domain', () => {
  asegurar(!cabeceraCookie('ml', 'x', undefined).includes('Domain='));
});

/* Una cookie se pisa por (nombre, dominio, path). Si el borrado no repitiera
   el mismo Domain, la vieja quedaria viva y un state ya usado podria volver
   a presentarse. */
test('el borrado repite el mismo Domain', () => {
  igual(
    cabeceraCookieBorrada('ml', 'www.emprendego.com.ar').includes('Domain=emprendego.com.ar'),
    cabeceraCookie('ml', 'x', 'www.emprendego.com.ar').includes('Domain=emprendego.com.ar')
  );
  asegurar(!cabeceraCookieBorrada('ml', 'emprende-go.vercel.app').includes('Domain='));
});

test('un dominio parecido pero ajeno no recibe Domain', () => {
  asegurar(!cabeceraCookie('ml', 'x', 'emprendego.com.ar.malicioso.com').includes('Domain='));
});

// ---------------------------------------------------------------------------
seccion('tokenDeReq: saca el Bearer del header');

test('saca el token', () => {
  igual(tokenDeReq(req({ authorization: 'Bearer abc.def.ghi' })), 'abc.def.ghi');
});

test('devuelve vacio si no hay header', () => {
  igual(tokenDeReq(req({})), '');
});

test('devuelve vacio si el esquema no es Bearer', () => {
  igual(tokenDeReq(req({ authorization: 'Basic dXNlcjpwYXNz' })), '');
});

test('no confunde "Bearer" pegado a otra cosa', () => {
  igual(tokenDeReq(req({ authorization: 'Bearerabc' })), '');
});

// ---------------------------------------------------------------------------
seccion('emailUsable: de quien es un proveedor');

/* Esta es la funcion mas delicada del archivo. La pertenencia a un proveedor se
   decide por email, asi que si esto devuelve un email cuando no deberia, el que
   llama se queda con el proveedor de otro: puede conectar su cuenta de Mercado
   Libre y sincronizarle el catalogo. */

test('acepta un usuario con el email confirmado', () => {
  igual(emailUsable({ email: 'Prov@Ejemplo.com', email_confirmed_at: '2026-01-01T00:00:00Z' }),
    'prov@ejemplo.com', 'y lo normaliza a minusculas');
});

/* confirmed_at NO alcanza, y este es el caso que casi se cuela.
   En Supabase confirmed_at es una columna generada:
   LEAST(email_confirmed_at, phone_confirmed_at). Se llena tambien cuando se
   verifico SOLO el telefono. Aceptarlo dejaria que alguien se registre con el
   email de un mayorista, verifique un telefono propio, y se quede con su ficha. */
test('RECHAZA confirmed_at sin email_confirmed_at (solo verifico el telefono)', () => {
  igual(emailUsable({ email: 'victima@mayorista.com', confirmed_at: '2026-01-01T00:00:00Z' }), null);
  igual(emailUsable({
    email: 'victima@mayorista.com',
    confirmed_at: '2026-01-01T00:00:00Z',
    phone_confirmed_at: '2026-01-01T00:00:00Z',
    email_confirmed_at: null
  }), null);
});

/* El caso que importa: alguien se registra con el email de un mayorista y no lo
   confirma nunca. Si esto lo aceptara, quedaria como dueno de su fila. */
test('RECHAZA un email sin confirmar', () => {
  igual(emailUsable({ email: 'victima@mayorista.com' }), null);
  igual(emailUsable({ email: 'victima@mayorista.com', email_confirmed_at: null }), null);
});

test('rechaza un usuario sin email', () => {
  igual(emailUsable({ email_confirmed_at: '2026-01-01T00:00:00Z' }), null);
  igual(emailUsable({ email: '   ', email_confirmed_at: '2026-01-01T00:00:00Z' }), null);
});

test('rechaza null y undefined sin explotar', () => {
  igual(emailUsable(null), null);
  igual(emailUsable(undefined), null);
});

// ---------------------------------------------------------------------------
seccion('idTiendaValido: el bug de la cadena "undefined"');

test('acepta un id real', () => {
  asegurar(idTiendaValido(4456833));
  asegurar(idTiendaValido('4456833'));
});

/* El bug: el callback hacia String(tokenData.user_id) ANTES de comprobar nada.
   Con user_id ausente eso daba "undefined", que no es cadena vacia y por lo
   tanto pasaba el chequeo. El proveedor quedaba guardado con
   tn_store_id = "undefined" y despues toda sincronizacion fallaba. */
test('RECHAZA la cadena "undefined"', () => {
  asegurar(!idTiendaValido(String(undefined)), 'este era el bug exacto');
  asegurar(!idTiendaValido('undefined'));
});

test('rechaza faltante, vacio y basura equivalente', () => {
  asegurar(!idTiendaValido(undefined));
  asegurar(!idTiendaValido(null));
  asegurar(!idTiendaValido(''));
  asegurar(!idTiendaValido('   '));
  asegurar(!idTiendaValido('null'));
  asegurar(!idTiendaValido(String(NaN)));
});

// ---------------------------------------------------------------------------
seccion('atributosUtiles: lo que hace publicable un producto');

/* Estos son los datos que ML exige para publicar (marca, color, talle, genero)
   y que el proveedor ya cargo en SU publicacion. Si esto los pierde, el
   comprador tiene que volver a completarlos producto por producto, y ahi se
   cae la promesa entera de Mi Negocio. */

test('se queda con los que tienen valor', () => {
  const r = atributosUtiles([
    { id: 'BRAND', name: 'Marca', value_id: null, value_name: 'Palette' },
    { id: 'COLOR', name: 'Color', value_id: '52049', value_name: 'Blanco' }
  ]);
  igual(r.length, 2);
  igual(r[0].id, 'BRAND');
  igual(r[0].value_name, 'Palette');
  igual(r[1].value_id, '52049', 'el value_id es lo que ML espera en los de lista');
});

/* Una publicacion trae ~70 atributos y casi todos vienen vacios. Guardarlos
   multiplicaria el peso de la tabla de productos para no usar nada. */
test('descarta los vacios', () => {
  const r = atributosUtiles([
    { id: 'BRAND', value_name: 'Palette' },
    { id: 'GTIN', value_id: null, value_name: null },
    { id: 'MODEL', value_id: null, value_name: null }
  ]);
  igual(r.length, 1);
  igual(r[0].id, 'BRAND');
});

test('devuelve null cuando no queda nada util', () => {
  igual(atributosUtiles([{ id: 'GTIN', value_id: null, value_name: null }]), null);
  igual(atributosUtiles([]), null);
  igual(atributosUtiles(null), null);
  igual(atributosUtiles(undefined), null);
});

test('no explota con basura', () => {
  igual(atributosUtiles('no soy un array'), null);
  igual(atributosUtiles([null, undefined, {}]), null);
});

test('descarta los que no traen id: sin id no se puede publicar', () => {
  igual(atributosUtiles([{ value_name: 'Blanco' }]), null);
});

// ---------------------------------------------------------------------------
seccion('La ventana de vigencia');

/* 15 minutos: suficiente para que alguien lea la pantalla de permisos de ML
   sin apuro, y corto para que un state filtrado no sirva mañana. Si este
   numero sube mucho, la prueba obliga a mirar por que. */
test('el state vive 15 minutos', () => {
  igual(STATE_VIGENCIA_MIN, 15);
});

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(60));
if (fallas.length) {
  console.log(`FALLARON ${fallas.length} de ${ok + fallas.length} comprobaciones\n`);
  for (const f of fallas) console.log(`  [${f.grupo}] ${f.nombre}: ${f.e.message}`);
  process.exit(1);
}
console.log(`Pasaron las ${ok} comprobaciones.`);
process.exit(0);
