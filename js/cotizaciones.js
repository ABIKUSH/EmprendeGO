/* =====================================================================
   COTIZACIONES (pedidos de cotizacion / RFQ) — modulo aislado.

   Vive dentro de #screen-cotizaciones. Se abre con window.abrirCotizaciones().
   No toca ninguna funcion del resto de la app: solo LEE helpers globales que
   ya existen (sb, currentUser, escHtml, showToast, haptic, goTo, abrirWA,
   registrarContactoWA, abrirDetalle, RUBROS_LISTA, PROVINCIAS).

   Reglas de producto (decididas con el founder):
   - La pantalla que se abre es el FEED PUBLICO de todos los pedidos abiertos,
     para las dos puntas. Es lo que hace que la seccion se vea viva en vez de
     vacia: se ve la actividad real del marketplace. "Mis pedidos" (o "Mis
     cotizaciones", si es proveedor) es un boton chico arriba, no la portada.
   - En el feed publico se ve CUANTAS cotizaciones recibio cada pedido, pero
     NUNCA los precios: esos solo los ve el dueño del pedido. Lo garantiza la
     RLS (cot_select), no la pantalla — asi no se le regalan los precios a la
     competencia.
   - Para publicar hay que estar logueado. El perfil del que pide aparece en su
     pedido (nombre + foto, denormalizados en la fila).
   - El proveedor NO ve el contacto del comprador. Cotiza a ciegas; el comprador
     elige a quien contactar y sale por el WhatsApp de siempre
     (registrarContactoWA -> suma a la metrica de consultas).
   - Sin muro Free/Pro por ahora: primero liquidez.

   Tablas: public.solicitudes / public.cotizaciones (RLS verificada).
   ===================================================================== */
