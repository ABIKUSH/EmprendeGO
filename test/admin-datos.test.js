/* =====================================================================
   PRUEBAS DE LOS DATOS DEL PANEL DE ADMIN

   Correr:   node test/admin-datos.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias ni red ni base.

   POR QUE EXISTE
   El 2026-09-07 el panel mostraba "1.000 usuarios registrados" habiendo
   1.036, y "13 proveedores Pro" habiendo 5 vigentes (8 vencidos contados
   como activos). Dos fallas distintas con la misma cara: un numero que se
   ve bien y esta mal.

   - El 1.000 es el tope de filas que devuelve la API de Supabase. No avisa
     cuando corta, asi que el sintoma es un numero redondo, nunca un error.
   - Los 13 salian de contar plan='pro' sin mirar plan_hasta.

   COMO ESTAN ESCRITAS
   admin.html es una pagina entera con su DOM y su login, imposible de
   cargar en Node sin inventar medio navegador. Estas pruebas extraen del
   archivo REAL las dos funciones que hacen la cuenta y las ejecutan. No hay
   copia del codigo aca: si alguien edita esas funciones en admin.html, esto
   prueba la version editada.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

/* ---------------- corredor ---------------- */

let ok = 0;
const fallas = [];
let grupo = '';

function seccion(t) { grupo = t; console.log('\n' + t); }

function test(nombre, fn) {
  const r = fn();
  if (r && typeof r.then === 'function') throw new Error('use testAsync() para pruebas con await');
  ok++; console.log('  ok   ' + nombre);
}

async function testAsync(nombre, fn) {
  try {
    await fn();
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

/* ---------------- extraccion del codigo real ----------------
   Corta desde la firma de la funcion hasta la primera llave de cierre que
   arranca en la columna 0. Si alguien reindenta admin.html esto deja de
   encontrarla y la prueba falla a la vista, que es lo que se quiere: mejor
   una falla ruidosa que una prueba que se saltea sola. */

function extraer(firma) {
  const desde = HTML.indexOf(firma);
  if (desde === -1) throw new Error('no se encontro en admin.html: ' + firma);
  const hasta = HTML.indexOf('\n}', desde);
  if (hasta === -1) throw new Error('no se encontro el cierre de: ' + firma);
  return HTML.slice(desde, hasta + 2);
}

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  extraer('async function traerTodasLasFilas') + '\n' +
  extraer('function esProVigente'),
  ctx, { filename: 'admin.html (extracto)' }
);
const { traerTodasLasFilas, esProVigente } = ctx;

/* ---------------- consulta de mentira ----------------
   Imita lo unico que importa de supabase-js: .range(desde, hasta) devuelve
   ese pedazo y nunca mas de PAGE filas, que es como se comporta PostgREST. */

function tablaFalsa(cantidad, opciones = {}) {
  const filas = Array.from({ length: cantidad }, (_, i) => ({ id: i + 1 }));
  const pedidos = [];
  const armar = () => ({
    range(desde, hasta) {
      pedidos.push([desde, hasta]);
      if (opciones.errorEnPedido === pedidos.length) {
        return Promise.resolve({ data: null, error: { message: 'falla simulada' } });
      }
      if (opciones.dataNula) return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: filas.slice(desde, hasta + 1), error: null });
    }
  });
  return { armar, pedidos };
}

/* ===================== PRUEBAS ===================== */

