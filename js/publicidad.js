/* =====================================================================
   PUBLICIDAD — espacios patrocinados (fase 1, 2026-11-19)

   Tres espacios: el carrusel del inicio, una tarjeta en la grilla de
   Buscar > Productos (posicion 3) y una tarjeta en Novedades (despues del
   4.º elemento). Los anuncios los carga el founder desde admin.html; la app
   solo los LEE, por la funcion anuncios_vigentes() de la base, que devuelve
   unicamente los aprobados y vigentes hoy, y solo sus campos publicos.

   Lo usan dos paginas:
     - index.html: pinta los espacios (pubCargar y las funciones pub*Html).
     - admin.html: reutiliza las cuentas (fechas, cupo, destino, total).
   Y la prueba test/publicidad.test.js, que corre las cuentas en Node.

   REGLAS QUE NO SE NEGOCIAN
   - Si un espacio no tiene anuncio, NO se dibuja nada: ni hueco, ni cartel
     de "espacio disponible". La app queda exactamente como antes.
   - Todo anuncio lleva el sello "Publicidad" encima de la pieza, puesto por
     nosotros. El anunciante no puede taparlo.
   - Si la imagen no carga, el anuncio desaparece (nunca una imagen rota).
   - El link sale siempre con rel="sponsored noopener noreferrer" y solo si
     es https. Un destino que no lo sea no se dibuja.
   - Una sola consulta liviana por visita. Si falla, la app sigue igual.
   - La letra es la de la app (no se fija ninguna fuente aca).
   ===================================================================== */
