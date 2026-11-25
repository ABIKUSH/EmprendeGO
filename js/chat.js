/* ============================================================
   CHAT INTERNO NUEVO (2026-11-25)

   Reemplaza al chat viejo SOLO cuando la llave esta prendida. Con la llave
   apagada este archivo no hace nada: no pinta, no consulta, no se suscribe.

   LA LLAVE
   - CHAT_PARA_TODOS = false  -> solo lo ve quien entro alguna vez con
     ?chat=nuevo (queda guardado en ese navegador). ?chat=viejo lo apaga.
   - Para prenderlo para todos: CHAT_PARA_TODOS = true y publicar.

   COMO SE ENGANCHA (sin tocar app.js)
   Las funciones de app.js son globales; aca se reemplazan las del chat
   (abrirChatDirecto, cargarMensajesUsuario, sendMsg, volverChat,
   detChatProd) y se envuelve goTo para mostrar los botones escondidos.
   Todo lo demas de la app queda igual.

   LA BASE (sql/2026-11-25_chat_interno_base.sql, aplicada el 2026-11-25)
   - Una conversacion = (proveedor_id, usuario_email). No hay otra tabla.
   - Realtime: se escucha la tabla entera SIN filtro y RLS decide que filas
     le llegan a cada uno. Es a proposito: no depende de filtrar por un email.
   - Lo unico que se puede actualizar de un mensaje es `leido`.

   ⚠️ #chat-inp tiene que seguir existiendo: enviarPedidoPorChat() de app.js
   escribe ahi el pedido del carrito antes de que la persona lo mande.
   ============================================================ */
