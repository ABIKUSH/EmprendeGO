/* =====================================================================
   PRUEBAS DE PUBLICIDAD (fase 1)

   Correr:   node test/publicidad.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin red ni base.

   Dos partes:
   1) Las cuentas de js/publicidad.js, EJECUTADAS: fechas, cupo, primera
      fecha libre, total y destino. Son las que deciden si un anuncio entra
      y cuanto se cobra, asi que se corren de verdad, no se leen.
   2) Las reglas que no se pueden perder sin que nadie lo note, leidas del
      codigo: el sello "Publicidad", el rel="sponsored", que la app no lea
      datos de contacto y que el cupo lo cuide la base.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const P = require(path.join(RAIZ, 'js', 'publicidad.js'));

let ok = 0, fallas = 0;
function comprobar(nombre, condicion) {
  if (condicion) { ok++; console.log('  ok   ' + nombre); }
  else { fallas++; console.log('  FALLA ' + nombre); }
}
const igual = (nombre, real, esperado) =>
  comprobar(nombre + ' (' + JSON.stringify(real) + ')', JSON.stringify(real) === JSON.stringify(esperado));

console.log('\n1) Fechas\n');
igual('un mes desde el 1/12', P.pubSumarMeses('2026-12-01', 1), '2027-01-01');
igual('31/01 + 1 mes cae en el ultimo dia de febrero', P.pubSumarMeses('2027-01-31', 1), '2027-02-28');
igual('6 meses cruzando el año', P.pubSumarMeses('2026-11-19', 6), '2027-05-19');
igual('ultimo dia visible de [1/12, 1/1)', P.pubUltimoDia('2027-01-01'), '2026-12-31');
igual('hoy en Argentina a las 01:00 UTC sigue siendo ayer', P.pubHoyAR(new Date('2026-11-20T01:00:00Z')), '2026-11-19');
igual('hoy en Argentina a las 03:00 UTC ya es hoy', P.pubHoyAR(new Date('2026-11-20T03:00:00Z')), '2026-11-20');
igual('fecha para mostrar', P.pubFecha('2026-12-01'), '01/12/2026');

console.log('\n2) Estado visible (activo y vencido salen de la fecha, no se guardan)\n');
const ap = (i, f) => ({ estado: 'aprobado', inicia_el: i, termina_el: f });
igual('programado', P.pubEstadoVisible(ap('2026-12-01', '2027-01-01'), '2026-11-19'), 'programado');
igual('activo el primer dia', P.pubEstadoVisible(ap('2026-11-19', '2026-12-19'), '2026-11-19'), 'activo');
igual('vencido el dia de termina_el', P.pubEstadoVisible(ap('2026-10-19', '2026-11-19'), '2026-11-19'), 'vencido');
igual('cancelado sigue cancelado', P.pubEstadoVisible({ estado: 'cancelado', inicia_el: '2026-11-01', termina_el: '2026-12-01' }, '2026-11-19'), 'cancelado');

console.log('\n3) Cupo\n');
const o = (id, i, f, estado) => ({ id, estado: estado || 'aprobado', inicia_el: i, termina_el: f });
const uno = [o('a', '2026-11-01', '2026-12-01')];
comprobar('cupo 1: no entra encima de otro', !P.pubEntra(uno, 1, '2026-11-15', '2026-12-15'));
comprobar('cupo 1: entra el dia que el otro termina', P.pubEntra(uno, 1, '2026-12-01', '2027-01-01'));
comprobar('cupo 1: un cancelado no ocupa', P.pubEntra([o('a', '2026-11-01', '2026-12-01', 'cancelado')], 1, '2026-11-15', '2026-12-15'));
comprobar('cupo 1: un borrador no ocupa', P.pubEntra([o('a', '2026-11-01', '2026-12-01', 'borrador')], 1, '2026-11-15', '2026-12-15'));
comprobar('editar el mismo anuncio no choca consigo mismo', P.pubEntra(uno, 1, '2026-11-01', '2026-12-01', 'a'));
// Carrusel: enero y marzo nunca estan juntos. Uno de enero a abril se
// superpone con los dos, pero nunca hay mas de 2 a la vez.
const carrusel = [o('e', '2027-01-01', '2027-02-01'), o('m', '2027-03-01', '2027-04-01')];
igual('maximo a la vez, no cantidad que toca', P.pubMaxSolapamiento(carrusel, '2027-01-01', '2027-04-01'), 1);
comprobar('cupo 2: entra aunque toque a dos que no coinciden', P.pubEntra(carrusel, 2, '2027-01-01', '2027-04-01'));
const tres = [o('x', '2027-01-01', '2027-03-01'), o('y', '2027-01-15', '2027-03-01'), o('z', '2027-02-01', '2027-03-01')];
comprobar('cupo 3: no entra un cuarto donde ya hay tres', !P.pubEntra(tres, 3, '2027-02-10', '2027-03-10'));
comprobar('cupo 3: entra antes de que llegue el tercero', P.pubEntra(tres, 3, '2026-12-01', '2027-02-01'));

console.log('\n4) Primera fecha libre\n');
igual('espacio vacio: hoy', P.pubPrimeraFechaLibre([], 1, '2026-11-19', 1), '2026-11-19');
igual('ocupado: el dia que termina el actual', P.pubPrimeraFechaLibre(uno, 1, '2026-11-19', 1), '2026-12-01');
igual('encadenados: salta al final del segundo',
  P.pubPrimeraFechaLibre([o('a', '2026-11-01', '2026-12-01'), o('b', '2026-12-01', '2027-01-01')], 1, '2026-11-19', 1), '2027-01-01');
igual('hueco chico: 3 meses no entran en un hueco de 1',
  P.pubPrimeraFechaLibre([o('a', '2026-11-01', '2026-12-01'), o('b', '2027-01-01', '2027-02-01')], 1, '2026-11-19', 3), '2027-02-01');

console.log('\n5) Total\n');
igual('1 mes', P.pubTotal(45000, 1, 10, 20), 45000);
igual('3 meses con 10 %', P.pubTotal(45000, 3, 10, 20), 121500);
igual('6 meses con 20 %', P.pubTotal(30000, 6, 10, 20), 144000);
igual('sin descuento cargado', P.pubTotal(60000, 3, 0, 0), 180000);

console.log('\n6) Destino: solo https o WhatsApp\n');
igual('link normal', P.pubNormalizarDestino('https://envios.com.ar/promo').url, 'https://envios.com.ar/promo');
igual('www sin https se completa', P.pubNormalizarDestino('www.envios.com.ar').url, 'https://www.envios.com.ar/');
igual('celular argentino sin codigo', P.pubNormalizarDestino('11 5555-1234').url, 'https://wa.me/5491155551234');
igual('celular con +54 9', P.pubNormalizarDestino('+54 9 11 5555 1234').url, 'https://wa.me/5491155551234');
comprobar('javascript: rechazado', !!P.pubNormalizarDestino('javascript:alert(1)').error);
comprobar('http plano rechazado', !!P.pubNormalizarDestino('http://envios.com.ar').error);
comprobar('data: rechazado', !!P.pubNormalizarDestino('data:text/html,hola').error);
comprobar('vacio rechazado', !!P.pubNormalizarDestino('  ').error);
igual('dominio sin www', P.pubDominio('https://www.packly.com.ar/x'), 'packly.com.ar');
igual('WhatsApp se lee como WhatsApp', P.pubDominio('https://wa.me/5491155551234'), 'WhatsApp');
comprobar('la app no dibuja un destino inseguro', !P.pubDestinoSeguro('javascript:alert(1)') && P.pubDestinoSeguro('https://a.com'));

console.log('\n7) Reglas que viven en el codigo\n');
const pub = fs.readFileSync(path.join(RAIZ, 'js', 'publicidad.js'), 'utf8');
const app = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const adm = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(RAIZ, 'sql', '2026-11-19_publicidad_fase1.sql'), 'utf8');

comprobar('el sello dice "Publicidad"', />Publicidad<\/span>/.test(pub));
comprobar('los tres espacios llevan el sello', (pub.match(/sello\(\d+\)/g) || []).length >= 3);
comprobar('el link sale con rel="sponsored noopener noreferrer"', pub.includes('rel="sponsored noopener noreferrer"'));
comprobar('si la imagen falla, el anuncio se esconde', pub.includes('onerror=') && pub.includes("closest('[data-pub-caja]')"));
comprobar('la app lee por anuncios_vigentes(), no por la tabla', pub.includes("sb.rpc('anuncios_vigentes')") && !/from\('ad_orders'\)/.test(pub + app));
comprobar('index.html tiene el lugar del carrusel, oculto de entrada', /<div id="pub-inicio" style="display:none"><\/div>/.test(idx));
comprobar('index.html carga publicidad.js despues de app.js', idx.indexOf('<script src="js/publicidad.js') > idx.indexOf('<script src="js/app.js'));
comprobar('la grilla de Buscar pone la tarjeta en la posicion 3', /celdas\.splice\(2, 0, pub\)/.test(app));
comprobar('Novedades pone la tarjeta despues de la 4.a novedad real', /lista\.length >= 4 \? 5 : tarjetas\.length/.test(app));
comprobar('el panel tiene la seccion Publicidad', adm.includes('id="page-publicidad"') && adm.includes("showPage('publicidad'"));
comprobar('la pieza se sube con nombre irrepetible', /Math\.random\(\)\.toString\(36\)\.slice\(2\) \+ '_' \+ Date\.now\(\)/.test(adm));

console.log('\n8) La base\n');
const funcion = (sql.match(/create or replace function public\.anuncios_vigentes\(\)[\s\S]*?\$\$;/) || [''])[0];
comprobar('anuncios_vigentes() no devuelve contacto, whatsapp, email, monto ni token',
  funcion && !/whatsapp|email|contacto|monto|token/i.test(funcion.split('as $$')[1] || 'x'));
comprobar('vigente se calcula en hora argentina', funcion.includes("America/Argentina/Buenos_Aires"));
comprobar('ad_orders cerrada para anon', /revoke all on public\.ad_orders from anon, authenticated/.test(sql) && !/grant [^;]*on public\.ad_orders to anon/i.test(sql));
comprobar('el cupo lo controla un disparador con bloqueo', /for update/.test(sql) && /create trigger ad_orders_cupo/.test(sql));
comprobar('solo destinos https en la base', sql.includes("destino_url ~* '^https://"));
comprobar('un aprobado sin pieza no se puede guardar', sql.includes('ad_orders_aprobado_con_pieza'));
comprobar('el bucket NO se llama publicidad (lo bloquean los bloqueadores)', sql.includes("values ('vitrina'") && !sql.includes("values ('publicidad'") && adm.includes("const PUB_BUCKET = 'vitrina'") && !adm.includes("storage.from('publicidad')"));
comprobar('bucket con tope de 2 MB y solo JPG/PNG/WebP', sql.includes('2097152') && sql.includes("array['image/jpeg','image/png','image/webp']"));
comprobar('subir piezas: solo admin', /vitrina_subir_admin[\s\S]*?is_admin\(\)/.test(sql));

console.log(`\n${ok} ok, ${fallas} fallas\n`);
process.exit(fallas ? 1 : 0);
