/* =====================================================================
   PRUEBAS DEL AVISO POR WHATSAPP AL PROVEEDOR

   Correr:   node test/aviso-wa.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias, igual que
   test/cotizaciones.test.js.

   QUE SE PRUEBA Y POR QUE
   Solo las funciones puras de api/notificar-mensaje.js que deciden A QUIEN se
   le manda y QUE dice, mas el matcher de rubros de api/_rubros.js. No se
   prueba el envio en si: eso habla con Meta y con Supabase, y una prueba que
   finge las dos cosas termina probando los fingidos.

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
  const { elegirDestinatarios, normalizarWa, limpiarParam, textoPedido, numeroDePrueba, valoresDelEvento,
          esFalloNuestro, enHorarioComercial, horaArgentina } = api;

  /* Mapa de desempeño para el ranking: { id: [avisos_recibidos, cotizo] }.
     Es lo que en produccion arma cargarDesempeno() leyendo avisos_wa y
     cotizaciones. */
  const perf = o => new Map(Object.entries(o).map(([id, [recibidos, cotizo]]) => [id, { recibidos, cotizo }]));

  // Una fecha a la hora argentina que se pida (Argentina es UTC-3 fijo).
  const aHoraAR = (h, m) => new Date(Date.UTC(2026, 8, 8, h + 3, m || 0));
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
  seccion('El numero de desvio de las pruebas es mas permisivo que el de la base');

  test('acepta la forma vieja de 14 digitos, que normalizarWa rechaza', () => {
    // 54 11 15 6445 7134. Es como la guardo la lista de permitidos del numero
    // de prueba de Meta, y con la forma estandar rebota con un 131030.
    igual(numeroDePrueba('54111564457134'), '54111564457134');
    igual(normalizarWa('54111564457134'), null, 'normalizarWa sigue siendo estricta');
  });

  test('acepta tambien la forma estandar de 13 digitos', () => {
    igual(numeroDePrueba('5491164457134'), '5491164457134');
  });

  test('limpia separadores', () => {
    igual(numeroDePrueba('+54 11 15 6445-7134'), '54111564457134');
  });

  test('vacio o sin cargar devuelve null, o sea que no hay desvio', () => {
    igual(numeroDePrueba(''), null);
    igual(numeroDePrueba(undefined), null);
  });

  test('un dedazo corto no desvia los mensajes a cualquier lado', () => {
    igual(numeroDePrueba('549'), null);
    igual(numeroDePrueba('1'), null);
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
    igual(r.linea, 'Busca proveedor para: Ropa mujer, Deportiva, Accesorios de moda');
    asegurar(!/Busco proveedor de/.test(r.linea), 'el titulo generico no tiene que aparecer');
  });

  test('NUNCA un numero en la cantidad de un pedido de proveedor', () => {
    /* El bug que mas plata podia costar. Con "Cantidad: 2 productos" el
       proveedor entiende que le quieren comprar DOS PRENDAS, descarta el
       pedido por chico y no cotiza — justo en los pedidos mas grandes, que
       son los de alguien que quiere surtirse de dos lineas enteras. */
    const dos = textoPedido({ titulo: 'x', productos: ['Ropa hombre', 'Deportiva'] });
    igual(dos.cantidad, 'a convenir');
    asegurar(!/\d/.test(dos.cantidad), 'no puede haber ningun digito en la cantidad');

    const uno = textoPedido({ titulo: 'x', productos: ['Gorras jordan'] });
    igual(uno.linea, 'Busca proveedor para: Gorras jordan');
    igual(uno.cantidad, 'a convenir');
  });

  test('productos con basura adentro no rompen ni ensucian la linea', () => {
    const r = textoPedido({ titulo: 'x', productos: ['Gorras', '', null, 42, {}, '  Buzos  '] });
    igual(r.linea, 'Busca proveedor para: Gorras, Buzos');
    igual(r.cantidad, 'a convenir');
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

  /* EL TOPE DIARIO POR PROVEEDOR.

     Estuvo en 1 cada 24 h y estaba mal: tiraba el segundo pedido del dia de
     cada rubro, o sea perdia ventas, para protegerse de un volumen que no
     existe (1,2 pedidos con aviso por dia repartidos en 17 rubros). Ahora son
     4 en ventana movil y funciona como cortacircuitos, no como filtro. */

  test('un proveedor que ya recibio 4 avisos hoy queda afuera', () => {
    const r = elegirDestinatarios(
      [prov('a'), prov('b')], 'Bazar', null,
      new Map([['a', 4]])
    );
    mismos(r, ['b'], 'el que llego al tope no tiene que estar');
  });

  test('con 3 avisos todavia entra: el cuarto se manda', () => {
    const r = elegirDestinatarios(
      [prov('a')], 'Bazar', null, new Map([['a', 3]])
    );
    igual(r.length, 1);
  });

  test('DOS pedidos del mismo rubro el mismo dia le llegan a la misma gente', () => {
    // Es lo que el tope viejo de 1 cada 24 h rompia, y por lo que se cambio.
    const lista = [prov('a'), prov('b')];
    const primero = elegirDestinatarios(lista, 'Bazar', null, new Map());
    const segundo = elegirDestinatarios(lista, 'Bazar', null, new Map([['a', 1], ['b', 1]]));
    mismos(primero, ['a', 'b']);
    mismos(segundo, ['a', 'b'], 'el segundo pedido del dia no puede quedarse sin nadie');
  });

  test('sin contador (llamada vieja) no se filtra a nadie por tope', () => {
    igual(elegirDestinatarios([prov('a')], 'Bazar', null).length, 1);
    igual(elegirDestinatarios([prov('a')], 'Bazar', null, null).length, 1);
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

  test('nunca se pasa del tope de destinatarios por pedido', () => {
    /* El numero va escrito a proposito y no leido de la constante: si alguien
       lo sube, esta prueba se pone roja y lo obliga a mirar por que. Es la
       unica cosa que limita cuanta gente recibe un mensaje de una sola vez, y
       el numero de EmprendeGO ya fue restringido una vez por mandar en masa.

       Arranco en 8 y se subio a 20 el 2026-09-08, con el embudo medido: 322
       avisos aceptados y 293 entregados sin una sola restriccion del numero.
       El techo sigue siendo 25, y esa distancia es a proposito: con 20,
       Indumentaria (35 aprobados) todavia deja gente afuera y el ranking por
       desempeño sigue teniendo algo que ordenar. */
    const muchos = [];
    for (let i = 0; i < 40; i++) muchos.push(prov('p' + String(i).padStart(2, '0')));
    igual(elegirDestinatarios(muchos, 'Bazar', null).length, 20);
  });

  /* =================================================================== */
  seccion('Ranking por desempeño: el que nunca cotiza no ocupa un lugar bueno');

  test('el que recibio 5 y nunca cotizo va al fondo', () => {
    const r = elegirDestinatarios(
      [prov('mudo'), prov('nuevo')], 'Bazar', null, null,
      perf({ mudo: [5, false] })
    );
    mismos(r, ['nuevo', 'mudo'], 'el que no contesta nunca va ultimo');
  });

  test('recibio muchos PERO cotizo alguna vez: no se lo penaliza', () => {
    /* La regla busca al que nunca dio señales de vida, no al que anda flojo.
       Este recibio mas avisos que nadie justamente porque es de un rubro
       pedido, y encima cotizo. */
    const r = elegirDestinatarios(
      [prov('activo', { last_wa_at: hs(1) }), prov('nuevo')], 'Bazar', null, null,
      perf({ activo: [30, true] })
    );
    mismos(r, ['nuevo', 'activo'], 'ordena por last_wa_at, no por castigo');
  });

  test('a los 12 avisos sin una sola cotizacion queda afuera', () => {
    // El caso real de EMA IMPORTADORA y Libreria Integral MAYA: 13 avisos
    // leidos, cero cotizaciones. Seguir escribiendoles es gastar un mensaje
    // pago y arriesgar que reporten el numero.
    const r = elegirDestinatarios(
      [prov('quemado'), prov('nuevo')], 'Bazar', null, null,
      perf({ quemado: [13, false] })
    );
    mismos(r, ['nuevo'], 'el de 13 avisos sin cotizar no entra');
  });

  test('11 sin cotizar todavia entra, 12 ya no', () => {
    // El corte tiene que ser el corte: un test que solo mire 5 y 13 no
    // detecta que alguien mueva el umbral de 12 a 20.
    const casi = elegirDestinatarios([prov('a')], 'Bazar', null, null, perf({ a: [11, false] }));
    igual(casi.length, 1, 'con 11 todavia se le manda');
    const corte = elegirDestinatarios([prov('a')], 'Bazar', null, null, perf({ a: [12, false] }));
    igual(corte.length, 0, 'con 12 ya no');
  });

  test('el mudo pierde contra la provincia, no al reves', () => {
    /* El orden de los criterios importa: estar en la misma ciudad que el
       comprador no compensa hacer cinco avisos que no contesta. */
    const r = elegirDestinatarios([
      prov('mudoCerca', { provincia: 'Córdoba' }),
      prov('buenoLejos', { provincia: 'CABA' })
    ], 'Bazar', 'Córdoba', null, perf({ mudoCerca: [6, false] }));
    mismos(r, ['buenoLejos', 'mudoCerca']);
  });

  test('si en el rubro no hay nadie mas, al mudo se le manda igual', () => {
    // WA_MUDO_FONDO ordena, no excluye: mejor avisarle al unico que hay que
    // dejar el pedido sin un solo destinatario.
    const r = elegirDestinatarios([prov('unico')], 'Bazar', null, null, perf({ unico: [7, false] }));
    mismos(r, ['unico']);
  });

  test('sin mapa de desempeño reparte igual que antes', () => {
    /* Si la lectura de Supabase falla, cargarDesempeno() devuelve un Map
       vacio. Que eso deje el reparto exactamente como estaba es lo que hace
       que un error de medicion no se coma los avisos. */
    const lista = [prov('c'), prov('a'), prov('b')];
    const sinMapa = elegirDestinatarios(lista, 'Bazar', null).map(p => p.id).join(',');
    const vacio = elegirDestinatarios(lista, 'Bazar', null, null, new Map()).map(p => p.id).join(',');
    igual(sinMapa, 'a,b,c');
    igual(vacio, sinMapa, 'un mapa vacio no castiga a nadie');
  });

  /* =================================================================== */
  seccion('Franja horaria: de noche el mayorista tiene el local cerrado');

  test('la hora se lee en Argentina y no en el servidor, que va en UTC', () => {
    igual(horaArgentina(aHoraAR(23, 38)), 23, 'las 23:38 AR son las 02:38 UTC del dia siguiente');
    igual(horaArgentina(aHoraAR(4, 42)), 4);
  });

  test('los dos casos reales del embudo quedan afuera', () => {
    // Avisos que salieron 23:38 y pedidos publicados 04:42: son los que
    // motivaron el corte.
    asegurar(!enHorarioComercial(aHoraAR(23, 38)), 'las 23:38 no');
    asegurar(!enHorarioComercial(aHoraAR(4, 42)), 'las 04:42 no');
  });

  test('en pleno dia sale', () => {
    asegurar(enHorarioComercial(aHoraAR(12, 0)));
    asegurar(enHorarioComercial(aHoraAR(18, 30)));
  });

  test('los bordes: 9:00 entra, 21:00 ya no', () => {
    /* Escrito contra los bordes a proposito: un >= mal puesto se ve como
       "algunos avisos salen 8:59" y nadie lo mira nunca. */
    asegurar(enHorarioComercial(aHoraAR(9, 0)), 'a las 9 en punto ya sale');
    asegurar(!enHorarioComercial(aHoraAR(8, 59)), 'a las 8:59 todavia no');
    asegurar(enHorarioComercial(aHoraAR(20, 55)), 'a las 20:55 todavia sale');
    asegurar(!enHorarioComercial(aHoraAR(21, 0)), 'a las 21 en punto ya no');
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
  seccion('El webhook: un evento raro no puede tirar abajo la tanda entera');

  test('aplana los tres niveles que anida Meta', () => {
    const v = valoresDelEvento({
      entry: [{ changes: [{ value: { statuses: [{ id: 'a', status: 'read' }] } }] }]
    });
    igual(v.length, 1);
    igual(v[0].statuses[0].status, 'read');
  });

  test('varios entry y varios changes salen todos', () => {
    const v = valoresDelEvento({
      entry: [
        { changes: [{ value: { messages: [1] } }, { value: { statuses: [2] } }] },
        { changes: [{ value: { messages: [3] } }] }
      ]
    });
    igual(v.length, 3);
  });

  test('un cuerpo vacio, nulo o con la forma equivocada devuelve lista vacia', () => {
    igual(valoresDelEvento(null).length, 0);
    igual(valoresDelEvento({}).length, 0);
    igual(valoresDelEvento({ entry: 'no soy un array' }).length, 0);
    igual(valoresDelEvento({ entry: [{}] }).length, 0);
    igual(valoresDelEvento({ entry: [{ changes: null }] }).length, 0);
  });

  test('un change roto en el medio no se lleva puestos a los demas', () => {
    // Meta manda varios eventos en la misma tanda. Si uno viene mal formado y
    // eso corta el bucle, se pierden acuses de mensajes que si estaban bien.
    const v = valoresDelEvento({
      entry: [{ changes: [{ value: { messages: [1] } }, null, { value: null }, { value: { statuses: [2] } }] }]
    });
    igual(v.length, 2, 'los dos sanos tienen que sobrevivir');
  });

  /* =================================================================== */
  /* Que se reintenta y que no. Es la unica pieza del reintento que se puede
     probar sin red: si esta lista se afloja, un reenvio empieza a insistirle
     a numeros que nos rebotan, que es como se quema el numero de la empresa.
     Los textos son los que devolvio Meta de verdad, copiados de avisos_wa. */
  seccion('esFalloNuestro: culpa nuestra vs. del destinatario');

  test('el fallo de facturacion del 2026-09-01 se reintenta', () => {
    asegurar(esFalloNuestro('Business eligibility payment issue'));
  });

  test('el numero sin registrar del 24-25/08 se reintenta', () => {
    asegurar(esFalloNuestro('(#133010) Account not registered'));
    asegurar(esFalloNuestro('Account not registered'));
  });

  test('un token vencido se reintenta', () => {
    asegurar(esFalloNuestro('(#190) Error validating access token'));
  });

  test('un rechazo del destinatario NO se reintenta', () => {
    asegurar(!esFalloNuestro('Message undeliverable'));
    asegurar(!esFalloNuestro('(#131026) Message Undeliverable'));
    asegurar(!esFalloNuestro('(#131030) Recipient phone number not in allowed list'));
  });

  test('un motivo desconocido NO se reintenta (lista blanca, no negra)', () => {
    asegurar(!esFalloNuestro('algo raro que nunca vimos'));
    asegurar(!esFalloNuestro('http_500'));
  });

  test('sin motivo no se adivina', () => {
    asegurar(!esFalloNuestro(''));
    asegurar(!esFalloNuestro(null));
    asegurar(!esFalloNuestro(undefined));
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