(function (raiz) {
  'use strict';

  // ── Cuentas puras (las prueba test/publicidad.test.js) ───────────────

  // Hoy en Argentina (UTC-3 fijo, sin horario de verano desde 2009), como
  // 'YYYY-MM-DD'. Es la misma cuenta que hace la base en anuncios_vigentes().
  function pubHoyAR(ahora) {
    const t = (ahora instanceof Date ? ahora : new Date()).getTime() - 3 * 3600 * 1000;
    return new Date(t).toISOString().slice(0, 10);
  }

  // Suma meses a una fecha 'YYYY-MM-DD'. Si el dia no existe en el mes de
  // llegada (31/01 + 1 mes), se queda en el ultimo dia de ese mes.
  function pubSumarMeses(iso, meses) {
    const [a, m, d] = String(iso).split('-').map(Number);
    const total = (m - 1) + Number(meses);
    const anio = a + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const dia = Math.min(d, ultimo);
    return anio + '-' + String(mes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  }

  // 'YYYY-MM-DD' -> 'DD/MM/YYYY'
  function pubFecha(iso) {
    if (!iso) return '';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return d + '/' + m + '/' + a;
  }

  // El rango es [inicia_el, termina_el): termina_el ya no se muestra. Para
  // decirle a una persona "hasta cuando", se muestra el dia anterior.
  function pubUltimoDia(terminaIso) {
    const t = Date.parse(terminaIso + 'T00:00:00Z') - 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }

  // Estados que ocupan lugar en el espacio. Igual que ad_controlar_cupo().
  const OCUPAN = ['pagado', 'en_revision', 'aprobado'];

  // Cuantos anuncios hay a la vez, como maximo, dentro de [inicio, fin).
  // El maximo siempre cae en un dia en que empieza algun anuncio (o en el
  // inicio del rango), asi que alcanza con mirar esos dias.
  function pubMaxSolapamiento(ordenes, inicio, fin, ignorarId) {
    const vivas = (ordenes || []).filter(o =>
      o && OCUPAN.includes(o.estado) && o.id !== ignorarId &&
      o.inicia_el < fin && o.termina_el > inicio);
    const dias = [inicio].concat(vivas.map(o => o.inicia_el).filter(d => d > inicio && d < fin));
    let max = 0;
    dias.forEach(d => {
      const n = vivas.filter(o => o.inicia_el <= d && o.termina_el > d).length;
      if (n > max) max = n;
    });
    return max;
  }

  // ¿Entra un anuncio nuevo de [inicio, fin) sin pasarse del cupo?
  function pubEntra(ordenes, cupo, inicio, fin, ignorarId) {
    return pubMaxSolapamiento(ordenes, inicio, fin, ignorarId) + 1 <= Number(cupo || 1);
  }

  // Primera fecha, desde `desde`, en la que entra un anuncio de `meses`
  // meses. Los candidatos son `desde` y cada dia en que termina un anuncio:
  // es el unico momento en que se puede liberar un lugar.
  function pubPrimeraFechaLibre(ordenes, cupo, desde, meses, ignorarId) {
    const candidatos = [desde].concat(
      (ordenes || [])
        .filter(o => o && OCUPAN.includes(o.estado) && o.id !== ignorarId && o.termina_el > desde)
        .map(o => o.termina_el)
    ).sort();
    for (const c of candidatos) {
      if (pubEntra(ordenes, cupo, c, pubSumarMeses(c, meses), ignorarId)) return c;
    }
    return null;
  }

  // Lo que se le muestra a una persona sobre el estado de un anuncio.
  // "Activo" y "Vencido" no se guardan: salen de la fecha de hoy.
  function pubEstadoVisible(o, hoy) {
    if (!o) return 'desconocido';
    if (o.estado !== 'aprobado') return o.estado;
    if (o.termina_el <= hoy) return 'vencido';
    if (o.inicia_el > hoy) return 'programado';
    return 'activo';
  }

  // Total a cobrar. El descuento por 3 o 6 meses es un porcentaje.
  function pubTotal(precioMensual, meses, desc3, desc6) {
    const bruto = Number(precioMensual || 0) * Number(meses || 0);
    const desc = Number(meses) >= 6 ? Number(desc6 || 0) : Number(meses) >= 3 ? Number(desc3 || 0) : 0;
    return Math.round(bruto * (1 - desc / 100));
  }

  // Normaliza lo que escribe el founder en "destino": un link o un numero
  // de WhatsApp. Devuelve { url } o { error }. Solo https: nunca
  // javascript:, data: ni http plano.
  function pubNormalizarDestino(texto) {
    const t = String(texto || '').trim();
    if (!t) return { error: 'Falta el destino del anuncio.' };
    const soloNumeros = t.replace(/[\s()+\-.]/g, '');
    if (/^\d{8,15}$/.test(soloNumeros)) {
      let n = soloNumeros.replace(/^0+/, '');
      if (!n.startsWith('54')) n = '54' + n;          // numero argentino sin codigo de pais
      if (n.startsWith('54') && !n.startsWith('549') && n.length === 12) n = '549' + n.slice(2); // celular sin el 9
      return { url: 'https://wa.me/' + n };
    }
    let url = t;
    if (/^www\./i.test(url)) url = 'https://' + url;
    if (!/^https:\/\//i.test(url)) {
      return { error: 'El link tiene que empezar con https:// (o ser un número de WhatsApp).' };
    }
    let u;
    try { u = new URL(url); } catch (e) { return { error: 'El link no es válido.' }; }
    if (u.protocol !== 'https:' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) {
      return { error: 'El link no es válido.' };
    }
    return { url: u.toString() };
  }

  // Lo que se lee en el pie del anuncio: el dominio, o "WhatsApp".
  function pubDominio(url) {
    try {
      const h = new URL(url).hostname.replace(/^www\./i, '');
      if (h === 'wa.me' || h === 'api.whatsapp.com') return 'WhatsApp';
      return h;
    } catch (e) { return ''; }
  }

  function pubDestinoSeguro(url) {
    return typeof url === 'string' && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(url);
  }

  function pubIniciales(nombre) {
    const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '')[0] || '').concat((p[1] || '')[0] || '').toUpperCase() || 'AD';
  }

  // ── Encaje automatico de la pieza ──
  // Cualquier imagen se lleva a la medida exacta del espacio.
  //   'entera': la imagen completa, sin cortar nada, centrada; lo que sobra
  //             se rellena (ver pubColorDeBorde).
  //   'llenar': cubre todo el espacio y recorta lo que sobresale, centrado.
  // Devuelve el rectangulo donde dibujar la imagen dentro del lienzo.
  function pubEncaje(srcW, srcH, dstW, dstH, modo) {
    const escala = modo === 'llenar'
      ? Math.max(dstW / srcW, dstH / srcH)
      : Math.min(dstW / srcW, dstH / srcH);
    const w = Math.round(srcW * escala), h = Math.round(srcH * escala);
    return { x: Math.round((dstW - w) / 2), y: Math.round((dstH - h) / 2), w, h };
  }

  // Mira el borde de la imagen (pixeles RGBA de su contorno). Si es de un
  // solo color, devuelve ese color para rellenar sin que se note la union
  // (un logo sobre fondo liso). Si el borde es variado (una foto), devuelve
  // null y se rellena con la misma imagen desenfocada. Un borde
  // transparente cuenta como blanco.
  function pubColorDeBorde(rgba, tolerancia) {
    const tol = tolerancia == null ? 18 : tolerancia;
    const n = Math.floor(rgba.length / 4);
    if (!n) return null;
    const px = i => {
      const a = rgba[i * 4 + 3] / 255;
      return [rgba[i * 4] * a + 255 * (1 - a), rgba[i * 4 + 1] * a + 255 * (1 - a), rgba[i * 4 + 2] * a + 255 * (1 - a)];
    };
    // Mediana por canal, no promedio: una firma oscura en el borde no tiene
    // que agrisar el relleno (se notaria la union con el fondo).
    const canales = [[], [], []];
    for (let i = 0; i < n; i++) { const p = px(i); canales[0].push(p[0]); canales[1].push(p[1]); canales[2].push(p[2]); }
    const mediana = v => { v.sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const r = mediana(canales[0]), g = mediana(canales[1]), b = mediana(canales[2]);
    let lejos = 0;
    for (let i = 0; i < n; i++) {
      const p = px(i);
      if (Math.abs(p[0] - r) > tol || Math.abs(p[1] - g) > tol || Math.abs(p[2] - b) > tol) lejos++;
    }
    // Hasta un 4 % de pixeles distintos se tolera (una firma, una marca de agua).
    if (lejos / n > 0.04) return null;
    const hex = v => Math.round(v).toString(16).padStart(2, '0');
    return '#' + hex(r) + hex(g) + hex(b);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const cuentas = {
    pubHoyAR, pubSumarMeses, pubFecha, pubUltimoDia, pubMaxSolapamiento, pubEntra,
    pubPrimeraFechaLibre, pubEstadoVisible, pubTotal, pubNormalizarDestino,
    pubDominio, pubDestinoSeguro, pubIniciales, pubEncaje, pubColorDeBorde, OCUPAN
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = cuentas;
    return;
  }
  Object.assign(raiz, cuentas);

  // ── En el navegador ──────────────────────────────────────────────────

  // Los anuncios vigentes, por espacio. null = todavia no se pidieron.
  let anuncios = null;

  // El sello "Publicidad". Mismo en los tres espacios; va encima de la
  // pieza y no recibe toques (el toque es del anuncio entero).
  // Estilo Instagram, pedido por Abraham el 2026-11-20: minuscula, sin
  // espaciado, peso medio, vidrio oscuro translucido. El fondo sigue siendo
  // lo bastante oscuro para leerse sobre una pieza blanca.
  function sello(margen) {
    return '<span style="position:absolute;top:' + margen + 'px;left:' + margen + 'px;z-index:2;' +
      'height:24px;display:inline-flex;align-items:center;padding:0 10px;border-radius:12px;' +
      'background:rgba(20,20,20,.62);-webkit-backdrop-filter:blur(10px) saturate(140%);backdrop-filter:blur(10px) saturate(140%);' +
      'color:#fff;font-size:12px;font-weight:600;line-height:1;letter-spacing:0;' +
      'box-shadow:0 1px 2px rgba(0,0,0,.18);pointer-events:none">Publicidad</span>';
  }

  // Si la pieza no carga, se esconde el anuncio entero (data-pub-caja).
  const ONERROR = "var c=this.closest('[data-pub-caja]');if(c){c.style.display='none';if(window.pubCarruselRehacer)pubCarruselRehacer();}";

  function img(a, ratio) {
    return '<img src="' + esc(a.imagen_url) + '" alt="' + esc(a.alt_text || ('Publicidad de ' + a.empresa)) + '"' +
      ' loading="lazy" decoding="async" onerror="' + ONERROR + '"' +
      ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block">';
  }

  function linkAttrs(a, extra) {
    return 'href="' + esc(a.destino_url) + '" target="_blank" rel="sponsored noopener noreferrer"' +
      ' data-pub-caja="1" data-pub-id="' + esc(a.id) + '"' +
      ' aria-label="Publicidad de ' + esc(a.empresa) + '. Se abre en una pestaña nueva."' +
      (extra ? ' ' + extra : '');
  }

  function delEspacio(espacio) {
    if (!anuncios) return [];
    return (anuncios[espacio] || []).filter(a => pubDestinoSeguro(a.destino_url) && a.imagen_url);
  }

  // Si el espacio admite uno solo pero hubiera mas (se subio el cupo), se
  // elige uno al azar por visita, siempre el mismo durante la visita.
  const elegido = {};
  function unoDe(espacio) {
    const lista = delEspacio(espacio);
    if (!lista.length) return null;
    if (!(espacio in elegido) || !lista[elegido[espacio]]) elegido[espacio] = Math.floor(Math.random() * lista.length);
    return lista[elegido[espacio]];
  }

  // ── Buscar > Productos: celda de la grilla ──
  // Se ve distinta a una ficha real a proposito: sin precio, sin rubro y
  // sin la franja del proveedor; borde mas marcado y pie gris.
  function pubCeldaResultadosHtml() {
    const a = unoDe('resultados');
    if (!a) return '';
    return '<a ' + linkAttrs(a, 'class="pub-celda"') + ' style="display:flex;flex-direction:column;background:#fff;' +
      'border:1px solid #D8D8D2;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.05);-webkit-tap-highlight-color:transparent">' +
        '<span style="position:relative;display:block;aspect-ratio:4/5;background:#EFEFEB;flex:none">' +
          img(a) + sello(8) +
        '</span>' +
        '<span style="flex:1;min-height:56px;display:flex;align-items:center;gap:6px;padding:8px 10px;' +
          'background:#F6F6F3;border-top:1px solid #E8E8E3">' +
          '<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">' +
            '<span style="font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#666">Patrocinado</span>' +
            '<span style="font-size:12.5px;font-weight:800;color:#1A1A1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
              esc(pubDominio(a.destino_url) || a.empresa) + '</span>' +
          '</span>' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>' +
        '</span>' +
      '</a>';
  }

  // ── Novedades: tarjeta del feed ──
  // Usa la misma estructura que las novedades reales (nv-bandeja/nv-nucleo)
  // para que el feed no salte, con borde propio y "Patrocinado" en lugar de
  // fecha y ciudad, para que no se confunda con un mayorista.
  function pubTarjetaNovedadesHtml() {
    const a = unoDe('novedades');
    if (!a) return '';
    const dominio = pubDominio(a.destino_url) || a.empresa;
    return '<article class="nv-bandeja nv-sube" data-pub-caja="1" style="border-color:#D8D8D2">' +
      '<a ' + linkAttrs(a).replace(' data-pub-caja="1"', '') + ' class="nv-nucleo" style="display:block;text-decoration:none;color:inherit">' +
        '<div class="nv-quien">' +
          '<span class="nv-sigla" aria-hidden="true">' + esc(pubIniciales(a.empresa)) + '</span>' +
          '<span class="nv-quien-txt"><b>' + esc(a.empresa) + '</b><span style="color:#666">Patrocinado</span></span>' +
        '</div>' +
        '<div style="position:relative;margin:0 7px;border-radius:16px;overflow:hidden;aspect-ratio:1/1;background:#EFEFEB">' +
          img(a) + sello(14) +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;padding:0 16px">' +
          '<span style="font-size:13.5px;font-weight:800;color:#1A1A1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">' + esc(dominio) + '</span>' +
          '<span style="flex:none;font-size:13px;font-weight:700;color:#065F46;display:inline-flex;align-items:center;gap:3px">Conocer más' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>' +
          '</span>' +
        '</div>' +
      '</a>' +
    '</article>';
  }

  // ── Inicio: carrusel ──
  let carrusel = null;   // { pista, puntos, total, timer, pausaHasta }

  function pubPintarInicio() {
    const caja = document.getElementById('pub-inicio');
    if (!caja) return;
    detenerCarrusel();
    const lista = delEspacio('inicio');
    if (!lista.length) { caja.innerHTML = ''; caja.style.display = 'none'; return; }

    const uno = lista.length === 1;
    // A 390 de ancho la pista mide 358 (390 - 16 - 16): con 32 menos queda
    // la slide en 326 y asoman ~38 px de la siguiente. Con uno solo, ancho
    // completo y nada que asome.
    const ancho = uno ? '100%' : 'calc(100% - 32px)';
    const slides = lista.map((a, i) =>
      '<a ' + linkAttrs(a) + ' style="position:relative;flex:0 0 ' + ancho + ';max-width:400px;aspect-ratio:1/1;' +
        'border-radius:20px;overflow:hidden;scroll-snap-align:start;scroll-snap-stop:always;background:#EFEFEB;display:block;' +
        'box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 24px -14px rgba(0,0,0,.28);-webkit-tap-highlight-color:transparent"' +
        ' aria-roledescription="anuncio" data-i="' + i + '">' +
        img(a) + sello(14) +
      '</a>').join('');

    caja.innerHTML =
      '<div role="region" aria-label="Publicidad" style="padding-top:20px">' +
        '<div class="pub-pista" style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;' +
          'scroll-padding:0 16px;padding:2px 16px 6px;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain">' +
          slides +
          (uno ? '' : '<span aria-hidden="true" style="flex:0 0 6px"></span>') +
        '</div>' +
        (uno ? '' :
          '<div class="pub-puntos" style="display:flex;justify-content:center;align-items:center;gap:2px;margin-top:6px">' +
            lista.map((_, i) =>
              '<button type="button" data-i="' + i + '" aria-label="Anuncio ' + (i + 1) + ' de ' + lista.length + '"' +
              ' style="border:0;background:none;padding:6px 3px;cursor:pointer;display:flex;align-items:center">' +
              '<span style="display:block;height:6px;border-radius:3px;transition:width .3s ease,background-color .3s ease"></span></button>'
            ).join('') +
          '</div>') +
      '</div>';
    caja.style.display = 'block';
    if (!uno) armarCarrusel(caja);
  }

  function reduceMovimiento() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function armarCarrusel(caja) {
    const pista = caja.querySelector('.pub-pista');
    const puntos = Array.from(caja.querySelectorAll('.pub-puntos button'));
    carrusel = { caja, pista, puntos, actual: 0, timer: null, pausaHasta: 0, visible: false };

    const paso = () => {
      const s = pista.querySelector('[data-pub-caja]:not([style*="display: none"])');
      return s ? s.getBoundingClientRect().width + 10 : pista.clientWidth;
    };
    const visibles = () => Array.from(pista.querySelectorAll('[data-pub-caja]')).filter(s => s.style.display !== 'none');

    const marcar = (i) => {
      carrusel.actual = i;
      puntos.forEach((b, j) => {
        const p = b.firstChild;
        p.style.width = j === i ? '20px' : '6px';
        p.style.backgroundColor = j === i ? '#065F46' : '#CFCFC9';
        b.setAttribute('aria-current', j === i ? 'true' : 'false');
      });
    };
    marcar(0);

    let raf = 0;
    pista.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const n = visibles().length;
        const i = Math.max(0, Math.min(n - 1, Math.round(pista.scrollLeft / paso())));
        marcar(i);
      });
    }, { passive: true });

    const ir = (i) => {
      pista.scrollTo({ left: i * paso(), behavior: reduceMovimiento() ? 'auto' : 'smooth' });
    };
    puntos.forEach(b => b.addEventListener('click', () => { pausar(12000); ir(Number(b.dataset.i)); }));

    // Pausa al tocar o al pasar el mouse: el que esta mirando manda.
    const pausar = (ms) => { carrusel.pausaHasta = Date.now() + ms; };
    ['pointerdown', 'touchstart', 'wheel', 'focusin'].forEach(ev =>
      pista.addEventListener(ev, () => pausar(12000), { passive: true }));
    pista.addEventListener('mouseenter', () => pausar(60 * 60 * 1000));
    pista.addEventListener('mouseleave', () => pausar(4000));

    // Avance lento (6 s), solo si se ve en pantalla, con la pestaña visible
    // y sin "reducir movimiento" pedido por el sistema.
    if (reduceMovimiento()) return;
    if ('IntersectionObserver' in window) {
      carrusel.io = new IntersectionObserver(e => { carrusel && (carrusel.visible = e[0].isIntersecting); }, { threshold: 0.5 });
      carrusel.io.observe(pista);
    } else {
      carrusel.visible = true;
    }
    carrusel.timer = setInterval(() => {
      if (!carrusel || !carrusel.visible || document.hidden || Date.now() < carrusel.pausaHasta) return;
      if (!document.getElementById('screen-inicio') || !document.getElementById('screen-inicio').classList.contains('active')) return;
      const n = visibles().length;
      if (n < 2) return;
      ir((carrusel.actual + 1) % n);
    }, 6000);
  }

  function detenerCarrusel() {
    if (!carrusel) return;
    clearInterval(carrusel.timer);
    if (carrusel.io) carrusel.io.disconnect();
    carrusel = null;
  }

  // Una pieza que no cargo se escondio: si quedo una sola, se rearma sin
  // puntos; si no quedo ninguna, desaparece el bloque.
  raiz.pubCarruselRehacer = function () {
    if (!anuncios) return;
    const caja = document.getElementById('pub-inicio');
    if (!caja) return;
    const ocultos = Array.from(caja.querySelectorAll('[data-pub-caja]'))
      .filter(s => s.style.display === 'none').map(s => s.dataset.pubId);
    if (!ocultos.length) return;
    anuncios.inicio = (anuncios.inicio || []).filter(a => !ocultos.includes(String(a.id)));
    pubPintarInicio();
  };

  // ── Carga ──
  // Una sola consulta por visita. Si falla, no pasa nada: no hay anuncios.
  async function pubCargar() {
    if (anuncios) return anuncios;
    if (typeof sb === 'undefined' || !sb || !sb.rpc) return null;
    try {
      const { data, error } = await sb.rpc('anuncios_vigentes');
      if (error) throw error;
      const porEspacio = {};
      (data || []).forEach(a => { (porEspacio[a.space_id] = porEspacio[a.space_id] || []).push(a); });
      anuncios = porEspacio;
    } catch (e) {
      anuncios = {};
      return anuncios;
    }
    // Lo que ya estaba dibujado antes de que llegaran los anuncios se
    // vuelve a pintar una vez, para sumarlos.
    pubPintarInicio();
    try {
      const grilla = document.getElementById('prodBuscarGrid');
      if (delEspacio('resultados').length && grilla && grilla.style.display === 'grid' && typeof _drawBuscarGrid === 'function') {
        _drawBuscarGrid(grilla);
      }
    } catch (e) { }
    try {
      if (delEspacio('novedades').length && typeof novCargadas !== 'undefined' && novCargadas && typeof renderNovedades === 'function') {
        renderNovedades();
      }
    } catch (e) { }
    return anuncios;
  }

  // Se pide apenas carga la pagina: el carrusel esta arriba de todo en el
  // inicio y conviene que aparezca antes de que la persona empiece a bajar.
  // En admin.html este archivo solo aporta las cuentas: no pide anuncios.
  const arrancar = () => { if (document.getElementById('screen-inicio')) pubCargar(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  raiz.pubCargar = pubCargar;
  raiz.pubPintarInicio = pubPintarInicio;
  raiz.pubCeldaResultadosHtml = pubCeldaResultadosHtml;
  raiz.pubTarjetaNovedadesHtml = pubTarjetaNovedadesHtml;
})(typeof window !== 'undefined' ? window : globalThis);
