/* =====================================================================
   PRUEBAS DEL RESUMEN SEMANAL POR WHATSAPP AL PROVEEDOR

   Correr:   node test/informe-wa.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin red y sin base, igual que
   test/aviso-wa.test.js.

   QUE SE PRUEBA Y POR QUE
   Las tres funciones puras de api/notificar-mensaje.js que deciden CUANDO,
   A QUIEN y QUE dice el resumen. El envio no se prueba: habla con Meta y con
   Supabase, y una prueba que finge las dos termina probando los fingidos.

   La razon de existir de este archivo es que los dos errores posibles son
   invisibles desde la pantalla y caros:

     1. Mandarle el resumen a alguien que se dio de baja. No se deshace, y a
        Meta le baja la calificacion de calidad del numero (que ya fue
        restringido una vez).
     2. Mandar un numero flojo. Un "lo contactaron 0 personas" es un mensaje
        PAGO que argumenta en contra de EmprendeGO.
   ===================================================================== */
'use strict';

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
function mismos(lista, ids, msg) {
  const vino = lista.map(p => p.id).join(',');
  if (vino !== ids.join(',')) {
    throw new Error((msg || 'lista distinta') + ': esperaba [' + ids.join(',') + '] y vino [' + vino + ']');
  }
}

function prov(id, extra) {
  return Object.assign({
    id, nombre: 'Proveedor ' + id, rubro: 'Bazar',
    whatsapp: '5491139295591', notif_wa: true, notif_informe: true
  }, extra || {});
}

// Map(id -> contactos) a partir de un objeto, para no repetir new Map(...).
const cuentas = o => new Map(Object.entries(o));