(function () {
  'use strict';

  const VERDE = '#006039';
  const VERDE_OSC = '#065F46';
  const SOFT = '#EFF6F2';
  const BORDE = '#DCE8E2';
  // Grises verificados contra WCAG AA (>=4.5:1) sobre blanco, #FAFBFA y #EFF6F2,
  // que son los tres fondos de esta pantalla. Los tonos mas claros que se usan
  // en otras partes de la app (#9AA8A1 = 2,47:1) no pasan en texto chico.
  const TENUE = '#5F6E66';   // fechas y metadatos   -> 5,37:1 sobre blanco
  const GRIS = '#5A6B7F';    // texto secundario     -> 5,46:1 sobre blanco

  // Columnas explicitas: `select('*')` traeria usuario_email, que esta
  // revocado de la API a proposito (PII) y devolveria 403.
  const COLS_SOL = 'id,created_at,usuario_id,comprador_nombre,comprador_foto,' +
    'titulo,cantidad,rubro,provincia,detalles,presupuesto,estado,cierra_at,respuestas';
  const COLS_COT = 'id,created_at,solicitud_id,proveedor_id,precio,entrega,minimo,pagos,nota';

  const ENTREGAS = ['24 hs', '48 hs', '3 a 5 dias', '1 semana', 'Mas de 1 semana'];
  const PAGOS = ['Transferencia', 'Efectivo', 'Mercado Pago', 'Cuotas'];

  const st = {
    vista: 'login',      // login | feed | publicar | mis | respuestas | cotizar | misCotiz
    uid: null,
    misPedidos: [],
    feed: [],            // todos los pedidos abiertos (las dos puntas ven lo mismo)
    misCotiz: {},        // solicitud_id -> cotizacion propia (proveedor)
    pedidoActual: null,
    cotizaciones: [],
    provsCache: {},
    orden: 'recientes',  // recientes | precio
    rubro: 'Todos',
    cargando: false,
    prefill: null,        // pedido pre-cargado desde una busqueda sin resultados
    errorPendiente: null, // error a mostrar al volver al formulario
    demanda: null         // carril "buscado sin respuesta"; null = todavia no se pidio
  };

  /* ---------------- utilidades ---------------- */

  const $ = id => document.getElementById(id);
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s ?? ''));

  function toast(m) { try { showToast(m); } catch (e) { } }
  function vibrar(t) { try { haptic(t); } catch (e) { } }

  function hace(iso) {
    if (!iso) return '';
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'recien';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.floor(min / 60);
    if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
    const d = Math.floor(h / 24);
    if (d < 30) return 'hace ' + d + (d === 1 ? ' dia' : ' dias');
    return 'hace ' + Math.floor(d / 30) + ' meses';
  }

  function plata(n) {
    const v = Number(n);
    if (!isFinite(v)) return '';
    return '$' + v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }

  // Parsea plata escrita como la escribe un argentino: el punto es separador de
  // MILES y la coma es el decimal. Sin esto, "1.200" se lee como 1,2 y un
  // proveedor que cotiza mil doscientos termina publicando un peso con veinte.
  function parsearMonto(raw) {
    let s = String(raw ?? '').replace(/[^0-9.,]/g, '');
    if (!s) return null;
    const tienePunto = s.includes('.'), tieneComa = s.includes(',');
    if (tienePunto && tieneComa) {
      // "1.200,50" -> el ultimo separador manda como decimal
      s = s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
    } else if (tieneComa) {
      s = s.replace(/,/g, '.');                     // "1200,50" -> decimal
    } else if (tienePunto) {
      const partes = s.split('.');
      const ultima = partes[partes.length - 1];
      // "1.200" o "1.200.000" -> miles.  "1200.50" -> decimal.
      if (partes.length > 2 || (ultima.length === 3 && partes[0].length > 0)) s = partes.join('');
    }
    const n = Number(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  function vigente(s) {
    return s.estado === 'abierta' && new Date(s.cierra_at).getTime() > Date.now();
  }

  // Los pedidos nacen con 14 dias. Se usa para el anillo y para el texto de
  // cierre; devuelve null si la fila no trae cierra_at.
  const DIAS_PEDIDO = 14;

  function diasParaCierre(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (!isFinite(ms)) return null;
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  function textoCierre(dias) {
    if (dias === null) return 'Abierto';
    if (dias <= 0) return 'Cierra hoy';
    if (dias === 1) return 'Último día';
    return 'Cierra en ' + dias + ' días';
  }

  // Anillo de tiempo restante. Es la unica pieza de la tarjeta que siempre
  // tiene algo que mostrar, incluso en un pedido cargado solo con el titulo.
  // rotate(-90) para que empiece a las 12 en punto.
  function anilloTiempo(dias) {
    const frac = dias === null ? 1 : Math.max(0, Math.min(1, dias / DIAS_PEDIDO));
    const r = 8, circ = 2 * Math.PI * r;
    const col = dias !== null && dias <= 2 ? '#D94F00' : VERDE;
    return `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style="flex-shrink:0;transform:rotate(-90deg)">
      <circle cx="10" cy="10" r="${r}" fill="none" stroke="#E4EBE7" stroke-width="2.4"/>
      <circle cx="10" cy="10" r="${r}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round"
        stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - frac)).toFixed(1)}"/>
    </svg>`;
  }

  function esDeHoy(iso) {
    if (!iso) return false;
    const d = new Date(iso), h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
  }

  // Cuenta ascendente de los numeros del pulso. Corre despues de pintar, sobre
  // los [data-cuenta] que quedaron en el DOM. Si el sistema pidio menos
  // movimiento se escribe el numero final y listo.
  function animarCifras(cont) {
    let quieto = false;
    try { quieto = window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { }
    cont.querySelectorAll('[data-cuenta]').forEach(el => {
      const fin = Number(el.dataset.cuenta) || 0;
      if (quieto || fin <= 0) { el.textContent = String(fin); return; }
      // El HTML ya trae el numero final: si esta funcion no llegara a correr
      // (error de JS antes de tiempo), se ve el valor real y no un cero.
      // Recien aca se lo baja a cero para animarlo.
      el.textContent = '0';
      const dur = 700, t0 = performance.now();
      (function paso(t) {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = String(Math.round(fin * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(paso);
      })(t0);
    });
  }

  function iniciales(nombre) {
    return String(nombre || '?').trim().substring(0, 2).toUpperCase();
  }

  // Avatar del comprador: foto si tiene, si no las iniciales sobre verde.
  function avatar(nombre, foto, size) {
    const s = size || 38;
    if (foto) {
      return `<div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:${SOFT}">
        <img loading="lazy" src="${esc(foto)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()"></div>`;
    }
    return `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${SOFT};color:${VERDE_OSC};display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;font-weight:800;font-size:${Math.round(s / 3)}px;flex-shrink:0">${esc(iniciales(nombre))}</div>`;
  }

  const ICO = {
    volver: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    mas: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    pin: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    ok: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    wa: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/><path d="M12 2a10 10 0 0 0-8.6 15.08L2 22l5.05-1.32A10 10 0 1 0 12 2zm0 18.2a8.17 8.17 0 0 1-4.17-1.14l-.3-.18-3 .78.8-2.92-.2-.31A8.2 8.2 0 1 1 12 20.2z"/></svg>`,
    vacio: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#B7C4BD" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    flecha: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/></svg>`,
    lupa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
  };

  // Boton principal: reusa .nv-cta-full / .nv-redondel, que css/styles.css define
  // como clases GLOBALES (no estan scopeadas a #screen-novedades). Asi estos
  // botones son literalmente los mismos que los de Novedades y acompañan
  // cualquier cambio futuro de ese estilo sin tocar este archivo.
  function btnCta(txt, onclick, extra) {
    return `<button class="nv-cta-full" onclick="${onclick}"${extra ? ' style="' + extra + '"' : ''}>
      <span>${txt}</span><span class="nv-redondel">${ICO.flecha}</span></button>`;
  }

  const btnPrimario = (txt, onclick, extra) => btnCta(txt, onclick, extra);

  // Boton secundario: misma pastilla (999px) pero calado, para que conviva con
  // el principal sin competirle.
  function btnSec(txt, onclick, tono) {
    const col = tono === 'rojo' ? '#B91C1C' : VERDE_OSC;
    const bor = tono === 'rojo' ? '#F3C9C9' : BORDE;
    return `<button onclick="${onclick}" style="flex:1;min-height:44px;background:#fff;color:${col};border:1.5px solid ${bor};border-radius:999px;padding:10px 16px;font-size:.83rem;font-weight:700;cursor:pointer;font-family:inherit;transition:transform 200ms cubic-bezier(.23,1,.32,1)">${txt}</button>`;
  }

  // Layout tipo Novedades: una columna en celular, dos en escritorio.
  // Va como <style> dentro de la pantalla para no tocar css/styles.css.
  const ESTILOS = `<style>
    /* Tokens de la seccion. Antes vivian solo dentro de .cz-portada; ahora los
       usa toda la pantalla (el pulso del feed y las tarjetas).

       OJO con el !important de las fuentes: css/styles.css unifica TODA la app
       en la fuente del sistema con \`body, body *{font-family:... !important}\`.
       Sin repetir el !important aca, Fraunces y la mono no se aplican nunca
       (es lo que le pasaba a la portada, que se veia en la fuente de sistema
       aunque pidiera serif). Novedades resuelve lo mismo de esta forma. */
    #screen-cotizaciones{
      --cz-naranja:#FF6B00;--cz-naranja-soft:#FF8A33;--cz-naranja-luz:#FFC79A;
      --cz-serif:'Fraunces',Georgia,'Times New Roman',serif;
      --cz-mono:ui-monospace,'SF Mono','Cascadia Mono',Menlo,Consolas,monospace;
    }

    #screen-cotizaciones .cz-grilla{display:flex;flex-direction:column;gap:12px;padding:4px 16px 96px}
    @media(min-width:900px){
      #screen-cotizaciones .cz-grilla{display:block;column-count:2;column-gap:20px;max-width:1000px;margin:0 auto;padding:8px 16px 96px}
      #screen-cotizaciones .cz-grilla > *{display:block;width:100%;margin:0 0 20px;break-inside:avoid;-webkit-column-break-inside:avoid}
      #screen-cotizaciones .cz-ancho{max-width:1000px;margin:0 auto}
    }
    #screen-cotizaciones .cz-chips{display:flex;gap:8px;overflow-x:auto;padding:12px 16px 10px;scrollbar-width:none}
    #screen-cotizaciones .cz-chips::-webkit-scrollbar{display:none}
    /* min-height 44: target tactil comodo. Con 31px (el alto que daba solo el
       padding) se falla en celular y se toca el chip de al lado. */
    #screen-cotizaciones .cz-chip{
      flex-shrink:0;min-height:44px;padding:8px 17px;border-radius:22px;
      font-size:.79rem;cursor:pointer;font-family:inherit;transition:all .18s ease-out;
    }

    /* Foco visible por teclado en TODO lo interactivo de la pantalla.
       :focus-visible y no :focus para no dibujar el anillo al tocar con el dedo. */
    #screen-cotizaciones button:focus-visible,
    #screen-cotizaciones input:focus-visible,
    #screen-cotizaciones select:focus-visible,
    #screen-cotizaciones textarea:focus-visible{
      outline:2px solid ${VERDE};outline-offset:2px;border-radius:12px;
    }
    #screen-cotizaciones .cz-chip:focus-visible,
    #screen-cotizaciones .nv-cta-full:focus-visible,
    #screen-cotizaciones .cz-fab:focus-visible{border-radius:999px}

    /* El campo activo tiene que avisar que lo esta, no solo al tabular. */
    #screen-cotizaciones input:focus,
    #screen-cotizaciones select:focus,
    #screen-cotizaciones textarea:focus{border-color:${VERDE}}

    #screen-cotizaciones button:disabled{opacity:.55;cursor:progress}

    /* Quien pidio menos movimiento no ve ninguno. No es opcional. */
    @media (prefers-reduced-motion:reduce){
      #screen-cotizaciones *,#screen-cotizaciones *::before,#screen-cotizaciones *::after{
        transition-duration:.01ms !important;animation-duration:.01ms !important;
      }
    }

    /* ---- PORTADA / ONBOARDING ----
       Mismo lenguaje que la portada de Mercado. Los tokens --se-* y las clases
       .se-* de css/styles.css estan scopeados a #screen-emprendedor, asi que
       hay que redeclararlos aca; se copian los MISMOS valores para que las dos
       pantallas se vean iguales. */
    #screen-cotizaciones .cz-portada{position:relative;min-height:100vh;overflow:hidden}
    #screen-cotizaciones .cz-obg{
      position:absolute;inset:0;z-index:0;pointer-events:none;
      background:
        radial-gradient(62% 42% at 16% 3%,rgba(28,190,124,.42),transparent 66%),
        radial-gradient(50% 40% at 98% 12%,rgba(255,107,0,.24),transparent 62%),
        radial-gradient(85% 55% at 50% 112%,rgba(13,110,70,.5),transparent 74%),
        linear-gradient(180deg,#0B3A27,#082C1E 55%,#051f15);
    }
    #screen-cotizaciones .cz-onb{
      position:relative;z-index:1;padding:26px 22px 46px;
      display:flex;flex-direction:column;max-width:560px;margin:0 auto;
    }
    #screen-cotizaciones .cz-volver{
      width:44px;height:44px;border-radius:50%;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;cursor:pointer;
      border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.09);
      color:#fff;margin-bottom:22px;
    }
    #screen-cotizaciones .cz-eyebrow{
      align-self:flex-start;display:inline-flex;align-items:center;gap:7px;
      border-radius:999px;padding:6px 12px;
      border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);
      font-family:var(--cz-mono) !important;font-size:.62rem;font-weight:600;
      letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.86);
    }
    #screen-cotizaciones .cz-punto{
      width:6px;height:6px;border-radius:50%;background:var(--cz-naranja);flex-shrink:0;
    }
    #screen-cotizaciones .cz-h1{
      font-family:var(--cz-serif) !important;font-size:clamp(1.7rem,6.8vw,2.2rem);font-weight:900;
      line-height:1.02;letter-spacing:-.03em;color:#fff;margin:14px 0 0;text-wrap:balance;
    }
    #screen-cotizaciones .cz-h1 em{
      font-style:italic;font-weight:700;color:var(--cz-naranja-soft);
    }
    #screen-cotizaciones .cz-bajada{
      margin:12px 0 0;font-size:.95rem;line-height:1.55;
      color:rgba(255,255,255,.78);max-width:46ch;
    }
    #screen-cotizaciones .cz-pasos{display:flex;flex-direction:column;gap:10px;margin:26px 0 0}
    #screen-cotizaciones .cz-paso{
      display:flex;align-items:center;gap:13px;padding:13px 14px;
      background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:15px;
    }
    #screen-cotizaciones .cz-num{
      width:38px;height:38px;flex-shrink:0;border-radius:11px;
      display:flex;align-items:center;justify-content:center;
      font-family:'Inter',sans-serif;font-weight:800;font-size:1rem;color:#fff;
      background:linear-gradient(135deg,#0FBF77,#0A8A58);
    }
    #screen-cotizaciones .cz-paso.tres .cz-num{
      background:linear-gradient(135deg,var(--cz-naranja),var(--cz-naranja-soft));
    }
    #screen-cotizaciones .cz-paso b{font-size:.92rem;color:#fff;font-weight:700;display:block}
    #screen-cotizaciones .cz-paso small{font-size:.78rem;line-height:1.35;color:rgba(255,255,255,.74)}
    #screen-cotizaciones .cz-onb-cta{margin-top:28px}
    #screen-cotizaciones .cz-cta-naranja{
      display:flex;align-items:center;justify-content:center;gap:9px;width:100%;
      min-height:52px;padding:15px;border:none;border-radius:15px;cursor:pointer;
      font-family:'Inter',sans-serif;font-size:.95rem;font-weight:700;letter-spacing:-.01em;color:#fff;
      /* Naranja un punto mas hondo que el de Mercado: con #FF6B00 el texto
         blanco queda en 2,86:1 y no llega al 3:1 que pide texto grande en
         negrita. Este degradado pasa en los DOS extremos (4,14 y 3,07) y a
         simple vista es el mismo naranja. */
      background:linear-gradient(135deg,#D94F00,#F26A00);
      box-shadow:0 12px 26px -12px rgba(217,79,0,.55);
      transition:transform 200ms cubic-bezier(.23,1,.32,1);
    }
    #screen-cotizaciones .cz-cta-naranja:active{transform:scale(.98)}
    #screen-cotizaciones .cz-cta-naranja svg{width:17px;height:17px}
    #screen-cotizaciones .cz-hint{
      margin:12px 0 0;text-align:center;font-family:var(--cz-mono) !important;
      font-size:.68rem;letter-spacing:.06em;color:rgba(255,255,255,.72);
    }
    #screen-cotizaciones .cz-sube{opacity:0;transform:translateY(12px);animation:czSube .62s cubic-bezier(.22,1,.36,1) forwards;animation-delay:var(--d,0ms)}
    @keyframes czSube{to{opacity:1;transform:none}}
    @media (prefers-reduced-motion:reduce){
      #screen-cotizaciones .cz-sube{opacity:1;transform:none;animation:none}
    }
    @media (hover:hover) and (pointer:fine){
      #screen-cotizaciones .cz-cta-naranja:hover{transform:translateY(-2px)}
      #screen-cotizaciones .cz-volver:hover{background:rgba(255,255,255,.16)}
    }

    /* Mismo lenguaje que Novedades: bandeja exterior + nucleo blanco adentro.
       Reusa los tokens --nv-* que ya define css/styles.css. */
    #screen-cotizaciones .cz-bandeja{
      background:var(--nv-hair-2,rgba(14,20,17,.045));
      border:1px solid var(--nv-hair,rgba(14,20,17,.07));
      border-radius:26px;padding:6px;
      box-shadow:var(--nv-flota,0 8px 20px -8px rgba(14,20,17,.07));
      transition:transform 440ms var(--nv-masa,cubic-bezier(.32,.72,0,1));
    }
    #screen-cotizaciones .cz-bandeja:active{transform:scale(.988)}
    #screen-cotizaciones .cz-bandeja.cz-propia{
      border-color:rgba(0,96,57,.35);
      background:rgba(0,96,57,.06);
    }
    #screen-cotizaciones .cz-nucleo{
      background:var(--nv-carta,#fff);border-radius:20px;padding:15px;
      box-shadow:inset 0 1px 1px rgba(255,255,255,.6);
    }

    /* "+" flotante al costado. Se corre con el ancho de pantalla para quedar
       pegado a la columna de contenido y no encima del texto. */
    #screen-cotizaciones .cz-fab{
      position:fixed;right:18px;bottom:84px;z-index:40;
      width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;
      display:flex;align-items:center;justify-content:center;color:#fff;
      background:linear-gradient(145deg,#0A7A4B,#006039);
      box-shadow:inset 0 1px 1px rgba(255,255,255,.24),0 8px 22px -8px rgba(0,96,57,.8);
      transition:transform 220ms cubic-bezier(.23,1,.32,1);
    }
    #screen-cotizaciones .cz-fab:active{transform:scale(.93)}
    #screen-cotizaciones .cz-fab svg{width:24px;height:24px}
    @media(min-width:900px){
      #screen-cotizaciones .cz-fab{bottom:28px;right:calc(50% - 500px + 4px)}
    }
    @media(max-width:1060px) and (min-width:900px){
      #screen-cotizaciones .cz-fab{right:18px}
    }
    /* ---- PULSO: cabecera viva del feed ----
       Reemplaza la cajita verde clara que solo tenia un titulo y una bajada.
       Los numeros salen del feed que YA esta cargado en memoria: no hay una
       sola consulta extra ni una columna nueva. */
    #screen-cotizaciones .cz-pulso{
      position:relative;overflow:hidden;border-radius:22px;padding:17px 18px 15px;
      background:
        radial-gradient(72% 62% at 6% -8%,rgba(28,190,124,.40),transparent 68%),
        radial-gradient(58% 70% at 104% 4%,rgba(255,107,0,.22),transparent 62%),
        linear-gradient(165deg,#0B3A27,#072A1D 62%,#052016);
      box-shadow:0 16px 34px -18px rgba(5,32,22,.8);
    }
    /* Reticula tenue: textura de tablero, cero peso. Se desvanece hacia abajo
       con una mascara para que no compita con el texto. */
    #screen-cotizaciones .cz-pulso::before{
      content:'';position:absolute;inset:0;pointer-events:none;opacity:.55;
      background-image:
        linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),
        linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px);
      background-size:32px 32px;
      -webkit-mask-image:radial-gradient(78% 82% at 50% 0%,#000,transparent 76%);
              mask-image:radial-gradient(78% 82% at 50% 0%,#000,transparent 76%);
    }
    #screen-cotizaciones .cz-pulso > *{position:relative;z-index:1}
    /* Solo para lectores de pantalla: el texto real detras de los numeros que
       animan de 0 hacia arriba. */
    #screen-cotizaciones .cz-oculto{
      position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
      clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;
    }
    #screen-cotizaciones .cz-vivo{
      width:7px;height:7px;border-radius:50%;background:var(--cz-naranja);flex-shrink:0;
      animation:czLatido 2.4s ease-out infinite;
    }
    @keyframes czLatido{
      0%{box-shadow:0 0 0 0 rgba(255,107,0,.55)}
      70%{box-shadow:0 0 0 8px rgba(255,107,0,0)}
      100%{box-shadow:0 0 0 0 rgba(255,107,0,0)}
    }
    #screen-cotizaciones .cz-cifra{
      font-family:var(--cz-serif) !important;
      font-size:clamp(2.9rem,14vw,3.6rem);font-weight:900;line-height:.86;
      letter-spacing:-.045em;color:#fff;font-variant-numeric:tabular-nums;
    }
    #screen-cotizaciones .cz-cifra-lab{
      font-size:.87rem;font-weight:600;line-height:1.3;color:rgba(255,255,255,.82);
    }
    #screen-cotizaciones .cz-stats{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}
    #screen-cotizaciones .cz-stat{
      display:inline-flex;align-items:baseline;gap:5px;border-radius:999px;padding:5px 11px;
      border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);
      font-size:.72rem;color:rgba(255,255,255,.76);
    }
    #screen-cotizaciones .cz-stat b{
      font-size:.84rem;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;
    }
    #screen-cotizaciones .cz-pulso-txt{
      margin:13px 0 0;font-size:.79rem;line-height:1.5;
      color:rgba(255,255,255,.76);max-width:44ch;
    }
    #screen-cotizaciones .cz-pulso-link{
      margin-top:12px;min-height:38px;display:inline-flex;align-items:center;gap:7px;
      border-radius:999px;padding:8px 14px;cursor:pointer;font-family:inherit;
      border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);
      color:#fff;font-size:.75rem;font-weight:700;
      transition:background 220ms ease-out;
    }
    #screen-cotizaciones .cz-pulso-link svg{width:13px;height:13px}

    /* ---- CARRIL "BUSCADO SIN RESPUESTA" ----
       Va en naranja y no en verde: el verde es lo que la plataforma YA
       resuelve (pedidos, cotizaciones) y esto es justamente el agujero, la
       oportunidad. Que se distinga de un vistazo del resto del feed. */
    #screen-cotizaciones .cz-demanda{padding:16px 15px 15px}
    #screen-cotizaciones .cz-dem-ojo{
      display:inline-flex;align-items:center;gap:7px;
      font-family:var(--cz-mono) !important;font-size:.62rem;font-weight:700;
      letter-spacing:.14em;text-transform:uppercase;color:#B24500;
    }
    #screen-cotizaciones .cz-dem-ojo svg{width:13px;height:13px;flex-shrink:0}
    #screen-cotizaciones .cz-dem-tit{
      margin:10px 0 5px;font-size:.98rem;font-weight:800;color:#1A1A1A;
      line-height:1.3;letter-spacing:-.015em;text-wrap:balance;
    }
    #screen-cotizaciones .cz-dem-baj{margin:0 0 14px;font-size:.79rem;line-height:1.5;color:${GRIS}}
    #screen-cotizaciones .cz-dem-chips{display:flex;gap:8px;flex-wrap:wrap}
    #screen-cotizaciones .cz-dem-chip{
      display:inline-flex;align-items:center;gap:7px;min-height:40px;
      padding:8px 12px;border-radius:11px;font-family:inherit;
      font-size:.83rem;font-weight:700;color:#1A1A1A;text-align:left;
      background:#FFF8F3;border:1.5px solid #FFD9BC;
      transition:transform 200ms cubic-bezier(.23,1,.32,1),border-color 200ms ease-out;
    }
    #screen-cotizaciones button.cz-dem-chip{cursor:pointer}
    #screen-cotizaciones button.cz-dem-chip:active{transform:scale(.96)}
    #screen-cotizaciones .cz-dem-n{
      flex-shrink:0;font-size:.7rem;font-weight:700;color:#B24500;background:#FFEBDC;
      border-radius:6px;padding:2px 7px;font-variant-numeric:tabular-nums;
    }
    #screen-cotizaciones .cz-dem-pie{
      margin:13px 0 0;font-size:.72rem;line-height:1.45;color:${TENUE};
    }

    /* ---- TARJETA DEL FEED ----
       Un pedido cargado solo con titulo salia como dos renglones sueltos y
       nada mas. Ahora el piso minimo de toda tarjeta es: quien pide, que
       pide, cuanto le queda abierta y en que estado esta. Todo con datos que
       ya venian en la fila. */
    #screen-cotizaciones .cz-titulo{
      font-size:1rem;font-weight:800;color:#1A1A1A;line-height:1.32;
      letter-spacing:-.015em;margin:0 0 10px;text-wrap:balance;
    }
    #screen-cotizaciones .cz-datos{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:11px}
    #screen-cotizaciones .cz-dato{
      display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:3px 9px;
      background:#F4F7F5;border:1px solid #E7EDE9;color:#41564C;font-size:.73rem;font-weight:600;
    }
    #screen-cotizaciones .cz-dato.fuerte{
      background:${SOFT};border-color:${BORDE};color:${VERDE_OSC};font-weight:800;
    }
    #screen-cotizaciones .cz-detalle{
      font-size:.79rem;color:#41564C;background:#FAFBFA;border:1px solid #F0F3F1;
      border-radius:10px;padding:9px 11px;margin:0 0 11px;line-height:1.5;
    }
    #screen-cotizaciones .cz-pie{
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      padding-top:11px;border-top:1px solid #EEF2F0;
    }
    #screen-cotizaciones .cz-cierre{
      display:inline-flex;align-items:center;gap:7px;min-width:0;
      font-family:var(--cz-mono) !important;font-size:.65rem;font-weight:600;
      letter-spacing:.07em;text-transform:uppercase;color:${TENUE};
    }
    #screen-cotizaciones .cz-estado{flex-shrink:0;font-size:.71rem;font-weight:700;color:${GRIS}}
    #screen-cotizaciones .cz-estado.hay{color:${VERDE_OSC};font-weight:800}
    #screen-cotizaciones .cz-cta-zona{margin-top:11px}
    #screen-cotizaciones .cz-pastilla{
      display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;
      background:${SOFT};color:${VERDE_OSC};border-radius:999px;padding:11px;
      font-size:.82rem;font-weight:700;
    }

    /* ---- ESQUELETOS ----
       Antes se veia "Cargando..." centrado y despues saltaba todo el layout.
       El esqueleto ocupa el mismo lugar que lo que viene. */
    #screen-cotizaciones .cz-sk{
      border-radius:12px;
      background:linear-gradient(100deg,#EDF1EF 20%,#F7F9F8 42%,#EDF1EF 62%);
      background-size:240% 100%;animation:czBrillo 1.25s linear infinite;
    }
    @keyframes czBrillo{from{background-position:180% 0}to{background-position:-60% 0}}
    #screen-cotizaciones .cz-sk-pulso{height:196px;border-radius:22px}
    #screen-cotizaciones .cz-sk-linea{height:11px;border-radius:6px}

    @media (hover:hover) and (pointer:fine){
      #screen-cotizaciones .cz-fab:hover{transform:translateY(-2px) scale(1.04)}
      #screen-cotizaciones .cz-bandeja:hover{transform:translateY(-2px)}
      #screen-cotizaciones .cz-pulso-link:hover{background:rgba(255,255,255,.17)}
      #screen-cotizaciones button.cz-dem-chip:hover{transform:translateY(-2px);border-color:#F3A268}
    }
  </style>`;

  // Boton "+" al costado: redondo y pegado al borde derecho, para que no tape
  // el contenido del feed como hacia la pastilla ancha centrada.
  // aria-label porque el boton no tiene texto visible.
  function fabPedir() {
    return `<button onclick="cotizIr('publicar')" aria-label="Pedir una cotización" title="Pedir una cotización"
      class="cz-fab">${ICO.mas}</button>`;
  }

  // `accion` = botoncito chico a la derecha (ej: "Mis pedidos").
  function header(titulo, onBack, accion) {
    return `<div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid ${BORDE};position:sticky;top:0;background:#fff;z-index:5">
      ${onBack ? `<button onclick="${onBack}" aria-label="Volver" style="background:none;border:none;width:44px;height:44px;margin-left:-11px;cursor:pointer;color:#1A1A1A;display:flex;align-items:center;justify-content:center;border-radius:50%">${ICO.volver}</button>` : ''}
      <div style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:800;color:#1A1A1A">${esc(titulo)}</div>
      ${accion ? `<div style="margin-left:auto">${accion}</div>` : ''}
    </div>`;
  }

  // Boton chico de la esquina, con puntito verde si hay algo para mirar.
  function btnEsquina(texto, onclick, aviso) {
    return `<button onclick="${onclick}" style="display:flex;align-items:center;gap:6px;min-height:44px;background:${SOFT};color:${VERDE_OSC};border:1.5px solid ${BORDE};border-radius:999px;padding:8px 15px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;transition:transform .18s ease-out">
      ${esc(texto)}
      ${aviso ? `<span aria-hidden="true" style="width:7px;height:7px;border-radius:50%;background:${VERDE};display:inline-block"></span>` : ''}
    </button>`;
  }

  function vacioBox(titulo, sub, cta) {
    return `<div style="text-align:center;padding:44px 28px">
      <div style="margin-bottom:12px">${ICO.vacio}</div>
      <div style="font-family:'Inter',sans-serif;font-size:.95rem;font-weight:800;color:#1A1A1A;margin-bottom:6px">${esc(titulo)}</div>
      <div style="font-size:.83rem;color:${GRIS};line-height:1.55;max-width:300px;margin:0 auto">${esc(sub)}</div>
      ${cta ? `<div style="margin-top:18px;max-width:280px;margin-left:auto;margin-right:auto">${cta}</div>` : ''}
    </div>`;
  }

  /* ---------------- datos ---------------- */

  async function getUid() {
    if (st.uid) return st.uid;
    try {
      const { data } = await sb.auth.getSession();
      st.uid = data?.session?.user?.id || null;
    } catch (e) { st.uid = null; }
    return st.uid;
  }

  async function cargarMisPedidos() {
    const uid = await getUid();
    if (!uid) { st.misPedidos = []; return; }
    const { data, error } = await sb.from('solicitudes').select(COLS_SOL)
      .eq('usuario_id', uid).order('created_at', { ascending: false }).limit(50);
    if (error) { console.warn('[cotiz] misPedidos', error); st.misPedidos = []; return; }
    st.misPedidos = data || [];
  }

  /* Feed del visitante SIN sesion.
     No lee la tabla: anon no tiene ningun permiso sobre solicitudes. Llama a
     cotiz_feed_publico(), una funcion SECURITY DEFINER que filtra a los
     pedidos abiertos y devuelve el nombre del comprador ya mascarado
     ("María R.", o "Emprendedor" si el nombre es un token pegado tipo handle
     de Instagram). Sin foto, sin usuario_id y sin nada de cotizaciones.

     Mascarar esto en el frontend no serviria: la clave anonima esta en el JS
     del sitio, asi que cualquiera podria pedirle los nombres completos a la
     API. Por eso el recorte vive en la base.

     Se completan los campos que la funcion no devuelve para que el resto de
     la pantalla no tenga que saber de donde vino la fila. */
  async function cargarFeedPublico() {
    const { data, error } = await sb.rpc('cotiz_feed_publico', { p_limit: 60 });
    st.misCotiz = {};
    if (error) { console.warn('[cotiz] feed publico', error); st.feed = []; return; }
    st.feed = (data || []).map(s => ({
      ...s, estado: 'abierta', comprador_foto: null, usuario_id: null
    }));
  }

  async function cargarFeed() {
    if (!currentUser) return cargarFeedPublico();

    const { data, error } = await sb.from('solicitudes').select(COLS_SOL)
      .eq('estado', 'abierta').gt('cierra_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(60);
    if (error) { console.warn('[cotiz] feed', error); st.feed = []; return; }
    st.feed = data || [];

    // Que pedidos ya cotice, para no ofrecer cotizar dos veces.
    const provId = currentUser?.proveedorId;
    st.misCotiz = {};
    if (provId) {
      // created_at hace falta para la pantalla "Mis cotizaciones" (el "hace X").
      const { data: mias } = await sb.from('cotizaciones').select('solicitud_id,precio,created_at')
        .eq('proveedor_id', provId);
      (mias || []).forEach(c => { st.misCotiz[c.solicitud_id] = c; });
    }
  }

  /* Carril "buscado sin respuesta".
     Los terminos salen ya filtrados y agregados por la base (minimo 5
     busquedas en 3 dias distintos, sin lugares, marcas ni genericos): la
     pantalla no decide nada, solo pinta.

     Se pide una sola vez por sesion. Cambia lento y el feed se recarga en
     cada ida y vuelta; volver a pedirlo cada vez seria puro desperdicio.
     Ante un error se deja [] y no se reintenta: el carril simplemente no
     aparece y la pantalla queda como estaba. */
  async function cargarDemanda() {
    if (st.demanda !== null) return;
    try {
      const { data, error } = await sb.rpc('cotiz_demanda_sin_respuesta', { p_limit: 10 });
      if (error) throw error;
      st.demanda = (data || []).filter(d => d && d.termino);
    } catch (e) {
      console.warn('[cotiz] demanda', e);
      st.demanda = [];
    }
  }

  async function cargarCotizaciones(solId) {
    const { data, error } = await sb.from('cotizaciones').select(COLS_COT)
      .eq('solicitud_id', solId).order('created_at', { ascending: false });
    if (error) { console.warn('[cotiz] cotizaciones', error); st.cotizaciones = []; return; }
    st.cotizaciones = data || [];

    const faltan = [...new Set(st.cotizaciones.map(c => c.proveedor_id))]
      .filter(id => !st.provsCache[id]);
    if (faltan.length) {
      const { data: provs } = await sb.from('proveedores')
        .select('id,nombre,logo_url,plan,plan_hasta,rubro,provincia,whatsapp,pedido_minimo')
        .in('id', faltan);
      (provs || []).forEach(p => { st.provsCache[p.id] = p; });
    }
  }

  function esPro(p) {
    if (!p || p.plan !== 'pro') return false;
    if (!p.plan_hasta) return true;
    return new Date(p.plan_hasta + 'T03:00:00Z') >= new Date();
  }

  /* ---------------- render: raiz ---------------- */

  function render() {
    const cont = $('screen-cotizaciones');
    if (!cont) return;
    let html = '';
    // La portada se pinta sin esperar datos: es solo explicativa.
    if (st.vista === 'portada') html = pantallaPortada();
    else if (st.cargando) html = pantallaCargando();
    else if (st.vista === 'login') html = pantallaLogin();
    else if (st.vista === 'publicar') html = pantallaPublicar();
    else if (st.vista === 'respuestas') html = pantallaRespuestas();
    else if (st.vista === 'cotizar') html = pantallaCotizar();
    else if (st.vista === 'mis') html = pantallaMisPedidos();
    else if (st.vista === 'misCotiz') html = pantallaMisCotizaciones();
    else html = pantallaFeed();
    cont.innerHTML = ESTILOS + html;
    animarCifras(cont);
    window.scrollTo(0, 0);
  }

  // Esqueleto con la forma de lo que viene: el pulso arriba y tres tarjetas.
  // Asi la pantalla no salta cuando llegan los datos.
  function pantallaCargando() {
    const sk = `<div class="cz-bandeja"><div class="cz-nucleo">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="cz-sk" style="width:34px;height:34px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="cz-sk cz-sk-linea" style="width:44%;margin-bottom:7px"></div>
          <div class="cz-sk cz-sk-linea" style="width:26%;height:9px"></div>
        </div>
      </div>
      <div class="cz-sk cz-sk-linea" style="width:82%;height:14px;margin-bottom:9px"></div>
      <div class="cz-sk cz-sk-linea" style="width:56%;height:14px;margin-bottom:15px"></div>
      <div style="display:flex;gap:7px">
        <div class="cz-sk" style="width:88px;height:24px;border-radius:8px"></div>
        <div class="cz-sk" style="width:68px;height:24px;border-radius:8px"></div>
      </div>
    </div></div>`;

    return header('Cotizaciones') + `
      <div class="cz-ancho" style="padding:13px 16px 2px"><div class="cz-sk cz-sk-pulso"></div></div>
      <div class="cz-grilla" aria-busy="true" aria-label="Cargando pedidos">${sk + sk + sk}</div>`;
  }

  /* ---------------- PORTADA (explica de que se trata) ----------------
     Se muestra la primera vez que alguien entra a Cotizaciones, con el mismo
     lenguaje visual que la portada de Mercado. Despues se va derecho al feed;
     queda accesible desde el boton "Como funciona" del encabezado.       */

  /* ---------------- BORRADOR DEL PEDIDO ----------------
     El muro de login va DESPUES de escribir, no antes: se pedia cuenta a
     todo el que tocaba "Pedir cotizacion", incluso al que todavia no sabia
     si le servia, y ahi se caia casi todo el mundo.

     Publicar SIGUE exigiendo sesion: lo unico que cambia es cuando se pide.
     Como el login con Google navega afuera y vuelve con la pagina recargada
     (signInWithOAuth con redirectTo), el borrador no puede vivir en memoria:
     va a localStorage y se publica solo al volver.                        */

  const BORRADOR = 'eg_cotiz_borrador';
  // Si volvio mucho despues, ya no es "estaba publicando esto": se le
  // muestra el formulario cargado y decide el, no se publica solo.
  const BORRADOR_VENCE = 45 * 60 * 1000;

  function guardarBorrador(d) {
    try { localStorage.setItem(BORRADOR, JSON.stringify({ ...d, ts: Date.now() })); } catch (e) { }
  }

  function leerBorrador() {
    try {
      const raw = localStorage.getItem(BORRADOR);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.titulo) return null;
      if (Date.now() - (d.ts || 0) > BORRADOR_VENCE) { d.intento = false; }
      return d;
    } catch (e) { return null; }
  }

  function limpiarBorrador() {
    try { localStorage.removeItem(BORRADOR); } catch (e) { }
  }

  // Antes se guardaba en localStorage una marca de "portada ya vista" para
  // mostrarla una sola vez. Se saco: ahora la portada es la puerta de entrada
  // fija de la seccion, asi que no hay nada que recordar.

  function pantallaPortada() {
    const prov = esProveedor();
    const pasos = prov
      ? [['Mire qué se está pidiendo', 'Pedidos reales de emprendedores, con cantidad y zona.'],
      ['Mande su precio', 'Precio por unidad, mínimo, entrega y formas de pago.'],
      ['Lo contactan', 'Si le sirve su propuesta, el comprador le escribe.']]
      : [['Publique su pedido', 'Qué necesita comprar, cuánto y dónde. Un minuto.'],
      ['Reciba cotizaciones', 'Varios proveedores mayoristas le mandan su precio.'],
      ['Elija y compre', 'Compare y contacte al que más le conviene.']];

    return `<div class="cz-portada"><div class="cz-obg"></div>
      <div class="cz-onb">
        <button class="cz-volver cz-sube" style="--d:0ms" onclick="closeCotiz()" aria-label="Volver">${ICO.volver}</button>

        <span class="cz-eyebrow cz-sube" style="--d:60ms"><span class="cz-punto"></span> ${prov ? 'Demanda real · en vivo' : 'Pedidos de cotización'}</span>

        <h1 class="cz-h1 cz-sube" style="--d:140ms">${prov
        ? 'Cotice lo que <em>ya le están pidiendo.</em>'
        : 'Publique su pedido y <em>reciba cotizaciones.</em>'}</h1>

        <p class="cz-bajada cz-sube" style="--d:220ms">${prov
        ? 'Los emprendedores publican lo que necesitan comprar. Usted manda su precio y compite por el pedido, sin salir a buscar clientes.'
        : 'En vez de escribirle a diez proveedores uno por uno, publica una sola vez y ellos le mandan su precio, su mínimo y su tiempo de entrega.'}</p>

        <div class="cz-pasos">
          ${pasos.map((p, i) => `<div class="cz-paso${i === 2 ? ' tres' : ''} cz-sube" style="--d:${300 + i * 70}ms">
            <div class="cz-num" aria-hidden="true">${i + 1}</div>
            <div><b>${esc(p[0])}</b><small>${esc(p[1])}</small></div>
          </div>`).join('')}
        </div>

        <div class="cz-onb-cta cz-sube" style="--d:530ms">
          <button class="cz-cta-naranja" onclick="cotizEmpezar()">Probar ${ICO.flecha}</button>
          <p class="cz-hint">${prov ? 'Sin costo · No paga por cotizar' : 'Gratis · No paga por publicar'}</p>
        </div>
      </div>
    </div>`;
  }

  window.cotizEmpezar = async function () {
    vibrar('light');
    // Antes, sin sesion se iba derecho al formulario porque no habia feed que
    // mostrar. Ahora si lo hay: ver primero lo que otros estan pidiendo hace
    // mas por convencer que un formulario en blanco. Publicar sigue estando a
    // un toque, con el boton "+" y el cartel del final.
    await cotizIr('feed');
  };

  window.cotizVerPortada = function () { st.vista = 'portada'; render(); };

  // Dos versiones: la de siempre (entro sin sesion y sin haber escrito nada)
  // y la del ultimo paso, cuando ya escribio el pedido y solo falta la cuenta.
  // En esa segunda hay que mostrarle que lo que escribio NO se perdio, que es
  // exactamente el miedo que hace que la gente no siga.
  function pantallaLogin() {
    const d = leerBorrador();
    if (d && d.intento) {
      return header('Último paso', "cotizIr('publicar')") + `<div style="padding:8px 16px 32px">
        <div style="background:${SOFT};border:1px solid ${BORDE};border-radius:16px;padding:22px;text-align:center">
          <div style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:800;color:#1A1A1A;margin-bottom:8px">Su pedido está listo</div>
          <div style="font-size:.85rem;color:#41564C;line-height:1.6;margin-bottom:14px">Solo falta la cuenta: los proveedores necesitan saber quién está pidiendo. Apenas inicie sesión se publica solo.</div>
          <div style="background:#fff;border:1px solid ${BORDE};border-radius:12px;padding:12px 14px;margin-bottom:18px;text-align:left">
            <div style="font-size:.7rem;color:${TENUE};margin-bottom:3px">Su pedido</div>
            <div style="font-family:'Inter',sans-serif;font-size:.86rem;font-weight:700;color:#1A1A1A;line-height:1.4">${esc(d.titulo)}</div>
            ${d.cantidad || d.rubro ? `<div style="font-size:.74rem;color:${GRIS};margin-top:5px">${esc([d.cantidad ? d.cantidad + ' unidades' : '', d.rubro || ''].filter(Boolean).join(' · '))}</div>` : ''}
          </div>
          ${btnPrimario('Iniciar sesión y publicar', "goTo('perfil')")}
        </div>
        <div style="font-size:.78rem;color:${GRIS};text-align:center;margin-top:14px;line-height:1.5">Lo que escribió queda guardado en este teléfono. Si vuelve, sigue ahí.</div>
      </div>`;
    }
    return header('Cotizaciones') + `<div style="padding:8px 16px 32px">
      <div style="background:${SOFT};border:1px solid ${BORDE};border-radius:16px;padding:22px;text-align:center">
        <div style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:800;color:#1A1A1A;margin-bottom:8px">Pida precio a varios proveedores de una sola vez</div>
        <div style="font-size:.85rem;color:#41564C;line-height:1.6;margin-bottom:18px">Publique lo que necesita comprar y los proveedores mayoristas le mandan su precio, su mínimo y su tiempo de entrega. Usted elige a quién le contesta.</div>
        ${btnPrimario('Escribir mi pedido', "cotizIr('publicar')")}
      </div>
      <div style="font-size:.78rem;color:${GRIS};text-align:center;margin-top:14px;line-height:1.5">Para ver los pedidos de la comunidad hace falta iniciar sesión.</div>
    </div>`;
  }

  /* ---------------- FEED PUBLICO (portada, las dos puntas) ---------------- */

  const esProveedor = () => currentUser?.type === 'proveedor';
  const esMio = s => st.uid && String(s.usuario_id) === String(st.uid);

  // Solo los rubros que REALMENTE tienen pedidos: no ofrecer filtros vacios.
  function rubrosDelFeed() {
    const cuenta = {};
    st.feed.forEach(s => { if (s.rubro) cuenta[s.rubro] = (cuenta[s.rubro] || 0) + 1; });
    return Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  }

  function chipsRubro() {
    const rubros = ['Todos', ...rubrosDelFeed()];
    if (rubros.length <= 2) return '';   // un solo rubro: el filtro no aporta
    return `<div class="cz-chips">${rubros.map(r => {
      const on = st.rubro === r;
      return `<button class="cz-chip" onclick="cotizRubro('${esc(r).replace(/'/g, "\\'")}')" style="border:1.5px solid ${on ? VERDE : '#E2E6E4'};background:${on ? VERDE : '#fff'};color:${on ? '#fff' : GRIS};font-weight:${on ? 700 : 500}">${esc(r)}</button>`;
    }).join('')}</div>`;
  }

  // Cabecera viva del feed. Todo lo que muestra sale de st.feed, que ya esta
  // en memoria: ni una consulta mas. Las metricas secundarias solo aparecen si
  // dan mayor que cero — tres ceros alineados se ven peor que no mostrar nada.
  function pulso() {
    const prov = esProveedor();
    const nPedidos = st.feed.length;
    const nCotiz = st.feed.reduce((a, s) => a + (s.respuestas || 0), 0);
    const nRubros = rubrosDelFeed().length;
    const nHoy = st.feed.filter(s => esDeHoy(s.created_at)).length;

    const stats = [];
    if (nCotiz) stats.push([nCotiz, nCotiz === 1 ? 'cotización enviada' : 'cotizaciones enviadas']);
    if (nHoy) stats.push([nHoy, nHoy === 1 ? 'publicado hoy' : 'publicados hoy']);
    if (nRubros > 1) stats.push([nRubros, 'rubros activos']);

    // Los numeros arrancan en 0 y suben, asi que la version visual va con
    // aria-hidden y al lado queda el texto real para el lector de pantalla:
    // si no, se anuncia "0 pedidos abiertos".
    const lab = nPedidos === 1 ? 'pedido abierto ahora mismo' : 'pedidos abiertos ahora mismo';

    return `<div class="cz-pulso">
      <span class="cz-eyebrow"><span class="cz-vivo"></span> Demanda en vivo</span>
      <p style="display:flex;align-items:center;gap:12px;margin:16px 0 0">
        <span class="cz-oculto">${nPedidos} ${lab}</span>
        <span class="cz-cifra" data-cuenta="${nPedidos}" aria-hidden="true">${nPedidos}</span>
        <span class="cz-cifra-lab" aria-hidden="true">${lab.replace(' ahora mismo', '<br>ahora mismo')}</span>
      </p>
      ${stats.length ? `<div class="cz-stats">${stats.map(([n, t]) =>
      `<span class="cz-stat"><span class="cz-oculto">${n} ${esc(t)}</span><b data-cuenta="${n}" aria-hidden="true">${n}</b> <span aria-hidden="true">${esc(t)}</span></span>`).join('')}</div>` : ''}
      <p class="cz-pulso-txt">${prov
        ? 'Cada tarjeta es un emprendedor que ya sabe qué quiere comprar. Mande su precio y compita por el pedido, sin salir a buscar clientes.'
        : 'Estos son los pedidos abiertos de la comunidad. Publique el suyo y reciba el precio, el mínimo y el plazo de varios proveedores a la vez.'}</p>
      <button class="cz-pulso-link" onclick="cotizVerPortada()">Cómo funciona ${ICO.flecha}</button>
    </div>`;
  }

  /* Carril "buscado sin respuesta".

     Lo que se muestra son BUSQUEDAS, y la pantalla lo dice con todas las
     letras. No son pedidos: inventar pedidos de cotizacion para que el feed
     parezca vivo seria mentirle al proveedor, que es el que despues pone
     precio. Por eso el titulo habla de busquedas y el numero dice "veces".

     Para el proveedor cambia el sentido y la accion: no es algo que pueda
     pedir, es un agujero de catalogo que puede llenar. Ahi los chips no son
     botones, porque no habria a donde mandarlo. */
  function carrilDemanda() {
    const lista = (st.demanda || []).slice(0, 10);
    if (!lista.length) return '';
    const prov = esProveedor();
    const total = lista.reduce((a, d) => a + (Number(d.busquedas) || 0), 0);

    const chip = d => {
      // Se sacan los caracteres de control antes de nada: un salto de linea
      // adentro de un string de JavaScript rompe el atributo onclick. La base
      // ya no los deja pasar, pero la pantalla no se apoya en eso.
      // Se filtra por codigo y no con una clase de regex para no meter
      // caracteres de control literales en el fuente de este archivo.
      const t = [...String(d.termino || '')].filter(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('').trim();
      const n = Number(d.busquedas) || 0;
      if (!t) return '';
      const dentro = `${esc(t)}<span class="cz-dem-n">${n}</span>`;
      if (prov) return `<span class="cz-dem-chip">${dentro}</span>`;
      // El termino sale de la base ya acotado a letras, numeros y espacios,
      // pero igual se escapa dos veces: primero para JavaScript y despues
      // para HTML, porque termina adentro de un atributo onclick.
      const paraJs = esc(t.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
      return `<button type="button" class="cz-dem-chip" onclick="cotizPedirPara('${paraJs}','carril')"
        aria-label="Pedir cotización de ${esc(t)}, buscado ${n} veces sin resultado">${dentro}</button>`;
    };

    return `<div class="cz-ancho" style="padding:12px 16px 0">
      <div class="cz-bandeja"><div class="cz-nucleo cz-demanda">
        <span class="cz-dem-ojo">${ICO.lupa} Buscado sin respuesta</span>
        <h3 class="cz-dem-tit">${prov
        ? 'Esto lo buscan y nadie lo ofrece'
        : 'Esto lo buscan y no lo encuentran'}</h3>
        <p class="cz-dem-baj">${prov
        ? `Búsquedas reales del último mes que no devolvieron ningún resultado. Si vende alguno de estos, cárguelo en su catálogo: la demanda ya está.`
        : `Búsquedas reales del último mes que no devolvieron ningún resultado. Si necesita alguno, pídalo y los proveedores le cotizan.`}</p>
        <div class="cz-dem-chips">${lista.map(chip).join('')}</div>
        <p class="cz-dem-pie">${total.toLocaleString('es-AR')} búsquedas se fueron con las manos vacías.</p>
      </div></div>
    </div>`;
  }

  function pantallaFeed() {
    const lista = st.rubro === 'Todos' ? st.feed : st.feed.filter(s => s.rubro === st.rubro);

    const conRespuesta = st.misPedidos.filter(p => vigente(p) && (p.respuestas || 0) > 0).length;
    // Sin sesion no hay "mis pedidos" que mostrar: el boton llevaria a una
    // pantalla vacia. La accion para el visitante es publicar, y de eso se
    // encargan el "+" y el cartel del final.
    const accion = !currentUser ? ''
      : esProveedor()
        ? btnEsquina('Mis cotizaciones', "cotizIr('misCotiz')", Object.keys(st.misCotiz).length > 0)
        : btnEsquina('Mis pedidos', "cotizIr('mis')", conRespuesta > 0);

    // El visitante sin sesion cierra el feed con un cartel; en ese caso la
    // grilla no tiene que reservar los 96px de abajo, que quedarian como un
    // hueco entre la ultima tarjeta y el cartel.
    const hayCierre = !currentUser && lista.length > 0;

    const cuerpo = !lista.length
      ? vacioBox(
        st.rubro === 'Todos' ? 'Todavía no hay pedidos abiertos' : 'No hay pedidos en ' + st.rubro,
        st.rubro === 'Todos'
          ? (esProveedor()
            ? 'Cuando un emprendedor publique lo que necesita comprar, va a aparecer acá.'
            : 'Sea el primero: publique lo que necesita comprar y reciba precios de varios proveedores.')
          : 'Pruebe con otra categoría o mire todos los pedidos.',
        esProveedor() ? '' : btnPrimario('Pedir una cotización', "cotizIr('publicar')"))
      // La animacion de entrada va en un envoltorio y no en .cz-bandeja: una
      // animacion con fill-mode forwards deja fijado transform:none y le gana
      // al :hover{translateY(-2px)} de la bandeja.
      : `<div class="cz-grilla"${hayCierre ? ' style="padding-bottom:12px"' : ''}>${lista.map((s, i) =>
        `<div class="cz-sube" style="--d:${Math.min(i, 7) * 55}ms">${cardFeed(s)}</div>`).join('')}</div>`;

    // Al visitante sin sesion el feed le sirve de prueba, pero el unico modo
    // de publicar seria el "+", que es un circulito facil de pasar por alto.
    // Este cierre le pone nombre a lo que acaba de ver.
    // 140px abajo y no 96: el "+" flotante vive entre los 84px y los 136px
    // del borde inferior, asi que con menos aire se le monta encima al boton
    // de este cartel cuando se llega al final del feed.
    const cierre = hayCierre
      ? `<div class="cz-ancho" style="padding:6px 16px 140px">
          <div style="background:${SOFT};border:1px solid ${BORDE};border-radius:16px;padding:20px 18px;text-align:center">
            <div style="font-size:.95rem;font-weight:800;color:#1A1A1A;margin-bottom:6px;line-height:1.35">¿Necesita comprar algo que no ve acá?</div>
            <div style="font-size:.83rem;color:#41564C;line-height:1.55;margin-bottom:16px">Publique su pedido y los proveedores mayoristas le mandan su precio, su mínimo y su tiempo de entrega. Gratis.</div>
            ${btnPrimario('Pedir una cotización', "cotizIr('publicar')")}
          </div>
        </div>`
      : '';

    // Sin ningun pedido abierto el pulso seria un "0" gigante arriba del cartel
    // de vacio, que ya dice lo mismo y mejor. En ese caso no se pinta.
    return header('Cotizaciones', null, accion) + `
      ${st.feed.length ? `<div class="cz-ancho" style="padding:13px 16px 2px">${pulso()}</div>` : ''}
      ${carrilDemanda()}
      ${chipsRubro()}
      ${cuerpo}
      ${cierre}
      ${esProveedor() ? '' : fabPedir()}`;
  }

  // Tarjeta del feed publico. OJO: muestra la CANTIDAD de cotizaciones, nunca
  // los precios — esos solo los ve el dueño (lo impone la RLS, no esta vista).
  //
  // El pie (anillo de cierre + estado) va SIEMPRE, tenga la fila los campos
  // opcionales cargados o no: un pedido publicado solo con el titulo antes
  // salia como un nombre y un renglon, sin una sola cosa para mirar ni tocar.
  function cardFeed(s) {
    const mio = esMio(s);
    const ya = st.misCotiz[s.id];
    const n = s.respuestas || 0;
    const dias = diasParaCierre(s.cierra_at);

    const accion = mio
      ? (n > 0 ? btnCta(`Ver mis ${n} ${n === 1 ? 'cotización' : 'cotizaciones'}`, `cotizVerRespuestas('${s.id}')`) : '')
      : esProveedor()
        ? (ya
          ? `<div class="cz-pastilla">${ICO.ok} Cotizó ${plata(ya.precio)} por unidad</div>`
          : btnCta('Enviar cotización', `cotizAbrirForm('${s.id}')`))
        : '';

    // El comprador que mira el pedido de otro no tiene accion posible, asi que
    // el estado es lo unico que cierra la tarjeta: sin esto quedaba cortada.
    const estado = n > 0
      ? `<span class="cz-estado hay">${n} ${n === 1 ? 'cotización' : 'cotizaciones'}</span>`
      : `<span class="cz-estado">Sin cotizar todavía</span>`;

    const datos = [
      s.cantidad ? `<span class="cz-dato fuerte">${esc(s.cantidad)} unidades</span>` : '',
      s.rubro ? `<span class="cz-dato">${esc(s.rubro)}</span>` : '',
      s.provincia ? `<span class="cz-dato">${ICO.pin}${esc(s.provincia)}</span>` : '',
      s.presupuesto ? `<span class="cz-dato">Hasta ${plata(s.presupuesto)}/u</span>` : ''
    ].filter(Boolean).join('');

    return `<div class="cz-bandeja${mio ? ' cz-propia' : ''}"><div class="cz-nucleo">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        ${avatar(s.comprador_nombre, s.comprador_foto, 34)}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:.82rem;font-weight:700;color:#1A1A1A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.comprador_nombre)}</span>
            ${mio ? `<span style="flex-shrink:0;font-size:.62rem;font-weight:800;background:${SOFT};color:${VERDE_OSC};padding:2px 7px;border-radius:7px">SU PEDIDO</span>` : ''}
          </div>
          <div style="font-size:.72rem;color:${TENUE}">${esc(hace(s.created_at))}</div>
        </div>
      </div>

      <h3 class="cz-titulo">${esc(s.titulo)}</h3>
      ${datos ? `<div class="cz-datos">${datos}</div>` : ''}
      ${s.detalles ? `<p class="cz-detalle">${esc(s.detalles)}</p>` : ''}

      <div class="cz-pie">
        <span class="cz-cierre">${anilloTiempo(dias)}${esc(textoCierre(dias))}</span>
        ${estado}
      </div>
      ${accion ? `<div class="cz-cta-zona">${accion}</div>` : ''}
    </div></div>`;
  }

  window.cotizRubro = function (r) { st.rubro = r; vibrar('light'); render(); };

  /* ---------------- MIS PEDIDOS (comprador, pantalla aparte) ---------------- */

  function pantallaMisPedidos() {
    const abiertos = st.misPedidos.filter(vigente);
    const cerrados = st.misPedidos.filter(p => !vigente(p));

    if (!st.misPedidos.length) {
      return header('Mis pedidos', "cotizIr('feed')") + vacioBox(
        'Todavía no pidió ninguna cotización',
        'Publique lo que necesita comprar y reciba precios de varios proveedores mayoristas sin escribirle a uno por uno.',
        btnPrimario('Pedir una cotización', "cotizIr('publicar')"));
    }

    return header('Mis pedidos', "cotizIr('feed')") + `
      <div style="padding:4px 16px 96px" class="cz-ancho">
        ${abiertos.map(cardMiPedido).join('')}
        ${cerrados.length ? `<div style="font-size:.78rem;font-weight:700;color:${GRIS};margin:22px 2px 10px;font-family:'Inter',sans-serif">Cerrados</div>` : ''}
        ${cerrados.map(cardMiPedido).join('')}
      </div>`;
  }

  function cardMiPedido(p) {
    const viv = vigente(p);
    const n = p.respuestas || 0;
    const badge = !viv
      ? `<span style="font-size:.7rem;font-weight:700;background:#F1F3F2;color:${GRIS};padding:3px 9px;border-radius:10px">Cerrado</span>`
      : n > 0
        ? `<span style="font-size:.7rem;font-weight:800;background:${SOFT};color:${VERDE_OSC};padding:3px 9px;border-radius:10px">${n} ${n === 1 ? 'cotización' : 'cotizaciones'}</span>`
        : `<span style="font-size:.7rem;font-weight:700;background:#F1F3F2;color:${GRIS};padding:3px 9px;border-radius:10px">Esperando respuestas</span>`;

    return `<div style="background:#fff;border:1px solid ${BORDE};border-radius:14px;padding:14px;margin-bottom:10px;${!viv ? 'opacity:.7' : ''}">
      <div onclick="cotizVerRespuestas('${p.id}')" style="cursor:pointer">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px">
          ${badge}
          <span style="font-size:.72rem;color:${TENUE};flex-shrink:0">${esc(hace(p.created_at))}</span>
        </div>
        <div style="font-family:'Inter',sans-serif;font-size:.9rem;font-weight:700;color:#1A1A1A;line-height:1.4;margin-bottom:9px">${esc(p.titulo)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.74rem;color:${GRIS}">
          ${p.cantidad ? `<span>${esc(p.cantidad)} unidades</span>` : ''}
          ${p.rubro ? `<span style="background:#F5F7F6;color:#41564C;border-radius:8px;padding:2px 9px;font-weight:600">${esc(p.rubro)}</span>` : ''}
          ${p.provincia ? `<span style="display:inline-flex;align-items:center;gap:3px">${ICO.pin}${esc(p.provincia)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;padding-top:11px;border-top:1px solid #F1F3F2">
        ${viv ? btnSec('Cerrar', `cotizCerrar('${p.id}')`) : ''}
        ${btnSec('Eliminar', `cotizEliminar('${p.id}')`, 'rojo')}
      </div>
    </div>`;
  }

  // Borrar de verdad: el que ya no lo quiere ver, no lo ve mas. Las cotizaciones
  // asociadas se van con el (ON DELETE CASCADE en la tabla).
  window.cotizEliminar = async function (id) {
    const p = st.misPedidos.find(x => String(x.id) === String(id));
    const n = p?.respuestas || 0;
    const aviso = n > 0
      ? `Va a borrar este pedido y las ${n} ${n === 1 ? 'cotización que recibió' : 'cotizaciones que recibió'}. No se puede deshacer.`
      : 'Va a borrar este pedido. No se puede deshacer.';
    if (!confirm(aviso)) return;
    try {
      const { error } = await sb.from('solicitudes').delete().eq('id', id);
      if (error) throw error;
      vibrar('success');
      toast('Pedido eliminado');
      await Promise.all([cargarMisPedidos(), cargarFeed()]);
      render();
    } catch (e) { console.warn('[cotiz] eliminar', e); toast('No se pudo eliminar'); }
  };

  /* ---------------- MIS COTIZACIONES (proveedor, pantalla aparte) ---------------- */

  function pantallaMisCotizaciones() {
    const enviadas = Object.keys(st.misCotiz)
      .map(sid => ({ cot: st.misCotiz[sid], sol: st.feed.find(s => String(s.id) === String(sid)) }))
      .filter(x => x.sol);

    if (!enviadas.length) {
      return header('Mis cotizaciones', "cotizIr('feed')") + vacioBox(
        'Todavía no cotizó ningún pedido',
        'Mire los pedidos abiertos y mande su precio. El comprador compara y contacta al que le sirve.',
        btnPrimario('Ver pedidos abiertos', "cotizIr('feed')"));
    }

    return header('Mis cotizaciones', "cotizIr('feed')") + `
      <div style="padding:4px 16px 96px" class="cz-ancho">
        ${enviadas.map(({ cot, sol }) => `
          <div style="background:#fff;border:1px solid ${BORDE};border-radius:14px;padding:14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
              <span style="font-size:.7rem;font-weight:800;background:${SOFT};color:${VERDE_OSC};padding:3px 9px;border-radius:10px">Cotizó ${plata(cot.precio)} por unidad</span>
              <span style="font-size:.72rem;color:${TENUE};flex-shrink:0">${esc(hace(cot.created_at))}</span>
            </div>
            <div style="font-family:'Inter',sans-serif;font-size:.88rem;font-weight:700;color:#1A1A1A;line-height:1.4;margin-bottom:7px">${esc(sol.titulo)}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:.74rem;color:${GRIS}">
              <span>${esc(sol.comprador_nombre)}</span>
              ${sol.cantidad ? `<span>· ${esc(sol.cantidad)} unidades</span>` : ''}
              ${sol.respuestas > 1 ? `<span>· compite con ${sol.respuestas - 1} ${sol.respuestas - 1 === 1 ? 'proveedor más' : 'proveedores más'}</span>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ---------------- vista PUBLICAR ---------------- */

  // Ata el <label> a su campo sacando el id del propio HTML: sin `for`, un lector
  // de pantalla lee el input sin nombre. La pista se ata con aria-describedby.
  function campo(label, inner, hint) {
    const m = /\sid="([^"]+)"/.exec(inner);
    const id = m ? m[1] : '';
    const idPista = id ? id + '-pista' : '';
    if (hint && idPista) inner = inner.replace(/\sid="/, ` aria-describedby="${idPista}" id="`);
    return `<div style="margin-bottom:16px">
      <label${id ? ` for="${id}"` : ''} style="display:block;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;color:#1A1A1A;margin-bottom:6px">${label}</label>
      ${inner}
      ${hint ? `<div id="${idPista}" style="font-size:.72rem;color:${TENUE};margin-top:5px">${hint}</div>` : ''}
    </div>`;
  }

  const INPUT_CSS = `width:100%;padding:12px 14px;border:1.5px solid #ddd;border-radius:10px;font-size:.88rem;font-family:inherit;outline:none;background:#fff;box-sizing:border-box`;

  const PISTA_RUBRO = 'Es lo que hace que su pedido le llegue a los proveedores de ese rubro.';
  const PISTA_RUBRO_AUTO = 'Lo completamos según lo que escribió. Cámbielo si no corresponde.';

  /* ---------------- RUBRO SUGERIDO DESDE EL TITULO ----------------
     El rubro y la provincia pasaron a ser obligatorios: sin ellos la tarjeta
     del feed sale con un solo dato y el pedido no le llega a nadie en
     particular. Para que ese requisito no sea friccion pura, el rubro se
     completa solo con rubroDeTermino(), el mismo mapa que ya usa el buscador.

     Nunca pisa una eleccion manual: apenas la persona toca el select se marca
     como tocado y el automatico se calla para siempre. */

  let temporizadorRubro = null;

  window.cotizAutoRubro = function () {
    clearTimeout(temporizadorRubro);
    temporizadorRubro = setTimeout(aplicarRubroSugerido, 250);
  };

  function aplicarRubroSugerido() {
    const sel = $('cz-rubro'), tit = $('cz-titulo');
    if (!sel || !tit || sel.dataset.tocado === '1') return;
    const t = tit.value.trim();
    // Con menos de 4 caracteres rubroDeTermino() puede enganchar por la rama
    // de "la clave contiene lo escrito" y tirar cualquier cosa a media palabra.
    if (t.length < 4) return;
    const r = rubroDeTermino(t);
    if (!r || r === sel.value) return;
    if (!Array.from(sel.options).some(o => o.value === r)) return;
    sel.value = r;
    pistaRubro(PISTA_RUBRO_AUTO);
  }

  window.cotizRubroManual = function () {
    const sel = $('cz-rubro');
    if (!sel) return;
    sel.dataset.tocado = '1';
    pistaRubro(PISTA_RUBRO);
  };

  function pistaRubro(txt) {
    const el = $('cz-rubro-pista');
    if (el) el.textContent = txt;
  }

  // Una sola validacion para los dos caminos que publican: el boton y el
  // reintento con el borrador guardado despues del login. Devuelve el campo a
  // enfocar y el mensaje, o null si esta todo bien.
  function validarPedido(d) {
    const titulo = String(d.titulo || '').trim();
    if (titulo.length < 3) return { campo: 'cz-titulo', msg: 'Escriba qué necesita comprar (mínimo 3 caracteres).' };
    if (titulo.length > 160) return { campo: 'cz-titulo', msg: 'El título es muy largo (máximo 160 caracteres).' };
    if (!d.rubro) return { campo: 'cz-rubro', msg: 'Elija el rubro: es lo que hace que su pedido le llegue a los proveedores correctos.' };
    if (!d.provincia) return { campo: 'cz-prov', msg: 'Elija dónde necesita la mercadería.' };
    return null;
  }

  function pantallaPublicar() {
    const rubros = (typeof RUBROS_LISTA !== 'undefined' ? RUBROS_LISTA : []);
    const provs = (typeof PROVINCIAS !== 'undefined' ? PROVINCIAS : []);
    // Se arma con lo que venga: el prefill de una busqueda sin resultados y,
    // por encima, el borrador guardado (lo que ya habia escrito).
    const guardadoPrevio = leerBorrador();
    const pre = { ...(st.prefill || {}), ...(guardadoPrevio || {}) };
    st.prefill = null;   // se usa una sola vez
    const errPend = st.errorPendiente; st.errorPendiente = null;

    // Si el rubro que viene cargado es el mismo que se deduce del titulo, es
    // que lo pusimos nosotros (viene de una busqueda sin resultados), no la
    // persona: se avisa, para que lo corrija si no corresponde.
    const rubroSugerido = !!(pre.rubro && pre.titulo && rubroDeTermino(pre.titulo) === pre.rubro);

    // Si volvio al formulario, ya no esta "en el medio de publicar": estaba
    // por publicar y se arrepintio, o vino a corregir algo. Se baja la bandera
    // para que no se le publique solo si mas tarde inicia sesion por otra cosa.
    // Si vuelve a tocar Publicar, se vuelve a levantar.
    if (guardadoPrevio && guardadoPrevio.intento) guardarBorrador({ ...guardadoPrevio, intento: false });

    // Sin sesion tambien se puede escribir. La cuenta se pide al publicar,
    // pero se avisa desde el arranque: que aparezca de sorpresa al final es
    // peor que decirlo ahora.
    const cabecera = currentUser
      ? `<div style="display:flex;align-items:center;gap:10px;background:${SOFT};border:1px solid ${BORDE};border-radius:12px;padding:11px 13px;margin-bottom:20px">
          ${avatar(currentUser?.name, currentUser?.picture, 34)}
          <div style="font-size:.78rem;color:#41564C;line-height:1.45">Su pedido se publica a nombre de <b style="color:#1A1A1A">${esc(currentUser?.name || '')}</b>. Los proveedores ven su nombre, no su teléfono.</div>
        </div>`
      : `<div style="background:${SOFT};border:1px solid ${BORDE};border-radius:12px;padding:11px 13px;margin-bottom:20px">
          <div style="font-size:.78rem;color:#41564C;line-height:1.45">Escriba lo que necesita. Al publicar le vamos a pedir que inicie sesión: los proveedores necesitan saber quién está pidiendo. <b style="color:#1A1A1A">No se pierde nada de lo que escriba.</b></div>
        </div>`;

    return header('Pedir una cotización', currentUser ? "cotizIr('feed')" : 'closeCotiz()') + `
      <div style="padding:18px 16px 40px">
        ${cabecera}

        ${campo('¿Qué necesita comprar?', `<input id="cz-titulo" maxlength="160" value="${esc(pre.titulo || '')}" oninput="cotizAutoRubro()" placeholder="ej: 500 pares de medias deportivas blancas" style="${INPUT_CSS}">`)}
        ${campo('Cantidad aproximada (opcional)', `<input id="cz-cantidad" inputmode="numeric" value="${esc(pre.cantidad || '')}" placeholder="ej: 500" style="${INPUT_CSS}">`)}
        ${campo('Rubro', `<select id="cz-rubro" onchange="cotizRubroManual()" style="${INPUT_CSS}"><option value="">Elegir rubro</option>${rubros.map(r => `<option value="${esc(r)}"${pre.rubro === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>`,
      rubroSugerido ? PISTA_RUBRO_AUTO : PISTA_RUBRO)}
        ${campo('¿Dónde lo necesita?', `<select id="cz-prov" style="${INPUT_CSS}"><option value="">Elegir provincia</option>${provs.map(r => `<option value="${esc(r)}"${pre.provincia === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>`)}
        ${campo('Detalles (opcional)', `<textarea id="cz-detalles" rows="3" maxlength="600" placeholder="Colores, talles, material, packaging, plazo..." style="${INPUT_CSS};resize:vertical">${esc(pre.detalles || '')}</textarea>`)}
        ${campo('Presupuesto máximo por unidad (opcional)', `<input id="cz-presup" inputmode="decimal" value="${esc(pre.presupuesto || '')}" placeholder="$ por unidad" style="${INPUT_CSS}">`, 'Ayuda a que le coticen en serio. Si lo deja vacío, no se muestra.')}

        <div id="cz-error" style="${errPend ? '' : 'display:none;'}background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:10px 12px;font-size:.8rem;margin-bottom:12px">${errPend ? esc(errPend) : ''}</div>
        ${btnPrimario('Publicar pedido', 'cotizPublicar(this)')}
        <div style="font-size:.74rem;color:${TENUE};text-align:center;margin-top:12px;line-height:1.5">El pedido queda abierto 14 días. Puede cerrarlo cuando quiera.</div>
      </div>`;
  }

  // Lo que el usuario escribio, sin nada de identidad: es lo que se guarda
  // como borrador mientras inicia sesion.
  function leerFormulario() {
    return {
      titulo: ($('cz-titulo')?.value || '').trim(),
      cantidad: ($('cz-cantidad')?.value || '').trim() || null,
      rubro: $('cz-rubro')?.value || null,
      provincia: $('cz-prov')?.value || null,
      detalles: ($('cz-detalles')?.value || '').trim() || null,
      presupuesto: parsearMonto($('cz-presup')?.value)
    };
  }

  window.cotizPublicar = async function (btn) {
    const err = $('cz-error');
    const mostrarErr = (m, campo) => {
      if (err) { err.textContent = m; err.style.display = 'block'; }
      vibrar('error');
      // Llevarlo al campo que falta: el aviso vive abajo de todo y en celular
      // puede quedar fuera de pantalla respecto del campo que hay que tocar.
      const el = campo && $(campo);
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    };

    const datos = leerFormulario();
    // Se valida ANTES de mandarlo a iniciar sesion: hacer que alguien se
    // loguee para despues decirle que le falta el rubro es la peor version
    // de esto.
    const falla = validarPedido(datos);
    if (falla) return mostrarErr(falla.msg, falla.campo);
    if (err) err.style.display = 'none';

    // Sin sesion: se guarda lo escrito y se pide la cuenta. Al volver del
    // login, intentarPublicarBorrador() lo publica solo.
    if (!currentUser) {
      guardarBorrador({ ...datos, intento: true });
      try { if (typeof trackEvent === 'function') trackEvent('rfq_login_pedido', { rubro: datos.rubro || '' }); } catch (e) { }
      vibrar('light');
      st.vista = 'login';
      return render();
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Publicando...'; btn.style.opacity = '.7'; }
    const r = await publicarPedido(datos);
    if (r.ok) { limpiarBorrador(); await irAMisPedidos(); return; }
    if (btn) { btn.disabled = false; btn.textContent = 'Publicar pedido'; btn.style.opacity = '1'; }
    mostrarErr(r.mensaje);
  };

  // Un solo lugar que inserta: lo usan el boton y el reintento post-login.
  async function publicarPedido(datos) {
    const fila = {
      // usuario_id lo pone la base con auth.uid() (default). No se manda desde
      // el cliente: asi no hay forma de publicar a nombre de otro.
      usuario_email: currentUser?.email || null,
      comprador_nombre: currentUser?.name || 'Emprendedor',
      comprador_foto: currentUser?.picture || null,
      titulo: datos.titulo,
      cantidad: datos.cantidad || null,
      rubro: datos.rubro || null,
      provincia: datos.provincia || null,
      detalles: datos.detalles || null,
      presupuesto: datos.presupuesto
    };

    try {
      // OJO: insert() SIN .select(). Encadenar .select() hace que PostgREST
      // devuelva la fila entera, incluida usuario_email, que esta revocada a
      // proposito -> "permission denied for table solicitudes" (42501).
      // Verificado contra el API real: sin .select() da 201, con .select() da 403.
      const { error } = await sb.from('solicitudes').insert(fila);
      if (error) throw error;
      vibrar('success');
      toast('Pedido publicado');
      try { if (typeof trackEvent === 'function') trackEvent('rfq_publicado', { rubro: fila.rubro || '', provincia: fila.provincia || '' }); } catch (e) { }
      return { ok: true };
    } catch (e) {
      console.warn('[cotiz] publicar', e);
      // El tope de pedidos por dia lo pone un trigger en la base
      // (limite_solicitudes_por_dia). El mensaje que tira ya esta escrito para
      // que lo lea una persona, asi que se muestra tal cual: decirle "no se
      // pudo publicar" cuando en realidad llego al tope no explica nada.
      const esAviso = e?.hint === 'limite_diario' || String(e?.code || '') === 'P0001';
      return {
        ok: false,
        mensaje: esAviso && e?.message
          ? e.message
          : 'No se pudo publicar. Revise su conexión e intente de nuevo.'
      };
    }
  }

  async function irAMisPedidos() {
    await cargarMisPedidos();
    st.vista = 'mis';
    render();
  }

  /* ---------------- REINTENTO DESPUES DEL LOGIN ----------------
     Si quedo un borrador marcado como intento, se publica apenas hay sesion.
     Corre en los dos caminos posibles: la vuelta de Google (pagina recargada,
     evento INITIAL_SESSION) y el login con email (sin recarga, SIGNED_IN). */

  let publicandoBorrador = false;

  // currentUser lo arma checkSession() de app.js y puede tardar un instante
  // mas que el evento de auth. Se espera en vez de duplicar esa logica aca.
  function esperarUsuario(ms) {
    const hasta = Date.now() + (ms || 8000);
    return new Promise(resolve => {
      (function mirar() {
        if (currentUser) return resolve(true);
        if (Date.now() > hasta) return resolve(false);
        setTimeout(mirar, 200);
      })();
    });
  }

  async function intentarPublicarBorrador() {
    if (publicandoBorrador) return;
    const d = leerBorrador();
    if (!d || !d.intento) return;
    publicandoBorrador = true;
    try {
      if (!(await esperarUsuario())) return;
      // Un borrador guardado antes de que el rubro y la provincia fueran
      // obligatorios no se publica solo: se le muestra el formulario cargado
      // con lo que falta.
      const falla = validarPedido(d);
      if (falla) {
        guardarBorrador({ ...d, intento: false });
        try { if (typeof goTo === 'function') goTo('cotizaciones'); } catch (e) { }
        st.vista = 'publicar';
        st.errorPendiente = falla.msg;
        return render();
      }
      const r = await publicarPedido(d);
      if (r.ok) {
        limpiarBorrador();
        try { if (typeof goTo === 'function') goTo('cotizaciones'); } catch (e) { }
        await getUid();
        await irAMisPedidos();
      } else {
        // No se pudo (ej: llego al tope). Se deja de reintentar, pero no se
        // tira lo que escribio: se le muestra el formulario cargado y el
        // motivo, para que decida el.
        guardarBorrador({ ...d, intento: false });
        try { if (typeof goTo === 'function') goTo('cotizaciones'); } catch (e) { }
        st.vista = 'publicar';
        st.errorPendiente = r.mensaje;
        render();
      }
    } catch (e) { console.warn('[cotiz] borrador', e); }
    finally { publicandoBorrador = false; }
  }

  try {
    sb.auth.onAuthStateChange((evento, sesion) => {
      if (!sesion) return;
      if (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION') intentarPublicarBorrador();
    });
  } catch (e) { console.warn('[cotiz] onAuthStateChange', e); }

  /* ---------------- vista RESPUESTAS (comprador ve sus cotizaciones) ---------------- */

  window.cotizVerRespuestas = async function (id) {
    // Puede venir de "Mis pedidos" o de mi propia tarjeta en el feed publico.
    const p = st.misPedidos.find(x => String(x.id) === String(id))
      || st.feed.find(x => String(x.id) === String(id));
    if (!p) return;
    st.pedidoActual = p;
    st.cargando = true; render();
    await cargarCotizaciones(p.id);
    st.cargando = false; st.vista = 'respuestas'; render();
  };

  function pantallaRespuestas() {
    const p = st.pedidoActual;
    if (!p) return pantallaFeed();

    let lista = st.cotizaciones.slice();
    if (st.orden === 'precio') lista.sort((a, b) => Number(a.precio) - Number(b.precio));

    const cuerpo = !lista.length
      ? vacioBox('Todavía no le cotizaron',
        vigente(p) ? 'Apenas un proveedor responda, lo va a ver acá. Los pedidos con cantidad y rubro cargados reciben más respuestas.' : 'Este pedido está cerrado.')
      : `<div style="padding:2px 16px 30px">${lista.map(cardCotizacion).join('')}</div>`;

    return header('Cotizaciones recibidas', "cotizIr('feed')") + `
      <div style="padding:13px 16px;background:#FAFBFA;border-bottom:1px solid ${BORDE}">
        <div style="font-family:'Inter',sans-serif;font-size:.88rem;font-weight:800;color:#1A1A1A;line-height:1.4;margin-bottom:5px">${esc(p.titulo)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:.74rem;color:${GRIS}">
          ${p.cantidad ? `<span>${esc(p.cantidad)} unidades</span>` : ''}
          ${p.provincia ? `<span style="display:inline-flex;align-items:center;gap:3px">${ICO.pin}${esc(p.provincia)}</span>` : ''}
          <span>${esc(hace(p.created_at))}</span>
        </div>
      </div>
      ${lista.length > 1 ? `<div style="display:flex;gap:8px;padding:12px 16px 8px">
        ${['recientes', 'precio'].map(o => `<button onclick="cotizOrden('${o}')" style="padding:6px 13px;border-radius:16px;border:1.5px solid ${st.orden === o ? VERDE : '#E2E6E4'};background:${st.orden === o ? SOFT : '#fff'};color:${st.orden === o ? VERDE_OSC : GRIS};font-size:.76rem;font-weight:${st.orden === o ? 700 : 500};cursor:pointer;font-family:inherit">${o === 'recientes' ? 'Más recientes' : 'Menor precio'}</button>`).join('')}
      </div>` : ''}
      ${cuerpo}
      ${vigente(p) ? `<div style="padding:0 16px 34px"><button onclick="cotizCerrar('${p.id}')" style="width:100%;background:#fff;color:${GRIS};border:1.5px solid #E2E6E4;border-radius:12px;padding:12px;font-size:.83rem;font-weight:700;cursor:pointer;font-family:inherit">Cerrar este pedido</button></div>` : ''}`;
  }

  function cardCotizacion(c) {
    const p = st.provsCache[c.proveedor_id] || {};
    const total = (st.pedidoActual?.cantidad || '').replace(/[^0-9]/g, '');
    const totalNum = total ? Number(total) * Number(c.precio) : null;
    const pro = esPro(p);

    return `<div class="cz-bandeja" style="margin-bottom:12px"><div class="cz-nucleo">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:13px">
        ${p.logo_url
        ? `<div style="width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${esc(p.logo_url)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`
        : avatar(p.nombre, null, 42)}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-family:'Inter',sans-serif;font-size:.87rem;font-weight:800;color:#1A1A1A">${esc(p.nombre || 'Proveedor')}</span>
            ${pro ? `<span style="font-size:.6rem;font-weight:800;background:linear-gradient(135deg,#064E3B,#022C22);color:#F0C775;border:1px solid rgba(233,185,73,.4);padding:2px 7px;border-radius:8px;letter-spacing:.04em">PRO</span>` : ''}
          </div>
          <div style="font-size:.73rem;color:${TENUE};margin-top:2px">${esc(p.provincia || '')}${p.provincia ? ' · ' : ''}${esc(hace(c.created_at))}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px">
        <div style="background:#FAFBFA;border-radius:10px;padding:10px 12px">
          <div style="font-size:.68rem;color:${TENUE};margin-bottom:2px">Por unidad</div>
          <div style="font-family:'Inter',sans-serif;font-size:1.05rem;font-weight:800;color:${VERDE}">${plata(c.precio)}</div>
        </div>
        <div style="background:#FAFBFA;border-radius:10px;padding:10px 12px">
          <div style="font-size:.68rem;color:${TENUE};margin-bottom:2px">${totalNum ? 'Total estimado' : 'Entrega'}</div>
          <div style="font-family:'Inter',sans-serif;font-size:1.05rem;font-weight:800;color:#1A1A1A">${totalNum ? plata(totalNum) : esc(c.entrega || '-')}</div>
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:.76rem;color:${GRIS};margin-bottom:${c.nota ? '10px' : '13px'}">
        ${totalNum && c.entrega ? `<span>Entrega: ${esc(c.entrega)}</span>` : ''}
        ${c.minimo ? `<span>Mínimo: ${esc(c.minimo)}</span>` : ''}
        ${c.pagos ? `<span>${esc(c.pagos)}</span>` : ''}
      </div>

      ${c.nota ? `<div style="font-size:.8rem;color:#41564C;background:#FAFBFA;border-radius:9px;padding:10px 12px;margin-bottom:13px;line-height:1.5">${esc(c.nota)}</div>` : ''}

      <div style="display:flex;gap:8px">
        ${p.whatsapp ? `<button onclick="cotizContactar('${c.proveedor_id}','${c.id}')" class="nv-cta-full" style="flex:1;min-height:44px;padding:5px 6px 5px 16px;font-size:.85rem">
          <span style="display:inline-flex;align-items:center;gap:7px">${ICO.wa} Contactar</span><span class="nv-redondel" style="width:32px;height:32px">${ICO.flecha}</span></button>` : ''}
        ${btnSec('Ver perfil', `cotizVerPerfil('${c.proveedor_id}')`)}
      </div>
    </div></div>`;
  }

  window.cotizOrden = function (o) { st.orden = o; render(); };

  window.cotizContactar = function (provId, cotId) {
    const p = st.provsCache[provId] || {};
    const c = st.cotizaciones.find(x => String(x.id) === String(cotId));
    const ped = st.pedidoActual;
    const msg = `Hola! Soy ${currentUser?.name || ''} de EmprendeGO. Cotizó mi pedido "${ped?.titulo || ''}"` +
      (c ? ` a ${plata(c.precio)} por unidad` : '') + '. Quería avanzar.';
    try { registrarContactoWA(provId, p); } catch (e) { }
    try { abrirWA(p.whatsapp, msg); } catch (e) { toast('WhatsApp no disponible'); }
  };

  // abrirDetalle() ya hace su propio goTo('detalle') (app.js:1715): no navegar antes
  // o el usuario pasa por 'inicio' y se ensucia el stack del boton Atras.
  window.cotizVerPerfil = function (provId) {
    try { abrirDetalle(provId); } catch (e) { toast('No se pudo abrir el perfil'); }
  };

  window.cotizCerrar = async function (id) {
    try {
      const { error } = await sb.from('solicitudes').update({ estado: 'cerrada' }).eq('id', id);
      if (error) throw error;
      toast('Pedido cerrado');
      // Se cierra -> sale del feed publico, asi que hay que refrescar los dos.
      await Promise.all([cargarMisPedidos(), cargarFeed()]);
      st.vista = 'mis'; render();
    } catch (e) { console.warn('[cotiz] cerrar', e); toast('No se pudo cerrar'); }
  };

  /* ---------------- vista COTIZAR (proveedor responde) ---------------- */

  window.cotizAbrirForm = function (id) {
    const s = st.feed.find(x => String(x.id) === String(id));
    if (!s) return;
    st.pedidoActual = s;
    st.vista = 'cotizar';
    render();
  };

  function pantallaCotizar() {
    const s = st.pedidoActual;
    if (!s) return pantallaFeed();
    return header('Enviar cotización', "cotizIr('feed')") + `
      <div style="padding:13px 16px;background:#FAFBFA;border-bottom:1px solid ${BORDE}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          ${avatar(s.comprador_nombre, s.comprador_foto, 30)}
          <div style="font-size:.78rem;font-weight:700;color:#41564C">${esc(s.comprador_nombre)}</div>
        </div>
        <div style="font-family:'Inter',sans-serif;font-size:.87rem;font-weight:800;color:#1A1A1A;line-height:1.4;margin-bottom:5px">${esc(s.titulo)}</div>
        <div style="font-size:.75rem;color:${GRIS}">${s.cantidad ? esc(s.cantidad) + ' unidades · ' : ''}${esc(s.provincia || '')}</div>
        ${s.detalles ? `<div style="font-size:.78rem;color:#41564C;margin-top:8px;line-height:1.5">${esc(s.detalles)}</div>` : ''}
      </div>

      <div style="padding:18px 16px 40px">
        ${campo('Precio por unidad', `<input id="cz-precio" inputmode="decimal" placeholder="$ por unidad" oninput="cotizCalcTotal()" style="${INPUT_CSS};font-size:1.05rem;font-weight:700">`)}
        <div id="cz-total" style="margin-top:-8px;margin-bottom:16px;font-size:.82rem;font-weight:700;color:${VERDE};display:none"></div>

        ${campo('Mínimo de compra (opcional)', `<input id="cz-minimo" maxlength="60" placeholder="ej: 100 unidades" style="${INPUT_CSS}">`)}

        ${campo('Tiempo de entrega', `<div id="cz-entregas" style="display:flex;gap:7px;flex-wrap:wrap">
          ${ENTREGAS.map(e => `<button type="button" data-v="${esc(e)}" onclick="cotizChip(this,'cz-entregas',true)" style="min-height:44px;padding:9px 15px;border-radius:999px;border:1.5px solid #E2E6E4;background:#fff;color:${GRIS};font-size:.79rem;font-weight:500;cursor:pointer;font-family:inherit;transition:all .18s ease-out">${esc(e)}</button>`).join('')}
        </div>`)}

        ${campo('Formas de pago que acepta', `<div id="cz-pagos" style="display:flex;gap:7px;flex-wrap:wrap">
          ${PAGOS.map(e => `<button type="button" data-v="${esc(e)}" onclick="cotizChip(this,'cz-pagos',false)" style="min-height:44px;padding:9px 15px;border-radius:999px;border:1.5px solid #E2E6E4;background:#fff;color:${GRIS};font-size:.79rem;font-weight:500;cursor:pointer;font-family:inherit;transition:all .18s ease-out">${esc(e)}</button>`).join('')}
        </div>`)}

        ${campo('Nota (opcional)', `<textarea id="cz-nota" rows="3" maxlength="400" placeholder="ej: Tengo stock disponible, envío incluido a CABA" style="${INPUT_CSS};resize:vertical"></textarea>`)}

        <div id="cz-error" style="display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:10px 12px;font-size:.8rem;margin-bottom:12px"></div>
        ${btnPrimario('Enviar cotización', 'cotizEnviar(this)')}
        <div style="font-size:.74rem;color:${TENUE};text-align:center;margin-top:12px;line-height:1.5">El comprador ve su cotización junto con las de otros proveedores. Si le sirve, lo contacta.</div>
      </div>`;
  }

  window.cotizChip = function (el, contId, unico) {
    const cont = $(contId);
    if (!cont) return;
    const activo = el.dataset.on === '1';
    if (unico) Array.from(cont.children).forEach(b => { b.dataset.on = '0'; pintarChip(b, false); });
    el.dataset.on = activo ? '0' : '1';
    pintarChip(el, !activo);
    vibrar('light');
  };

  function pintarChip(b, on) {
    b.style.border = '1.5px solid ' + (on ? VERDE : '#E2E6E4');
    b.style.background = on ? SOFT : '#fff';
    b.style.color = on ? VERDE_OSC : GRIS;
    b.style.fontWeight = on ? '700' : '500';
  }

  function leerChips(contId) {
    const cont = $(contId);
    if (!cont) return [];
    return Array.from(cont.children).filter(b => b.dataset.on === '1').map(b => b.dataset.v);
  }

  window.cotizCalcTotal = function () {
    const el = $('cz-total');
    const s = st.pedidoActual;
    if (!el || !s) return;
    const cant = Number((s.cantidad || '').replace(/[^0-9]/g, ''));
    const precio = parsearMonto($('cz-precio')?.value);
    if (cant && precio) {
      el.textContent = 'Total por ' + cant + ' unidades: ' + plata(cant * precio);
      el.style.display = 'block';
    } else el.style.display = 'none';
  };

  window.cotizEnviar = async function (btn) {
    const s = st.pedidoActual;
    const err = $('cz-error');
    const mostrarErr = m => { if (err) { err.textContent = m; err.style.display = 'block'; } vibrar('error'); };
    if (!s) return;

    const precio = parsearMonto($('cz-precio')?.value);
    if (!precio) return mostrarErr('Ponga un precio por unidad válido.');
    if (!currentUser?.proveedorId) return mostrarErr('Su cuenta de proveedor todavía no está aprobada.');
    if (err) err.style.display = 'none';

    const fila = {
      solicitud_id: s.id,
      proveedor_id: currentUser.proveedorId,
      precio: precio,
      entrega: leerChips('cz-entregas')[0] || null,
      minimo: ($('cz-minimo')?.value || '').trim() || null,
      pagos: leerChips('cz-pagos').join(', ') || null,
      nota: ($('cz-nota')?.value || '').trim() || null
    };

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; btn.style.opacity = '.7'; }
    try {
      const { error } = await sb.from('cotizaciones').insert(fila);
      if (error) throw error;
      vibrar('success');
      toast('Cotización enviada');
      try { if (typeof trackEvent === 'function') trackEvent('rfq_cotizado', { rubro: s.rubro || '' }); } catch (e) { }
      await cargarFeed();
      st.vista = 'feed';
      render();
    } catch (e) {
      console.warn('[cotiz] enviar', e);
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar cotización'; btn.style.opacity = '1'; }
      const dup = String(e?.code || '') === '23505';
      mostrarErr(dup ? 'Ya cotizó este pedido.' : 'No se pudo enviar. Revise su conexión e intente de nuevo.');
    }
  };

  /* ---------------- navegacion interna ---------------- */

  window.cotizIr = async function (v) {
    vibrar('light');
    // Refrescar antes de pintar: si vengo de publicar/cotizar/borrar, los
    // contadores y el feed cambiaron.
    if (v === 'feed' || v === 'mis') {
      st.cargando = true; render();
      await cargarDatos();
      st.cargando = false;
    }
    st.vista = v;
    render();
  };

  // Carga todo lo que necesita la portada: el feed publico (las dos puntas lo
  // ven) y, ademas, mis pedidos para el puntito del boton "Mis pedidos".
  async function cargarDatos() {
    try {
      await getUid();
      await (esProveedor()
        ? Promise.all([cargarFeed(), cargarDemanda()])
        : Promise.all([cargarFeed(), cargarMisPedidos(), cargarDemanda()]));
    } catch (e) { console.warn('[cotiz] cargarDatos', e); }
  }

  // Sale del modulo sin romper el historial de pantallas de la app.
  window.closeCotiz = function () {
    try { if (typeof goTo === 'function') goTo('inicio'); } catch (e) { }
  };

  /* ---------------- ENGANCHE DESDE EL BUSCADOR ----------------
     Cuando una busqueda no devuelve nada, en vez de dejar al comprador en una
     pantalla muerta le ofrecemos publicar el pedido. Es la boca de entrada mas
     importante de la seccion: ~70% de las busquedas dan cero resultados.
     app.js solo pega el bloque; toda la logica vive aca.            */

  // Adivina el rubro desde lo que escribio, reusando el mapa que ya tiene la app.
  function rubroDeTermino(term) {
    try {
      if (typeof SUBCATEGORIA_MAP !== 'object' || !SUBCATEGORIA_MAP) return '';
      const t = String(term || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!t) return '';
      // Primero exacto, despues por palabra contenida (la mas larga gana).
      if (SUBCATEGORIA_MAP[t]) return SUBCATEGORIA_MAP[t][0] || '';
      let mejor = '', largo = 0;
      for (const k of Object.keys(SUBCATEGORIA_MAP)) {
        if (k.length > largo && (t.includes(k) || k.includes(t))) { mejor = SUBCATEGORIA_MAP[k][0]; largo = k.length; }
      }
      return mejor || '';
    } catch (e) { return ''; }
  }

  window.cotizBloqueSinResultados = function (termino) {
    const t = String(termino || '').trim();
    if (!t || t.length < 2) return '';
    const seguro = esc(t);
    // El termino lo escribe el usuario en el buscador, asi que va a parar a un
    // atributo onclick: hay que escaparlo DOS veces. Primero para JavaScript
    // (backslash y comilla simple) y despues para HTML (comilla doble, < y &).
    // Sin el segundo paso, buscar algo con una comilla doble rompe el atributo.
    const paraJs = esc(t.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
    // Estilos en linea a proposito: este bloque se pinta DENTRO de la pantalla
    // del buscador, donde las clases .cz-* (scopeadas a #screen-cotizaciones)
    // no aplican. .nv-cta-full si, porque es global.
    return `<div style="max-width:430px;margin:8px auto 0;padding:6px;text-align:left;
        background:rgba(14,20,17,.045);border:1px solid rgba(14,20,17,.07);border-radius:26px;
        box-shadow:0 1px 2px rgba(14,20,17,.03),0 8px 20px -8px rgba(14,20,17,.07)">
      <div style="background:#fff;border-radius:20px;padding:20px 18px;text-align:center;
          box-shadow:inset 0 1px 1px rgba(255,255,255,.6)">
        <div style="font-family:'Inter',sans-serif;font-size:.95rem;font-weight:800;color:#1A1A1A;margin-bottom:7px;line-height:1.35">Todavía nadie tiene “${seguro}” publicado</div>
        <div style="font-size:.84rem;color:#41564C;line-height:1.55;margin-bottom:16px">Pida que le coticen: los proveedores mayoristas le mandan su precio, su mínimo y su tiempo de entrega.</div>
        ${btnCta('Pedir cotización', `cotizPedirPara('${paraJs}')`)}
      </div>
    </div>`;
  };

  // Abre el formulario ya cargado con lo que la persona busco.
  // `origen` separa las dos bocas de entrada: el bloque que aparece cuando una
  // busqueda no da resultados ('busqueda') y el carril del feed ('carril').
  // Sin esto las dos caian en la misma metrica y no habria forma de saber si
  // el carril sirve para algo.
  window.cotizPedirPara = async function (termino, origen) {
    const boca = origen === 'carril' ? 'carril' : 'busqueda';
    st.prefill = { titulo: String(termino || '').trim(), rubro: rubroDeTermino(termino) };
    try { if (typeof trackEvent === 'function') trackEvent('rfq_desde_busqueda', { termino: String(termino || ''), origen: boca }); } catch (e) { }
    try { if (typeof closeDrawer === 'function') closeDrawer(); } catch (e) { }
    try { if (typeof goTo === 'function') goTo('cotizaciones'); } catch (e) { }
    try { if (typeof trackEvent === 'function') trackEvent('rfq_form_abierto', { origen: boca }); } catch (e) { }
    // Con o sin sesion, va derecho al formulario: es el que buscaba algo y no
    // lo encontro, ya sabe lo que quiere. Pedirle cuenta aca era donde se caia.
    if (currentUser) await getUid();
    st.vista = 'publicar';
    st.cargando = false;
    render();
  };

  /* ---------------- entrada publica ---------------- */

  window.abrirCotizaciones = async function () {
    try { if (typeof closeDrawer === 'function') closeDrawer(); } catch (e) { }
    try { if (typeof goTo === 'function') goTo('cotizaciones'); } catch (e) { }

    // Si dejo un pedido escrito a medio publicar, eso manda sobre todo lo
    // demas: mostrarle la portada explicativa seria hacerle perder el hilo.
    const pendiente = leerBorrador();
    if (pendiente && pendiente.intento && !currentUser) {
      st.vista = 'login'; st.cargando = false; return render();
    }

    // La portada va SIEMPRE, no solo la primera vez. Es la introduccion a una
    // seccion que no se explica sola: caer directo en una lista de pedidos
    // ajenos no dice para que sirve ni que se gana. Se sale con "Probar", que
    // es el que carga el feed (cotizEmpezar).
    //
    // Vale para las dos puntas y con o sin sesion: primero se entiende, y la
    // cuenta recien se pide al publicar.
    st.vista = 'portada';
    st.rubro = 'Todos';
    st.cargando = false;
    render();
  };
})();
