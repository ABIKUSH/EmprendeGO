/* =====================================================================
   PRUEBAS DE js/cotizaciones.js

   Correr:   node test/cotizaciones.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias: no hay
   package.json en este repo a proposito y estas pruebas no lo cambian.

   COMO ESTAN ESCRITAS
   El modulo es una IIFE: sus funciones internas no se exportan. Estas
   pruebas NO las espian — cargan el archivo en un contexto con un DOM y un
   Supabase de mentira, lo manejan por donde lo maneja una persona (las
   window.cotiz*) y miran el HTML que quedo pintado. O sea que prueban lo
   que se ve, no como esta escrito por dentro: refactorizar el modulo no
   deberia romper una sola de estas.

   ATENCION AL LEER UNA FALLA: cuando algo se rompe, el nombre de la prueba
   dice QUE se rompio, no donde. Casi siempre el error esta en el modulo,
   no aca.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearDocumento } = require('./dom-falso');
const { crearSupabase, tablaDe, rpcDe, selectDe, eqsDe, tiene } = require('./supabase-falso');

const RAIZ = path.join(__dirname, '..');

/* ---------------- corredor de pruebas ---------------- */

let ok = 0;
const fallas = [];
let grupo = '';

function seccion(t) { grupo = t; console.log('\n' + t); }

function test(nombre, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') throw new Error('test() no acepta promesas; use testAsync()');
    ok++; console.log('  ok   ' + nombre);
  } catch (e) {
    fallas.push({ grupo, nombre, e });
    console.log('  FALLA ' + nombre + '\n        ' + (e && e.message));
  }
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
  if (a !== b) throw new Error((msg || 'distintos') + ': esperaba ' + JSON.stringify(b) + ', vino ' + JSON.stringify(a));
}
function contiene(txt, frag, msg) {
  if (String(txt).indexOf(frag) < 0) throw new Error((msg || 'falta el texto') + ': ' + JSON.stringify(frag));
}
function noContiene(txt, frag, msg) {
  if (String(txt).indexOf(frag) >= 0) throw new Error((msg || 'no deberia estar') + ': ' + JSON.stringify(frag));
}

/* OJO al escribir una prueba de "esto NO aparece": el HTML pintado incluye
   el bloque <style>, asi que buscar el nombre de una clase dentro del string
   da positivo por la REGLA de CSS aunque no exista ni un elemento. Estas dos
   van por el DOM, que es lo que la persona ve. */
const hay = (m, sel) => m.doc.querySelectorAll(sel).length > 0;
const contarTarjetas = m => m.doc.querySelectorAll('.cz-bandeja')
  .filter(e => !e.classList.contains('cz-demanda')).length;

/* ---------------- constantes reales de app.js ----------------
   Se leen del archivo de verdad y no se copian aca: una copia se
   desactualiza y las pruebas empiezan a pasar sobre datos que ya no
   existen. Se recorta la declaracion contando llaves/corchetes. */

const APP = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');

/* Busca el cierre del bloque que abre en `desde`, salteando lo que no es
   codigo: textos, comentarios y LITERALES DE REGEX.

   Los regex no son un detalle: escHtml hace .replace(/'/g, '&#39;'), o sea
   que tiene una comilla simple adentro de un regex. Un lector que solo
   entienda comillas se desincroniza justo ahi y se lleva medio app.js.

   Para saber si una barra abre un regex o es una division se mira el ultimo
   caracter de codigo: despues de un valor (identificador, numero, cierre de
   parentesis) una barra divide; en cualquier otro lado, abre un regex. */
function buscarCierre(fuente, desde) {
  const abre = fuente[desde];
  const cierra = abre === '{' ? '}' : abre === '[' ? ']' : abre === '(' ? ')' : null;
  if (!cierra) throw new Error('no abre un bloque en la posicion ' + desde);

  let prof = 0, previo = '';
  for (let j = desde; j < fuente.length; j++) {
    const c = fuente[j];

    if (c === '"' || c === "'" || c === '`') {
      for (j++; j < fuente.length; j++) {
        if (fuente[j] === '\\') j++;
        else if (fuente[j] === c) break;
      }
      previo = 'x';
      continue;
    }
    if (c === '/' && fuente[j + 1] === '/') { while (j < fuente.length && fuente[j] !== '\n') j++; continue; }
    if (c === '/' && fuente[j + 1] === '*') { j = fuente.indexOf('*/', j + 2) + 1; previo = ''; continue; }
    if (c === '/' && !/[a-zA-Z0-9_$)\]]/.test(previo)) {
      for (j++; j < fuente.length; j++) {
        if (fuente[j] === '\\') j++;
        else if (fuente[j] === '[') { while (j < fuente.length && fuente[j] !== ']') { if (fuente[j] === '\\') j++; j++; } }
        else if (fuente[j] === '/') break;
      }
      previo = 'x';
      continue;
    }

    if (c === abre) prof++;
    else if (c === cierra) { prof--; if (!prof) return j; }
    if (!/\s/.test(c)) previo = c;
  }
  throw new Error('no se encontro el cierre del bloque');
}

function recortarDeclaracion(fuente, nombre) {
  const re = new RegExp('^(?:const|let|var)\\s+' + nombre + '\\s*=', 'm');
  const m = re.exec(fuente);
  if (!m) throw new Error('app.js ya no declara ' + nombre);
  let i = m.index + m[0].length;
  while (i < fuente.length && /\s/.test(fuente[i])) i++;
  if (fuente[i] !== '{' && fuente[i] !== '[') throw new Error(nombre + ' ya no es un objeto ni un array');
  return fuente.slice(i, buscarCierre(fuente, i) + 1);
}

function recortarFuncion(fuente, nombre) {
  const re = new RegExp('^function\\s+' + nombre + '\\s*\\(', 'm');
  const m = re.exec(fuente);
  if (!m) throw new Error('app.js ya no declara la funcion ' + nombre);
  const i = fuente.indexOf('{', fuente.indexOf(')', m.index));
  return fuente.slice(m.index, buscarCierre(fuente, i) + 1);
}

/* `var` y no `const`: en un contexto de vm, const y let quedan encerrados en
   el script que los declara y no se ven desde el siguiente. Con var pasan a
   ser propiedades del global del contexto, que es como los ve el modulo. */
const CONSTANTES_APP = [
  'var RUBROS_LISTA = ' + recortarDeclaracion(APP, 'RUBROS_LISTA') + ';',
  'var PROVINCIAS = ' + recortarDeclaracion(APP, 'PROVINCIAS') + ';',
  'var SUBCATEGORIA_MAP = ' + recortarDeclaracion(APP, 'SUBCATEGORIA_MAP') + ';',
  'var CAT_SUBCATS = ' + recortarDeclaracion(APP, 'CAT_SUBCATS') + ';',
  recortarFuncion(APP, 'escHtml'),
  recortarFuncion(APP, 'minimoPedidoNum')
].join('\n');