(function () {
  'use strict';

  var CHAT_PARA_TODOS = false;
  var CLAVE = 'eg_chat_nuevo';

  // La query string se lee ACA, al cargar el script: el handler de
  // DOMContentLoaded de app.js la borra con pushState (ver CLAUDE.md).
  try {
    var q = new URLSearchParams(location.search).get('chat');
    if (q === 'nuevo') localStorage.setItem(CLAVE, '1');
    else if (q === 'viejo') localStorage.removeItem(CLAVE);
  } catch (e) { }
  var activo = CHAT_PARA_TODOS;
  try { activo = activo || localStorage.getItem(CLAVE) === '1'; } catch (e) { }
  if (!activo) return;
  window.EG_CHAT_NUEVO = true;

  // Los estilos se cargan solo con la llave prendida.
  try {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/chat.css?v=20261125-chat1';
    document.head.appendChild(css);
  } catch (e) { }

  /* ---------------- utilidades ---------------- */
  function esc(s) { return window.escHtml ? window.escHtml(s == null ? '' : String(s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usuario() { try { return typeof currentUser !== 'undefined' ? currentUser : null; } catch (e) { return null; } }
  function cliente() { try { return typeof sb !== 'undefined' ? sb : null; } catch (e) { return null; } }
  function toast(m) { if (window.showToast) window.showToast(m); }
  function medir(n, p) { try { if (window.trackEvent) window.trackEvent(n, p || {}); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  function iniciales(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + ((p[1] || '')[0] || (p[0] || '')[1] || '')).toUpperCase(); }
  var PALETA = ['#006039', '#8a5a2b', '#3d5a80', '#7b2d43', '#5b6b8c', '#6b4c8a', '#2d6a6a', '#9a6b1f'];
  function colorDe(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return PALETA[Math.abs(h) % PALETA.length]; }
  function hashCorto(s) { var h = 5381; s = String(s || ''); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function hora(d) { var x = new Date(d); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); }
  function mismoDia(a, b) { a = new Date(a); b = new Date(b); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function etiquetaDia(d) {
    var hoy = new Date(), ayer = new Date(Date.now() - 864e5);
    if (mismoDia(d, hoy)) return 'Hoy';
    if (mismoDia(d, ayer)) return 'Ayer';
    var dias = (Date.now() - new Date(d).getTime()) / 864e5;
    if (dias < 7) { var w = new Date(d).toLocaleDateString('es-AR', { weekday: 'long' }); return w.charAt(0).toUpperCase() + w.slice(1); }
    return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  }
  function horaLista(d) {
    if (mismoDia(d, new Date())) return hora(d);
    if (mismoDia(d, new Date(Date.now() - 864e5))) return 'Ayer';
    var dias = (Date.now() - new Date(d).getTime()) / 864e5;
    if (dias < 7) { var w = new Date(d).toLocaleDateString('es-AR', { weekday: 'long' }); return w.charAt(0).toUpperCase() + w.slice(1); }
    return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }
  function hace(d) {
    var min = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 60000));
    if (min < 60) return 'Hace ' + min + ' min';
    var h = Math.round(min / 60);
    if (h < 24) return 'Hace ' + h + ' h';
    var dd = Math.round(h / 24);
    return 'Hace ' + dd + (dd === 1 ? ' día' : ' días');
  }
  var tactil = (function () { try { return window.matchMedia('(pointer:coarse)').matches; } catch (e) { return false; } })();

  var SVG = {
    ver: '<svg class="cx-ver" viewBox="0 0 24 24" aria-label="Verificado"><circle cx="12" cy="12" r="10" fill="#006039"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    t1: '<svg class="cx-tick" viewBox="0 0 18 12" aria-label="Enviado"><path d="M3 6.5l3.2 3.2L13 2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    t2: '<svg class="cx-tick" viewBox="0 0 18 12" aria-label="Leído"><path d="M1 6.5l3.2 3.2L10.5 2.5M7 9.2l.6.5L14.5 2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reloj: '<svg class="cx-tick" viewBox="0 0 24 24" aria-label="Enviando" style="width:12px;height:12px"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    atras: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    enviar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    lupa: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
  };

  var RAPIDAS = {
    comprador: ['¿Tiene stock?', '¿Cuál es el mínimo de compra?', '¿Hace envíos al interior?', '¿Qué formas de pago acepta?'],
    proveedor: ['Sí, tenemos stock.', 'Le paso la lista de precios.', '¿Cuántas unidades necesita?', '¿A qué localidad sería el envío?']
  };

  /* ---------------- estado ---------------- */
  var S = {
    conv: null,          // conversacion abierta
    canal: null,         // realtime de la tabla (badges + chat abierto)
    canalOk: false,
    tipeo: null,         // canal "escribiendo..." de la conversacion abierta
    ultimoTipeoEnviado: 0,
    tipeoRemotoT: null,
    pollT: null,         // respaldo si realtime no conecta
    claveSesion: '',
    noLeidosComprador: 0,
    provEsperando: 0,
    provMasViejo: null,
    convsProveedor: [],
    pestanaBandeja: 'sin',
    autoPestana: true,
    recontarT: null,
    pintados: {}
  };

  /* ================================================================
     PANTALLA DEL CHAT
     ================================================================ */
  function montarPantallaChat() {
    var s = $('screen-chat');
    if (!s || s.getAttribute('data-cx') === '1') return;
    s.setAttribute('data-cx', '1');
    s.style.padding = '0';
    s.innerHTML =
      '<div class="cx-chat">' +
      '<div class="cx-head"><button class="cx-atras" id="cx-atras" aria-label="Volver">' + SVG.atras + '</button>' +
      '<div class="cx-av s" id="cx-av"></div><div class="quien" id="cx-quien"><div class="n" id="cx-nom"></div><div class="s" id="cx-sub"></div></div></div>' +
      '<div id="cx-ficha-wrap"></div>' +
      '<div class="cx-msgs" id="cx-msgs" role="log" aria-live="polite"></div>' +
      '<div class="cx-rapidas" id="cx-rapidas"></div>' +
      '<div class="cx-barra"><div class="cx-inp"><textarea id="chat-inp" rows="1" maxlength="2000" placeholder="Escriba su mensaje" aria-label="Mensaje"></textarea></div>' +
      '<button class="cx-env" id="cx-env" aria-label="Enviar">' + SVG.enviar + '</button></div>' +
      '</div>';
    $('cx-atras').addEventListener('click', volver);
    $('cx-env').addEventListener('click', function () { enviarDesdeCaja(); });
    $('cx-quien').addEventListener('click', function () {
      if (S.conv && S.conv.rol === 'comprador' && window.abrirDetalle) { var id = S.conv.provId; window.abrirDetalle(id); }
    });
    var ta = $('chat-inp');
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !tactil) { e.preventDefault(); enviarDesdeCaja(); }
    });
    ta.addEventListener('input', function () { autoAlto(); pintarRapidas(); avisarTipeo(); });
  }

  function autoAlto() {
    var ta = $('chat-inp'); if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  function pintarCabecera() {
    var c = S.conv; if (!c) return;
    var av = $('cx-av');
    if (c.logo) av.innerHTML = '<img src="' + esc(c.logo) + '" alt="">';
    else { av.textContent = iniciales(c.nombreOtro); }
    av.style.background = colorDe(c.nombreOtro);
    $('cx-nom').innerHTML = '<span>' + esc(c.nombreOtro) + '</span>' + (c.rol === 'comprador' && c.verificado ? SVG.ver : '');
    pintarSub();
  }
  function pintarSub() {
    var c = S.conv, el = $('cx-sub'); if (!c || !el) return;
    if (c.tipeando) { el.textContent = 'escribiendo...'; el.className = 's en'; return; }
    el.className = 's';
    el.textContent = c.rol === 'comprador' ? (c.rubro || 'Proveedor') : 'Comprador';
  }

  function pintarFicha() {
    var w = $('cx-ficha-wrap'); if (!w) return;
    var p = S.conv && S.conv.producto;
    if (!p) { w.innerHTML = ''; return; }
    var foto = p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">' : '';
    var precio = (p.precio != null && Number(p.precio) > 0) ? '$ ' + Number(p.precio).toLocaleString('es-AR') : '';
    w.innerHTML = '<div class="cx-ficha" id="cx-ficha">' + foto +
      '<div style="min-width:0"><div class="fn">' + esc(p.nombre) + '</div>' + (precio ? '<div class="fp">' + esc(precio) + ' <span class="fm">por mayor</span></div>' : '') + '</div>' +
      '<a role="button">Ver</a></div>';
    $('cx-ficha').addEventListener('click', function () { if (window.abrirDetalleProd) window.abrirDetalleProd(p.id); });
  }

  function pintarRapidas() {
    var el = $('cx-rapidas'), ta = $('chat-inp'); if (!el || !S.conv) return;
    if (ta && ta.value.trim()) { el.innerHTML = ''; return; }
    var lista = RAPIDAS[S.conv.rol] || [];
    el.innerHTML = lista.map(function (t, i) { return '<button type="button" class="cx-rap" data-i="' + i + '">' + esc(t) + '</button>'; }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.cx-rap'), function (b) {
      b.addEventListener('click', function () {
        var t = lista[Number(b.getAttribute('data-i'))];
        ta.value = t; autoAlto(); ta.focus(); pintarRapidas();
      });
    });
  }

  function claveMsg(m) { return m.id || m.tmp; }
  function esMio(m) { return S.conv && ((S.conv.rol === 'comprador' && m.de_tipo === 'usuario') || (S.conv.rol === 'proveedor' && m.de_tipo === 'proveedor')); }

  function pintarMensajes(forzarAbajo) {
    var el = $('cx-msgs'); if (!el || !S.conv) return;
    var cercaDelFondo = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    var c = S.conv, html = '', diaPrevio = null;
    if (!c.msgs.length) {
      html = '<div class="cx-vacio">' + (c.rol === 'comprador'
        ? 'Escríbale a ' + esc(c.nombreOtro) + '. Le avisamos que tiene un mensaje suyo.'
        : 'Todavía no hay mensajes en esta conversación.') + '</div>';
    }
    c.msgs.forEach(function (m) {
      if (!diaPrevio || !mismoDia(diaPrevio, m.created_at)) { html += '<div class="cx-dia">' + esc(etiquetaDia(m.created_at)) + '</div>'; diaPrevio = m.created_at; }
      var mio = esMio(m), k = claveMsg(m), nuevo = !S.pintados[k];
      S.pintados[k] = true;
      var estado = '';
      if (mio) {
        if (m.estado === 'enviando') estado = '<span style="color:rgba(255,255,255,.7)">' + SVG.reloj + '</span>';
        else if (m.estado === 'error') estado = '<span class="err">No enviado. Toque para reintentar</span>';
        else if (m.leido) estado = '<span style="color:#9fe0ff">' + SVG.t2 + '</span>';
        else estado = '<span style="color:rgba(255,255,255,.75)">' + SVG.t1 + '</span>';
      }
      html += '<div class="cx-b ' + (mio ? 'yo' : 'el') + (nuevo ? ' cx-nuevo' : '') + (m.estado === 'error' ? ' err' : '') + '" data-k="' + esc(k) + '">' +
        esc(m.texto) + '<div class="h">' + (m.estado === 'error' ? '' : esc(hora(m.created_at))) + ' ' + estado + '</div></div>';
    });
    if (c.tipeando) html += '<div class="cx-esc" aria-label="Escribiendo"><i></i><i></i><i></i></div>';
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll('.cx-b.err'), function (b) {
      b.addEventListener('click', function () { reintentar(b.getAttribute('data-k')); });
    });
    if (forzarAbajo || cercaDelFondo) el.scrollTop = el.scrollHeight;
  }

  /* ---------------- abrir una conversacion ---------------- */
  async function abrirConversacion(datos) {
    var u = usuario(), db = cliente();
    if (!u || !db) return;
    cerrarConversacion();
    montarPantallaChat();
    S.pintados = {};
    S.conv = {
      rol: datos.rol, provId: String(datos.provId), email: String(datos.email || '').toLowerCase(),
      nombreOtro: datos.nombreOtro || (datos.rol === 'comprador' ? 'Proveedor' : 'Comprador'),
      logo: datos.logo || '', rubro: datos.rubro || '', verificado: !!datos.verificado,
      productoId: datos.productoId || null, producto: null, msgs: [], cargando: true, tipeando: false
    };
    var ta = $('chat-inp'); if (ta) { ta.value = ''; autoAlto(); }
    pintarCabecera(); pintarFicha(); pintarRapidas();
    $('cx-msgs').innerHTML = '<div class="cx-vacio">Cargando la conversación...</div>';
    if (window.goTo) window.goTo('chat');
    await cargarConversacion(true);
    unirseTipeo();
    arrancarRespaldo();
  }

  async function cargarConversacion(primeraVez) {
    var c = S.conv, db = cliente(); if (!c || !db) return;
    var r = await db.from('mensajes')
      .select('id,proveedor_id,usuario_email,de_tipo,de_nombre,texto,leido,created_at,producto_id')
      .eq('proveedor_id', c.provId).eq('usuario_email', c.email)
      .order('created_at', { ascending: true }).limit(1000);
    if (S.conv !== c) return; // se cerro mientras cargaba
    if (r.error) {
      if (primeraVez) $('cx-msgs').innerHTML = '<div class="cx-vacio">No pudimos abrir esta conversación. Revise su conexión e intente de nuevo.</div>';
      return;
    }
    var pendientes = c.msgs.filter(function (m) { return !m.id; });
    c.msgs = (r.data || []).concat(pendientes);
    c.cargando = false;
    if (!c.productoId) {
      for (var i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].producto_id) { c.productoId = c.msgs[i].producto_id; break; }
    }
    if (c.productoId && !c.producto) cargarProducto(c);
    pintarMensajes(true);
    marcarLeidos();
  }

  async function cargarProducto(c) {
    var db = cliente(); if (!db) return;
    try {
      var r = await db.from('productos').select('id,nombre,precio,imagen_url,foto_url,imagenes').eq('id', c.productoId).maybeSingle();
      if (S.conv !== c || !r.data) return;
      var p = r.data, foto = p.imagen_url || p.foto_url || '';
      if (!foto && Array.isArray(p.imagenes) && p.imagenes.length) foto = typeof p.imagenes[0] === 'string' ? p.imagenes[0] : (p.imagenes[0] && p.imagenes[0].url) || '';
      c.producto = { id: p.id, nombre: p.nombre, precio: p.precio, foto: foto };
      pintarFicha();
    } catch (e) { }
  }

  function marcarLeidos() {
    var c = S.conv, db = cliente(); if (!c || !db || document.hidden) return;
    var delOtro = c.rol === 'comprador' ? 'proveedor' : 'usuario';
    var hay = c.msgs.some(function (m) { return m.de_tipo === delOtro && !m.leido; });
    if (!hay) return;
    c.msgs.forEach(function (m) { if (m.de_tipo === delOtro) m.leido = true; });
    db.from('mensajes').update({ leido: true })
      .eq('proveedor_id', c.provId).eq('usuario_email', c.email)
      .eq('de_tipo', delOtro).eq('leido', false)
      .then(function () { recontarPronto(); }, function () { });
  }

  function cerrarConversacion() {
    if (S.tipeo) { try { cliente().removeChannel(S.tipeo); } catch (e) { } S.tipeo = null; }
    if (S.pollT) { clearTimeout(S.pollT); S.pollT = null; }
    if (S.tipeoRemotoT) { clearTimeout(S.tipeoRemotoT); S.tipeoRemotoT = null; }
    S.conv = null;
  }

  function volver() {
    var rol = S.conv && S.conv.rol;
    cerrarConversacion();
    if (window.goBack) window.goBack(rol === 'proveedor' ? 'cx-bandeja' : 'mensajes');
  }

  /* ---------------- mandar ---------------- */
  function enviarDesdeCaja() {
    var ta = $('chat-inp'); if (!ta) return;
    var t = ta.value.trim(); if (!t) return;
    ta.value = ''; autoAlto(); pintarRapidas();
    enviar(t);
    if (!tactil) ta.focus();
  }

  async function enviar(texto, reuso) {
    var c = S.conv, u = usuario(), db = cliente();
    if (!c || !u || !db) return;
    texto = String(texto).slice(0, 2000);
    var m = reuso || { id: null, tmp: 't' + Date.now() + Math.random().toString(36).slice(2), de_tipo: c.rol === 'comprador' ? 'usuario' : 'proveedor', texto: texto, created_at: new Date().toISOString(), leido: false };
    m.estado = 'enviando';
    if (!reuso) c.msgs.push(m);
    pintarMensajes(true);
    var fila = { proveedor_id: c.provId, de_tipo: m.de_tipo, de_nombre: u.name || '', usuario_email: c.email, texto: texto, leido: false };
    if (c.productoId) fila.producto_id = c.productoId;
    var r;
    try { r = await db.from('mensajes').insert(fila).select('id,created_at').single(); } catch (e) { r = { error: e }; }
    if (r.error || !r.data) {
      m.estado = 'error';
      if (S.conv === c) pintarMensajes();
      return;
    }
    // Puede que realtime haya traido la fila antes que la respuesta.
    var yaEsta = c.msgs.some(function (x) { return x !== m && x.id === r.data.id; });
    if (yaEsta) c.msgs = c.msgs.filter(function (x) { return x !== m; });
    else { S.pintados[r.data.id] = true; m.id = r.data.id; m.created_at = r.data.created_at; m.estado = 'ok'; }
    if (S.conv === c) pintarMensajes();
    if (c.rol === 'comprador') {
      medir('mensaje_chat', { provider_id: c.provId, con_producto: !!c.productoId });
      // Mismo aviso por correo que mandaba el chat viejo (fire-and-forget).
      try {
        fetch('/api/notificar-mensaje', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proveedor_id: c.provId, de_nombre: u.name || '', texto: texto })
        }).catch(function () { });
      } catch (e) { }
    }
  }

  function reintentar(k) {
    var c = S.conv; if (!c) return;
    var m = c.msgs.find(function (x) { return claveMsg(x) === k; });
    if (m && m.estado === 'error') enviar(m.texto, m);
  }

  /* ---------------- "escribiendo..." ---------------- */
  function unirseTipeo() {
    var c = S.conv, db = cliente(); if (!c || !db || !db.channel) return;
    try {
      // El nombre no lleva el email: lleva un resumen que no se puede revertir.
      var ch = db.channel('cxt-' + c.provId + '-' + hashCorto(c.email), { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'tipeo' }, function (p) {
        if (!S.conv || S.conv !== c) return;
        if (!p || !p.payload || p.payload.rol === c.rol) return;
        c.tipeando = true; pintarSub(); pintarMensajes();
        if (S.tipeoRemotoT) clearTimeout(S.tipeoRemotoT);
        S.tipeoRemotoT = setTimeout(function () { if (S.conv === c) { c.tipeando = false; pintarSub(); pintarMensajes(); } }, 4000);
      });
      ch.subscribe();
      S.tipeo = ch;
    } catch (e) { }
  }
  function avisarTipeo() {
    if (!S.tipeo || !S.conv) return;
    var ahora = Date.now();
    if (ahora - S.ultimoTipeoEnviado < 2500) return;
    S.ultimoTipeoEnviado = ahora;
    try { S.tipeo.send({ type: 'broadcast', event: 'tipeo', payload: { rol: S.conv.rol } }); } catch (e) { }
  }

  /* ---------------- tiempo real ---------------- */
  function esDeMiConversacion(row) {
    var c = S.conv;
    return c && String(row.proveedor_id) === c.provId && String(row.usuario_email || '').toLowerCase() === c.email;
  }
  function meIncumbe(row) {
    var u = usuario(); if (!u) return false;
    if (String(row.usuario_email || '').toLowerCase() === String(u.email || '').toLowerCase()) return true;
    return !!(u.proveedorId && String(row.proveedor_id) === String(u.proveedorId));
  }

  function alCambio(pl) {
    var row = pl && pl.new; if (!row || !row.id || !meIncumbe(row)) return;
    var c = S.conv;
    if (c && esDeMiConversacion(row)) {
      var existente = c.msgs.find(function (m) { return m.id === row.id; });
      if (pl.eventType === 'INSERT' && !existente) {
        // Eco de lo que acabo de mandar: se asienta sobre la burbuja pendiente.
        var pend = c.msgs.find(function (m) { return !m.id && m.estado === 'enviando' && m.de_tipo === row.de_tipo && m.texto === row.texto; });
        if (pend) { pend.id = row.id; pend.created_at = row.created_at; pend.estado = 'ok'; S.pintados[row.id] = true; }
        else {
          c.msgs.push(row);
          if (!esMio(row)) { c.tipeando = false; pintarSub(); }
        }
        if (row.producto_id && !c.productoId) { c.productoId = row.producto_id; cargarProducto(c); }
        pintarMensajes();
        marcarLeidos();
      } else if (pl.eventType === 'UPDATE' && existente) {
        existente.leido = !!row.leido;
        pintarMensajes();
      }
    }
    recontarPronto();
    var activa = document.querySelector('.screen.active');
    if (activa && activa.id === 'screen-mensajes' && !S.conv) recargarListaPronto();
    if (activa && activa.id === 'screen-cx-bandeja') recargarBandejaPronto();
  }

  function conectar() {
    var db = cliente(); if (!db || !db.channel) return;
    desconectar();
    try {
      var ch = db.channel('cx-mensajes-' + Math.random().toString(36).slice(2));
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, alCambio);
      ch.subscribe(function (estado) {
        S.canalOk = estado === 'SUBSCRIBED';
        if (S.canalOk && S.conv) cargarConversacion(false); // por si algo llego mientras conectaba
      });
      S.canal = ch;
    } catch (e) { S.canalOk = false; }
  }
  function desconectar() {
    if (S.canal) { try { cliente().removeChannel(S.canal); } catch (e) { } S.canal = null; }
    S.canalOk = false;
  }

  // Respaldo: si realtime no conecta, la conversacion abierta se refresca
  // cada 8 s (mismo ritmo que el chat viejo) y solo con la pestana visible.
  function arrancarRespaldo() {
    if (S.pollT) clearTimeout(S.pollT);
    var c = S.conv;
    S.pollT = setTimeout(function vuelta() {
      if (S.conv !== c) return;
      if (!S.canalOk && !document.hidden) cargarConversacion(false);
      S.pollT = setTimeout(vuelta, 8000);
    }, 8000);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (S.conv) cargarConversacion(false);
    recontarPronto();
  });

  /* ================================================================
     CONTADORES (menu del comprador y panel del proveedor)
     ================================================================ */
  function recontarPronto() {
    if (S.recontarT) clearTimeout(S.recontarT);
    S.recontarT = setTimeout(recontar, 400);
  }

  async function recontar() {
    var u = usuario(), db = cliente(); if (!u || !db) { pintarContadores(); return; }
    try {
      var r = await db.from('mensajes').select('id', { count: 'exact', head: true })
        .eq('usuario_email', u.email).eq('de_tipo', 'proveedor').eq('leido', false);
      if (!r.error) S.noLeidosComprador = r.count || 0;
    } catch (e) { }
    if (u.proveedorId) {
      try {
        var convs = await traerConvsProveedor();
        if (convs) {
          S.convsProveedor = convs;
          var esperando = convs.filter(function (c) { return c.esperando; });
          S.provEsperando = esperando.length;
          S.provMasViejo = esperando.length ? esperando.reduce(function (a, b) { return new Date(a.ultimaFecha) < new Date(b.ultimaFecha) ? a : b; }).ultimaFecha : null;
        }
      } catch (e) { }
    }
    pintarContadores();
  }

  function numHtml(n, nar) { return '<span class="cx-num' + (nar ? ' nar' : '') + '" data-cx-num>' + (n > 99 ? '99+' : n) + '</span>'; }

  function pintarContadores() {
    var u = usuario();
    // Menu: "Mensajes" visible siempre que la llave este prendida.
    var it = $('dnav-mensajes');
    if (it) {
      it.style.display = '';
      var viejo = it.querySelector('[data-cx-num]'); if (viejo) viejo.remove();
      if (u && S.noLeidosComprador > 0) { it.insertAdjacentHTML('beforeend', numHtml(S.noLeidosComprador)); it.querySelector('[data-cx-num]').style.marginLeft = 'auto'; }
    }
    // Panel del proveedor: boton "Mensajes" y aviso de quien espera.
    var btn = botonMensajesPanel();
    if (btn) {
      if (u && u.proveedorId) {
        btn.style.display = '';
        btn.setAttribute('onclick', '');
        btn.onclick = function () { if (window.haptic) window.haptic('light'); if (window.goTo) window.goTo('cx-bandeja'); };
        var sub = btn.querySelector('.dash-action-sub');
        if (sub) sub.textContent = S.provEsperando ? S.provEsperando + ' sin responder' : 'ver todos';
        var badge = $('dash-msgs-new');
        if (badge) {
          if (S.provEsperando) { badge.className = 'cx-num nar'; badge.removeAttribute('style'); badge.style.cssText = 'position:absolute;top:8px;right:8px'; badge.textContent = String(S.provEsperando); }
          else badge.style.display = 'none';
        }
      } else btn.style.display = 'none';
    }
    var aviso = $('cx-aviso-panel');
    if (u && u.proveedorId && S.provEsperando > 0) {
      var cab = document.querySelector('#perfil-proveedor .dash-head-verde');
      if (!aviso && cab) {
        cab.insertAdjacentHTML('afterend', '<div class="cx-aviso" id="cx-aviso-panel" role="button"></div>');
        aviso = $('cx-aviso-panel');
        aviso.addEventListener('click', function () { if (window.goTo) window.goTo('cx-bandeja'); });
      }
      if (aviso) {
        var n = S.provEsperando;
        aviso.innerHTML = '<span class="cx-num nar" style="width:34px;height:34px;border-radius:50%;font-size:.85rem">' + n + '</span><div><div class="t">' +
          (n === 1 ? '1 comprador espera su respuesta' : n + ' compradores esperan su respuesta') + '</div><div class="st">' +
          (S.provMasViejo ? 'El más antiguo le escribió ' + esc(hace(S.provMasViejo).toLowerCase()) : '') + '</div></div>';
      }
    } else if (aviso) aviso.remove();
  }

  function botonMensajesPanel() {
    var bs = document.querySelectorAll('#dash-quick-actions .dash-action-btn');
    for (var i = 0; i < bs.length; i++) {
      var oc = bs[i].getAttribute('onclick') || '';
      if (oc.indexOf('provMsgListModal') >= 0 || bs[i].getAttribute('data-cx-msj') === '1') { bs[i].setAttribute('data-cx-msj', '1'); return bs[i]; }
    }
    return null;
  }

  /* ================================================================
     LISTA DEL COMPRADOR (pantalla "Mensajes" que ya existia)
     ================================================================ */
  var recargarListaT = null;
  function recargarListaPronto() { if (recargarListaT) clearTimeout(recargarListaT); recargarListaT = setTimeout(cargarListaComprador, 500); }

  async function cargarListaComprador() {
    var el = $('mensajes-list'); if (!el) return;
    el.style.padding = '0';
    var u = usuario(), db = cliente();
    if (!u) {
      el.innerHTML = '<div class="cx-lista-vacia"><b>Inicie sesión para ver sus mensajes</b>Ahí va a encontrar sus conversaciones con los proveedores.<br><button class="cx-btn" onclick="goTo(\'perfil\')">Iniciar sesión</button></div>';
      return;
    }
    if (!el.querySelector('.cx-lista')) el.innerHTML = '<div class="cx-lista-vacia">Cargando sus conversaciones...</div>';
    var r = await db.from('mensajes')
      .select('proveedor_id,de_tipo,texto,leido,created_at,producto_id')
      .eq('usuario_email', u.email).order('created_at', { ascending: false }).limit(500);
    if (r.error) { el.innerHTML = '<div class="cx-lista-vacia"><b>No pudimos cargar sus mensajes</b><button class="cx-btn" id="cx-reint">Reintentar</button></div>'; $('cx-reint').onclick = cargarListaComprador; return; }
    var mapa = {}, orden = [];
    (r.data || []).forEach(function (m) {
      var k = String(m.proveedor_id);
      if (!mapa[k]) { mapa[k] = { provId: k, ultimo: m, noLeidos: 0, productoId: null }; orden.push(k); }
      if (m.de_tipo === 'proveedor' && !m.leido) mapa[k].noLeidos++;
      if (!mapa[k].productoId && m.producto_id) mapa[k].productoId = m.producto_id;
    });
    if (!orden.length) {
      el.innerHTML = '<div class="cx-lista-vacia"><b>Todavía no tiene conversaciones</b>Cuando le escriba a un proveedor, la conversación va a aparecer acá.<br><button class="cx-btn" onclick="goTo(\'buscar\')">Buscar proveedores</button></div>';
      return;
    }
    var provs = {}, faltan = [];
    try { (proveedoresDB || []).forEach(function (p) { if (mapa[String(p.id)]) provs[String(p.id)] = p; }); } catch (e) { }
    orden.forEach(function (k) { if (!provs[k]) faltan.push(k); });
    if (faltan.length) {
      try { var rp = await db.from('proveedores').select('id,nombre,rubro,logo_url,estado').in('id', faltan); (rp.data || []).forEach(function (p) { provs[String(p.id)] = p; }); } catch (e) { }
    }
    var prods = {}, idsProd = orden.map(function (k) { return mapa[k].productoId; }).filter(Boolean);
    if (idsProd.length) {
      try { var rpr = await db.from('productos').select('id,nombre').in('id', idsProd); (rpr.data || []).forEach(function (p) { prods[p.id] = p.nombre; }); } catch (e) { }
    }
    var busca = '<div class="cx-busca">' + SVG.lupa + '<input id="cx-busca-inp" placeholder="Buscar proveedor" aria-label="Buscar proveedor"></div>';
    var filas = orden.map(function (k) {
      var c = mapa[k], p = provs[k] || {}, nombre = p.nombre || 'Proveedor', ult = c.ultimo;
      var mioUlt = ult.de_tipo === 'usuario';
      var tick = mioUlt ? '<span style="color:' + (ult.leido ? '#34B7F1' : '#99a') + '">' + (ult.leido ? SVG.t2 : SVG.t1) + '</span> ' : '';
      var prev = esc(String(ult.texto || '').replace(/\s+/g, ' ').slice(0, 80));
      var av = p.logo_url ? '<img src="' + esc(p.logo_url) + '" alt="">' : esc(iniciales(nombre));
      return '<div class="cx-conv" data-prov="' + esc(k) + '" data-nom="' + esc(nombre.toLowerCase()) + '" role="button" tabindex="0">' +
        '<div class="cx-av" style="background:' + colorDe(nombre) + '">' + av + '</div><div class="cx-meta">' +
        '<div class="cx-l1"><span class="cx-nom">' + esc(nombre) + '</span>' + (p.estado === 'aprobado' ? SVG.ver : '') + '<span class="cx-hora' + (c.noLeidos ? ' nv' : '') + '">' + esc(horaLista(ult.created_at)) + '</span></div>' +
        '<div class="cx-l2"><span class="cx-prev">' + tick + (c.noLeidos ? '<b>' + prev + '</b>' : prev) + '</span>' + (c.noLeidos ? '<span class="cx-num">' + c.noLeidos + '</span>' : '') + '</div>' +
        (c.productoId && prods[c.productoId] ? '<div class="cx-prod">' + esc(prods[c.productoId]) + '</div>' : '') +
        '</div></div>';
    }).join('');
    var valorBusca = ($('cx-busca-inp') || {}).value || '';
    el.innerHTML = busca + '<div class="cx-lista">' + filas + '</div>';
    var inp = $('cx-busca-inp'); inp.value = valorBusca;
    var filtrar = function () { var q = inp.value.trim().toLowerCase(); Array.prototype.forEach.call(el.querySelectorAll('.cx-conv'), function (f) { f.style.display = !q || f.getAttribute('data-nom').indexOf(q) >= 0 ? '' : 'none'; }); };
    inp.addEventListener('input', filtrar); filtrar();
    Array.prototype.forEach.call(el.querySelectorAll('.cx-conv'), function (f) {
      var abrir = function () { window.abrirChatDirecto(f.getAttribute('data-prov')); };
      f.addEventListener('click', abrir);
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrir(); });
    });
  }

  /* ================================================================
     BANDEJA DEL PROVEEDOR (pantalla nueva: screen-cx-bandeja)
     ================================================================ */
  function montarBandeja() {
    if ($('screen-cx-bandeja')) return;
    var ref = $('screen-mensajes'); if (!ref) return;
    ref.insertAdjacentHTML('afterend',
      '<div class="screen" id="screen-cx-bandeja"><div class="topbar">' +
      '<button class="hamburger-btn" onclick="goBack(\'perfil\')" aria-label="Volver">' + SVG.atras + '</button>' +
      '<span class="topbar-logo">Mensajes</span><div style="width:36px"></div></div>' +
      '<div id="cx-bandeja"></div></div>');
  }

  async function traerConvsProveedor() {
    var u = usuario(), db = cliente(); if (!u || !u.proveedorId || !db) return null;
    var r = await db.from('mensajes')
      .select('usuario_email,de_tipo,de_nombre,texto,leido,created_at,producto_id')
      .eq('proveedor_id', String(u.proveedorId)).order('created_at', { ascending: false }).limit(1000);
    if (r.error) return null;
    var mapa = {}, orden = [];
    (r.data || []).forEach(function (m) {
      var k = String(m.usuario_email || '').toLowerCase(); if (!k) return;
      if (!mapa[k]) { mapa[k] = { email: k, ultimo: m, ultimaFecha: m.created_at, nombre: null, noLeidos: 0, productoId: null, esperando: m.de_tipo === 'usuario' }; orden.push(k); }
      if (!mapa[k].nombre && m.de_tipo === 'usuario' && m.de_nombre) mapa[k].nombre = m.de_nombre;
      if (m.de_tipo === 'usuario' && !m.leido) mapa[k].noLeidos++;
      if (!mapa[k].productoId && m.producto_id) mapa[k].productoId = m.producto_id;
    });
    return orden.map(function (k) { return mapa[k]; });
  }

  var recargarBandejaT = null;
  function recargarBandejaPronto() { if (recargarBandejaT) clearTimeout(recargarBandejaT); recargarBandejaT = setTimeout(cargarBandeja, 500); }

  async function cargarBandeja() {
    var el = $('cx-bandeja'); if (!el) return;
    var u = usuario(), db = cliente();
    if (!u || !u.proveedorId) { el.innerHTML = '<div class="cx-lista-vacia"><b>Inicie sesión con su cuenta de proveedor</b></div>'; return; }
    if (!el.querySelector('.cx-lista')) el.innerHTML = '<div class="cx-lista-vacia">Cargando sus mensajes...</div>';
    var convs = await traerConvsProveedor();
    if (!convs) { el.innerHTML = '<div class="cx-lista-vacia"><b>No pudimos cargar sus mensajes</b><button class="cx-btn" id="cx-reint-b">Reintentar</button></div>'; $('cx-reint-b').onclick = cargarBandeja; return; }
    S.convsProveedor = convs;
    var prods = {}, ids = convs.map(function (c) { return c.productoId; }).filter(Boolean);
    if (ids.length) { try { var rp = await db.from('productos').select('id,nombre').in('id', ids); (rp.data || []).forEach(function (p) { prods[p.id] = p.nombre; }); } catch (e) { } }
    var sin = convs.filter(function (c) { return c.esperando; });
    if (S.autoPestana && S.pestanaBandeja === 'sin' && !sin.length && convs.length) S.pestanaBandeja = 'todas';
    S.autoPestana = false;
    var lista = S.pestanaBandeja === 'sin' ? sin : convs;
    var tabs = '<div class="cx-tabs"><button type="button" class="cx-tab' + (S.pestanaBandeja === 'sin' ? ' on' : '') + '" data-t="sin">Sin responder · ' + sin.length + '</button>' +
      '<button type="button" class="cx-tab' + (S.pestanaBandeja === 'todas' ? ' on' : '') + '" data-t="todas">Todas</button></div>';
    var cuerpo;
    if (!convs.length) cuerpo = '<div class="cx-lista-vacia"><b>Todavía no tiene mensajes</b>Cuando un comprador le escriba desde EmprendeGO, lo va a ver acá.</div>';
    else if (!lista.length) cuerpo = '<div class="cx-lista-vacia"><b>Respondió todo</b>No tiene compradores esperando respuesta.</div>';
    else cuerpo = '<div class="cx-lista">' + lista.map(function (c) {
      var nombre = c.nombre || 'Comprador', ult = c.ultimo;
      var prev = esc(String(ult.texto || '').replace(/\s+/g, ' ').slice(0, 80));
      var lado = c.esperando ? '<span class="cx-espera">' + esc(hace(c.ultimaFecha)) + '</span>' : '<span class="cx-hora">' + esc(horaLista(c.ultimaFecha)) + '</span>';
      return '<div class="cx-conv" data-email="' + esc(c.email) + '" role="button" tabindex="0">' +
        '<div class="cx-av" style="background:' + colorDe(nombre) + '">' + esc(iniciales(nombre)) + '</div><div class="cx-meta">' +
        '<div class="cx-l1"><span class="cx-nom">' + esc(nombre) + '</span>' + lado + '</div>' +
        '<div class="cx-l2"><span class="cx-prev">' + (c.esperando ? '<b>' + prev + '</b>' : 'Usted: ' + prev) + '</span>' + (c.noLeidos ? '<span class="cx-num nar">' + c.noLeidos + '</span>' : '') + '</div>' +
        (c.productoId && prods[c.productoId] ? '<div class="cx-prod">' + esc(prods[c.productoId]) + '</div>' : '') +
        '</div></div>';
    }).join('') + '</div>';
    el.innerHTML = tabs + cuerpo;
    Array.prototype.forEach.call(el.querySelectorAll('.cx-tab'), function (t) {
      t.addEventListener('click', function () { S.pestanaBandeja = t.getAttribute('data-t'); cargarBandeja(); });
    });
    Array.prototype.forEach.call(el.querySelectorAll('.cx-conv'), function (f) {
      var abrir = function () {
        var email = f.getAttribute('data-email');
        var c = convs.find(function (x) { return x.email === email; }) || {};
        abrirConversacion({ rol: 'proveedor', provId: u.proveedorId, email: email, nombreOtro: c.nombre || 'Comprador', productoId: c.productoId || null });
      };
      f.addEventListener('click', abrir);
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrir(); });
    });
    S.provEsperando = sin.length;
    pintarContadores();
  }

  /* ================================================================
     REEMPLAZOS DE LAS FUNCIONES DE app.js
     ================================================================ */
  async function abrirChatDirectoNuevo(id, productoId) {
    var u = usuario();
    if (!u) {
      toast('Inicie sesión para escribirle a este proveedor');
      if (window.goTo) window.goTo('perfil');
      return;
    }
    if (u.proveedorId && String(u.proveedorId) === String(id)) { toast('Este es su propio perfil'); return; }
    var p = null;
    try { p = (proveedoresDB || []).find(function (x) { return String(x.id) === String(id); }); } catch (e) { }
    if (!p) {
      try { var r = await cliente().from('proveedores').select('id,nombre,rubro,logo_url,estado').eq('id', id).maybeSingle(); p = r.data; } catch (e) { }
    }
    if (!p) { toast('Proveedor no disponible'); return; }
    try { provActual = p; } catch (e) { }
    medir('abrir_chat', { provider_name: p.nombre, provider_rubro: p.rubro || '', chat: 'nuevo' });
    await abrirConversacion({
      rol: 'comprador', provId: p.id, email: u.email, nombreOtro: p.nombre, logo: p.logo_url || p.logo || '',
      rubro: p.rubro || '', verificado: p.estado ? p.estado === 'aprobado' : true, productoId: productoId || null
    });
  }

  window.abrirChatDirecto = abrirChatDirectoNuevo;
  window.cargarMensajesUsuario = cargarListaComprador;
  window.sendMsg = enviarDesdeCaja;
  window.volverChat = volver;
  window.detChatProd = function () {
    try { if (productoActual) abrirChatDirectoNuevo(productoActual.provId, productoActual.id); } catch (e) { }
  };

  // goTo: al pasar por las fichas se muestran los botones "Enviar mensaje"
  // (app.js los esconde cada vez que pinta la ficha), y al salir del chat
  // por otro lado (menu, atras del celular) se cierra la conversacion.
  var goToOriginal = window.goTo;
  if (typeof goToOriginal === 'function') {
    window.goTo = function (s) {
      if (s !== 'chat' && S.conv) cerrarConversacion();
      var r = goToOriginal.apply(this, arguments);
      try {
        if (s === 'detalle-producto') {
          var b = $('prod-det-chat-btn');
          var propio = usuario() && usuario().proveedorId && productoActual && String(usuario().proveedorId) === String(productoActual.provId);
          if (b && !propio) b.style.display = 'flex';
        } else if (s === 'detalle') {
          var b2 = document.querySelector('#screen-detalle button[onclick="detChat()"]');
          var propio2 = usuario() && usuario().proveedorId && provActual && String(usuario().proveedorId) === String(provActual.id);
          if (b2 && !propio2) b2.style.display = 'flex';
        } else if (s === 'cx-bandeja') {
          S.pestanaBandeja = 'sin'; S.autoPestana = true;
          cargarBandeja();
        } else if (s === 'perfil') {
          recontarPronto();
        }
      } catch (e) { }
      return r;
    };
  }

  /* ---------------- sesion ---------------- */
  // app.js arma currentUser de forma asincronica y no avisa; se mira cada 2 s
  // (sin red: solo compara en memoria) y al cambiar se reconecta.
  function vigilarSesion() {
    var u = usuario();
    var clave = u ? (String(u.email || '') + '|' + String(u.proveedorId || '')) : '';
    if (clave === S.claveSesion) return;
    S.claveSesion = clave;
    cerrarConversacion();
    if (clave) { conectar(); recontar(); }
    else { desconectar(); S.noLeidosComprador = 0; S.provEsperando = 0; pintarContadores(); }
  }

  function iniciar() {
    montarPantallaChat();
    montarBandeja();
    pintarContadores();
    vigilarSesion();
    setInterval(vigilarSesion, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