async function main() {
  const api = await import('../api/notificar-mensaje.js');
  const { lunesDeLaSemanaAR, elegirParaInforme, textoInforme } = api;

  /* =================================================================== */
  seccion('La semana: es la mitad del anti-duplicado');

  test('un lunes devuelve ese mismo lunes', () => {
    // 2026-08-31 fue lunes. 15:00 UTC son las 12:00 en Argentina.
    igual(lunesDeLaSemanaAR(new Date('2026-08-31T15:00:00Z')), '2026-08-31');
  });

  test('un jueves devuelve el lunes anterior', () => {
    igual(lunesDeLaSemanaAR(new Date('2026-09-03T15:00:00Z')), '2026-08-31');
  });

  test('un domingo devuelve el lunes anterior, no el de mañana', () => {
    igual(lunesDeLaSemanaAR(new Date('2026-09-06T15:00:00Z')), '2026-08-31');
  });

  /* El caso que rompe si alguien usa getDay() local en vez de correr la hora:
     el servidor de Vercel esta en UTC, donde a las 01:00 del lunes ya es
     lunes, pero en Argentina (UTC-3) todavia son las 22:00 del domingo. Si
     las dos corridas de un mismo lunes argentino calcularan semanas
     distintas, el indice unico no las frenaria y el proveedor recibiria DOS
     resumenes. */
  test('lunes 01:00 UTC todavia es la semana anterior en Argentina', () => {
    igual(lunesDeLaSemanaAR(new Date('2026-08-31T01:00:00Z')), '2026-08-24');
  });

  test('lunes 04:00 UTC ya es lunes en Argentina', () => {
    igual(lunesDeLaSemanaAR(new Date('2026-08-31T04:00:00Z')), '2026-08-31');
  });

  test('dos momentos del mismo lunes argentino dan la misma semana', () => {
    const a = lunesDeLaSemanaAR(new Date('2026-08-31T13:00:00Z'));
    const b = lunesDeLaSemanaAR(new Date('2026-08-31T23:59:00Z'));
    igual(a, b, 'dos corridas del mismo dia tienen que chocar contra el indice unico');
  });

  /* =================================================================== */
  seccion('El piso: nunca mandar un numero flojo');

  test('con 3 contactos entra', () => {
    const r = elegirParaInforme([prov('a')], cuentas({ a: 3 }), new Set());
    mismos(r, ['a']);
  });

  /* Si alguien baja el piso, esta prueba se cae y lo obliga a mirar por que
     estaba en 3. Mismo criterio que el 8 de WA_LIMITE_DESTINATARIOS en
     test/aviso-wa.test.js. */
  test('con 2 contactos NO entra: el piso es 3 y esta puesto a proposito', () => {
    const r = elegirParaInforme([prov('a')], cuentas({ a: 2 }), new Set());
    igual(r.length, 0);
  });

  test('con 0 contactos no entra (es el caso que argumenta en contra)', () => {
    const r = elegirParaInforme([prov('a')], cuentas({}), new Set());
    igual(r.length, 0);
  });

  /* =================================================================== */
  seccion('Las bajas: mandarle a quien dijo que no es lo que quema el numero');

  test('notif_informe en false queda afuera', () => {
    const r = elegirParaInforme([prov('a', { notif_informe: false })], cuentas({ a: 40 }), new Set());
    igual(r.length, 0);
  });

  /* El que apago los avisos de pedidos dijo "no me mandes WhatsApp", no "no
     me mandes esa categoria". Aprovechar la distincion seria abusar de una
     letra chica que el proveedor nunca leyo. */
  test('notif_wa en false tambien apaga el resumen, aunque notif_informe siga en true', () => {
    const r = elegirParaInforme([prov('a', { notif_wa: false })], cuentas({ a: 40 }), new Set());
    igual(r.length, 0);
  });

  test('un telefono que no se puede mandar queda afuera y no rompe la tanda', () => {
    const lista = [prov('a', { whatsapp: '11 3929-5591' }), prov('b')];
    const r = elegirParaInforme(lista, cuentas({ a: 40, b: 5 }), new Set());
    mismos(r, ['b'], 'el que no tiene codigo de pais no se adivina, se saltea');
  });

  test('el que ya recibio el de esta semana no vuelve a recibirlo', () => {
    const r = elegirParaInforme([prov('a'), prov('b')], cuentas({ a: 40, b: 30 }), new Set(['a']));
    mismos(r, ['b']);
  });

  test('sin proveedores no explota', () => {
    igual(elegirParaInforme(null, null, null).length, 0);
  });

  /* =================================================================== */
  seccion('El orden: si la tanda se corta, primero los numeros que convencen');

  test('ordena por cantidad de contactos, de mayor a menor', () => {
    const lista = [prov('a'), prov('b'), prov('c')];
    const r = elegirParaInforme(lista, cuentas({ a: 5, b: 140, c: 30 }), new Set());
    mismos(r, ['b', 'c', 'a']);
  });

  test('empate: desempate estable por id, para que dos corridas den lo mismo', () => {
    const r1 = elegirParaInforme([prov('b'), prov('a')], cuentas({ a: 10, b: 10 }), new Set());
    const r2 = elegirParaInforme([prov('a'), prov('b')], cuentas({ a: 10, b: 10 }), new Set());
    mismos(r1, ['a', 'b']);
    mismos(r2, ['a', 'b']);
  });

  /* =================================================================== */
  seccion('El texto: ningun parametro vacio y ningun cero');

  /* Un parametro vacio hace fallar el envio ENTERO con un 131008 de Meta, no
     solo esa linea. Y un cero es la mala noticia que este mensaje no da. */
  test('sin intentos de catalogo, la segunda linea dice donde aparece (no dice 0)', () => {
    const t = textoInforme(prov('a', { rubro: 'Bazar, Juguetería' }), 12, 0, true);
    asegurar(t.linea2.length > 0, 'la linea nunca puede venir vacia');
    asegurar(!/\b0\b/.test(t.linea2), 'no puede aparecer un cero: vino "' + t.linea2 + '"');
    asegurar(t.linea2.includes('Bazar'), 'tiene que nombrar el rubro real');
  });

  test('sin rubro cargado igual sale una linea, no un vacio', () => {
    const t = textoInforme({ id: 'a', nombre: 'X', rubro: '' }, 12, 0, true);
    asegurar(t.linea2.trim().length > 0, 'vino vacia y eso tira el envio entero');
  });

  test('con un solo intento de catalogo va en singular', () => {
    const t = textoInforme(prov('a'), 12, 1, true);
    asegurar(t.linea2.includes('una persona'), 'vino: ' + t.linea2);
  });

  test('con varios intentos va en plural y con el numero', () => {
    const t = textoInforme(prov('a'), 12, 23, true);
    asegurar(t.linea2.includes('23'), 'vino: ' + t.linea2);
    asegurar(t.linea2.includes('personas'), 'vino: ' + t.linea2);
  });

  test('los contactos viajan como texto: un numero pelado no es un parametro valido', () => {
    igual(textoInforme(prov('a'), 12, 0, true).contactos, '12');
  });

  /* Al 2026-09-01 hay 121 perfiles aprobados sin un solo producto que igual
     reciben contactos. Para esos, "mire su panel" no es la accion util. */
  test('sin catalogo, el link deja al proveedor parado en la pantalla de carga', () => {
    const t = textoInforme(prov('a'), 12, 4, false);
    igual(t.destino, 'cargar');
    asegurar(/[Cc]argue/.test(t.accion), 'la accion tiene que pedir el catalogo: ' + t.accion);
  });

  test('con catalogo, el link va al panel', () => {
    igual(textoInforme(prov('a'), 12, 4, true).destino, 'perfil');
  });

  /* La plantilla aprobada en Meta no tiene signos de exclamacion: si el texto
     suena promocional, Meta lo reclasifica de "utility" a "marketing" y en
     Argentina el mensaje pasa de USD 0,012 a USD 0,0618. Cinco veces mas caro,
     todas las semanas. */
  test('ninguna linea variable mete signos de exclamacion', () => {
    for (const conCat of [true, false]) {
      for (const conProd of [true, false]) {
        const t = textoInforme(prov('a'), 12, conCat ? 5 : 0, conProd);
        asegurar(!/[!¡]/.test(t.linea2 + t.accion),
          'aparecio una exclamacion: ' + t.linea2 + ' / ' + t.accion);
      }
    }
  });

  /* Meta rechaza el envio entero (131008) si un parametro trae saltos de
     linea, tabs o 4 espacios seguidos. Las lineas variables se arman aca. */
  test('ninguna linea variable trae saltos de linea ni tabs', () => {
    const t = textoInforme(prov('a', { rubro: 'Bazar\ny\tDeco' }), 12, 0, true);
    asegurar(!/[\r\n\t]/.test(t.linea2), 'vino con blancos prohibidos: ' + JSON.stringify(t.linea2));
  });

  /* =================================================================== */
  console.log('\n' + '='.repeat(60));
  if (fallas.length) {
    console.log(`FALLARON ${fallas.length} de ${ok + fallas.length}`);
    fallas.forEach(f => console.log(`  - [${f.grupo}] ${f.nombre}`));
    process.exit(1);
  }
  console.log(`PASARON las ${ok} comprobaciones`);
}

main().catch(e => { console.error(e); process.exit(1); });
