/* =====================================================================
   PRUEBAS DEL BUSCADOR DE PROVEEDORES

   Correr:   node test/buscador.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias ni red ni base,
   igual que el resto de test/ (no hay package.json en este repo a proposito).

   POR QUE EXISTE ESTE ARCHIVO
   El 2026-09-04 un proveedor (VisioWipe) aviso que no aparecia buscando
   "lentes", teniendo la palabra escrita en su perfil. La causa: los tres
   lugares que leen la descripcion del proveedor para buscar la pedian como
   `p.descripcion`, pero cargarProveedores() la guarda en `p.desc`. O sea que
   la descripcion NUNCA participo de la busqueda, desde el primer commit.
   Medido sobre 90 dias de busquedas reales: 1.980 de las 9.516 que
   devolvieron cero tenian un proveedor aprobado con ese mismo termino
   escrito en su descripcion.

   COMO ESTAN ESCRITAS
   No copian la logica: cargan js/buscador.js y js/app.js de verdad en un
   contexto de Node con un DOM y un Supabase de mentira, y despues llaman a
   las mismas funciones que llama filterProvs(). Si alguien vuelve a cambiar
   el nombre del campo, estas pruebas se ponen rojas.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

/* ---------------- corredor de pruebas ---------------- */

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

/* ---------------- entorno de mentira ----------------
   Un DOM que nunca devuelve null: app.js pinta pantallas al cargar y aca no
   hay index.html. No pretende parecerse a un navegador, solo dejar que el
   archivo termine de cargarse para poder llamar a sus funciones. */

function elemento(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: '', value: '', textContent: '',
    innerHTML: '', className: '', children: [], dataset: {}, style: {},
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; }, removeChild() { },
    insertAdjacentHTML() { }, setAttribute() { }, getAttribute() { return null; },
    addEventListener() { }, removeEventListener() { }, remove() { },
    querySelector() { return elemento(); }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() { }, focus() { }, click() { },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
  return el;
}

function crearContexto() {
  const porId = new Map();
  const doc = {
    getElementById(id) {
      if (!porId.has(id)) { const e = elemento(); e.id = id; porId.set(id, e); }
      return porId.get(id);
    },
    createElement: elemento,
    querySelector() { return elemento(); },
    querySelectorAll() { return []; },
    addEventListener() { }, removeEventListener() { },
    body: elemento(), head: elemento(), documentElement: elemento(),
    title: '', cookie: '', readyState: 'complete'
  };

  // Supabase de mentira: encadenable y siempre vacio. Lo unico que importa es
  // que ninguna llamada explote mientras app.js arranca.
  const sb = {
    from() { return this; }, select() { return this; }, eq() { return this; },
    order() { return Promise.resolve({ data: [], error: null }); },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    insert() { return { then(res) { res && res({}); return Promise.resolve({}); } }; },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange() { return { data: { subscription: { unsubscribe() { } } } }; },
      signOut: () => Promise.resolve({ error: null })
    }
  };

  const ctx = {
    console, document: doc, sb,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
    sessionStorage: { getItem: () => null, setItem() { }, removeItem() { } },
    navigator: { userAgent: 'node', vibrate() { }, onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    location: { search: '', pathname: '/', href: 'http://test/', hash: '' },
    history: { pushState() { }, replaceState() { } },
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' }),
    supabase: { createClient: () => sb },
    gtag() { }, dataLayer: [],
    Image: function () { },
    IntersectionObserver: function () { this.observe = () => { }; this.disconnect = () => { }; },
    addEventListener() { }, removeEventListener() { },
    matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { } }),
    requestAnimationFrame: f => setTimeout(f, 0),
    URLSearchParams, URL, Promise,
    alert() { }, scrollTo() { }, innerWidth: 390, innerHeight: 800
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.top = ctx;
  vm.createContext(ctx);

  for (const archivo of ['js/buscador.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'), ctx, { filename: archivo });
  }
  return ctx;
}

const ctx = crearContexto();

// proveedoresDB y productosReales son `let` de app.js: no son propiedades del
// objeto global, asi que se cargan ejecutando una asignacion adentro del mismo
// contexto. De paso se limpian los caches del corrector, que se invalidan por
// cantidad de filas y no notarian un cambio de contenido con el mismo largo.
function cargarProveedores(lista) {
  vm.runInContext(
    'proveedoresDB = ' + JSON.stringify(lista) + ';' +
    'productosReales = [];' +
    '_egVocabHuella = ""; _egCacheCorreccion = new Map();',
    ctx
  );
  return vm.runInContext('proveedoresDB', ctx);
}

// La misma llamada que hace filterProvs(): escalera de rescate con matchesQuery
// como match literal y el conteo de tokens sobre el blob del proveedor.
function buscar(lista, q) {
  return ctx.egEscaleraBusqueda(
    lista, q,
    (p, texto) => ctx.matchesQuery(p, texto),
    (p, toks) => ctx._contarTokens(ctx._provBlob(p), p.provincia, p.rubro, toks)
  ).lista;
}
function nombres(lista) { return lista.map(p => p.nombre).sort().join(', '); }

/* ---------------- datos ----------------
   Calcados de proveedoresDB tal como lo arma cargarProveedores(): la
   descripcion viaja en `desc`. El primero es el caso real que destapo el bug:
   "lentes" existe solo en su descripcion, no en el nombre ni en el rubro. */

