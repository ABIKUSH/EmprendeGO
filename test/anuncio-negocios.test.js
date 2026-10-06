/* =====================================================================
   PRUEBAS DEL ANUNCIO POR MAIL DE EMPRENDEGO NEGOCIOS  (2026-10-06)

   Correr:   node test/anuncio-negocios.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias ni red ni base,
   igual que el resto de test/ (no hay package.json en este repo a proposito).

   POR QUE EXISTE ESTE ARCHIVO
   Esto le escribe a 1.575 personas reales. Es lo mas irreversible que hace
   el panel: un mail mandado no se puede desmandar, y un error no se nota
   hasta que ya salio. Tres cosas tienen que seguir siendo ciertas:

   1) EL CONTENIDO NUNCA VIAJA EN EL REQUEST. El panel manda un NOMBRE de
      campana contra una lista cerrada. Si alguna vez alguien acepta un
      asunto o un html del cliente, el endpoint pasa a ser un relay para
      spamear la base entera con sesion de admin robada.

   2) LA FILA SE RESERVA ANTES DE MANDAR. Es lo unico que impide el mail
      duplicado cuando hay dos pedidos simultaneos. Si se invierte el orden,
      el indice unico deja de arbitrar y la persona recibe dos veces.

   3) LA TANDA NO ARRANCA SOLA. No hay envio automatico en ningun lado: lo
      dispara una persona, con confirmacion, y se puede frenar.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(RAIZ, 'api', 'notificar-mensaje.js'), 'utf8');
const admin = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

let ok = 0, fallas = 0;
function comprobar(nombre, condicion) {
  if (condicion) { ok++; console.log('  ok   ' + nombre); }
  else { fallas++; console.log('  FALLA ' + nombre); }
}

console.log('\n1) La campana se elige de una lista cerrada\n');

comprobar('existe el registro de campanas', /const CAMPANAS = \{/.test(api));
comprobar('estan las dos campanas',
  /anuncio_cotizaciones:\s*\{/.test(api) && /anuncio_negocios:\s*\{/.test(api));

// ⚠️ SIN ESTE CHEQUEO EL ENDPOINT ACEPTA CUALQUIER CAMPANA y revienta al
// buscar la plantilla, o peor, manda la que no es.
comprobar('se valida contra la lista antes de usarla',
  /hasOwnProperty\.call\(CAMPANAS, campana\)/.test(api));
comprobar('y una campana desconocida se rechaza',
  /error: 'campana_invalida'/.test(api));

// Un panel viejo cacheado en el navegador de alguien no manda `campana`.
// Tiene que seguir mandando la campana que ESE panel conocia.
comprobar('sin campana cae en la de siempre, no en la nueva',
  /const CAMPANA_POR_DEFECTO = 'anuncio_cotizaciones';/.test(api) &&
  /req\.body\?\.campana \|\| CAMPANA_POR_DEFECTO/.test(api));

// ⚠️ LO MAS IMPORTANTE DE TODO EL ARCHIVO. El cuerpo del mail se arma SOLO
// desde la plantilla de la campana. Nada de lo que manda el cliente entra.
comprobar('el mail se arma desde la plantilla de la campana',
  /const mail = CAMPANAS\[campana\]\.plantilla\(usuario\.nombre, unsubUrl\);/.test(api));
comprobar('el request NO aporta asunto ni cuerpo',
  !/req\.body\?\.(asunto|subject|html|texto|cuerpo)/.test(api));

console.log('\n2) El anti-duplicado y los topes siguen en pie\n');

// La reserva va ANTES del fetch a Resend. Se compara por posicion dentro del
// handler: si alguien mueve el envio arriba de la reserva, esto se pone rojo.
// Se acota a handlerAnuncio a proposito -- el aviso de mensajes nuevos, mas
// arriba en el archivo, tambien le pega a Resend y confundiria la medicion.
const handler = api.slice(api.indexOf('async function handlerAnuncio('),
                          api.indexOf('PLANTILLA — anuncio de la seccion Pedidos'));
const posReserva = handler.indexOf('reserva = await reservarEnvio(');
const posEnvio = handler.indexOf("fetch('https://api.resend.com/emails'");
comprobar('la fila se reserva ANTES de mandar el mail',
  posReserva > 0 && posEnvio > 0 && posReserva < posEnvio);

comprobar('si no se pudo registrar, no se manda',
  /error: 'sin_registro'/.test(api));
comprobar('sigue el tope diario de 60', /const LIMITE_DIARIO = 60;/.test(api));
comprobar('sigue chequeando la baja antes de mandar', /error: 'baja'/.test(api));
comprobar('sigue exigiendo sesion de admin',
  /const adminEmail = await verificarAdmin\(req, serviceKey\);/.test(api) &&
  /error: 'no_autorizado'/.test(api));

// El tope de rafaga subio de 30 a 70 para que el panel no se frene solo.
// Que no vuelva a bajar sin querer, ni suba sin motivo.
comprobar('el tope de rafaga quedo en 70 por minuto',
  /bucket: 'anuncio', limit: 70, windowMs: 60000/.test(api));

console.log('\n3) La plantilla nueva\n');

comprobar('existe plantillaAnuncioNegocios', /function plantillaAnuncioNegocios\(/.test(api));
comprobar('apunta a negocios.emprendego.com.ar',
  /const cta = 'https:\/\/negocios\.emprendego\.com\.ar';/.test(api));
comprobar('va en HTML y en texto plano', /return \{ asunto, html, texto \};[\s\S]{0,40}\}\s*\n\s*\n\s*\/\* =+\n\s+AVISO POR WHATSAPP/.test(api));
comprobar('lleva el enlace de baja en el cuerpo', /plantillaAnuncioNegocios[\s\S]{0,6000}\$\{unsubUrl\}/.test(api));

// Regla de la casa: trato de usted y cero emojis en todo lo que ve el usuario.
const cuerpoNegocios = api.slice(api.indexOf('function plantillaAnuncioNegocios('),
                                 api.indexOf('AVISO POR WHATSAPP AL PROVEEDOR'));
comprobar('trata de usted, no tutea',
  /Le escribo desde EmprendeGO/.test(cuerpoNegocios) && !/\btu negocio\b|\bvos\b|\btenes\b/i.test(cuerpoNegocios));
comprobar('no tiene ni un emoji',
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/u.test(cuerpoNegocios));

// Decir que hay prueba gratis y que despues se paga es una decision, no un
// descuido: esconderlo hasta el final del embudo es lo que hace que la gente
// se de de baja de TODO.
comprobar('dice que la prueba es de 15 dias sin tarjeta',
  /15 d[ií]as de prueba, sin tarjeta/.test(cuerpoNegocios));
comprobar('y no esconde que despues se paga',
  /ah[ií] hablamos de cu[aá]nto sale/.test(cuerpoNegocios));

console.log('\n4) El panel: la tanda no arranca sola y se puede frenar\n');

comprobar('el panel apunta a la campana nueva',
  /const ANUNCIO_CAMPANA = 'anuncio_negocios';/.test(admin));
comprobar('y manda la campana en cada pedido',
  (admin.match(/campana: ANUNCIO_CAMPANA/g) || []).length === 2);

// ⚠️ NO ARRANCA SOLA. Si algun dia esto aparece dentro de un setInterval, de
// un onload o de cargarUsuarios, el panel pasa a mandar mails sin que nadie
// lo haya pedido.
comprobar('enviarTanda solo se dispara desde el boton',
  (admin.match(/enviarTanda\(\)/g) || []).length === 2 &&
  /onclick="enviarTanda\(\)"/.test(admin));
comprobar('pide confirmacion con el numero exacto',
  /Se van a enviar \$\{vanASalir\} mails/.test(admin));
comprobar('se puede detener', /function detenerTanda\(\)/.test(admin) && /if\(tandaCancelada\) break;/.test(admin));
comprobar('se corta sola a los 3 errores seguidos', /if\(seguidos >= 3\)\{/.test(admin));
comprobar('respeta el cupo que queda del dia',
  /const cupo = Math\.max\(0, ANUNCIO_LIMITE_DIARIO - anuncioEnviadosHoy\);/.test(admin) &&
  /pendientes\.slice\(0, cupo\)/.test(admin));
comprobar('y frena si el backend dice que se llego al tope',
  /j\.error === 'limite_diario'/.test(admin));

// La espera entre mails es lo que evita que el panel se coma su propio rate
// limit. A 1,5 s salen 40 por minuto contra un tope de 70.
comprobar('espera entre mail y mail', /const ANUNCIO_ESPERA_MS = 1500;/.test(admin));
comprobar('y la espera se usa de verdad',
  /await new Promise\(r => setTimeout\(r, ANUNCIO_ESPERA_MS\)\);/.test(admin));

// La tanda sale de la lista COMPLETA, no de las filas pintadas.
comprobar('la tanda usa la lista completa de usuarios',
  /usuariosCache = data \|\| \[\];/.test(admin) && /usuariosCache\.filter/.test(admin));
comprobar('y saltea a los que ya recibieron o se dieron de baja',
  /if\(anuncioLogs\.has\(u\.id\)\) return false;/.test(admin) &&
  /if\(anuncioBajas\.has\(email\)\) return false;/.test(admin));

console.log('\n' + '='.repeat(60));
if (fallas) { console.log(`${fallas} FALLAS sobre ${ok + fallas} comprobaciones`); process.exit(1); }
console.log(`${ok} comprobaciones, todas en verde`);
