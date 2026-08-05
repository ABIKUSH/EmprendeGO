/* =====================================================================
   SOY EMPRENDEDOR — módulo aislado (no toca el resto de la app).
   Vive dentro de #screen-emprendedor. Se abre con window.abrirEmprendedor().
   Usa el cliente global `sb` (Supabase). SOLO LECTURAS.
   Muestra únicamente datos reales: categorías (proveedores.rubro),
   demanda (busquedas), productos y proveedores (productos + proveedores).
   La capa de Mercado Libre (precio/tendencia externa) se suma después.
   ===================================================================== */
(function () {
  'use strict';

  // Categorías canónicas con al menos 1 proveedor (validado con datos reales).
  // match = substring (sin acentos) que se busca dentro de proveedores.rubro.
  const CATS = [
    { key: 'Indumentaria', match: 'indumentaria' },
    { key: 'Bazar', match: 'bazar' },
    { key: 'Hogar y Deco', match: 'hogar' },
    { key: 'Blanquería', match: 'blanquer' },
    { key: 'Tecnología', match: 'tecnolog' },
    { key: 'Bebés y Niños', match: 'bebe' },
    { key: 'Belleza y Salud', match: 'belleza' },
    { key: 'Electrónica', match: 'electr' },
    { key: 'Packaging', match: 'packaging' },
    { key: 'Juguetería', match: 'juguet' },
    { key: 'Calzado', match: 'calzado' },
    { key: 'Deportes', match: 'deporte' },
    { key: 'Marroquinería y Bolsos', match: 'marroqu' },
    { key: 'Librería y Papelería', match: 'librer' },
    { key: 'Limpieza', match: 'limpieza' },
    { key: 'Mascotas', match: 'mascota' }
  ];

  // Pistas de rubro: si nadie tiene el producto publicado con ese nombre, al menos
  // sabemos a qué categoría pertenece y podemos ofrecer proveedores del rubro.
  // Se evalúa en orden: la primera pista contenida en el término gana.
  const PISTAS = [
    { k: ['zapatilla', 'zapato', 'bota', 'sandalia', 'ojota', 'calzado', 'crocs'], cat: 'Calzado' },
    { k: ['remera', 'campera', 'buzo', 'pantalon', 'jean', 'vestido', 'short', 'media', 'ropa', 'indumentaria', 'camisa', 'bikini', 'malla', 'jogging', 'ambo'], cat: 'Indumentaria' },
    { k: ['auricular', 'celular', 'tablet', 'notebook', 'cargador', 'parlante', 'smartwatch', 'teclado', 'mouse', 'monitor', 'gamer', 'usb', 'cable', 'power bank', 'led'], cat: 'Tecnología' },
    { k: ['televisor', 'aire acondicionado', 'heladera', 'lavarropa', 'microonda', 'electrodomestico'], cat: 'Electrónica' },
    { k: ['aspiradora', 'cocina', 'licuadora', 'cafetera', 'ventilador', 'mueble', 'silla', 'escritorio', 'deco', 'lampara', 'organizador'], cat: 'Hogar y Deco' },
    { k: ['mate', 'termo', 'vaso', 'taza', 'olla', 'sarten', 'bazar', 'cubierto', 'bandeja', 'tupper'], cat: 'Bazar' },
    { k: ['sabana', 'toalla', 'acolchado', 'almohada', 'cubrecama', 'manta', 'blanqueria'], cat: 'Blanquería' },
    { k: ['perfume', 'maquillaje', 'crema', 'shampoo', 'labial', 'esmalte', 'belleza', 'skincare', 'cosmetic'], cat: 'Belleza y Salud' },
    { k: ['mochila', 'bolso', 'cartera', 'billetera', 'riñonera', 'rinonera', 'valija'], cat: 'Marroquinería y Bolsos' },
    { k: ['juguete', 'muñec', 'munec', 'peluche', 'rompecabeza', 'didactic'], cat: 'Juguetería' },
    { k: ['pañal', 'panal', 'bebe', 'cochecito', 'mamadera', 'chupete'], cat: 'Bebés y Niños' },
    { k: ['pelota', 'bicicleta', 'mancuerna', 'gimnasio', 'fitness', 'deporte', 'casco'], cat: 'Deportes' },
    { k: ['cuaderno', 'lapiz', 'birome', 'papel', 'libreria', 'escolar', 'carpeta'], cat: 'Librería y Papelería' },
    { k: ['perro', 'gato', 'mascota', 'alimento balanceado'], cat: 'Mascotas' },
    { k: ['bolsa', 'caja', 'packaging', 'etiqueta', 'cinta', 'sobre'], cat: 'Packaging' },
    { k: ['detergente', 'lavandina', 'limpieza', 'jabon', 'trapo'], cat: 'Limpieza' }
  ];

  // Devuelve la categoría probable de un término libre, o null.
  function catDeTermino(term) {
    const t = norm(term);
    if (!t) return null;
    for (const p of PISTAS) {
      if (p.k.some(k => t.includes(k))) return CATS.find(c => c.key === p.cat) || null;
    }
    return null;
  }

  // Términos de ubicación / ruido que NO son productos (para el "más buscado").
  const RUIDO = new Set([
    'buenos aires', 'caba', 'capital federal', 'cordoba', 'córdoba', 'mendoza',
    'rosario', 'la plata', 'santa fe', 'tucuman', 'tucumán', 'salta', 'neuquen',
    'neuquén', 'mar del plata', 'argentina', 'bsas', 'gba', 'once', 'flores'
  ]);

  let built = false;
  let dataListo = false;
  const seStack = [];          // historial interno de vistas
  let provCache = null;        // proveedores aprobados [{id, nombre, rubro, ...}]

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
  const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const esc = (s) => (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function fotoDe(p) {
    if (Array.isArray(p.imagenes) && p.imagenes.length && p.imagenes[0]) return p.imagenes[0];
    return p.imagen_url || p.foto_url || '';
  }
  function waLink(whatsapp, texto) {
    const num = (whatsapp || '').toString().replace(/\D/g, '');
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
  }

  /* ---------- router interno de sub-vistas ---------- */
  function show(view, push) {
    if (!built) return;
    document.querySelectorAll('#screen-emprendedor .se-view').forEach(v => v.classList.remove('se-on'));
    const v = $('se-view-' + view);
    if (v) v.classList.add('se-on');
    if (push !== false) {
      if (seStack[seStack.length - 1] !== view) seStack.push(view);
    }
    const sc = document.querySelector('#screen-emprendedor');
    if (sc) sc.scrollTop = 0;
    try { window.scrollTo({ top: 0 }); } catch (e) { }
  }
  function seBack() {
    seStack.pop();
    const prev = seStack[seStack.length - 1];
    if (prev) { show(prev, false); }
    else if (typeof goTo === 'function') { goTo('inicio'); }
  }

  /* ---------- construcción del DOM (una vez) ---------- */
  function build() {
    if (built) return;
    const scr = $('screen-emprendedor');
    if (!scr) return;
    scr.innerHTML = `
    <div class="se-root">

      <!-- ONBOARDING -->
      <section class="se-view se-on" id="se-view-onboarding">
        <div class="se-obg"></div>
        <button class="se-fab-back" data-back aria-label="Volver">${icoBack()}</button>
        <div class="se-onb">
          <span class="se-eyebrow"><span class="se-pulse"></span> Datos del mercado · en vivo</span>
          <h1 class="se-h1">Vendé lo que <em>ya se busca.</em></h1>
          <p class="se-bajada">Te mostramos qué se busca en el mercado y qué proveedor de EmprendeGO te lo vende por mayor.</p>
          <div class="se-steps">
            <div class="se-step"><div class="se-num">1</div><div><b>¿Qué vendo?</b><small>Lo más buscado y por categoría.</small></div></div>
            <div class="se-step"><div class="se-num">2</div><div><b>¿Quién me lo vende?</b><small>Proveedores verificados y su precio por mayor.</small></div></div>
            <div class="se-step three"><div class="se-num">3</div><div><b>Arranco</b><small>Contactás y hacés tu primer pedido.</small></div></div>
          </div>
          <div class="se-onb-cta">
            <button class="se-cta" id="se-btn-empezar">Ver el mercado hoy ${icoArrow()}</button>
            <p class="se-mono se-hint">Gratis · Sin registrarte</p>
          </div>
        </div>
      </section>

      <!-- MERCADO -->
      <section class="se-view" id="se-view-mercado">
        <div class="se-head">
          <button class="se-back" data-back aria-label="Volver">${icoBack()}</button>
          <div class="se-title">El mercado hoy</div>
          <span class="se-live"><span class="se-livedot"></span> En vivo</span>
        </div>
        <div class="se-scroll">
          <div class="se-searchbar" id="se-open-search">${icoSearch('var(--se-ink3)')}<span class="se-search-ph">Buscar un producto…</span></div>
          <div class="se-seclabel"><div class="se-h3">Lo más buscado en el mercado</div><span class="se-mono se-muted" id="se-trend-src">cargando…</span></div>
          <div id="se-buscado">${loading()}</div>
          <div class="se-seclabel"><div class="se-h3">Explorá por categoría</div></div>
          <div class="se-catgrid" id="se-catgrid">${loading()}</div>
          <p class="se-mono se-fuente">TENDENCIAS DEL MERCADO · PROVEEDORES DE EMPRENDEGO</p>
        </div>
      </section>

      <!-- BUSCADOR -->
      <section class="se-view" id="se-view-buscar">
        <div class="se-head">
          <button class="se-back" data-back aria-label="Volver">${icoBack()}</button>
          <div class="se-title">Buscar producto</div>
        </div>
        <div class="se-scroll">
          <div class="se-searchbar se-active">${icoSearch('var(--se-verde)')}<input id="se-q" placeholder="Ej: perfume, mochila, mate…" autocomplete="off"></div>
          <div id="se-res"></div>
        </div>
      </section>

      <!-- CATEGORÍA -->
      <section class="se-view" id="se-view-categoria">
        <div class="se-head">
          <button class="se-back" data-back aria-label="Volver">${icoBack()}</button>
          <div class="se-title" id="se-cat-title">Categoría</div>
        </div>
        <div class="se-scroll">
          <div class="se-cat-hero"><div class="se-h2" id="se-cat-h">—</div><p class="se-sub" id="se-cat-sub">—</p></div>
          <div id="se-cat-list">${loading()}</div>
        </div>
      </section>

      <!-- PRODUCTO → PROVEEDORES -->
      <section class="se-view" id="se-view-prod">
        <div class="se-head">
          <button class="se-back" data-back aria-label="Volver">${icoBack()}</button>
          <div class="se-title" id="se-prod-title">Producto</div>
        </div>
        <div class="se-scroll">
          <div class="se-prodhero" id="se-prodhero"></div>
          <div class="se-seclabel"><div class="se-h3">Quién te lo vende</div></div>
          <div id="se-prov-list">${loading()}</div>
          <p class="se-mono se-fuente">PROVEEDORES Y PRECIOS · EMPRENDEGO</p>
        </div>
      </section>

    </div>`;

    // listeners (delegados / directos, todos dentro del módulo)
    scr.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', seBack));
    const btnEmp = $('se-btn-empezar');
    if (btnEmp) btnEmp.addEventListener('click', () => show('mercado'));
    const openSearch = $('se-open-search');
    if (openSearch) openSearch.addEventListener('click', () => { show('buscar'); setTimeout(() => { const q = $('se-q'); if (q) q.focus(); }, 60); });
    const q = $('se-q');
    if (q) q.addEventListener('input', (e) => buscar(e.target.value));

    built = true;
  }

  /* ---------- iconos (SVG inline, sin dependencias) ---------- */
  function icoBack() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'; }
  function icoArrow() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'; }
  function icoChevron() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'; }
  function icoSearch(c) { return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'; }
  function icoWa() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2.3 1.3 1.1 2.3 1.5 2.6 1.6.3.1.5.1.7-.1l.7-.9c.2-.3.4-.2.7-.1l2 .9c.3.1.5.2.5.4.1.1.1.6-.1 1.3z"/></svg>'; }
  function icoCheck() { return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.6 1.9 3.2-.2 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.2L12 23l-2.6-1.9-3.2.2-1-3L2.6 16.4l1-3-1-3 2.6-1.9 1-3 3.2.2L12 1z"/><path d="M8 12l2.5 2.5L16 9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function loading() { return '<div class="se-loading"><span class="se-spin"></span></div>'; }
  function fotoBox(p, cls) {
    const url = fotoDe(p);
    if (url) return '<div class="' + cls + '" style="background-image:url(\'' + esc(url) + '\')"></div>';
    return '<div class="' + cls + ' se-noimg">' + (esc((p.nombre || '·')[0]).toUpperCase()) + '</div>';
  }

  /* ---------- carga de datos reales (una vez) ---------- */
  async function cargarProveedores() {
    if (provCache) return provCache;
    try {
      const { data } = await sb.from('proveedores')
        .select('id,nombre,rubro,provincia,whatsapp,logo_url,foto_url,pedido_minimo,estado,plan,instagram,envios')
        .eq('estado', 'aprobado');
      provCache = data || [];
    } catch (e) { provCache = []; }
    return provCache;
  }
  function provsDeCat(cat) {
    return (provCache || []).filter(p => norm(p.rubro).includes(cat.match));
  }

  async function loadMercado() {
    if (dataListo) return;
    dataListo = true;
    await cargarProveedores();
    renderCategorias();
    renderMasBuscado();
  }

  function renderCategorias() {
    const cont = $('se-catgrid');
    if (!cont) return;
    const cards = CATS
      .map(c => ({ c, n: provsDeCat(c).length }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map(x => `
        <button class="se-catcard" data-cat="${esc(x.c.key)}">
          <span class="se-cat-name">${esc(x.c.key)}</span>
          <span class="se-cat-n se-mono">${x.n} proveedor${x.n !== 1 ? 'es' : ''}</span>
        </button>`).join('');
    cont.innerHTML = cards || '<p class="se-muted" style="padding:8px 2px">Sin categorías disponibles.</p>';
    cont.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => verCategoria(b.dataset.cat)));
  }

  async function renderMasBuscado() {
    const cont = $('se-buscado');
    if (!cont) return;
    let terms = [];
    let fromMarket = false;
    // 1) Tendencias del mercado (ML vía backend /api/ml?action=trends). Nunca rompe.
    try {
      const r = await fetch('/api/ml?action=trends', { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.trends) && j.trends.length) { terms = j.trends.slice(0, 12); fromMarket = true; }
      }
    } catch (e) { }
    // 2) Fallback: demanda real dentro de EmprendeGO (tabla busquedas).
    if (!terms.length) {
      try {
        const { data } = await sb.from('busquedas').select('termino,resultados').not('termino', 'is', null).order('created_at', { ascending: false }).limit(1000);
        const conteo = {};
        (data || []).forEach(r => { const t = norm(r.termino); if (!t || t.length < 3 || RUIDO.has(t)) return; conteo[t] = (conteo[t] || 0) + 1; });
        terms = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0]);
      } catch (e) { }
    }
    const src = $('se-trend-src');
    if (src) src.textContent = fromMarket ? 'en vivo' : 'demanda en EmprendeGO';
    if (!terms.length) { cont.innerHTML = '<p class="se-muted" style="padding:8px 2px">Todavía no hay datos de tendencias.</p>'; return; }
    cont.innerHTML = '<div class="se-chips">' + terms.map((t, i) =>
      `<button class="se-chip" data-term="${esc(t)}"><span class="se-chip-pos">${i + 1}</span> ${esc(t)}</button>`
    ).join('') + '</div>';
    // Tocar una tendencia = matchear con proveedores de EmprendeGO.
    cont.querySelectorAll('[data-term]').forEach(b => b.addEventListener('click', () => abrirProducto(b.dataset.term)));
  }

  /* ---------- categoría → productos ---------- */
  async function verCategoria(key) {
    const cat = CATS.find(c => c.key === key);
    if (!cat) return;
    $('se-cat-title').textContent = key;
    $('se-cat-h').textContent = key;
    const provs = provsDeCat(cat);
    $('se-cat-sub').textContent = provs.length + ' proveedor' + (provs.length !== 1 ? 'es' : '') + ' en esta categoría';
    const list = $('se-cat-list');
    list.innerHTML = loading();
    show('categoria');
    let prods = [];
    try {
      const ids = provs.map(p => p.id);
      if (ids.length) {
        const { data } = await sb.from('productos')
          .select('id,nombre,precio,imagenes,imagen_url,foto_url,proveedor_id')
          .in('proveedor_id', ids).eq('visible', true)
          .order('created_at', { ascending: false }).limit(60);
        prods = data || [];
      }
    } catch (e) { prods = []; }
    if (!prods.length) {
      list.innerHTML = `<div class="se-empty"><div class="se-empty-t">Todavía no hay productos cargados en ${esc(key)}</div><p class="se-muted">Hay proveedores del rubro; podés contactarlos igual desde Buscar.</p></div>`;
      return;
    }
    list.innerHTML = prods.map(p => rowProducto(p)).join('');
    list.querySelectorAll('[data-prod]').forEach(b => b.addEventListener('click', () => abrirProducto(b.dataset.prod)));
  }

  function rowProducto(p) {
    return `<button class="se-prodrow" data-prod="${esc(p.nombre)}">
      ${fotoBox(p, 'se-prodthumb')}
      <div class="se-prodinfo"><b>${esc(p.nombre)}</b>${p.precio ? '<span class="se-mono se-prodprice">' + money(p.precio) + '</span>' : ''}</div>
      ${icoChevron()}
    </button>`;
  }

  /* ---------- producto → proveedores (matching real) ---------- */
  async function abrirProducto(term) {
    const t = (term || '').trim();
    if (!t) return;
    $('se-prod-title').textContent = t;
    $('se-prodhero').innerHTML = '';
    const list = $('se-prov-list');
    list.innerHTML = loading();
    show('prod');
    let prods = [];
    try {
      const { data } = await sb.from('productos')
        .select('id,nombre,precio,imagenes,imagen_url,foto_url,proveedor_id')
        .ilike('nombre', '%' + t + '%').eq('visible', true).limit(120);
      prods = data || [];
    } catch (e) { prods = []; }

    // agrupar por proveedor
    const porProv = {};
    prods.forEach(p => {
      const id = p.proveedor_id;
      if (!id) return;
      if (!porProv[id]) porProv[id] = { min: p.precio || null, ejemplo: p.nombre, count: 0 };
      porProv[id].count++;
      if (p.precio && (porProv[id].min == null || p.precio < porProv[id].min)) porProv[id].min = p.precio;
    });
    const provIds = Object.keys(porProv);

    // hero con datos reales del catálogo
    const precios = prods.map(p => p.precio).filter(x => x > 0);
    const heroBits = [];
    if (precios.length) {
      const lo = Math.min(...precios), hi = Math.max(...precios);
      const rango = lo === hi ? money(lo) : `${money(lo)}<span>–</span>${money(hi)}`;
      heroBits.push(`<div class="se-stat"><div class="se-stat-n se-mono">${rango}</div><div class="se-stat-l se-mono">precio en el catálogo</div></div>`);
    }
    heroBits.push(`<div class="se-stat"><div class="se-stat-n se-mono">${provIds.length}</div><div class="se-stat-l se-mono">proveedor${provIds.length !== 1 ? 'es' : ''} lo vende${provIds.length !== 1 ? 'n' : ''}</div></div>`);
    $('se-prodhero').innerHTML = '<div class="se-h2" style="margin-bottom:12px">' + esc(t) + '</div><div class="se-stats">' + heroBits.join('') + '</div>';

    await cargarProveedores();

    // Nadie lo tiene publicado con ese nombre. Antes de mostrar un callejón sin
    // salida, ofrecemos proveedores del rubro al que pertenece el término,
    // diciendo con todas las letras que es del rubro y no un producto publicado.
    if (!provIds.length) {
      const cat = catDeTermino(t);
      const delRubro = cat ? provsDeCat(cat) : [];
      if (delRubro.length) {
        const cards = delRubro
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
          .map(p => cardProveedor(p, { min: null, count: 0, rubroOnly: true }, t)).join('');
        list.innerHTML =
          `<div class="se-nota">
             <div class="se-nota-t">Nadie lo tiene publicado todavía</div>
             <p class="se-muted">Estos ${delRubro.length} proveedores son del rubro ${esc(cat.key)}. No figura “${esc(t)}” en su catálogo, pero es lo suyo: conviene preguntarles directo.</p>
           </div>` + cards;
        list.querySelectorAll('[data-wa]').forEach(b => b.addEventListener('click', () => { window.open(b.dataset.wa, '_blank'); }));
        return;
      }
      list.innerHTML = `<div class="se-empty"><div class="se-empty-t">Todavía no tenemos proveedores con “${esc(t)}” publicado</div><p class="se-muted">Probá con un término más general, o mirá las categorías.</p></div>`;
      return;
    }

    const byId = {}; (provCache || []).forEach(p => byId[p.id] = p);
    const cards = provIds
      .map(id => ({ prov: byId[id], info: porProv[id] }))
      .filter(x => x.prov)
      .sort((a, b) => (a.info.min || 9e9) - (b.info.min || 9e9))
      .map(x => cardProveedor(x.prov, x.info, t)).join('');
    list.innerHTML = cards || `<div class="se-empty"><div class="se-empty-t">Proveedores no disponibles ahora</div></div>`;
    list.querySelectorAll('[data-wa]').forEach(b => b.addEventListener('click', () => { window.open(b.dataset.wa, '_blank'); }));
  }

  function cardProveedor(prov, info, term) {
    const ini = (prov.nombre || '·')[0].toUpperCase();
    const logo = prov.logo_url || prov.foto_url || '';
    const avatar = logo
      ? `<div class="se-supp-logo" style="background-image:url('${esc(logo)}')"></div>`
      : `<div class="se-supp-logo se-supp-ini">${esc(ini)}</div>`;
    const msg = info.rubroOnly
      ? `Hola ${prov.nombre || ''}, te contacto desde EmprendeGO. ¿Manejás ${term} por mayor? Estoy armando mi emprendimiento y quiero revender. Si tenés, ¿me pasás precios y mínimo de compra? ¡Gracias!`
      : `Hola ${prov.nombre || ''}, te contacto desde EmprendeGO. Me interesa comprar ${term} por mayor para revender. ¿Me pasás precios y mínimo de compra? ¡Gracias!`;
    const min = prov.pedido_minimo ? `<div class="se-sfig"><div class="se-sfl se-mono">Mínimo</div><div class="se-sfv">${esc(prov.pedido_minimo)}</div></div>` : '';
    const precio = info.min ? `<div class="se-sfig"><div class="se-sfl se-mono">Desde</div><div class="se-sfv se-mono">${money(info.min)}</div></div>` : '';
    // En el fallback por rubro no hay productos que contar: mostrar "0" seria enganoso.
    const prods = info.rubroOnly
      ? `<div class="se-sfig"><div class="se-sfl se-mono">Rubro</div><div class="se-sfv">${esc((prov.rubro || '').split(',')[0].trim() || '—')}</div></div>`
      : `<div class="se-sfig"><div class="se-sfl se-mono">Productos</div><div class="se-sfv se-mono">${info.count}</div></div>`;
    return `<div class="se-supp">
      <div class="se-supp-top">
        ${avatar}
        <div class="se-supp-name">
          <b>${esc(prov.nombre || 'Proveedor')} <span class="se-verif" title="Verificado">${icoCheck()}</span></b>
          <div class="se-supp-loc se-mono">${esc(prov.provincia || 'Argentina')}</div>
        </div>
      </div>
      <div class="se-sfigs">${precio}${min}${prods}</div>
      ${prov.whatsapp ? `<button class="se-cta se-wa" data-wa="${esc(waLink(prov.whatsapp, msg))}">${icoWa()} Contactar por WhatsApp</button>` : '<div class="se-muted se-mono" style="text-align:center;font-size:.72rem;padding:8px">Sin WhatsApp cargado</div>'}
    </div>`;
  }

  /* ---------- buscador ---------- */
  let buscarT = null;
  function buscar(q) {
    const cont = $('se-res');
    if (!cont) return;
    const t = norm(q);
    clearTimeout(buscarT);
    if (t.length < 2) { cont.innerHTML = '<p class="se-muted se-mono" style="padding:12px 2px">Escribí al menos 2 letras…</p>'; return; }
    cont.innerHTML = loading();
    buscarT = setTimeout(async () => {
      let prods = [];
      try {
        const { data } = await sb.from('productos')
          .select('id,nombre,precio,imagenes,imagen_url,foto_url,proveedor_id')
          .ilike('nombre', '%' + q.trim() + '%').eq('visible', true).limit(40);
        prods = data || [];
      } catch (e) { prods = []; }
      // dedup por nombre para no repetir
      const vistos = new Set(); const uniq = [];
      prods.forEach(p => { const k = norm(p.nombre); if (!vistos.has(k)) { vistos.add(k); uniq.push(p); } });
      if (!uniq.length) {
        cont.innerHTML = `<div class="se-empty"><div class="se-empty-t">Todavía no medimos “${esc(q.trim())}”</div><p class="se-muted">Ningún proveedor lo tiene publicado por ahora. Quedó registrado como demanda.</p></div>`;
        return;
      }
      cont.innerHTML = uniq.map(p => rowProducto(p)).join('');
      cont.querySelectorAll('[data-prod]').forEach(b => b.addEventListener('click', () => abrirProducto(b.dataset.prod)));
    }, 260);
  }

  /* ---------- entrada pública ---------- */
  window.abrirEmprendedor = function () {
    try { if (typeof closeDrawer === 'function') closeDrawer(); } catch (e) { }
    build();
    seStack.length = 0;
    try { if (typeof goTo === 'function') goTo('emprendedor'); } catch (e) { }
    show('onboarding');
    loadMercado();
  };
})();