const FUENTE_COTIZ = fs.readFileSync(path.join(RAIZ, 'js', 'cotizaciones.js'), 'utf8');

/* ---------------- montaje del modulo ---------------- */

const PROV = { id: 'prov-1', nombre: 'Mayorista Norte', rubro: 'Indumentaria, Textil y Telas', plan: 'pro', plan_hasta: null, estado: 'aprobado' };

function pedido(over) {
  return Object.assign({
    id: 'sol-' + Math.random().toString(36).slice(2, 8),
    created_at: new Date().toISOString(),
    usuario_id: 'uid-otro',
    comprador_nombre: 'Ana G.',
    comprador_foto: null,
    titulo: 'Remeras lisas de algodón',
    cantidad: '50', unidad: 'unidades',
    rubro: 'Indumentaria', provincia: 'Córdoba',
    detalles: null, presupuesto: null,
    estado: 'abierta',
    cierra_at: new Date(Date.now() + 9 * 864e5).toISOString(),
    respuestas: 0,
    foto_url: null,
    tipo: 'producto', productos: null, ya_vende: null, inversion: null
  }, over || {});
}

function pedidoB(over) {
  return pedido(Object.assign({
    tipo: 'proveedor',
    titulo: 'Busco quien me abastezca de blanquería',
    cantidad: null, unidad: null,
    productos: ['Toallas', 'Sábanas', 'Acolchados'],
    ya_vende: 'vendiendo', inversion: '100-300',
    rubro: 'Blanquería'
  }, over || {}));
}

/* Levanta una instancia limpia del modulo.
   `cfg` maneja el mundo: quien esta logueado, que devuelve la base y si la
   migracion de rubros seguidos esta corrida. */
function montar(cfg) {
  cfg = cfg || {};
  const doc = crearDocumento();
  doc.raiz.innerHTML = '<div id="screen-cotizaciones"></div>';

  const toasts = [];
  const escrituras = [];
  const confirmaciones = [];
  let reloj = 0;

  const router = pasos => {
    const t = tablaDe(pasos), r = rpcDe(pasos);

    if (r === 'cotiz_feed_publico') return { data: cfg.feed || [], error: null };
    if (r === 'cotiz_demanda_sin_respuesta') return { data: [], error: null };

    if (t === 'solicitudes') {
      if (tiene(pasos, 'delete')) { escrituras.push({ t, op: 'delete', eqs: eqsDe(pasos) }); return { data: null, error: null }; }
      if (tiene(pasos, 'update')) { escrituras.push({ t, op: 'update', eqs: eqsDe(pasos) }); return { data: null, error: null }; }
      if (tiene(pasos, 'insert')) { escrituras.push({ t, op: 'insert', fila: pasos.find(p => p.m === 'insert').args[0] }); return { data: null, error: null }; }
      // Es "mis pedidos" si filtra por usuario_id.
      const porUsuario = eqsDe(pasos).some(e => e.col === 'usuario_id');
      return { data: porUsuario ? (cfg.misPedidos || []) : (cfg.feed || []), error: null };
    }

    if (t === 'cotizaciones') {
      if (tiene(pasos, 'delete')) { escrituras.push({ t, op: 'delete', eqs: eqsDe(pasos) }); return { data: null, error: cfg.errorBorrar || null }; }
      if (tiene(pasos, 'insert')) { escrituras.push({ t, op: 'insert', fila: pasos.find(p => p.m === 'insert').args[0] }); return { data: null, error: null }; }
      return { data: cfg.misCotiz || [], error: null };
    }

    if (t === 'proveedores') {
      if (tiene(pasos, 'update')) {
        const fila = pasos.find(p => p.m === 'update').args[0];
        escrituras.push({ t, op: 'update', fila, eqs: eqsDe(pasos) });
        return { data: null, error: cfg.errorGuardar || null };
      }
      if (selectDe(pasos).indexOf('rubros_seguidos') >= 0) {
        if (cfg.sinColumnaSeguidos) {
          return { data: null, error: { code: '42703', message: 'column proveedores.rubros_seguidos does not exist' } };
        }
        return { data: { rubros_seguidos: cfg.seguidos || null }, error: null };
      }
      return { data: [], error: null };
    }
    return { data: [], error: null };
  };

  const sb = crearSupabase(router);

  const win = {
    matchMedia: () => ({ matches: !!cfg.menosMovimiento }),
    scrollTo: () => { },
    addEventListener: () => { },
    removeEventListener: () => { }
  };

  const ctx = {
    window: win, document: doc, console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    /* El reloj TIENE que avanzar. La cuenta ascendente del pulso se llama a
       si misma por requestAnimationFrame hasta que pasa la duracion; con un
       now() clavado en cero eso es recursion infinita y el feed no pinta
       nunca. Cada cuadro adelanta 60ms, asi que la cuenta termina sola. */
    requestAnimationFrame: fn => { reloj += 60; fn(reloj); return 1; },
    performance: { now: () => reloj },
    Math, Date, JSON, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat,
    Promise, Set, Map, RegExp, Error, encodeURIComponent, decodeURIComponent,
    localStorage: {
      _d: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; }
    },
    sb,
    currentUser: cfg.usuario === undefined ? null : cfg.usuario,
    showToast: m => toasts.push(String(m)),
    haptic: () => { },
    goTo: () => { },
    closeDrawer: () => { },
    trackEvent: () => { },
    abrirWA: () => { },
    registrarContactoWA: () => { },
    abrirDetalle: () => { },
    confirm: m => { confirmaciones.push(String(m)); return cfg.confirmar !== false; },
    alert: () => { }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(CONSTANTES_APP, ctx, { filename: 'app-constantes.js' });
  vm.runInContext(FUENTE_COTIZ, ctx, { filename: 'js/cotizaciones.js' });

  return {
    ctx, doc, sb, toasts, escrituras, confirmaciones,
    w: win,
    html: () => doc.getElementById('screen-cotizaciones').innerHTML,
    el: id => doc.getElementById(id),
    // El feed es el unico camino que carga datos; casi toda prueba arranca aca.
    abrirFeed: async () => {
      await win.cotizIr('feed');
      // El carril de demanda ya no se espera junto con el feed: se pide aparte
      // y se pinta cuando llega (su consulta es la mas cara de la seccion y
      // tenerla colgada del Promise.all era lo que hacia tardar la pantalla).
      // Este respiro deja que esa promesa suelta termine antes de que la prueba
      // mire el DOM, en vez de depender de cuantos await hubo puertas adentro.
      await new Promise(r => setImmediate(r));
    }
  };
}

