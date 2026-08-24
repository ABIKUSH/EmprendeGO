/* =====================================================================
   PRUEBAS DEL AVISO POR WHATSAPP AL PROVEEDOR

   Correr:   node test/aviso-wa.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias, igual que
   test/cotizaciones.test.js.

   QUE SE PRUEBA Y POR QUE
   Solo las tres funciones puras de api/notificar-mensaje.js que deciden A
   QUIEN se le manda y QUE dice, mas el matcher de rubros de api/_rubros.js.
   No se prueba el envio en si: eso habla con Meta y con Supabase, y una
   prueba que finge las dos cosas termina probando los fingidos.

   La razon de existir de este archivo es que un error en elegirDestinatarios
   no se ve en pantalla: se ve como un WhatsApp que le llega a un proveedor
   al que no le tenia que llegar, y eso no se puede deshacer.
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

// Ayudas para armar proveedores sin repetir 8 campos en cada caso.
const hs = h => new Date(Date.now() - h * 3600 * 1000).toISOString();
function prov(id, extra) {
  return Object.assign({
    id, nombre: 'Proveedor ' + id, rubro: 'Bazar', provincia: 'CABA',
    whatsapp: '5491139295591', last_wa_at: null, notif_wa: true, rubros_seguidos: null
  }, extra || {});
}

async function main() {
  const api = await import('../api/notificar-mensaje.js');
  const rub = await import('../api/_rubros.js');
  const { elegirDestinatarios, normalizarWa, limpiarParam, textoPedido } = api;
  const { rubroCoincide, rubroEsCiego } = rub;

  /* =================================================================== */
  seccion('El telefono: mandar al numero equivocado es peor que no mandar');

  test('el formato que ya tienen los 150 aprobados pasa tal cual', () => {
    igual(normalizarWa('5491139295591'), '5491139295591');
  });

  test('se le sacan el mas, los espacios y los guiones', () => {
    igual(normalizarWa('+54 9 11 3929-5591'), '5491139295591');
  });

  test('un numero sin codigo de pais NO se completa a mano, se descarta', () => {
    igual(normalizarWa('1139295591'), null);
  });

  test('un numero de otro pais se descarta', () => {
    igual(normalizarWa('5511999999999'), null, 'Brasil no tendria que pasar');
  });

  test('vacio, nulo o texto se descartan sin explotar', () => {
    igual(normalizarWa(''), null);
    igual(normalizarWa(null), null);
    igual(normalizarWa(undefined), null);
    igual(normalizarWa('no tengo'), null);
  });

  test('un 54 suelto o demasiado largo no pasa', () => {
    igual(normalizarWa('54'), null);
    igual(normalizarWa('549113929559100'), null);
  });

  /* =================================================================== */
  seccion('El texto del mensaje: Meta rechaza el envio entero por un salto de linea');

  test('los saltos de linea del titulo se vuelven espacios', () => {
    igual(limpiarParam('remeras\nlisas\r\nblancas'), 'remeras lisas blancas');
  });

  test('los espacios seguidos se colapsan (4 seguidos son un 131008)', () => {
    igual(limpiarParam('remeras     lisas'), 'remeras lisas');
  });

  test('los tabs tambien', () => {
    igual(limpiarParam('remeras\t\tlisas'), 'remeras lisas');
  });

  test('un campo vacio sale como guion y no como cadena vacia', () => {
    igual(limpiarParam(''), '-', 'un parametro vacio hace fallar el envio');
    igual(limpiarParam(null), '-');
    igual(limpiarParam('   '), '-');
  });

  test('se corta al largo pedido', () => {
    igual(limpiarParam('abcdefghij', 4), 'abcd');
  });

  /* =================================================================== */
  seccion('Las dos clases de pedido tienen que servirse con la MISMA plantilla');

  test('pedido de producto: va el titulo y la cantidad con su unidad', () => {
    const r = textoPedido({ titulo: 'Vasos de vidrio', cantidad: '200', unidad: 'unidades' });
    igual(r.linea, 'Vasos de vidrio');
    igual(r.cantidad, '200 unidades');
  });

  test('pedido de producto sin cantidad cargada: "a convenir"', () => {
    const r = textoPedido({ titulo: 'Vasos de vidrio' });
    igual(r.linea, 'Vasos de vidrio');
    igual(r.cantidad, 'a convenir');
  });

  test('pedido de proveedor: manda la LISTA de productos, no el titulo generico', () => {
    // El titulo de un pedido B lo arma el formulario y no dice nada que el
    // rubro no haya dicho ya en la linea de arriba del mensaje.
    const r = textoPedido({
      titulo: 'Busco proveedor de Indumentaria', tipo: 'proveedor',
      productos: ['Ropa mujer', 'Deportiva', 'Accesorios de moda']
    });
    igual(r.linea, 'Ropa mujer, Deportiva, Accesorios de moda');
    igual(r.cantidad, '3 productos');
    asegurar(!/Busco proveedor/.test(r.linea), 'el titulo generico no tiene que aparecer');
  });

  test('pedido de proveedor con un solo producto: singular', () => {
    const r = textoPedido({ titulo: 'Busco proveedor de Otro', productos: ['Gorras jordan'] });
    igual(r.linea, 'Gorras jordan');
    igual(r.cantidad, '1 producto');
  });

  test('productos con basura adentro no rompen ni ensucian la linea', () => {
    const r = textoPedido({ titulo: 'x', productos: ['Gorras', '', null, 42, {}, '  Buzos  '] });
    igual(r.linea, 'Gorras, Buzos');
    igual(r.cantidad, '2 productos');
  });

  test('un pedido sin nada no devuelve vacio en la cantidad', () => {
    // Un parametro vacio hace fallar el envio entero contra Meta.
    const r = textoPedido({});
    igual(r.cantidad, 'a convenir');
    igual(limpiarParam(r.linea), '-');
  });

  /* =================================================================== */
  seccion('El rubro es filtro duro');

  test('coincide por nombre exacto', () => {
    asegurar(rubroCoincide('Bazar', 'Bazar'));
  });

  test('coincide con un nombre viejo guardado en la base', () => {
    asegurar(rubroCoincide('Moda', 'Indumentaria'), 'Moda es Indumentaria');
    asegurar(rubroCoincide('Zapatillas', 'Calzado'), 'Zapatillas es Calzado');
  });

  test('coincide dentro de una lista separada por comas', () => {
    asegurar(rubroCoincide('Indumentaria, Textil y Telas, Bazar', 'Bazar'));
  });

  test('un rubro que no esta en la lista NO coincide', () => {
    asegurar(!rubroCoincide('Indumentaria, Bazar', 'Ferretería'));
  });

  test('un proveedor SIN rubro cargado no coincide con nada', () => {
    // A diferencia de matchesCat() en app.js, que devuelve true con rubro
    // vacio para el filtro "Todas" del directorio. Aca eso seria mandarle un
    // WhatsApp a alguien porque no sabemos que vende.
    asegurar(!rubroCoincide('', 'Bazar'));
    asegurar(!rubroCoincide(null, 'Bazar'));
  });

  test('"Otro" y "Otros" son rubros ciegos; un rubro de verdad no', () => {
    asegurar(rubroEsCiego('Otro'));
    asegurar(rubroEsCiego('Otros'));
    asegurar(rubroEsCiego(''));
    asegurar(!rubroEsCiego('Bazar'));
  });

  /* =================================================================== */
  seccion('A quien se le manda');

  test('solo los del rubro del pedido', () => {
    const r = elegirDestinatarios([
      prov('a', { rubro: 'Bazar' }),
      prov('b', { rubro: 'Ferretería' }),
      prov('c', { rubro: 'Indumentaria, Bazar' })
    ], 'Bazar', null);
    mismos(r, ['a', 'c']);
  });

  test('el que se dio de baja no recibe nada', () => {
    const r = elegirDestinatarios([
      prov('a'), prov('b', { notif_wa: false })
    ], 'Bazar', null);
    mismos(r, ['a']);
  });

  test('el que no tiene un WhatsApp usable queda afuera', () => {
    const r = elegirDestinatarios([
      prov('a'), prov('b', { whatsapp: '' }), prov('c', { whatsapp: '1139295591' })
    ], 'Bazar', null);
    mismos(r, ['a']);
  });

  test('el enfriamiento de 24 h se respeta', () => {
    const r = elegirDestinatarios([
      prov('a', { last_wa_at: hs(2) }),    // recibio hace 2 h -> no
      prov('b', { last_wa_at: hs(30) }),   // hace 30 h -> si
      prov('c', { last_wa_at: null })      // nunca -> si
    ], 'Bazar', null);
    asegurar(r.every(p => p.id !== 'a'), 'el que recibio hace 2 h no tiene que estar');
    igual(r.length, 2);
  });

  test('justo antes de las 24 h todavia NO, justo despues SI', () => {
    const casi = elegirDestinatarios([prov('a', { last_wa_at: hs(23.5) })], 'Bazar', null);
    igual(casi.length, 0, 'a las 23:30 todavia esta enfriando');
    const pasado = elegirDestinatarios([prov('a', { last_wa_at: hs(24.5) })], 'Bazar', null);
    igual(pasado.length, 1, 'a las 24:30 ya puede recibir');
  });

  /* =================================================================== */
  seccion('rubros_seguidos manda sobre el rubro del registro');

  test('si eligio rubros, solo esos cuentan', () => {
    const r = elegirDestinatarios([
      // Vende bazar pero pidio seguir solo Ferreteria: no le interesa este pedido.
      prov('a', { rubro: 'Bazar', rubros_seguidos: ['Ferretería'] }),
      prov('b', { rubro: 'Bazar', rubros_seguidos: ['Bazar'] })
    ], 'Bazar', null);
    mismos(r, ['b']);
  });

  test('si sigue un rubro que NO vende, igual le llega', () => {
    // Es la gracia de rubros_seguidos: elegir a que prestarle atencion de
    // ahora en mas, no describir lo que ya vende.
    const r = elegirDestinatarios([
      prov('a', { rubro: 'Ferretería', rubros_seguidos: ['Bazar'] })
    ], 'Bazar', null);
    mismos(r, ['a']);
  });

  test('sin rubros elegidos (null o lista vacia) se usa el rubro del registro', () => {
    const r = elegirDestinatarios([
      prov('a', { rubro: 'Bazar', rubros_seguidos: null }),
      prov('b', { rubro: 'Bazar', rubros_seguidos: [] })
    ], 'Bazar', null);
    mismos(r, ['a', 'b']);
  });

  /* =================================================================== */
  seccion('En que orden, cuando hay mas candidatos que lugares');

  test('la provincia del comprador va primero, pero NO excluye al resto', () => {
    const r = elegirDestinatarios([
      prov('lejos', { provincia: 'CABA' }),
      prov('cerca', { provincia: 'Córdoba' })
    ], 'Bazar', 'Córdoba');
    mismos(r, ['cerca', 'lejos'], 'el de Cordoba primero y el de CABA tambien va');
  });

  test('a igual provincia, primero el que hace mas que no recibe uno', () => {
    const r = elegirDestinatarios([
      prov('reciente', { last_wa_at: hs(25) }),
      prov('nunca', { last_wa_at: null }),
      prov('viejo', { last_wa_at: hs(200) })
    ], 'Bazar', null);
    mismos(r, ['nunca', 'viejo', 'reciente']);
  });

  test('nunca se pasa de 25 destinatarios', () => {
    const muchos = [];
    for (let i = 0; i < 40; i++) muchos.push(prov('p' + String(i).padStart(2, '0')));
    igual(elegirDestinatarios(muchos, 'Bazar', null).length, 25);
  });

  test('dos corridas con los mismos datos dan el mismo orden', () => {
    // Sin esto, dos llamadas simultaneas elegirian dos subconjuntos distintos
    // de 25 y entre las dos le mandarian a mas gente de la que corresponde.
    const lista = [prov('c'), prov('a'), prov('b')];
    const una = elegirDestinatarios(lista, 'Bazar', null).map(p => p.id).join(',');
    const otra = elegirDestinatarios(lista, 'Bazar', null).map(p => p.id).join(',');
    igual(una, otra);
    igual(una, 'a,b,c', 'a igualdad de todo, se ordena por id');
  });

  /* =================================================================== */
  seccion('Casos borde que no tienen que explotar');

  test('una lista vacia o nula devuelve lista vacia', () => {
    igual(elegirDestinatarios([], 'Bazar', null).length, 0);
    igual(elegirDestinatarios(null, 'Bazar', null).length, 0);
  });

  test('filas rotas en el medio no cortan la seleccion', () => {
    const r = elegirDestinatarios([null, prov('a'), undefined, {}], 'Bazar', null);
    mismos(r, ['a']);
  });

  test('sin rubro no se elige a nadie', () => {
    igual(elegirDestinatarios([prov('a')], '', null).length, 0);
  });

  /* =================================================================== */
  console.log('\n' + '='.repeat(60));
  if (fallas.length) {
    console.log(fallas.length + ' FALLA(S) de ' + (ok + fallas.length) + ' comprobaciones\n');
    fallas.forEach(f => console.log('  [' + f.grupo + '] ' + f.nombre));
    process.exit(1);
  }
  console.log(ok + ' comprobaciones, todas en verde');
}

main().catch(e => { console.error(e); process.exit(1); });
