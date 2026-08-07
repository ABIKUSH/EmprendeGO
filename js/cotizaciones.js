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
    cargando: false
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
    flecha: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/></svg>`
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
    @media (hover:hover) and (pointer:fine){
      #screen-cotizaciones .cz-fab:hover{transform:translateY(-2px) scale(1.04)}
      #screen-cotizaciones .cz-bandeja:hover{transform:translateY(-2px)}
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

  async function cargarFeed() {
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
    if (st.cargando) html = pantallaCargando();
    else if (st.vista === 'login') html = pantallaLogin();
    else if (st.vista === 'publicar') html = pantallaPublicar();
    else if (st.vista === 'respuestas') html = pantallaRespuestas();
    else if (st.vista === 'cotizar') html = pantallaCotizar();
    else if (st.vista === 'mis') html = pantallaMisPedidos();
    else if (st.vista === 'misCotiz') html = pantallaMisCotizaciones();
    else html = pantallaFeed();
    cont.innerHTML = ESTILOS + html;
    window.scrollTo(0, 0);
  }

  function pantallaCargando() {
    return header('Cotizaciones') + `<div style="padding:40px;text-align:center;color:${GRIS};font-size:.85rem">Cargando...</div>`;
  }

  function pantallaLogin() {
    return header('Cotizaciones') + `<div style="padding:8px 16px 32px">
      <div style="background:${SOFT};border:1px solid ${BORDE};border-radius:16px;padding:22px;text-align:center">
        <div style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:800;color:#1A1A1A;margin-bottom:8px">Pedí precio a varios proveedores de una sola vez</div>
        <div style="font-size:.85rem;color:#41564C;line-height:1.6;margin-bottom:18px">Publicá lo que necesitás comprar y los proveedores mayoristas le mandan su precio, su mínimo y su tiempo de entrega. Usted elige a quién le contesta.</div>
        ${btnPrimario('Iniciar sesión', "goTo('perfil')")}
      </div>
      <div style="font-size:.78rem;color:${GRIS};text-align:center;margin-top:14px;line-height:1.5">Hace falta una cuenta para que los proveedores sepan quién está pidiendo.</div>
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

  function pantallaFeed() {
    const lista = st.rubro === 'Todos' ? st.feed : st.feed.filter(s => s.rubro === st.rubro);

    const conRespuesta = st.misPedidos.filter(p => vigente(p) && (p.respuestas || 0) > 0).length;
    const accion = esProveedor()
      ? btnEsquina('Mis cotizaciones', "cotizIr('misCotiz')", Object.keys(st.misCotiz).length > 0)
      : btnEsquina('Mis pedidos', "cotizIr('mis')", conRespuesta > 0);

    const cuerpo = !lista.length
      ? vacioBox(
        st.rubro === 'Todos' ? 'Todavía no hay pedidos abiertos' : 'No hay pedidos en ' + st.rubro,
        st.rubro === 'Todos'
          ? (esProveedor()
            ? 'Cuando un emprendedor publique lo que necesita comprar, va a aparecer acá.'
            : 'Sé el primero: publicá lo que necesitás comprar y recibí precios de varios proveedores.')
          : 'Probá con otra categoría o mirá todos los pedidos.',
        esProveedor() ? '' : btnPrimario('Pedir una cotización', "cotizIr('publicar')"))
      : `<div class="cz-grilla">${lista.map(cardFeed).join('')}</div>`;

    return header('Cotizaciones', null, accion) + `
      <div class="cz-ancho" style="padding:13px 16px 2px">
        <div style="background:${SOFT};border:1px solid ${BORDE};border-radius:12px;padding:12px 14px">
          <div style="font-family:'Inter',sans-serif;font-size:.85rem;font-weight:800;color:#1A1A1A;margin-bottom:3px">${esProveedor() ? 'Emprendedores buscando proveedor' : 'Lo que se está buscando ahora'}</div>
          <div style="font-size:.77rem;color:#41564C;line-height:1.5">${esProveedor()
        ? 'Elegí a cuáles cotizar. Mandás tu precio y, si le sirve, el comprador te contacta.'
        : 'Estos son los pedidos abiertos de la comunidad. Publicá el tuyo y recibí precios de varios proveedores.'}</div>
        </div>
      </div>
      ${chipsRubro()}
      ${cuerpo}
      ${esProveedor() ? '' : fabPedir()}`;
  }

  // Tarjeta del feed publico. OJO: muestra la CANTIDAD de cotizaciones, nunca
  // los precios — esos solo los ve el dueño (lo impone la RLS, no esta vista).
  function cardFeed(s) {
    const mio = esMio(s);
    const ya = st.misCotiz[s.id];
    const n = s.respuestas || 0;

    const accion = mio
      ? (n > 0
        ? btnCta(`Ver mis ${n} ${n === 1 ? 'cotización' : 'cotizaciones'}`, `cotizVerRespuestas('${s.id}')`)
        : `<div style="display:flex;align-items:center;justify-content:center;min-height:44px;background:${SOFT};color:${VERDE_OSC};border-radius:999px;padding:11px;font-size:.82rem;font-weight:700">Esperando respuestas</div>`)
      : esProveedor()
        ? (ya
          ? `<div style="display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;background:${SOFT};color:${VERDE_OSC};border-radius:999px;padding:11px;font-size:.82rem;font-weight:700">${ICO.ok} Cotizaste ${plata(ya.precio)} por unidad</div>`
          : btnCta('Enviar cotización', `cotizAbrirForm('${s.id}')`))
        : '';

    return `<div class="cz-bandeja${mio ? ' cz-propia' : ''}"><div class="cz-nucleo">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:11px">
        ${avatar(s.comprador_nombre, s.comprador_foto, 34)}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;color:#1A1A1A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.comprador_nombre)}</span>
            ${mio ? `<span style="flex-shrink:0;font-size:.62rem;font-weight:800;background:${SOFT};color:${VERDE_OSC};padding:2px 7px;border-radius:7px">TU PEDIDO</span>` : ''}
          </div>
          <div style="font-size:.72rem;color:${TENUE}">${esc(hace(s.created_at))}</div>
        </div>
        ${n ? `<span style="flex-shrink:0;font-size:.7rem;font-weight:700;background:${SOFT};color:${VERDE_OSC};padding:3px 9px;border-radius:10px">${n} ${n === 1 ? 'cotización' : 'cotizaciones'}</span>` : ''}
      </div>

      <div style="font-family:'Inter',sans-serif;font-size:.9rem;font-weight:700;color:#1A1A1A;line-height:1.4;margin-bottom:9px">${esc(s.titulo)}</div>

      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.74rem;color:${GRIS};margin-bottom:${s.detalles ? '9px' : '13px'}">
        ${s.cantidad ? `<span style="font-weight:600;color:#41564C">${esc(s.cantidad)} unidades</span>` : ''}
        ${s.rubro ? `<span style="background:#F5F7F6;color:#41564C;border-radius:8px;padding:2px 9px;font-weight:600">${esc(s.rubro)}</span>` : ''}
        ${s.provincia ? `<span style="display:inline-flex;align-items:center;gap:3px">${ICO.pin}${esc(s.provincia)}</span>` : ''}
        ${s.presupuesto ? `<span>Hasta ${plata(s.presupuesto)}/u</span>` : ''}
      </div>

      ${s.detalles ? `<div style="font-size:.79rem;color:#41564C;background:#FAFBFA;border-radius:9px;padding:9px 11px;margin-bottom:13px;line-height:1.5">${esc(s.detalles)}</div>` : ''}
      ${accion}
    </div></div>`;
  }

  window.cotizRubro = function (r) { st.rubro = r; vibrar('light'); render(); };

  /* ---------------- MIS PEDIDOS (comprador, pantalla aparte) ---------------- */

  function pantallaMisPedidos() {
    const abiertos = st.misPedidos.filter(vigente);
    const cerrados = st.misPedidos.filter(p => !vigente(p));

    if (!st.misPedidos.length) {
      return header('Mis pedidos', "cotizIr('feed')") + vacioBox(
        'Todavía no pediste ninguna cotización',
        'Publicá lo que necesitás comprar y recibí precios de varios proveedores mayoristas sin escribirle a uno por uno.',
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
      ? `Vas a borrar este pedido y las ${n} ${n === 1 ? 'cotización que recibiste' : 'cotizaciones que recibiste'}. No se puede deshacer.`
      : 'Vas a borrar este pedido. No se puede deshacer.';
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
        'Todavía no cotizaste ningún pedido',
        'Mirá los pedidos abiertos y mandá tu precio. El comprador compara y contacta al que le sirve.',
        btnPrimario('Ver pedidos abiertos', "cotizIr('feed')"));
    }

    return header('Mis cotizaciones', "cotizIr('feed')") + `
      <div style="padding:4px 16px 96px" class="cz-ancho">
        ${enviadas.map(({ cot, sol }) => `
          <div style="background:#fff;border:1px solid ${BORDE};border-radius:14px;padding:14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
              <span style="font-size:.7rem;font-weight:800;background:${SOFT};color:${VERDE_OSC};padding:3px 9px;border-radius:10px">Cotizaste ${plata(cot.precio)} por unidad</span>
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

  function pantallaPublicar() {
    const rubros = (typeof RUBROS_LISTA !== 'undefined' ? RUBROS_LISTA : []);
    const provs = (typeof PROVINCIAS !== 'undefined' ? PROVINCIAS : []);
    // Viene pre-cargado si entro desde una busqueda sin resultados.
    const pre = st.prefill || {};
    st.prefill = null;   // se usa una sola vez
    return header('Pedir una cotización', "cotizIr('feed')") + `
      <div style="padding:18px 16px 40px">
        <div style="display:flex;align-items:center;gap:10px;background:${SOFT};border:1px solid ${BORDE};border-radius:12px;padding:11px 13px;margin-bottom:20px">
          ${avatar(currentUser?.name, currentUser?.picture, 34)}
          <div style="font-size:.78rem;color:#41564C;line-height:1.45">Su pedido se publica a nombre de <b style="color:#1A1A1A">${esc(currentUser?.name || '')}</b>. Los proveedores ven su nombre, no su teléfono.</div>
        </div>

        ${campo('¿Qué necesita comprar?', `<input id="cz-titulo" maxlength="160" value="${esc(pre.titulo || '')}" placeholder="ej: 500 pares de medias deportivas blancas" style="${INPUT_CSS}">`)}
        ${campo('Cantidad aproximada', `<input id="cz-cantidad" inputmode="numeric" placeholder="ej: 500" style="${INPUT_CSS}">`)}
        ${campo('Rubro', `<select id="cz-rubro" style="${INPUT_CSS}"><option value="">Elegir rubro</option>${rubros.map(r => `<option value="${esc(r)}"${pre.rubro === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>`)}
        ${campo('¿Dónde lo necesita?', `<select id="cz-prov" style="${INPUT_CSS}"><option value="">Elegir provincia</option>${provs.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>`)}
        ${campo('Detalles (opcional)', `<textarea id="cz-detalles" rows="3" maxlength="600" placeholder="Colores, talles, material, packaging, plazo..." style="${INPUT_CSS};resize:vertical"></textarea>`)}
        ${campo('Presupuesto máximo por unidad (opcional)', `<input id="cz-presup" inputmode="decimal" placeholder="$ por unidad" style="${INPUT_CSS}">`, 'Ayuda a que le coticen en serio. Si lo deja vacío, no se muestra.')}

        <div id="cz-error" style="display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:10px 12px;font-size:.8rem;margin-bottom:12px"></div>
        ${btnPrimario('Publicar pedido', 'cotizPublicar(this)')}
        <div style="font-size:.74rem;color:${TENUE};text-align:center;margin-top:12px;line-height:1.5">El pedido queda abierto 14 días. Puede cerrarlo cuando quiera.</div>
      </div>`;
  }

  window.cotizPublicar = async function (btn) {
    const titulo = ($('cz-titulo')?.value || '').trim();
    const err = $('cz-error');
    const mostrarErr = m => { if (err) { err.textContent = m; err.style.display = 'block'; } vibrar('error'); };

    if (titulo.length < 3) return mostrarErr('Escribí qué necesitás comprar (mínimo 3 caracteres).');
    if (titulo.length > 160) return mostrarErr('El título es muy largo (máximo 160 caracteres).');
    if (err) err.style.display = 'none';

    const presup = parsearMonto($('cz-presup')?.value);

    const fila = {
      // usuario_id lo pone la base con auth.uid() (default). No se manda desde
      // el cliente: asi no hay forma de publicar a nombre de otro.
      usuario_email: currentUser?.email || null,
      comprador_nombre: currentUser?.name || 'Emprendedor',
      comprador_foto: currentUser?.picture || null,
      titulo: titulo,
      cantidad: ($('cz-cantidad')?.value || '').trim() || null,
      rubro: $('cz-rubro')?.value || null,
      provincia: $('cz-prov')?.value || null,
      detalles: ($('cz-detalles')?.value || '').trim() || null,
      presupuesto: presup
    };

    if (btn) { btn.disabled = true; btn.textContent = 'Publicando...'; btn.style.opacity = '.7'; }
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
      await cargarMisPedidos();
      st.vista = 'comprador';
      render();
    } catch (e) {
      console.warn('[cotiz] publicar', e);
      if (btn) { btn.disabled = false; btn.textContent = 'Publicar pedido'; btn.style.opacity = '1'; }
      mostrarErr('No se pudo publicar. Revisá tu conexión e intentá de nuevo.');
    }
  };

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
        vigente(p) ? 'Apenas un proveedor responda, lo vas a ver acá. Los pedidos con cantidad y rubro cargados reciben más respuestas.' : 'Este pedido está cerrado.')
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
    const msg = `Hola! Soy ${currentUser?.name || ''} de EmprendeGO. Cotizaste mi pedido "${ped?.titulo || ''}"` +
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
    if (!precio) return mostrarErr('Poné un precio por unidad válido.');
    if (!currentUser?.proveedorId) return mostrarErr('Tu cuenta de proveedor todavía no está aprobada.');
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
      mostrarErr(dup ? 'Ya cotizaste este pedido.' : 'No se pudo enviar. Revisá tu conexión e intentá de nuevo.');
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
      await (esProveedor() ? cargarFeed() : Promise.all([cargarFeed(), cargarMisPedidos()]));
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
        <div style="font-size:.84rem;color:#41564C;line-height:1.55;margin-bottom:16px">Pedí que te coticen: los proveedores mayoristas te mandan su precio, su mínimo y su tiempo de entrega.</div>
        ${btnCta('Pedir cotización', `cotizPedirPara('${paraJs}')`)}
      </div>
    </div>`;
  };

  // Abre el formulario ya cargado con lo que la persona busco.
  window.cotizPedirPara = async function (termino) {
    st.prefill = { titulo: String(termino || '').trim(), rubro: rubroDeTermino(termino) };
    try { if (typeof trackEvent === 'function') trackEvent('rfq_desde_busqueda', { termino: String(termino || '') }); } catch (e) { }
    try { if (typeof closeDrawer === 'function') closeDrawer(); } catch (e) { }
    try { if (typeof goTo === 'function') goTo('cotizaciones'); } catch (e) { }
    if (!currentUser) { st.vista = 'login'; st.cargando = false; return render(); }
    await getUid();
    st.vista = 'publicar';
    st.cargando = false;
    render();
  };

  /* ---------------- entrada publica ---------------- */

  window.abrirCotizaciones = async function () {
    try { if (typeof closeDrawer === 'function') closeDrawer(); } catch (e) { }
    try { if (typeof goTo === 'function') goTo('cotizaciones'); } catch (e) { }

    if (!currentUser) { st.vista = 'login'; st.cargando = false; render(); return; }

    // La portada es siempre el feed publico, para las dos puntas.
    st.cargando = true;
    st.vista = 'feed';
    st.rubro = 'Todos';
    render();

    await cargarDatos();

    st.cargando = false;
    render();
  };
})();
