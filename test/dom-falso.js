/* =====================================================================
   DOM de mentira, lo minimo para que corra js/cotizaciones.js en Node.

   POR QUE ESTO Y NO jsdom: el proyecto no tiene package.json ni bundler a
   proposito (ver CLAUDE.md). Meter una dependencia de desarrollo para
   probar un archivo obligaria a instalar node_modules en un repo que hoy se
   despliega tal cual esta. Esto son 150 lineas y no se instala nada.

   NO pretende ser un navegador. Implementa exactamente lo que el modulo
   toca: getElementById, innerHTML, querySelectorAll por selectores simples,
   classList, dataset, style, children y los pocos metodos de nodo que usa.
   Si algun dia el modulo empieza a usar algo mas, esto se cae con un error
   claro en vez de mentir un resultado.
   ===================================================================== */
'use strict';

/* Parser de HTML mas que rudimentario: alcanza para reconstruir el arbol de
   elementos con sus atributos y su texto. No entiende comentarios ni CDATA;
   si aparecen, se los saltea. */
const VACIOS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'path',
  'circle', 'line', 'polyline', 'rect', 'polygon', 'use', 'stop', 'ellipse']);

function parsearAtributos(txt) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(txt))) {
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    attrs[m[1].toLowerCase()] = desescapar(val);
  }
  return attrs;
}

function desescapar(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

class Elemento {
  constructor(tag, attrs) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.attrs = attrs || {};
    this.children = [];      // solo elementos, como en el DOM real
    this.textoPropio = '';
    this.padre = null;
    this._style = {};
    this._html = null;       // se recalcula si alguien lo pide

    // style="a:b;c:d" -> objeto, para que el modulo pueda leerlo y escribirlo
    const st = this.attrs.style || '';
    st.split(';').forEach(par => {
      const i = par.indexOf(':');
      if (i < 0) return;
      const k = par.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (k) this._style[k] = par.slice(i + 1).trim();
    });
  }

  get id() { return this.attrs.id || ''; }
  get style() { return this._style; }

  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }

  get classList() {
    const el = this;
    const lista = () => (el.attrs.class || '').split(/\s+/).filter(Boolean);
    return {
      contains: c => lista().indexOf(c) >= 0,
      add: c => { const l = lista(); if (l.indexOf(c) < 0) l.push(c); el.attrs.class = l.join(' '); },
      remove: c => { el.attrs.class = lista().filter(x => x !== c).join(' '); }
    };
  }

  get dataset() {
    const d = {};
    Object.keys(this.attrs).forEach(k => {
      if (k.indexOf('data-') !== 0) return;
      d[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k];
    });
    return d;
  }

  getAttribute(n) { const v = this.attrs[String(n).toLowerCase()]; return v === undefined ? null : v; }
  setAttribute(n, v) { this.attrs[String(n).toLowerCase()] = String(v); }
  removeAttribute(n) { delete this.attrs[String(n).toLowerCase()]; }

  get textContent() {
    return this.textoPropio + this.children.map(c => c.textContent).join('');
  }
  set textContent(v) { this.children = []; this.textoPropio = String(v); this._html = null; }

  get innerHTML() { return this._html === null ? this.textoPropio : this._html; }
  set innerHTML(v) {
    this._html = String(v);
    const { hijos, texto } = construir(String(v));
    this.children = hijos;
    hijos.forEach(h => { h.padre = this; });
    this.textoPropio = texto;
  }

  // Los <input>/<select>/<textarea> arrancan con lo que diga el atributo
  // value y despues viven aparte, como en el DOM real.
  get value() { return this._value === undefined ? (this.attrs.value || '') : this._value; }
  set value(v) { this._value = String(v); }

  get offsetWidth() { return 320; }   // lo unico que se le pide es existir
  get scrollHeight() { return 120; }  // alto de mentira para el despliegue

  remove() {
    if (!this.padre) return;
    this.padre.children = this.padre.children.filter(c => c !== this);
  }

  animate() {
    // Devuelve algo con la forma de una Animation: el modulo le engancha
    // 'finish' y 'cancel' para devolver el overflow.
    const oyentes = {};
    return {
      addEventListener: (ev, fn) => { (oyentes[ev] = oyentes[ev] || []).push(fn); },
      disparar: ev => (oyentes[ev] || []).forEach(fn => fn())
    };
  }
  scrollIntoView() { }
  focus() { }
  click() { }

  // Selectores soportados: '#id', '.clase', 'tag', '[attr]' y combinaciones
  // simples separadas por coma. Nada de descendencia ni de pseudo-clases.
  querySelectorAll(sel) {
    const partes = String(sel).split(',').map(s => s.trim()).filter(Boolean);
    const salida = [];
    this.recorrer(el => { if (partes.some(p => coincide(el, p))) salida.push(el); });
    return salida;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

  recorrer(fn) { this.children.forEach(c => { fn(c); c.recorrer(fn); }); }
}

function coincide(el, sel) {
  if (sel[0] === '#') return el.id === sel.slice(1);
  if (sel[0] === '.') return el.classList.contains(sel.slice(1));
  if (sel[0] === '[') {
    const m = sel.match(/^\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]$/);
    if (!m) return false;
    const v = el.getAttribute(m[1]);
    return m[2] === undefined ? v !== null : v === m[2];
  }
  return el.tagName === sel.toUpperCase();
}

function construir(html) {
  const hijos = [];
  const pila = [];
  let texto = '';
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][-a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let ult = 0, m;

  const meter = el => {
    if (pila.length) { el.padre = pila[pila.length - 1]; pila[pila.length - 1].children.push(el); }
    else hijos.push(el);
  };
  const sumarTexto = t => {
    if (!t) return;
    if (pila.length) pila[pila.length - 1].textoPropio += t; else texto += t;
  };

  while ((m = re.exec(html))) {
    sumarTexto(desescapar(html.slice(ult, m.index)));
    ult = re.lastIndex;
    if (m[0].indexOf('<!--') === 0) continue;

    const cierre = m[1] === '/', tag = m[2].toLowerCase(), resto = m[3] || '';
    if (cierre) {
      for (let i = pila.length - 1; i >= 0; i--) {
        if (pila[i].tagName === tag.toUpperCase()) { pila.length = i; break; }
      }
      continue;
    }
    const el = new Elemento(tag, parsearAtributos(resto));
    meter(el);
    if (!VACIOS.has(tag) && resto.trim().slice(-1) !== '/') pila.push(el);
  }
  sumarTexto(desescapar(html.slice(ult)));
  return { hijos, texto };
}

function crearDocumento() {
  const raiz = new Elemento('body', {});
  return {
    raiz,
    getElementById(id) {
      let hit = null;
      raiz.recorrer(el => { if (!hit && el.id === id) hit = el; });
      return hit;
    },
    createElement(tag) { return new Elemento(tag, {}); },
    querySelectorAll(sel) { return raiz.querySelectorAll(sel); },
    querySelector(sel) { return raiz.querySelector(sel); },
    addEventListener() { },
    documentElement: new Elemento('html', {}),
    body: raiz
  };
}

module.exports = { Elemento, crearDocumento, construir, desescapar };