const comprador = { type: 'comprador', name: 'Ana', email: 'a@b.com' };
const proveedor = { type: 'proveedor', name: PROV.nombre, email: 'p@b.com', proveedorId: PROV.id, provData: PROV };

/* =====================================================================
   PRUEBAS
   ===================================================================== */

(async function correr() {

  // ------------------------------------------------------------------
  seccion('Contrato con app.js (los globales que el modulo lee)');
  // ------------------------------------------------------------------
  const base = montar({});

  test('app.js sigue exponiendo RUBROS_LISTA, PROVINCIAS, SUBCATEGORIA_MAP y CAT_SUBCATS', () => {
    ['RUBROS_LISTA', 'PROVINCIAS', 'SUBCATEGORIA_MAP', 'CAT_SUBCATS'].forEach(n => {
      asegurar(base.ctx[n], 'falta ' + n);
    });
  });

  test('RUBROS_LISTA no tiene rubros repetidos', () => {
    const l = base.ctx.RUBROS_LISTA;
    igual(l.length, new Set(l).size, 'hay rubros duplicados');
  });

  test('minimoPedidoNum sigue devolviendo 0 para "Sin minimo" (ordena primero)', () => {
    igual(base.ctx.minimoPedidoNum('Sin mínimo'), 0);
  });

  test('el modulo publica su superficie completa en window', () => {
    ['cotizIr', 'cotizPedir', 'cotizEmpezar', 'abrirCotizaciones', 'cotizRetirarCotiz',
      'cotizVerTodos', 'cotizSoloMisRubros', 'cotizSegChip', 'cotizSegGuardar',
      'cotizSegTodos', 'cotizBTexto', 'cotizBChip', 'cotizCantModo'].forEach(f => {
        asegurar(typeof base.w[f] === 'function', 'falta window.' + f);
      });
  });

  await testAsync('el bloque de estilos sale resuelto, sin interpolaciones ni tokens muertos', async () => {
    await base.abrirFeed();
    /* ESTILOS es un template literal y ya rompio el archivo una vez. Un
       acento invertido suelto lo agarra el parser al cargar el modulo, asi
       que no hace falta buscarlo. Lo que NO agarra nadie es un ${...} mal
       escapado (sale literal al CSS) o un token que no existe (sale
       "undefined" y la regla se descarta en silencio). Se mira la salida. */
    const estilo = base.doc.querySelector('style');
    asegurar(estilo, 'la pantalla no pinto el bloque de estilos');
    // Se sacan los comentarios: adentro de uno hay un "${ }" a proposito,
    // que es justamente el que documenta este gotcha.
    const css = estilo.textContent.replace(/\/\*[\s\S]*?\*\//g, '');
    asegurar(css.length > 2000, 'el bloque de estilos salio demasiado corto');
    noContiene(css, '${', 'quedo una interpolacion sin resolver en el CSS');
    noContiene(css, 'undefined', 'una regla quedo apuntando a un token que no existe');
  });

  // ------------------------------------------------------------------
  seccion('Las once vistas se pintan sin dejar basura');
  // ------------------------------------------------------------------
  const VISTAS = ['portada', 'login', 'feed', 'bifurcacion', 'publicar', 'publicarB',
    'mis', 'misCotiz', 'seguidos', 'respuestas', 'confirmado'];

  for (const v of VISTAS) {
    await testAsync('vista "' + v + '" pinta algo y no filtra undefined/NaN/[object Object]', async () => {
      const m = montar({ usuario: proveedor, feed: [pedido(), pedidoB()], misCotiz: [] });
      await m.w.cotizIr(v);
      const h = m.html();
      asegurar(h && h.length > 50, 'la vista salio vacia');
      noContiene(h, 'undefined', 'se filtro un undefined');
      noContiene(h, '[object Object]', 'se filtro un [object Object]');
      noContiene(h, 'NaN', 'se filtro un NaN');
    });
  }

  // ------------------------------------------------------------------
  seccion('Cinta: de que clase es el pedido (lo nuevo)');
  // ------------------------------------------------------------------

  await testAsync('un pedido de producto lleva la cinta "Producto puntual"', async () => {
    const m = montar({ usuario: proveedor, feed: [pedido()] });
    await m.abrirFeed();
    contiene(m.html(), 'cz-tipo a');
    contiene(m.html(), 'Producto puntual');
  });

  await testAsync('un pedido de proveedor lleva la cinta "Busca proveedor fijo"', async () => {
    const m = montar({ usuario: proveedor, feed: [pedidoB()] });
    await m.abrirFeed();
    contiene(m.html(), 'cz-tipo b');
    contiene(m.html(), 'Busca proveedor fijo');
  });

  await testAsync('la cinta reemplazo al viejo chip "Busca proveedor" de la fila de datos', async () => {
    const m = montar({ usuario: proveedor, feed: [pedidoB()] });
    await m.abrirFeed();
    const chips = m.doc.querySelectorAll('.cz-dato').map(e => e.textContent.trim());
    asegurar(chips.indexOf('Busca proveedor') < 0, 'el chip viejo sigue en los datos');
  });

  await testAsync('un pedido de proveedor dice de cuantos productos es el surtido', async () => {
    const m = montar({ usuario: proveedor, feed: [pedidoB()] });
    await m.abrirFeed();
    contiene(m.html(), '3 productos');
  });

  await testAsync('con un solo producto dice "1 producto", en singular', async () => {
    const m = montar({ usuario: proveedor, feed: [pedidoB({ productos: ['Toallas'] })] });
    await m.abrirFeed();
    contiene(m.html(), '1 producto<');
  });

  await testAsync('sin la migracion de la fase 4 no se pinta ninguna cinta', async () => {
    // El feed publico devuelve filas sin `tipo`: asi es como el modulo se
    // entera de que la migracion no corrio (baja nivelSql a 1).
    const sinTipo = pedido();
    delete sinTipo.tipo;
    const m = montar({ usuario: null, feed: [sinTipo] });
    await m.abrirFeed();
    asegurar(!hay(m, '.cz-tipo'), 'pinto una cinta sin poder distinguir los tipos');
  });

  // ------------------------------------------------------------------
  seccion('El proveedor retira su propia cotizacion (lo nuevo)');
  // ------------------------------------------------------------------

  const solYa = pedido({ id: 'sol-ya', respuestas: 1 });
  const cotizPropia = [{ solicitud_id: 'sol-ya', precio: 1500, created_at: new Date().toISOString(), tipo: 'producto', cubre: null }];

  await testAsync('si ya cotizo, la tarjeta le ofrece retirar', async () => {
    const m = montar({ usuario: proveedor, feed: [solYa], misCotiz: cotizPropia });
    await m.abrirFeed();
    contiene(m.html(), 'Retirar mi cotización');
  });

  await testAsync('si no cotizo, no hay nada que retirar', async () => {
    const m = montar({ usuario: proveedor, feed: [pedido()], misCotiz: [] });
    await m.abrirFeed();
    noContiene(m.html(), 'Retirar mi');
  });

  await testAsync('en un pedido de proveedor dice "respuesta", no "cotizacion"', async () => {
    const solB = pedidoB({ id: 'sol-b', respuestas: 1 });
    const m = montar({
      usuario: proveedor, feed: [solB],
      misCotiz: [{ solicitud_id: 'sol-b', precio: null, created_at: new Date().toISOString(), tipo: 'proveedor', cubre: ['Toallas'] }]
    });
    await m.abrirFeed();
    contiene(m.html(), 'Retirar mi respuesta');
    noContiene(m.html(), 'Retirar mi cotización');
  });

  await testAsync('al comprador nunca se le ofrece retirar nada', async () => {
    const m = montar({ usuario: comprador, feed: [solYa], misPedidos: [] });
    await m.abrirFeed();
    noContiene(m.html(), 'Retirar mi');
  });

  await testAsync('cancelar la confirmacion no borra nada', async () => {
    const m = montar({ usuario: proveedor, feed: [solYa], misCotiz: cotizPropia, confirmar: false });
    await m.abrirFeed();
    await m.w.cotizRetirarCotiz('sol-ya');
    igual(m.escrituras.filter(e => e.op === 'delete').length, 0, 'borro despues de cancelar');
  });

  await testAsync('aceptar borra por (solicitud_id, proveedor_id), nunca por uno solo', async () => {
    const m = montar({ usuario: proveedor, feed: [solYa], misCotiz: cotizPropia });
    await m.abrirFeed();
    await m.w.cotizRetirarCotiz('sol-ya');
    const del = m.escrituras.filter(e => e.t === 'cotizaciones' && e.op === 'delete');
    igual(del.length, 1, 'no borro exactamente una vez');
    const cols = del[0].eqs.map(e => e.col).sort();
    igual(cols.join(','), 'proveedor_id,solicitud_id', 'el filtro del delete cambio');
    igual(del[0].eqs.find(e => e.col === 'proveedor_id').val, PROV.id);
    igual(del[0].eqs.find(e => e.col === 'solicitud_id').val, 'sol-ya');
  });

  await testAsync('la confirmacion avisa que puede volver a responder', async () => {
    const m = montar({ usuario: proveedor, feed: [solYa], misCotiz: cotizPropia });
    await m.abrirFeed();
    await m.w.cotizRetirarCotiz('sol-ya');
    contiene(m.confirmaciones.join(' '), 'volver a responder');
  });

  await testAsync('si la base rechaza el borrado, avisa y no rompe la pantalla', async () => {
    const m = montar({
      usuario: proveedor, feed: [solYa], misCotiz: cotizPropia,
      errorBorrar: { code: '42501', message: 'permission denied' }
    });
    await m.abrirFeed();
    await m.w.cotizRetirarCotiz('sol-ya');
    contiene(m.toasts.join(' '), 'No se pudo retirar');
    asegurar(m.html().length > 50, 'la pantalla quedo vacia despues del error');
  });

  await testAsync('"Mis cotizaciones" tambien ofrece retirar', async () => {
    const m = montar({ usuario: proveedor, feed: [solYa], misCotiz: cotizPropia });
    await m.abrirFeed();
    await m.w.cotizIr('misCotiz');
    contiene(m.html(), 'Retirar mi cotización');
  });

  // ------------------------------------------------------------------
  seccion('Rubros seguidos: el filtro del feed (lo nuevo)');
  // ------------------------------------------------------------------

  const feedMixto = [
    pedido({ id: 's1', rubro: 'Indumentaria' }),
    pedido({ id: 's2', rubro: 'Electrónica' }),
    pedido({ id: 's3', rubro: 'Alimentos' }),
    pedido({ id: 's4', rubro: 'Ferretería' }),
    pedido({ id: 's5', rubro: 'Indumentaria' })
  ];

  await testAsync('sin rubros elegidos ve el feed entero', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    igual(contarTarjetas(m), 5, 'escondio pedidos sin que nadie se lo pidiera');
  });

  await testAsync('siguiendo un rubro, el feed queda recortado a ese rubro', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    igual(contarTarjetas(m), 2, 'no recorto por rubro');
    noContiene(m.html(), 'Electrónica');
  });

  await testAsync('el numero grande del pulso cuenta lo filtrado, no el total', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    const oculto = m.doc.querySelectorAll('.cz-oculto').map(e => e.textContent).join(' ');
    contiene(oculto, '2 pedidos abiertos', 'el pulso sigue contando el feed sin filtrar');
  });

  await testAsync('"Ver todos" apaga el filtro sin borrar lo que eligio', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    m.w.cotizVerTodos();
    igual(contarTarjetas(m), 5, 'no mostro todo');
    contiene(m.html(), 'Volver a mis rubros', 'no dejo el camino de vuelta');
  });

  await testAsync('"Volver a mis rubros" vuelve a filtrar', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    m.w.cotizVerTodos();
    m.w.cotizSoloMisRubros();
    igual(contarTarjetas(m), 2);
  });

  await testAsync('al comprador no se le filtra nada ni se le muestra la barra', async () => {
    const m = montar({ usuario: comprador, feed: feedMixto, seguidos: ['Indumentaria'], misPedidos: [] });
    await m.abrirFeed();
    igual(contarTarjetas(m), 5, 'le filtro el feed a un comprador');
    asegurar(!hay(m, '.cz-seg-barra'), 'le mostro la barra de rubros a un comprador');
  });

  await testAsync('si el filtro deja la pantalla vacia, lo dice y ofrece la salida', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Mascotas'] });
    await m.abrirFeed();
    const h = m.html();
    contiene(h, 'No hay pedidos abiertos en sus rubros');
    contiene(h, 'Ver todos los pedidos');
    noContiene(h, 'Todavía no hay pedidos abiertos', 'le mintio: hay pedidos, solo que en otros rubros');
  });

  await testAsync('con el feed realmente vacio sigue diciendo lo de siempre', async () => {
    const m = montar({ usuario: proveedor, feed: [], seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    contiene(m.html(), 'Todavía no hay pedidos abiertos');
  });

  await testAsync('"Mis cotizaciones" NO se filtra por los rubros seguidos', async () => {
    // Lo que se filtra es lo que se le OFRECE, nunca lo que ya hizo: una
    // cotizacion enviada a un rubro que despues dejo de seguir tiene que
    // seguir estando en su propia lista.
    const sol = pedido({ id: 'sol-ele', rubro: 'Electrónica', respuestas: 1 });
    const m = montar({
      usuario: proveedor, feed: [sol], seguidos: ['Indumentaria'],
      misCotiz: [{ solicitud_id: 'sol-ele', precio: 900, created_at: new Date().toISOString(), tipo: 'producto', cubre: null }]
    });
    await m.abrirFeed();
    await m.w.cotizIr('misCotiz');
    contiene(m.html(), sol.titulo, 'se le perdio una cotizacion que ya habia mandado');
  });

  await testAsync('sin la migracion corrida, el filtro no existe y el feed se ve completo', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, sinColumnaSeguidos: true });
    await m.abrirFeed();
    igual(contarTarjetas(m), 5, 'escondio pedidos apoyandose en una columna que no existe');
    asegurar(!hay(m, '.cz-seg-barra'), 'ofrecio un filtro que no se puede guardar');
  });

  // ------------------------------------------------------------------
  seccion('Rubros seguidos: la barra y la pantalla de eleccion');
  // ------------------------------------------------------------------

  await testAsync('la invitacion aparece cuando hay rubros de sobra en el feed', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    contiene(m.html(), 'Elegir rubros');
  });

  await testAsync('con pocos rubros en el feed la invitacion no molesta', async () => {
    const m = montar({
      usuario: proveedor, seguidos: null,
      feed: [pedido({ rubro: 'Indumentaria' }), pedido({ rubro: 'Calzado' })]
    });
    await m.abrirFeed();
    noContiene(m.html(), 'Elegir rubros', 'ofrecio filtrar dos rubros');
  });

  await testAsync('filtrando, la barra dice cuantos rubros sigue', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria', 'Calzado'] });
    await m.abrirFeed();
    contiene(m.html(), 'Siguiendo 2 rubros');
  });

  await testAsync('con un solo rubro lo dice en singular', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    contiene(m.html(), 'Siguiendo 1 rubro.');
  });

  await testAsync('la pantalla lista los 27 rubros, no solo los que hoy tienen pedidos', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    igual(m.el('cz-seg-chips').children.length, m.ctx.RUBROS_LISTA.length);
  });

  await testAsync('los rubros propios del proveedor salen señalados (aunque tenga varios)', async () => {
    // proveedores.rubro es una LISTA separada por comas, no un rubro.
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    const marcados = m.doc.querySelectorAll('.cz-seg-suyo').length;
    igual(marcados, 2, 'no señalo los dos rubros del proveedor');
  });

  await testAsync('la seleccion arranca de lo que ya tenia guardado', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    const on = m.el('cz-seg-chips').children.filter(b => b.getAttribute('aria-pressed') === 'true');
    igual(on.length, 1);
    igual(on[0].dataset.r, 'Indumentaria');
  });

  await testAsync('tocar un chip lo marca y volver a tocarlo lo desmarca', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    const cuantosOn = () => m.el('cz-seg-chips').children.filter(b => b.getAttribute('aria-pressed') === 'true').length;
    m.w.cotizSegChip('Calzado');
    igual(cuantosOn(), 1, 'no se marco');
    m.w.cotizSegChip('Calzado');
    igual(cuantosOn(), 0, 'no se desmarco');
  });

  await testAsync('no deja pasar del tope de 10 y explica por que', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    m.ctx.RUBROS_LISTA.slice(0, 11).forEach(r => m.w.cotizSegChip(r));
    const on = m.el('cz-seg-chips').children.filter(b => b.getAttribute('aria-pressed') === 'true');
    igual(on.length, 10, 'dejo pasar el tope que el CHECK de la base rechaza');
    contiene(m.toasts.join(' '), 'hasta 10 rubros');
  });

  await testAsync('guardar manda exactamente los rubros elegidos', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    m.w.cotizSegChip('Indumentaria');
    m.w.cotizSegChip('Calzado');
    await m.w.cotizSegGuardar();
    const up = m.escrituras.filter(e => e.t === 'proveedores' && e.op === 'update');
    igual(up.length, 1);
    igual(JSON.stringify(up[0].fila.rubros_seguidos), JSON.stringify(['Indumentaria', 'Calzado']));
    igual(up[0].eqs[0].val, PROV.id, 'no acoto el update a su propia fila');
  });

  await testAsync('guardar sin ninguno manda NULL, no un array vacio', async () => {
    // El CHECK de la base rechaza el array vacio a proposito: no puede haber
    // dos estados distintos que signifiquen "sin filtro".
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    m.w.cotizSegChip('Indumentaria');   // lo desmarca
    await m.w.cotizSegGuardar();
    const up = m.escrituras.filter(e => e.t === 'proveedores' && e.op === 'update');
    igual(up[up.length - 1].fila.rubros_seguidos, null);
  });

  await testAsync('"Seguir todos los rubros" guarda NULL de una', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    await m.w.cotizSegTodos();
    const up = m.escrituras.filter(e => e.t === 'proveedores' && e.op === 'update');
    igual(up[up.length - 1].fila.rubros_seguidos, null);
  });

  await testAsync('despues de guardar vuelve al feed ya filtrado', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: null });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    m.w.cotizSegChip('Indumentaria');
    await m.w.cotizSegGuardar();
    igual(contarTarjetas(m), 2, 'no volvio al feed o no aplico el filtro nuevo');
  });

  await testAsync('salirse sin guardar no cambia lo que estaba guardado', async () => {
    const m = montar({ usuario: proveedor, feed: feedMixto, seguidos: ['Indumentaria'] });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    m.w.cotizSegChip('Alimentos');
    m.w.cotizSegChip('Electrónica');
    await m.w.cotizIr('feed');
    igual(m.escrituras.filter(e => e.t === 'proveedores' && e.op === 'update').length, 0, 'guardo sin que se lo pidieran');
    igual(contarTarjetas(m), 2, 'el filtro cambio sin guardar');
  });

  await testAsync('si la base rechaza el guardado, avisa y se queda en la pantalla', async () => {
    const m = montar({
      usuario: proveedor, feed: feedMixto, seguidos: null,
      errorGuardar: { code: '23514', message: 'check constraint' }
    });
    await m.abrirFeed();
    await m.w.cotizIr('seguidos');
    m.w.cotizSegChip('Indumentaria');
    await m.w.cotizSegGuardar();
    contiene(m.toasts.join(' '), 'No se pudo guardar');
    asegurar(m.el('cz-seg-chips'), 'se fue de la pantalla despues de fallar');
  });

  // ------------------------------------------------------------------
  seccion('Formulario B: los pasos se encadenan y se despliegan');
  // ------------------------------------------------------------------

  async function formB() {
    const m = montar({ usuario: comprador, feed: [pedido()], misPedidos: [] });
    await m.abrirFeed();
    await m.w.cotizIr('publicarB');
    return m;
  }
  const visible = (m, id) => m.el(id) && m.el(id).style.display !== 'none';
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  await testAsync('el formulario arranca con un solo paso a la vista', async () => {
    const m = await formB();
    asegurar(!visible(m, 'cz-b-paso2'), 'el paso 2 nace visible');
    asegurar(!visible(m, 'cz-b-paso3'), 'el paso 3 nace visible');
    asegurar(!visible(m, 'cz-b-paso4'), 'el paso 4 nace visible');
    asegurar(!visible(m, 'cz-b-paso5'), 'el paso 5 nace visible');
  });

  await testAsync('el paso 2 aparece recien cuando escribio algo', async () => {
    const m = await formB();
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    asegurar(visible(m, 'cz-b-paso2'), 'el paso 2 no aparecio');
    asegurar(!visible(m, 'cz-b-paso3'), 'el paso 3 se adelanto');
  });

  await testAsync('el paso 3 espera a que elija al menos un producto', async () => {
    const m = await formB();
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    const primer = m.el('cz-b-chips').children[0];
    asegurar(primer, 'no salio ninguna sugerencia para "blanqueria"');
    m.w.cotizBChip(primer.textContent.trim());
    asegurar(visible(m, 'cz-b-paso3'), 'el paso 3 no aparecio al elegir un producto');
    asegurar(!visible(m, 'cz-b-paso4'), 'el paso 4 se adelanto');
  });

  await testAsync('los pasos 4 y 5 se encadenan detras de los anteriores', async () => {
    const m = await formB();
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    m.w.cotizBChip(m.el('cz-b-chips').children[0].textContent.trim());
    m.w.cotizBVende('vendiendo');
    asegurar(visible(m, 'cz-b-paso4'), 'el paso 4 no aparecio');
    asegurar(!visible(m, 'cz-b-paso5'), 'el paso 5 se adelanto');
    m.w.cotizBInversion('100-300');
    asegurar(visible(m, 'cz-b-paso5'), 'el paso 5 no aparecio');
  });

  await testAsync('un producto escrito a mano sobrevive al cambio de rubro', async () => {
    const m = await formB();
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    m.el('cz-b-propio').value = 'Repasadores';
    m.w.cotizBSumar();
    m.el('cz-b-texto').value = 'ropa de bebe';
    m.w.cotizBTexto();
    await esperar(340);
    contiene(m.el('cz-b-chips').textContent, 'Repasadores', 'se perdio el producto que habia escrito');
  });

  await testAsync('el paso que aparece se despliega en vez de aparecer de golpe', async () => {
    // Lo que se comprueba es que el modulo PIDA la animacion de alto: la
    // clase .entra que habia antes apuntaba a un keyframe sin fotograma
    // inicial y no movia absolutamente nada.
    const m = await formB();
    let pedida = null;
    const paso2 = m.el('cz-b-paso2');
    paso2.animate = fotogramas => {
      pedida = fotogramas;
      return { addEventListener: () => { } };
    };
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    asegurar(pedida, 'no se animo nada al aparecer el paso');
    igual(pedida[0].height, '0px', 'no arranca de alto cero');
    igual(pedida[0].opacity, 0, 'no arranca transparente');
    asegurar(pedida[1].height !== '0px', 'no termina en un alto real');
  });

  await testAsync('el margen se anima junto con el alto (si no, el salto vuelve)', async () => {
    const m = await formB();
    let pedida = null;
    m.el('cz-b-paso2').animate = f => { pedida = f; return { addEventListener: () => { } }; };
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    igual(pedida[0].marginBottom, '0px', 'el margen no arranca en cero');
    igual(pedida[1].marginBottom, '22px', 'el margen final no coincide con el CSS de .cz-paso-b');
  });

  await testAsync('el recorte se devuelve cuando la animacion termina', async () => {
    const m = await formB();
    const paso2 = m.el('cz-b-paso2');
    let anim = null;
    paso2.animate = () => {
      const oy = {};
      anim = { addEventListener: (e, f) => { (oy[e] = oy[e] || []).push(f); }, disparar: e => (oy[e] || []).forEach(f => f()) };
      return anim;
    };
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    igual(paso2.style.overflow, 'hidden', 'no recorto durante el despliegue');
    anim.disparar('finish');
    asegurar(paso2.style.overflow !== 'hidden', 'el paso quedo recortado para siempre');
  });

  await testAsync('el recorte se devuelve tambien si la animacion se cancela', async () => {
    const m = await formB();
    const paso2 = m.el('cz-b-paso2');
    let anim = null;
    paso2.animate = () => {
      const oy = {};
      anim = { addEventListener: (e, f) => { (oy[e] = oy[e] || []).push(f); }, disparar: e => (oy[e] || []).forEach(f => f()) };
      return anim;
    };
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    anim.disparar('cancel');
    asegurar(paso2.style.overflow !== 'hidden', 'un despliegue interrumpido deja el paso recortado');
  });

  await testAsync('con "menos movimiento" no se anima, pero el paso aparece igual', async () => {
    const m = montar({ usuario: comprador, feed: [pedido()], misPedidos: [], menosMovimiento: true });
    await m.abrirFeed();
    await m.w.cotizIr('publicarB');
    let animo = false;
    m.el('cz-b-paso2').animate = () => { animo = true; return { addEventListener: () => { } }; };
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    asegurar(!animo, 'animo pese a que el sistema pidio menos movimiento');
    asegurar(visible(m, 'cz-b-paso2'), 'el paso no aparecio');
  });

  await testAsync('el paso 2 no le mueve la pantalla mientras escribe', async () => {
    const m = await formB();
    let movio = false;
    m.el('cz-b-paso2').scrollIntoView = () => { movio = true; };
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    asegurar(!movio, 'le movio la pantalla abajo del teclado mientras tipeaba');
  });

  await testAsync('el paso 3 si se acerca: aparece despues de un toque', async () => {
    const m = await formB();
    m.el('cz-b-texto').value = 'blanqueria';
    m.w.cotizBTexto();
    await esperar(340);
    let movio = false;
    m.el('cz-b-paso3').scrollIntoView = () => { movio = true; };
    m.w.cotizBChip(m.el('cz-b-chips').children[0].textContent.trim());
    asegurar(movio, 'el paso nuevo nacio abajo del borde y nadie se lo acerco');
  });

  // ------------------------------------------------------------------
  seccion('Cantidad del formulario A (el chip renombrado)');
  // ------------------------------------------------------------------

  async function formA() {
    const m = montar({ usuario: comprador, feed: [pedido()], misPedidos: [] });
    await m.abrirFeed();
    await m.w.cotizIr('publicar');
    return m;
  }

  await testAsync('el chip ya no arranca con "No se"', async () => {
    const m = await formA();
    noContiene(m.html(), 'No sé, dígame su mínimo', 'sigue el texto viejo');
    contiene(m.html(), 'La que ustedes manejen');
  });

  await testAsync('sigue siendo la opcion elegida por defecto', async () => {
    const m = await formA();
    const chip = m.el('cz-cant-chips').children.find(b => b.dataset.modo === 'minimo');
    asegurar(chip, 'desaparecio el modo "minimo"');
    igual(chip.getAttribute('aria-pressed'), 'true', 'ya no viene elegido');
  });

  await testAsync('en ese modo se explica que cada proveedor responde con su minimo', async () => {
    const m = await formA();
    asegurar(m.el('cz-cant-nota').style.display !== 'none', 'la nota no se ve');
    contiene(m.el('cz-cant-nota').textContent, 'cantidad mínima');
  });

  await testAsync('elegir una cantidad concreta esconde esa nota', async () => {
    const m = await formA();
    m.w.cotizCantModo('50');
    igual(m.el('cz-cant-nota').style.display, 'none');
  });

  await testAsync('"Otra cantidad" abre el campo numerico', async () => {
    const m = await formA();
    m.w.cotizCantModo('otra');
    asegurar(m.el('cz-cant-otra').style.display !== 'none', 'el campo no aparecio');
  });

  // ------------------------------------------------------------------
  seccion('Regresiones que ya costaron una vez');
  // ------------------------------------------------------------------

  await testAsync('una respuesta sin precio no se pinta como "$0"', async () => {
    // plata(null) devolvia "$0" porque Number(null) es 0 y isFinite(0) es true.
    const solB = pedidoB({ id: 'sol-b2', respuestas: 1 });
    const m = montar({
      usuario: proveedor, feed: [solB],
      misCotiz: [{ solicitud_id: 'sol-b2', precio: null, created_at: new Date().toISOString(), tipo: 'proveedor', cubre: ['Toallas'] }]
    });
    await m.abrirFeed();
    noContiene(m.html(), '$0', 'volvio el "$0" de las respuestas sin precio');
  });

  await testAsync('una lista de productos con basura adentro no pinta [object Object]', async () => {
    const sucio = pedidoB({ productos: ['Toallas', { x: 1 }, null, 42, 'Sábanas'] });
    const m = montar({ usuario: proveedor, feed: [sucio] });
    await m.abrirFeed();
    noContiene(m.html(), '[object Object]');
    contiene(m.html(), 'Toallas');
  });

  await testAsync('un nombre o titulo con comillas no rompe la tarjeta', async () => {
    // Lo que escribe la gente es el riesgo real. Los id son uuid de Postgres
    // y no pueden traer comillas, asi que no se prueban como si pudieran.
    const m = montar({
      usuario: proveedor,
      feed: [pedido({ comprador_nombre: 'Ana "La Turca" G.', titulo: "Remeras d'algodón <b>ya</b>" })],
      misCotiz: []
    });
    await m.abrirFeed();
    const h = m.html();
    contiene(h, '&quot;', 'la comilla doble del nombre no se escapo');
    contiene(h, '&lt;b&gt;', 'el titulo entro con HTML crudo adentro');
    const titulo = m.doc.querySelector('.cz-titulo');
    asegurar(titulo, 'la tarjeta no se pinto');
    contiene(titulo.textContent, "d'algodón", 'el titulo se perdio por el camino');
  });

  await testAsync('un termino con comilla en el carril se escapa dos veces para el onclick', async () => {
    // El carril de demanda mete texto de busquedas reales adentro de un
    // atributo onclick: ahi si hace falta el doble escapado (JavaScript y
    // despues HTML). Si se hace uno solo, la tarjeta queda rota.
    const m = montar({ usuario: comprador, feed: [pedido()], misPedidos: [] });
    m.ctx.sb.rpc = (nombre, args) => {
      const orig = crearSupabase(() => ({ data: [], error: null }));
      const cad = orig.rpc(nombre, args);
      cad.then = res => Promise.resolve(nombre === 'cotiz_demanda_sin_respuesta'
        ? { data: [{ termino: "zapatillas d'hombre", busquedas: 12 }], error: null }
        : { data: [], error: null }).then(res);
      return cad;
    };
    await m.abrirFeed();
    const chip = m.doc.querySelectorAll('.cz-dem-chip')[0];
    asegurar(chip, 'no se pinto el carril de demanda');
    // Se mira el HTML del hueco del carril y no el de la pantalla entera: el
    // carril se pinta solo sobre su propio nodo (#cz-carril), asi que el DOM de
    // mentira, que devuelve el ultimo string asignado a CADA nodo, ya no lo
    // tiene adentro del padre. Lo que se afirma es lo mismo de siempre: el
    // termino salio escapado por las dos capas, JavaScript y despues HTML.
    const carril = m.doc.getElementById('cz-carril');
    asegurar(carril, 'falta el hueco #cz-carril');
    contiene(carril.innerHTML, '\\&#39;', 'la comilla no paso por el escapado doble');
  });

  await testAsync('el feed sin sesion no filtra ni ofrece rubros seguidos', async () => {
    const m = montar({ usuario: null, feed: feedMixto });
    await m.abrirFeed();
    igual(contarTarjetas(m), 5);
    asegurar(!hay(m, '.cz-seg-barra'), 'le ofrecio seguir rubros a un visitante sin sesion');
  });

  /* =====================================================================
     ENTRAR A LA SECCION NO SE TIENE QUE TRABAR

     Lo que se rompio: tocar "Probar" en la portada no mostraba nada durante
     varios segundos, la gente volvia a tocar, y el numero grande del pulso
     se reiniciaba dos o tres veces antes de quedarse quieto.

     Eran tres cosas sumadas, y hay una prueba por cada una:
       1. el esqueleto de carga era inalcanzable saliendo de la portada;
       2. sin guarda de reentrada, cada toque disparaba una carga entera;
       3. la consulta del carril (la mas cara de la base) estaba colgada del
          mismo Promise.all que el feed, que vuelve en milisegundos.
     ===================================================================== */
  seccion('Entrar a la seccion no se tiene que trabar');

  /* Deja UNA consulta colgada para poder mirar la pantalla en el medio de la
     carga. Devuelve la palanca que la suelta. */
  function trabar(m, nombreRpc) {
    let soltar;
    const trabado = new Promise(r => { soltar = r; });
    const rpcOriginal = m.ctx.sb.rpc;
    m.ctx.sb.rpc = (nombre, args) => {
      const cad = rpcOriginal(nombre, args);
      if (nombre !== nombreRpc) return cad;
      const thenOriginal = cad.then;
      // El await de un thenable llama a .then(resolve, reject) y espera a que
      // alguien llame a resolve; lo que .then devuelva no le importa. Por eso
      // alcanza con demorar la llamada al original.
      cad.then = (res, rej) => trabado.then(() => thenOriginal(res, rej));
      return cad;
    };
    return soltar;
  }

  const respirar = () => new Promise(r => setImmediate(r));
  const vecesRpc = (m, nombre) => m.sb.llamadas.filter(l => l.indexOf(nombre) >= 0).length;

  /* Las dos pruebas del carril entran a la seccion con esa consulta colgada a
     proposito. Si alguien la volviera a meter adentro del Promise.all del
     feed, el await no volveria NUNCA y el proceso se apagaria en silencio al
     quedarse sin nada pendiente. Con el limite falla con un mensaje que se
     entiende, que es de lo que se trata una prueba de regresion. */
  const conLimite = (p, msg) => Promise.race([
    p, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error(msg)), 2000))
  ]);

  await testAsync('al tocar "Probar" aparece el esqueleto, no la portada de nuevo', async () => {
    const m = montar({ usuario: null, feed: [pedido()] });
    await m.w.abrirCotizaciones();
    asegurar(hay(m, '.cz-portada'), 'no se pinto la portada');

    const soltar = trabar(m, 'cotiz_feed_publico');
    const enCurso = m.w.cotizIr('feed');
    await respirar();

    // Esto es exactamente lo que fallaba: render() miraba st.vista antes que
    // st.cargando, y cotizIr() prende st.cargando SIN haber cambiado todavia
    // la vista. Resultado: se repintaba la portada identica y la pantalla
    // parecia no responder.
    asegurar(hay(m, '[aria-busy]'), 'no se pinto el esqueleto de carga');
    asegurar(!hay(m, '.cz-portada'), 'se repinto la portada en vez del esqueleto');

    soltar();
    await enCurso;
    asegurar(hay(m, '.cz-pulso'), 'el feed no llego a pintarse');
  });

  await testAsync('tocar "Probar" tres veces seguidas carga los datos una sola vez', async () => {
    const m = montar({ usuario: null, feed: [pedido()] });
    await m.w.abrirCotizaciones();
    const antes = m.sb.llamadas.length;

    // Los tres toques salen antes de que termine el primero, que es lo que
    // hacia una persona cuando la pantalla no le contestaba.
    await Promise.all([m.w.cotizIr('feed'), m.w.cotizIr('feed'), m.w.cotizIr('feed')]);
    await respirar();

    const feeds = m.sb.llamadas.slice(antes).filter(l => l.indexOf('cotiz_feed_publico') >= 0).length;
    igual(feeds, 1, 'cada toque de mas volvio a cargar todo');
    asegurar(hay(m, '.cz-pulso'), 'el feed no quedo pintado');
  });

  await testAsync('el feed no espera al carril de demanda para pintarse', async () => {
    const m = montar({ usuario: null, feed: [pedido()] });
    const soltar = trabar(m, 'cotiz_demanda_sin_respuesta');

    // Con el carril colgado, el feed tiene que estar igual: si esto se cae,
    // alguien lo volvio a meter adentro del Promise.all.
    await conLimite(m.w.cotizIr('feed'), 'el feed se quedo esperando al carril');
    asegurar(hay(m, '.cz-pulso'), 'el feed se quedo esperando al carril');
    asegurar(hay(m, '#cz-carril'), 'falta el hueco donde se pinta el carril');

    soltar();
    await respirar();
  });

  await testAsync('volver a entrar no duplica la consulta cara del carril', async () => {
    const m = montar({ usuario: null, feed: [pedido()] });
    const soltar = trabar(m, 'cotiz_demanda_sin_respuesta');

    // La segunda entrada pasa con la consulta anterior TODAVIA en vuelo. La
    // guarda vieja miraba st.demanda, que sigue en null hasta que vuelve, asi
    // que las dos pasaban y mandaban la consulta dos veces.
    await conLimite(m.w.cotizIr('feed'), 'el feed se quedo esperando al carril');
    await conLimite(m.w.cotizIr('feed'), 'el feed se quedo esperando al carril');
    soltar();
    await respirar();

    igual(vecesRpc(m, 'cotiz_demanda_sin_respuesta'), 1, 'el carril se pidio de mas');
  });

  await testAsync('el carril aparece solo cuando llega, sin repintar el feed', async () => {
    const m = montar({ usuario: null, feed: [pedido()] });
    m.ctx.sb.rpc = (nombre, args) => {
      const orig = crearSupabase(() => ({ data: [], error: null }));
      const cad = orig.rpc(nombre, args);
      cad.then = res => Promise.resolve(nombre === 'cotiz_demanda_sin_respuesta'
        ? { data: [{ termino: 'gorras lisas', busquedas: 9 }], error: null }
        : { data: [pedido()], error: null }).then(res);
      return cad;
    };

    await m.w.cotizIr('feed');
    asegurar(!hay(m, '.cz-dem-chip'), 'el carril llego antes que el feed');
    await respirar();
    asegurar(hay(m, '.cz-dem-chip'), 'el carril nunca aparecio');
    // El pulso sigue en pie: el carril se pinta sobre su propio nodo y no
    // vuelve a llamar a render(), que reiniciaria la cuenta ascendente.
    asegurar(hay(m, '.cz-pulso'), 'pintar el carril se llevo puesto el feed');

    // Volver a entrar usa el OTRO camino: la demanda ya esta en memoria, asi
    // que el carril sale pintado de una en el propio HTML del feed en vez de
    // llegar despues. Los dos caminos tienen que dar lo mismo.
    await m.w.cotizIr('feed');
    asegurar(hay(m, '.cz-dem-chip'), 'al volver a entrar el carril desaparecio');
  });

  // ------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  if (fallas.length) {
    console.log(fallas.length + ' FALLARON, ' + ok + ' pasaron\n');
    fallas.forEach(f => console.log('  [' + f.grupo + '] ' + f.nombre + '\n    ' + (f.e && f.e.stack || f.e)));
    process.exit(1);
  }
  console.log(ok + ' comprobaciones, todas en verde');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
