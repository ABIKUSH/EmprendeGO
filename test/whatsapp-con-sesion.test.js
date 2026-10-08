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

/* ---------------------------------------------------------------------
   5) UNA FUNCIÓN QUE ESCRIBE NO PUEDE SER STABLE

   ⚠️ ESTO NO ES UNA PRECAUCIÓN, ES UNA CICATRIZ. `whatsapp_de_proveedor()`
   nació el 2026-10-01 declarada STABLE y con un INSERT adentro. PostgreSQL
   no deja escribir desde una función no volátil: la corta con
     ERROR: INSERT is not allowed in a non-volatile function
   y la tira SIEMPRE, en la primera llamada de cualquier persona.

   Resultado: del 1 al 8 de octubre NADIE pudo obtener un número de
   WhatsApp. Siete días. ~245 contactos perdidos, que es exactamente la
   mercadería que esta aplicación entrega. El evento `contact_whatsapp` de
   GA4 venía con ~35 por día y se cortó seco; `contactos_revelados` quedó
   con cero filas. Lo encontró el founder mirando la pantalla, no una
   prueba.

   POR QUÉ NINGUNA PRUEBA LO VIO, que es lo que esta sección arregla:
     . Las de arriba leen js/app.js y api/catalogo.js. El error estaba en
       el SQL, que hasta hoy no lo miraba nadie.
     . `permisos-publicos.test.js` pregunta qué se puede leer SIN sesión.
       Esta función exige sesión: contestaba `sin_sesion` -lo correcto- y
       nunca llegaba al INSERT que rompe.
     . El frente envuelve todo en un catch y muestra un cartel gris, así
       que la falla no dejó rastro en ningún lado.

   La comprobación es tosca a propósito: lee los .sql del repo y busca
   funciones declaradas stable o immutable que escriban. No entiende SQL,
   y no hace falta: el error que nos costó la semana se ve a simple vista.
   --------------------------------------------------------------------- */
console.log('\n5) Ninguna función del repo escribe siendo STABLE\n');

const dirSql = path.join(RAIZ, 'sql');
const archivosSql = fs.existsSync(dirSql) ? fs.readdirSync(dirSql).filter(n => n.endsWith('.sql')) : [];
comprobar('hay migraciones que revisar', archivosSql.length > 0);

// ⚠️ GANA LA ÚLTIMA DEFINICIÓN DE CADA FUNCIÓN, no cada archivo por separado.
// Los .sql son el registro de lo que se aplicó, en orden, y `create or replace`
// hace que la última pise a las anteriores: la migración de hoy declara volátil
// la misma función que la del 1 de octubre declaró stable. Revisar archivo por
// archivo dejaría esta prueba en rojo para siempre por un error ya corregido, y
// una prueba que siempre falla es una prueba que nadie mira. Los nombres de
// archivo empiezan con la fecha, así que ordenarlos alfabéticamente los ordena
// cronológicamente.
const ultimaDefinicion = new Map();
for (const nombre of [...archivosSql].sort()) {
  const sql = fs.readFileSync(path.join(dirSql, nombre), 'utf8');
  // Cada cuerpo de función, entre `create ... function` y el `$$;` que lo cierra.
  const cuerpos = sql.match(/create\s+(or\s+replace\s+)?function[\s\S]*?\$function\$;|create\s+(or\s+replace\s+)?function[\s\S]*?\$\$;/gi) || [];
  for (const cuerpo of cuerpos) {
    const quien = (cuerpo.match(/function\s+([\w.]+)\s*\(/i) || [, '?'])[1];
    ultimaDefinicion.set(quien, { archivo: nombre, cuerpo });
  }
}

const culpables = [];
for (const [quien, { archivo, cuerpo }] of ultimaDefinicion) {
  // La cabecera es lo que va hasta el `as $...$`; la volatilidad se declara ahí.
  const cabecera = cuerpo.split(/\bas\s+\$/i)[0] || '';
  const noVolatil = /\b(stable|immutable)\b/i.test(cabecera);
  const escribe = /\b(insert\s+into|update\s+\w|delete\s+from)\b/i.test(cuerpo);
  if (noVolatil && escribe) culpables.push(`${archivo} → ${quien}()`);
}
comprobar('ninguna función declarada stable/immutable hace insert, update o delete'
  + (culpables.length ? ': ' + culpables.join(', ') : ''), culpables.length === 0);

// Y la que nos mordió, nombrada, para que no vuelva por otro archivo.
const migracionDelArreglo = path.join(dirSql, '2026-10-08_whatsapp_volatile.sql');
comprobar('está la migración que la volvió volátil', fs.existsSync(migracionDelArreglo));
if (fs.existsSync(migracionDelArreglo)) {
  const arreglo = fs.readFileSync(migracionDelArreglo, 'utf8');
  comprobar('y declara volatile, no stable', /\bvolatile\s+security\s+definer\b/i.test(arreglo));
  comprobar('sin regalarle el permiso a anon', /revoke\s+all\s+on\s+function[\s\S]*?anon/i.test(arreglo));
}

console.log('\n' + '='.repeat(60));
if (fallas) { console.log(`${fallas} FALLAS sobre ${ok + fallas} comprobaciones`); process.exit(1); }
console.log(`${ok} comprobaciones, todas en verde`);
