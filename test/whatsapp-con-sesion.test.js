/* =====================================================================
   EL TELÉFONO DEL PROVEEDOR YA NO ES PÚBLICO

   Correr:  node test/whatsapp-con-sesion.test.js

   POR QUE EXISTE
   Hasta el 2026-10-01 `proveedores.whatsapp` viajaba en la respuesta
   publica: /api/catalogo lo pedia en COLS y cargarProveedores() lo traia
   en su select. Con UN pedido HTTP, sin cuenta, se bajaba la lista entera
   de proveedores con sus telefonos.

   La decision de Abraham fue: para ver el WhatsApp hay que tener sesion
   (no hace falta ser Pro). El permiso se cerro en la base
   (sql/2026-10-01_whatsapp_con_sesion.sql) y el frontend pasa a pedir el
   numero de a uno.

   ⚠️ LO QUE ESTAS PRUEBAS CUIDAN DE VERDAD es que ninguna consulta vuelva
   a MENCIONAR la columna. No es una cuestion de elegancia: PostgREST, si le
   pedis una columna sin permiso, NO devuelve el resto de la fila, falla la
   consulta ENTERA con 403. Eso ya paso en produccion ese mismo dia: el
   catalogo devolvio 502 y la app quedo sin un solo producto. Es el mismo
   sintoma que project_rls_referencia_columna_revocada.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
const catalogo = fs.readFileSync(path.join(RAIZ, 'api', 'catalogo.js'), 'utf8');

let ok = 0, fallas = 0;
function comprobar(nombre, condicion) {
  if (condicion) { ok++; console.log('  ok   ' + nombre); }
  else { fallas++; console.log('  FALLA ' + nombre); }
}

console.log('\n1) Ninguna consulta pide la columna revocada\n');

// Esto es lo que tiro el catalogo abajo. Si vuelve, vuelve el 502.
comprobar('el catálogo público no pide whatsapp',
  !/select=[^'"`]*whatsapp/.test(catalogo) && !/proveedores\([^)]*whatsapp/.test(catalogo));

// ⚠️ SOLO LAS CONSULTAS ANONIMAS. `authenticated` CONSERVA la columna a
// proposito: el proveedor tiene que poder ver y editar su propio numero, y lo
// hace desde checkSession(). Esa consulta puede nombrarla sin romper nada.
const conWa = (app.match(/\.from\('proveedores'\)\.select\('[^']*'\)/g) || [])
  .filter(s => s.includes('whatsapp'));
// Queda UNA sola, y es la de checkSession(): el proveedor leyendo su propia
// ficha, con sesión. Si alguna vez son dos, es que el teléfono volvió a una
// consulta anónima y el catálogo va a devolver 502 otra vez.
comprobar('sólo la consulta del propio proveedor menciona whatsapp', conWa.length === 1);
comprobar('y esa es la de la sesión, no la del catálogo',
  conWa.length === 1 && conWa[0].includes('plan_desde'));

console.log('\n2) El número se pide de a uno y con sesión\n');

comprobar('existe la única puerta', /async function pedirWhatsapp\(provId\)/.test(app));
comprobar('usa la RPC y no la tabla',
  /sb\.rpc\('whatsapp_de_proveedor', \{ p_proveedor_id: provId \}\)/.test(app));

// Sin esto, "hay que estar logueado" no se cumple del lado del navegador.
comprobar('sin sesión no la llama y manda a iniciar sesión',
  /if \(!currentUser\) \{ showToast\('Iniciá sesión para ver el WhatsApp'\); goTo\('perfil'\); return null; \}/.test(app));

// Los tres motivos que devuelve la RPC tienen que decirle algo al usuario.
comprobar('explica qué pasó cuando falta confirmar el email', /Confirmá tu email para ver el WhatsApp/.test(app));
comprobar('y cuando se pidieron demasiados seguidos', /Pediste muchos contactos seguidos/.test(app));

console.log('\n3) El número no se guarda en ningún lado\n');

// ⚠️ Guardarlo reconstruiría la lista que se acaba de desarmar: alcanzaría
// con recorrer las fichas una vez para volver a tenerlas todas juntas.
comprobar('no vuelve a entrar en proveedoresDB',
  !/whatsapp: p\.whatsapp/.test(app));
comprobar('no queda en el almacenamiento del navegador',
  !/(localStorage|sessionStorage)\.setItem\([^)]*wa/i.test(app));

console.log('\n4) Las dos vías de contacto pasan por la puerta\n');

comprobar('la tarjeta pide el número antes de abrir WhatsApp',
  /async function waDesdeTarjeta\(d\)[\s\S]{0,400}await pedirWhatsapp\(d\.pid\)/.test(app));
comprobar('la ficha también',
  /async function detWA\(\)[\s\S]{0,400}await pedirWhatsapp\(provActual\.id\)/.test(app));

// Un enlace fijo a wa.me no se puede armar sin el número: si alguien lo
// reintroduce, es que volvió a tener el dato en el navegador.
// ⚠️ Se excluye comprador_whatsapp: ese es el teléfono DEL COMPRADOR dentro de
// un pedido, vive en otra tabla y esta migración no lo tocó.
const enlaces = (app.match(/href="https:\/\/wa\.me\/\$\{[^}]*\}/g) || [])
  .filter(l => !l.includes('comprador_whatsapp'));
comprobar('no quedó ningún enlace directo armado con el número del proveedor',
  enlaces.length === 0);

console.log('\n' + '='.repeat(60));
if (fallas) { console.log(`${fallas} FALLAS sobre ${ok + fallas} comprobaciones`); process.exit(1); }
console.log(`${ok} comprobaciones, todas en verde`);
