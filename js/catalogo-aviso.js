// ===== AVISO DEL CATALOGO (2026-11-24) =====
//
// POR QUE EXISTE. El que entra a EmprendeGO casi siempre es un emprendedor que
// REVENDE: busca proveedor para despues venderle a sus clientes. Lo que
// necesita despues de comprar es mostrar lo que vende. Negocios ya tiene un
// catalogo en un link (negocios.emprendego.com.ar/c/...) y la idea del founder
// es ofrecerselo aca, por $15.000 por mes, como puerta de entrada a Negocios.
//
// "Armar mi catalogo" lleva a crear la cuenta en Negocios con el PLAN CATALOGO
// (negocios.emprendego.com.ar/?plan=catalogo, V7.67): el negocio nace con ese
// plan, ve solo el catalogo y el resto con candado. Cada aparicion y cada toque
// se cuentan en GA4 (eventos catalogo_aviso_*).
//
// CUANDO APARECE (pedido del founder, 2026-11-24: "que aparezca bastantes
// veces, aunque se vuelva pesado, es la unica via para monetizar"):
//   - 5 segundos despues de entrar, en CADA VISITA (sessionStorage: una
//     pestaña nueva es una visita nueva).
//   - Despues de contactar a un proveedor por WhatsApp, una vez por visita,
//     aunque haya cerrado el de la entrada. Se muestra cuando vuelve a la
//     pestaña (el WhatsApp se abre en otra), no mientras se va.
//   - El que toco "Armar mi catálogo" no lo vuelve a ver por 7 dias.
//   - Nunca a un proveedor con sesion: ya vende aca.
//   - Nunca encima de otra ventana abierta.
//
// ⚠️ LOS PARAMETROS DE LA URL SE LEEN ACA ARRIBA, AL CARGAR EL ARCHIVO, y no
// despues: el handler de DOMContentLoaded de app.js hace un pushState que borra
// la query string (ver CLAUDE.md, "Deep-links"). Este archivo se carga como
// script comun, antes de ese handler.
//
// localStorage puede fallar (modo privado, bloqueado): todo va en try/catch y,
// si falla, el aviso se muestra igual una vez por visita y no rompe nada.
(function () {
  'use strict';

  var CLAVE = 'eg_catalogo_aviso';
  var ALTA_CATALOGO = 'https://negocios.emprendego.com.ar/?plan=catalogo';
  var ESPERA_INICIO_MS = 5000;
  var PAUSA_TRAS_ACEPTAR_MS = 7 * 24 * 3600 * 1000;
  var CLAVE_VISITA = 'eg_catalogo_aviso_visita';
  var llegoConDestino = /[?&]ir=/.test(window.location.search);

  function leerEstado() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { return {}; }
  }
  function guardarEstado(cambio) {
    var estado = leerEstado();
    for (var k in cambio) estado[k] = cambio[k];
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { }
    memoria = estado;
  }
  var memoria = leerEstado();

  function enPausa() {
    return Boolean(memoria.acepto) && Date.now() - Number(memoria.acepto) < PAUSA_TRAS_ACEPTAR_MS;
  }
  // Lo visto EN ESTA VISITA. Si sessionStorage falla, vale lo de la memoria.
  var visitaEnMemoria = {};
  function vistoEnVisita(momento) {
    try { return Boolean((JSON.parse(sessionStorage.getItem(CLAVE_VISITA) || '{}') || {})[momento]); } catch (e) { return Boolean(visitaEnMemoria[momento]); }
  }
  function marcarVisita(momento) {
    visitaEnMemoria[momento] = true;
    try {
      var v = JSON.parse(sessionStorage.getItem(CLAVE_VISITA) || '{}') || {};
      v[momento] = Date.now();
      sessionStorage.setItem(CLAVE_VISITA, JSON.stringify(v));
    } catch (e) { }
  }

  function medir(nombre, momento) {
    try { if (typeof trackEvent === 'function') trackEvent(nombre, { momento: momento }); } catch (e) { }
  }

  function esProveedor() {
    try { return Boolean(typeof currentUser !== 'undefined' && currentUser && currentUser.provData); } catch (e) { return false; }
  }

  // Otra ventana abierta: la bienvenida de la primera visita, la guia de
  // carga, un modal o un overlay visible.
  // ⚠️ getClientRects y NO offsetParent: un elemento position:fixed (como la
  // bienvenida) tiene offsetParent null aunque este a la vista.
  function hayOtraVentana() {
    var abiertas = document.querySelectorAll('#onboarding-overlay, #guia-sheet, [aria-modal="true"], .modal-overlay, .modal');
    for (var i = 0; i < abiertas.length; i++) {
      var el = abiertas[i];
      if (el.closest && el.closest('#ca-aviso')) continue;
      var s = window.getComputedStyle(el);
      if (s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0) return true;
    }
    return false;
  }

  // Si hay otra ventana, se espera a que se cierre y recien ahi se cuentan
  // los segundos. Con tope: a los 3 minutos se deja para la proxima visita.
  function cuandoSePueda(momento, esperaMs) {
    var vueltas = 0;
    var intento = function () {
      if (abierto || esProveedor()) return;
      if (hayOtraVentana()) {
        if (++vueltas < 180) setTimeout(intento, 1000);
        else if (momento === 'contacto') pendienteContacto = false;
        return;
      }
      if (vueltas > 0) { vueltas = 0; setTimeout(function () { if (!hayOtraVentana()) mostrar(momento); else intento(); }, esperaMs); return; }
      mostrar(momento);
    };
    setTimeout(intento, esperaMs);
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // El celular muestra productos REALES del catalogo de EmprendeGO, con foto.
  // Si todavia no cargaron, van tarjetas vacias: nunca una foto inventada.
  function tarjetas() {
    var lista = [];
    try {
      if (typeof productosReales !== 'undefined' && Array.isArray(productosReales)) {
        lista = productosReales.filter(function (p) { return p && p.imgUrl; }).slice(0, 4);
      }
    } catch (e) { }
    var html = '';
    for (var i = 0; i < 4; i++) {
      var p = lista[i];
      var src = '';
      if (p) {
        try { src = typeof imgThumb === 'function' ? imgThumb(p.imgUrl, 200, 65) : p.imgUrl; } catch (e) { src = p.imgUrl; }
      }
      html += '<div class="ca-card"><span class="ca-foto">' +
        (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">' : '') +
        '</span><span class="ca-nom">' + (p ? esc(p.nombre) : '') + '</span>' +
        (p && p.precio ? '<span class="ca-pre">$ ' + Number(p.precio).toLocaleString('es-AR') + '</span>' : '<span class="ca-barra"></span>') +
        '</div>';
    }
    return html;
  }

  var abierto = false;
  var momentoActual = '';
  var focoAnterior = null;

  function cerrar(motivo) {
    var raiz = document.getElementById('ca-aviso');
    if (!raiz) return;
    if (motivo === 'cerrar') medir('catalogo_aviso_cerrar', momentoActual);
    raiz.classList.remove('abierto');
    document.removeEventListener('keydown', alTeclado);
    abierto = false;
    setTimeout(function () { if (raiz.parentNode) raiz.parentNode.removeChild(raiz); }, 260);
    try { document.body.style.overflow = ''; } catch (e) { }
    if (focoAnterior && typeof focoAnterior.focus === 'function') { try { focoAnterior.focus(); } catch (e) { } }
  }

  function alTeclado(e) { if (e.key === 'Escape') cerrar('cerrar'); }

  function irAlAlta() {
    medir('catalogo_aviso_armar', momentoActual);
    guardarEstado({ acepto: Date.now() });
    window.open(ALTA_CATALOGO, '_blank', 'noopener');
    cerrar('acepto');
  }

  function mostrar(momento) {
    if (abierto || esProveedor() || hayOtraVentana()) return false;
    abierto = true;
    momentoActual = momento;
    focoAnterior = document.activeElement;

    var raiz = document.createElement('div');
    raiz.id = 'ca-aviso';
    raiz.innerHTML =
      '<div class="ca-velo" data-ca="cerrar"></div>' +
      '<section class="ca-hoja" role="dialog" aria-modal="true" aria-labelledby="ca-titulo">' +
        '<button type="button" class="ca-x" data-ca="cerrar" aria-label="Cerrar"></button>' +
        '<p class="ca-pastilla"><span class="ca-punto"></span>Para los que revenden</p>' +
        '<div class="ca-fila">' +
          '<h2 id="ca-titulo">' + (momento === 'contacto' ? 'Ya tiene proveedor.' : 'Su tienda, en un link.') +
            '<br><span class="ca-tenue">' + (momento === 'contacto' ? 'Ahora muestre lo que vende.' : 'Sus clientes le piden por WhatsApp.') + '</span></h2>' +
          '<div class="ca-escena" aria-hidden="true"><div class="ca-celular"><div class="ca-isla"></div><div class="ca-pantalla">' +
            '<div class="ca-cab"><span class="ca-av">SN</span><b>Su Negocio</b></div>' +
            '<div class="ca-url">Buscar en el catálogo</div>' +
            '<div class="ca-grilla">' + tarjetas() + '</div>' +
          '</div></div></div>' +
        '</div>' +
        '<ul class="ca-claves">' +
          '<li><span class="ca-tilde"></span>Su catálogo en un link, con fotos y precios</li>' +
          '<li><span class="ca-tilde"></span>Sus clientes le piden por WhatsApp</li>' +
          '<li><span class="ca-tilde"></span>Sube todos sus productos de una vez desde un Excel</li>' +
        '</ul>' +
        '<div class="ca-precio"><b>$15.000</b><span>por mes · los primeros 15 días, gratis</span></div>' +
        '<button type="button" class="ca-cta" data-ca="armar">Armar mi catálogo<span class="ca-flecha"></span></button>' +
        '<button type="button" class="ca-ahora" data-ca="cerrar">Ahora no</button>' +
      '</section>';

    raiz.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-ca]') : null;
      if (!el) return;
      var accion = el.getAttribute('data-ca');
      if (accion === 'cerrar') cerrar('cerrar');
      else irAlAlta();
    });
    document.body.appendChild(raiz);
    document.addEventListener('keydown', alTeclado);
    try { document.body.style.overflow = 'hidden'; } catch (e) { }
    // Un cuadro despues, para que la transicion corra (y si el navegador no
    // dibuja, el aviso igual queda visible: la clase solo suma el movimiento).
    requestAnimationFrame(function () { raiz.classList.add('abierto'); var b = raiz.querySelector('.ca-cta'); if (b) b.focus({ preventScroll: true }); });

    marcarVisita(momento);
    medir('catalogo_aviso_visto', momento);
    return true;
  }

  // 1) Al entrar, a los 5 segundos.
  function alEntrar() {
    if (enPausa() || vistoEnVisita('inicio') || llegoConDestino) return;
    cuandoSePueda('inicio', ESPERA_INICIO_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alEntrar);
  else alEntrar();

  // 2) Despues de contactar a un proveedor. Lo llama registrarContactoWA()
  // (app.js). Como el WhatsApp se abre en otra pestaña, se espera a que la
  // persona vuelva; si nunca se fue (WhatsApp de escritorio), a los 4 segundos.
  var pendienteContacto = false;
  window.catalogoAvisoTrasContacto = function () {
    if (enPausa() || vistoEnVisita('contacto') || pendienteContacto) return;
    pendienteContacto = true;
    var intentar = function () {
      if (!pendienteContacto || document.visibilityState !== 'visible') return;
      pendienteContacto = false;
      document.removeEventListener('visibilitychange', intentar);
      cuandoSePueda('contacto', 1200);
    };
    document.addEventListener('visibilitychange', intentar);
    setTimeout(intentar, 4000);
  };
})();