(async () => {

  seccion('Traer una tabla entera (el tope de 1000 filas)');

  await testAsync('1.036 usuarios devuelven 1.036, no 1.000', async () => {
    // El caso exacto que rompio el panel.
    const t = tablaFalsa(1036);
    const { data, error } = await traerTodasLasFilas(t.armar);
    igual(data.length, 1036);
    igual(error, null);
  });

  await testAsync('2.500 filas se traen en tres pedidos, sin repetir ni saltear', async () => {
    const t = tablaFalsa(2500);
    const { data } = await traerTodasLasFilas(t.armar);
    igual(data.length, 2500);
    igual(t.pedidos.length, 3);
    igual(JSON.stringify(t.pedidos), JSON.stringify([[0, 999], [1000, 1999], [2000, 2999]]));
    igual(new Set(data.map(f => f.id)).size, 2500, 'hay filas repetidas');
  });

  await testAsync('una tabla chica se pide una sola vez', async () => {
    // Sin esto, cada pantalla del panel haria una consulta de mas al pedo.
    const t = tablaFalsa(40);
    const { data } = await traerTodasLasFilas(t.armar);
    igual(data.length, 40);
    igual(t.pedidos.length, 1);
  });

  await testAsync('justo 1.000 filas: pide la pagina siguiente y no duplica', async () => {
    // El borde peligroso: con exactamente PAGE filas no se sabe si hay mas.
    const t = tablaFalsa(1000);
    const { data } = await traerTodasLasFilas(t.armar);
    igual(data.length, 1000);
    igual(t.pedidos.length, 2, 'tiene que confirmar que no habia mas');
  });

  await testAsync('tabla vacia devuelve lista vacia', async () => {
    const t = tablaFalsa(0);
    const { data, error } = await traerTodasLasFilas(t.armar);
    igual(data.length, 0);
    igual(error, null);
  });

  await testAsync('un error en la primera pagina se devuelve, no se traga', async () => {
    const t = tablaFalsa(2500, { errorEnPedido: 1 });
    const { data, error } = await traerTodasLasFilas(t.armar);
    igual(data.length, 0);
    asegurar(error, 'el error tiene que llegar a quien llamo');
  });

  await testAsync('un error a mitad devuelve lo que ya se junto', async () => {
    // Media tabla es mejor que nada, pero el error viaja igual para que la
    // pantalla pueda avisar en vez de mostrar un total incompleto como si
    // fuera el bueno.
    const t = tablaFalsa(5000, { errorEnPedido: 3 });
    const { data, error } = await traerTodasLasFilas(t.armar);
    igual(data.length, 2000);
    asegurar(error, 'el error tiene que llegar igual');
  });

  await testAsync('si la API devuelve data nula corta sin colgarse', async () => {
    const t = tablaFalsa(2500, { dataNula: true });
    const { data } = await traerTodasLasFilas(t.armar);
    igual(data.length, 0);
    igual(t.pedidos.length, 1);
  });

  seccion('Plan Pro vigente vs. vencido');

  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  test('un Pro que vence manana esta vigente', () => {
    asegurar(esProVigente({ plan: 'pro', plan_hasta: manana }));
  });

  test('un Pro que vencio ayer NO cuenta', () => {
    // Los 8 que inflaban la tarjeta de 5 a 13.
    asegurar(!esProVigente({ plan: 'pro', plan_hasta: ayer }));
  });

  test('un Pro sin fecha de vencimiento cuenta como vigente', () => {
    // plan_hasta nulo = sin vencimiento cargado; la app publica lo trata
    // igual (esProvPro en js/app.js) y los dos tienen que decir lo mismo.
    asegurar(esProVigente({ plan: 'pro', plan_hasta: null }));
  });

  test('un plan gratis nunca es Pro, ni con fecha futura', () => {
    asegurar(!esProVigente({ plan: 'gratis', plan_hasta: manana }));
  });

  test('no se rompe con una fila vacia', () => {
    asegurar(!esProVigente(null));
    asegurar(!esProVigente({}));
  });

  /* ---------------- cierre ---------------- */

  console.log('\n' + ok + ' comprobaciones ok, ' + fallas.length + ' fallas');
  if (fallas.length) {
    console.log('\nFallaron:');
    fallas.forEach(f => console.log('  [' + f.grupo + '] ' + f.nombre + '\n    ' + (f.e && f.e.stack || f.e)));
    process.exit(1);
  }
  process.exit(0);

})();