// OJO AL ELEGIR LA PALABRA DE PRUEBA: tiene que ser una que no exista en
// SUBCATEGORIA_MAP ni en el lexico del rubro, o el proveedor aparece igual por
// otro camino y la prueba pasa incluso con el bug puesto. "zapatillas", por
// ejemplo, no sirve: mapea sola a Calzado. "toallitas" no esta en ningun mapeo.
const VISIOWIPE = {
  id: '1', nombre: 'VisioWipe | Tech & Optics', rubro: 'Tecnología, Limpieza',
  provincia: 'Buenos Aires',
  desc: 'Toallitas humedas premium para Lentes y Tecnología. Mayoristas especializados.'
};
const BYPACK = {
  id: '2', nombre: 'Bypack Calzados', rubro: 'Calzado', provincia: 'Córdoba',
  desc: 'Fabricantes de zapatillas urbanas por mayor.'
};
const KOQUIT = {
  id: '3', nombre: 'Koquit', rubro: 'Indumentaria', provincia: 'Santa Fe',
  desc: 'Lenceria y corseteria femenina.'
};
const SIN_DESC = { id: '4', nombre: 'Mayorista Pelado', rubro: 'Bazar', provincia: 'Mendoza', desc: '' };
const BASE = [VISIOWIPE, BYPACK, KOQUIT, SIN_DESC];

/* ===================== PRUEBAS ===================== */

seccion('La descripcion del proveedor entra en la busqueda');

test('encuentra por una palabra que solo esta en la descripcion', () => {
  const db = cargarProveedores(BASE);
  igual(nombres(buscar(db, 'lentes')), 'VisioWipe | Tech & Optics');
});

test('encuentra por un producto nombrado solo en la descripcion', () => {
  const db = cargarProveedores(BASE);
  igual(nombres(buscar(db, 'toallitas')), 'VisioWipe | Tech & Optics');
});

test('el rescate por tokens tambien ve la descripcion', () => {
  // Dos palabras sueltas de la descripcion que no forman una frase contigua:
  // el match literal no puede resolverlo y tiene que entrar el rescate por
  // tokens, que lee el blob de _provBlob(). Ninguna de las dos esta en el
  // nombre ni en el rubro, asi que no hay otro camino posible.
  const db = cargarProveedores(BASE);
  igual(nombres(buscar(db, 'toallitas lentes')), 'VisioWipe | Tech & Optics');
});

test('el corrector aprende palabras de las descripciones', () => {
  // "corseteria" solo existe en una descripcion. Si el vocabulario la ignora,
  // el error de tipeo no se corrige y la busqueda muere en cero.
  const db = cargarProveedores(BASE.concat([
    { id: '5', nombre: 'A', rubro: 'Indumentaria', provincia: 'CABA', desc: 'corseteria' },
    { id: '6', nombre: 'B', rubro: 'Indumentaria', provincia: 'CABA', desc: 'corseteria' }
  ]));
  igual(ctx.egCorregirBusqueda('corseteriaa').texto, 'corseteria');
  asegurar(buscar(db, 'corseteriaa').length > 0, 'el termino corregido tendria que encontrar algo');
});

test('un sinonimo llega hasta la descripcion (anteojos -> lentes)', () => {
  const db = cargarProveedores(BASE);
  igual(nombres(buscar(db, 'anteojos')), 'VisioWipe | Tech & Optics');
});

seccion('Lo que ya funcionaba sigue igual');

test('matchesQuery sigue aceptando la forma cruda de Supabase (descripcion)', () => {
  // Esta pasa con y sin el arreglo, y tiene que seguir asi: no todos los
  // objetos de proveedor salen del mapeo de cargarProveedores(), y si algun
  // dia se unifican los nombres de campo, el que quede afuera no puede
  // dejar de buscarse en silencio.
  const crudo = { nombre: 'X', rubro: 'Bazar', provincia: 'CABA', descripcion: 'vendemos termos' };
  asegurar(ctx.matchesQuery(crudo, 'termos'));
});

test('sigue encontrando por nombre', () => {
  const db = cargarProveedores(BASE);
  igual(nombres(buscar(db, 'koquit')), 'Koquit');
});

test('sigue encontrando por rubro', () => {
  const db = cargarProveedores(BASE);
  igual(nombres(buscar(db, 'bazar')), 'Mayorista Pelado');
});

test('sigue encontrando por provincia', () => {
  const db = cargarProveedores(BASE);
  igual(nombres(buscar(db, 'mendoza')), 'Mayorista Pelado');
});

test('un proveedor sin descripcion no rompe nada', () => {
  asegurar(ctx.matchesQuery(SIN_DESC, 'bazar'));
  asegurar(!ctx.matchesQuery({ nombre: 'Z', rubro: 'Bazar', provincia: 'CABA' }, 'lentes'));
});

test('el cero honesto se mantiene', () => {
  // Si no hay nadie, tiene que dar cero: ese dato es el que dice a quien
  // reclutar. Un cero disfrazado de resultado es peor que no encontrar nada.
  const db = cargarProveedores(BASE);
  igual(buscar(db, 'motosierra').length, 0);
});

/* ---------------- cierre ---------------- */

console.log('\n' + ok + ' comprobaciones ok, ' + fallas.length + ' fallas');
if (fallas.length) {
  console.log('\nFallaron:');
  fallas.forEach(f => console.log('  [' + f.grupo + '] ' + f.nombre + '\n    ' + (f.e && f.e.stack || f.e)));
  process.exit(1);
}
process.exit(0);
