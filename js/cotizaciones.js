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
    'titulo,cantidad,unidad,rubro,provincia,detalles,presupuesto,estado,cierra_at,respuestas';

  /* ---------------- QUE MIGRACIONES ESTAN CORRIDAS ----------------

     OJO, esto no es paranoia: pedir en un select una columna que no existe
     NO devuelve ese campo vacio, hace fallar la consulta ENTERA. Pushear el
     frontend antes de correr la migracion dejaria el feed en cero.

     Las migraciones son acumulativas y estan encadenadas (la de 2026-08-20
     aborta si no corrio la de 2026-08-19), asi que alcanza con un solo
     numero en vez de una bandera por columna:

       2 = las dos corridas      -> tipo, productos, cubre... todo disponible
       1 = solo la de la foto    -> hay foto_url, no hay pedidos tipo B
       0 = ninguna               -> la seccion funciona como antes de todo esto

     Arranca optimista en 2 y BAJA sola si la base se queja. Pasa una vez por
     sesion; despues ya se sabe. Cuando las dos esten corridas en produccion
     esto se puede aplanar pegando las columnas dentro de COLS_SOL/COLS_COT y
     borrando conFallback(). */
  let nivelSql = 2;

  const colsSol = () => COLS_SOL
    + (nivelSql >= 1 ? ',foto_url' : '')
    + (nivelSql >= 2 ? ',tipo,productos,ya_vende,inversion' : '');

  const colsCot = () => COLS_COT
    + (nivelSql >= 2 ? ',tipo,cubre,envio' : '');

  // El error no dice QUE columna falta, asi que se baja un escalon y se
  // reintenta. Como mucho da dos vueltas extra, y una sola vez por sesion.
  async function conFallback(armarConsulta) {
    let r = await armarConsulta();
    while (r && r.error && nivelSql > 0 && esColumnaFaltante(r.error)) {
      nivelSql--;
      console.warn('[cotiz] falta correr una migracion; bajando a nivel ' + nivelSql, r.error);
      r = await armarConsulta();
    }
    return r;
  }

  /* El formulario B necesita SI o SI las columnas de la fase 4. FORM_B_LISTO
     dice que el codigo esta listo; nivelSql dice que la base tambien. Hacen
     falta las dos: si se pushea antes de correr el SQL, la bifurcacion no
     aparece y la seccion sigue funcionando como hoy, en vez de ofrecer un
     formulario que no puede guardar nada. */
  const formBDisponible = () => FORM_B_LISTO && nivelSql >= 2;
  const COLS_COT = 'id,created_at,solicitud_id,proveedor_id,precio,entrega,minimo,pagos,nota';

  /* ---------------- LOS DOS TIPOS DE PEDIDO ----------------
     A ('producto')  = "necesito 500 remeras". Tiene cantidad, unidad y se
                       responde con un precio por unidad.
     B ('proveedor') = "necesito quien me abastezca". No tiene cantidad ni
                       precio: tiene una LISTA de productos y un rango de
                       inversion, y se responde como un remito (que puedo
                       abastecer, cual es mi minimo, como envio).

     Las filas viejas no tienen la columna: caen en 'producto', que es lo que
     efectivamente son. */
  const TIPO_B = 'proveedor';
  const esPedidoB = s => !!s && s.tipo === TIPO_B;
  const esRespuestaB = c => !!c && c.tipo === TIPO_B;

  /* Estas tres listas estan ESPEJADAS en los CHECK de la base
     (sql/2026-08-20_pedidos_de_proveedor.sql). Si se agrega una opcion aca,
     va tambien alla, o el insert entero se cae con un 23514. */
  const YA_VENDE = [
    ['vendiendo', 'Ya tengo el negocio funcionando'],
    ['arrancando', 'Estoy por arrancar']
  ];

  // El tercer valor es el TECHO en pesos, para cruzarlo contra el pedido
  // minimo de cada proveedor. null = no filtra nada.
  const INVERSIONES = [
    ['0-100', 'Hasta $100.000', 100000],
    ['100-300', '$100.000 a $300.000', 300000],
    ['300-1000', '$300.000 a $1.000.000', 1000000],
    ['1000+', 'Más de $1.000.000', Infinity],
    ['nosabe', 'No sé todavía', null]
  ];

  const ENVIOS = [
    'Envío gratis a todo el país',
    'Envío gratis a CABA y GBA',
    'Envío a cargo del comprador',
    'El comprador retira',
    'A convenir'
  ];

  const etiquetaDe = (lista, val) => (lista.find(x => x[0] === val) || [])[1] || '';
  const techoInversion = val => {
    const f = INVERSIONES.find(x => x[0] === val);
    return f ? f[2] : null;
  };

  /* Una columna jsonb de tipo array llega como array de JavaScript. Se
     normaliza igual porque la misma fila puede venir por dos caminos (la
     tabla y la funcion del feed publico) y porque una fila vieja trae null.
     Todo lo que salga de aca es texto: la pantalla nunca tiene que pintar
     un [object Object]. */
  function listaTexto(v) {
    if (!v) return [];
    let arr = v;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { return []; } }
    if (!Array.isArray(arr)) return [];
    // Se descarta lo que NO sea texto en vez de convertirlo: String({}) da
    // "[object Object]", y eso terminaba pintado en la tarjeta. La base ya lo
    // impide con cotiz_lista_de_textos(), pero la pantalla no se apoya en eso:
    // la clave anonima es publica y las filas viejas son anteriores al CHECK.
    return arr.filter(x => typeof x === 'string')
      .map(x => x.trim()).filter(Boolean).slice(0, 12);
  }

  const productosDe = s => listaTexto(s && s.productos);
  const cubreDe = c => listaTexto(c && c.cubre);

  /* Como se resume una respuesta en un renglon. Hay tres pantallas que
     mostraban "Cotizó $X por unidad" leyendo cot.precio derecho; con un
     pedido de proveedor eso no existe, asi que todas pasan por aca.

     Un pedido de producto se resume por su precio. Uno de proveedor se
     resume por cuanto del surtido cubre, que es la unica cifra que importa
     de ese lado. */
  function resumenCotiz(cot, sol) {
    if (!cot) return '';
    if (esRespuestaB(cot) || esPedidoB(sol)) {
      const cubre = cubreDe(cot).length;
      const total = productosDe(sol).length;
      if (!cubre) return 'Respondió';
      return total ? `Cubre ${cubre} de ${total}` : `Cubre ${cubre} ${cubre === 1 ? 'producto' : 'productos'}`;
    }
    const p = plata(cot.precio);
    return p ? `Cotizó ${p} por ${uSingular(sol)}` : 'Cotizó';
  }

  /* Pedido minimo del proveedor, en pesos. Delega en minimoPedidoNum() de
     app.js, que es la MISMA cuenta que usa el buscador para ordenar por
     "menor pedido mínimo".

     Que sea una sola funcion no es prolijidad: si las dos se separan, el
     buscador y Cotizaciones empiezan a contestar cosas distintas sobre el
     mismo proveedor. La copia local es solo el bote salvavidas por si este
     archivo se carga sin app.js. */
  function minimoEnPesos(txt) {
    if (typeof minimoPedidoNum === 'function') return minimoPedidoNum(txt);
    const s = String(txt == null ? '' : txt).toLowerCase();
    if (!s.trim() || s.includes('sin')) return 0;
    const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
    return isFinite(n) ? n : 0;
  }

  const ENTREGAS = ['24 hs', '48 hs', '3 a 5 dias', '1 semana', 'Mas de 1 semana'];
  const PAGOS = ['Transferencia', 'Efectivo', 'Mercado Pago', 'Cuotas'];

  /* ---------------- UNIDAD DE MEDIDA ----------------
     "100 unidades de textil" no le dice nada al proveedor: podian ser 100
     metros, 100 rollos o 100 prendas, y cada una es otro precio por unidad.
     Antes la palabra "unidades" estaba escrita a mano al lado de la cantidad;
     ahora la elige el comprador y viaja en solicitudes.unidad.

     La lista esta espejada en el CHECK de la base
     (sql/2026-08-12_solicitudes_unidad.sql): si se agrega una, van las dos. */
  const UNIDADES = ['unidades', 'pares', 'metros', 'rollos', 'kilos', 'cajas', 'docenas', 'packs', 'litros'];
  const UNIDAD_SINGULAR = {
    unidades: 'unidad', pares: 'par', metros: 'metro', rollos: 'rollo', kilos: 'kilo',
    cajas: 'caja', docenas: 'docena', packs: 'pack', litros: 'litro'
  };

  // Los pedidos publicados antes de que existiera la columna vienen con
  // unidad NULL: caen en "unidades", que es lo que ya decia la tarjeta.
  // Devuelve SIEMPRE un valor de la lista, asi que lo que sale de aca nunca
  // necesita esc(): no puede traer nada que escribio una persona.
  function uPlural(s) {
    const u = String((s && s.unidad) || '').trim().toLowerCase();
    return UNIDADES.indexOf(u) >= 0 ? u : 'unidades';
  }
  function uSingular(s) { return UNIDAD_SINGULAR[uPlural(s)]; }

  // "500 metros" / "500 unidades". Sin cantidad no hay nada que decir.
  function cantidadTexto(s) {
    return s && s.cantidad ? esc(s.cantidad) + ' ' + uPlural(s) : '';
  }

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
    confirmado: null,     // acuse de recibo despues de publicar; ver pantallaConfirmado()
    prefill: null,        // pedido pre-cargado desde una busqueda sin resultados
    errorPendiente: null, // error a mostrar al volver al formulario
    demanda: null,        // carril "buscado sin respuesta"; null = todavia no se pidio
    // Rubros que el proveedor sigue. Ver el bloque RUBROS SEGUIDOS mas abajo.
    seguidos: null,       // array de rubros | null = no eligio nada (ve todo)
    haySeguidos: true,    // false = la migracion no esta corrida; el filtro no existe
    verTodos: false,      // se pidio ver todo el feed, por esta vez
    // Formulario A. Viven en st y no en el DOM porque el formulario se repinta
    // entero en cada render() y estos dos tienen que sobrevivir a eso.
    cantModo: 'minimo',   // '20' | '50' | '100' | 'otra' | 'minimo'
    foto: null            // URL ya subida a Storage, o null
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

  /* OJO con el null. Number(null) es 0 y isFinite(0) es true, asi que antes
     plata(null) devolvia "$0". Mientras precio fue NOT NULL nadie lo noto,
     pero desde que una respuesta de tipo proveedor puede no tener precio
     (sql/2026-08-20_pedidos_de_proveedor.sql), "$0" seria un precio inventado
     puesto en pantalla. Vacio es la unica respuesta honesta. */
  function plata(n) {
    if (n === null || n === undefined || n === '') return '';
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
    lupa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    // Iconos de la bifurcacion y del formulario A. Trazo, nunca emoji: el
    // emoji lo dibuja el sistema y en cada Android sale distinto.
    caja: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    local: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 5 4h14l2 5.5"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/><path d="M10 20v-5h4v5"/></svg>`,
    camara: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.2"/><path d="M9 6V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/></svg>`,
    chequeRedondo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    alerta: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    cruz: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    // ICO.lupa no trae medidas (la dimensiona el CSS de su contenedor). Esta
    // se usa suelta dentro de un parrafo, asi que las necesita.
    lupaChica: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
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
    return `<button class="cz-btn2" onclick="${onclick}" style="flex:1;min-height:44px;background:#fff;color:${col};border:1.5px solid ${bor};border-radius:999px;padding:10px 16px;font-size:.83rem;font-weight:700;cursor:pointer;font-family:inherit;transition:transform 200ms cubic-bezier(.23,1,.32,1)">${txt}</button>`;
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

      /* ---- LIQUID GLASS ----
         El tinte NO es un gris neutro: sale del verde de marca. Sobre los
         fondos claros de esta pantalla (#fff, #FAFBFA, #EFF6F2) un gris se ve
         sucio, y el verde hace que el vidrio pertenezca a la marca en vez de
         parecer un panel prestado del sistema operativo.

         La opacidad no es libre: es lo que decide el contraste del texto que
         queda encima. Medido, no estimado: con .74, el peor fondo posible de
         la seccion (el pulso #0B3A27 pasando por debajo del encabezado) deja
         el titulo #1A1A1A en 9,8:1; sobre fondo claro da 16,5:1.
         La version "fuerte" (.85) es para las superficies que llevan texto
         chico, donde el margen es mas fino.
         Si alguna vez hay que subir el blur o bajar la opacidad, se vuelve a
         medir ESTO. El gris nunca se aclara para acomodar al vidrio: se
         ajusta el vidrio. */
      --cz-glass-bg:rgba(241,248,244,.74);
      --cz-glass-bg-fuerte:rgba(243,249,246,.85);
      --cz-glass-solido:#F3F8F5;          /* el mismo color, opaco: fallbacks */
      --cz-glass-borde:rgba(255,255,255,.60);
      --cz-glass-blur:20px;
      --cz-glass-sat:180%;
      /* El brillo especular del canto. Es lo unico que separa el vidrio de un
         div con opacidad: sin esta linea el material no tiene espesor. */
      --cz-glass-luz:rgba(255,255,255,.74);
      --cz-glass-sombra:0 10px 30px -20px rgba(5,32,22,.45);

      /* Mismo material, tintado con la marca a fondo: es para el "+", que
         tiene que seguir leyendose como el boton principal y no como un
         vidrio mas. El icono blanco da 5,7:1 en el peor caso (contenido
         claro por debajo) y 10,4:1 sobre contenido oscuro. */
      --cz-glass-verde:rgba(0,78,47,.80);
      --cz-glass-verde-solido:#00522F;

      --cz-salida:cubic-bezier(.23,1,.32,1);
      /* Escala de apilado con nombre, en vez de numeros sueltos.
         Los modales viven en <body> y no en esta pantalla: siguen con el
         9999 que ya usaban. */
      --cz-z-barra:30;--cz-z-header:40;--cz-z-fab:50;
    }

    /* Superficie de vidrio. Todo lo que la use tiene que estar en la lista
       corta: encabezado, "+", barra de accion de los formularios, bloque de
       resultado en vivo, indicador de cobertura y hojas/modales.
       NUNCA en las tarjetas del feed: son N elementos que scrollean y un
       backdrop-filter por tarjeta destroza el rendimiento en gama baja. */
    #screen-cotizaciones .cz-vidrio{
      background:var(--cz-glass-bg);
      -webkit-backdrop-filter:blur(var(--cz-glass-blur)) saturate(var(--cz-glass-sat));
              backdrop-filter:blur(var(--cz-glass-blur)) saturate(var(--cz-glass-sat));
      border:1px solid var(--cz-glass-borde);
      box-shadow:inset 0 1px 0 var(--cz-glass-luz),var(--cz-glass-sombra);
    }

    /* ---- FALLBACKS ----
       Los tres casos redefinen los TOKENS y apagan el filtro, en vez de
       parchear cada regla: asi cualquier superficie de vidrio que se agregue
       despues queda cubierta sola.

       El @supports pregunta por las dos formas a proposito: Safari viejo
       soporta -webkit-backdrop-filter pero no la version sin prefijo, y
       preguntando solo por la corta se le daria el fallback a un navegador
       que en realidad sabe pintar el vidrio. */
    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
      #screen-cotizaciones{
        --cz-glass-bg:var(--cz-glass-solido);
        --cz-glass-bg-fuerte:var(--cz-glass-solido);
        --cz-glass-borde:${BORDE};
        --cz-glass-verde:var(--cz-glass-verde-solido);
      }
    }
    @media (prefers-reduced-transparency:reduce){
      #screen-cotizaciones{
        --cz-glass-bg:var(--cz-glass-solido);
        --cz-glass-bg-fuerte:var(--cz-glass-solido);
        --cz-glass-borde:${BORDE};
        --cz-glass-verde:var(--cz-glass-verde-solido);
      }
      #screen-cotizaciones .cz-vidrio,#screen-cotizaciones .cz-fab{
        -webkit-backdrop-filter:none;backdrop-filter:none;
      }
    }

    /* ---- ENCABEZADO ----
       Fijo arriba, con el contenido pasando por debajo. El brillo especular
       va en el canto de ABAJO y no en el de arriba: el borde superior queda
       fuera de la pantalla, asi que el unico limite visible del material es
       el inferior y ahi es donde tiene que estar la luz. */
    #screen-cotizaciones .cz-header{
      position:sticky;top:0;z-index:var(--cz-z-header);
      display:flex;align-items:center;gap:8px;
      padding:12px 16px;
      /* Alto fijo: el encabezado del esqueleto de carga no lleva flecha ni
         boton de esquina, asi que sin esto medía 24px menos que el del feed y
         todo saltaba hacia arriba justo cuando llegaban los datos. */
      min-height:68px;
      border-width:0;border-radius:0;
      box-shadow:
        inset 0 -1px 0 var(--cz-glass-luz),
        0 1px 0 rgba(0,96,57,.13),
        0 10px 24px -22px rgba(5,32,22,.5);
    }
    #screen-cotizaciones .cz-htit{
      font-size:1rem;font-weight:800;color:#1A1A1A;letter-spacing:-.015em;
      min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    }
    #screen-cotizaciones .cz-hvolver{
      width:44px;height:44px;margin-left:-11px;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;
      background:none;border:none;border-radius:50%;cursor:pointer;color:#1A1A1A;
      transition:background 180ms ease-out,transform 160ms var(--cz-salida);
    }
    #screen-cotizaciones .cz-hvolver:active{transform:scale(.92);background:rgba(0,96,57,.08)}

    /* ---- BARRA DE ACCION DE LOS FORMULARIOS ----
       Se pega abajo mientras quede formulario para scrollear. Aca la luz SI
       va arriba: es el canto por donde el contenido entra debajo del vidrio.
       El safe-area es por el iPhone con gesto: sin eso el boton queda debajo
       de la barra del sistema. */
    #screen-cotizaciones .cz-barra{
      position:sticky;bottom:0;z-index:var(--cz-z-barra);
      margin:8px -16px 0;
      padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));
      background:var(--cz-glass-bg-fuerte);
      border-width:0;border-radius:0;
      /* Sin borde propio: el canto lo dibujan el brillo interior (la luz del
         material) y una linea de pelo verde por FUERA. Con borde ademas del
         inset quedaban dos lineas blancas de 1px pegadas y el canto se veia
         grueso, que es justo lo que hace que el vidrio parezca plastico. */
      box-shadow:
        inset 0 1px 0 var(--cz-glass-luz),
        0 -1px 0 rgba(0,96,57,.11),
        0 -10px 30px -22px rgba(5,32,22,.45);
    }
    /* #41564C y no ${TENUE}: es el mismo gris que ya usa el modulo en sus
       bloques de texto, y es MAS oscuro. Sobre el vidrio de la barra aguanta
       5,6:1 incluso con contenido oscuro pasando por debajo, donde ${TENUE}
       se caeria a 3,8:1 y dejaria de pasar AA. El gris no se aclara nunca;
       cuando el fondo cambia, se elige uno mas hondo. */
    #screen-cotizaciones .cz-barra-nota{
      margin-top:10px;text-align:center;
      font-size:.74rem;line-height:1.5;color:#41564C;
    }
    #screen-cotizaciones .cz-barra-nota + .cz-barra-nota{margin-top:3px}

    /* Contenedor de los formularios. Sin padding abajo: el pie lo cierra la
       propia barra pegada.
       El margen negativo cancela los 80px que .screen reserva en
       css/styles.css para la barra de navegacion inferior (que hoy esta en
       display:none). Sin esto, al llegar al final del formulario queda una
       franja vacia de 80px POR DEBAJO del boton y parece un error de
       maquetado. Se cancela solo en los formularios; el resto de la seccion
       conserva ese aire. Si algun dia cambia el padding de .screen, este
       numero cambia con el. */
    #screen-cotizaciones .cz-form{padding:18px 16px 0;margin-bottom:-80px}

    /* Enlace tenue de la barra ("¿No sabe bien qué pedir?"). Es un boton, no
       un <a>: no navega a ninguna URL. Va subrayado igual, porque sin subrayar
       un texto verde al lado de un boton verde no se lee como algo tocable. */
    #screen-cotizaciones .cz-link{
      display:block;width:100%;min-height:44px;margin-top:8px;
      background:none;border:none;cursor:pointer;font-family:inherit;
      font-size:.78rem;font-weight:700;color:${VERDE_OSC};
      text-decoration:underline;text-underline-offset:3px;
      text-decoration-color:rgba(6,95,70,.35);
      transition:text-decoration-color 180ms ease-out;
    }
    #screen-cotizaciones .cz-link:active{text-decoration-color:${VERDE_OSC}}

    /* ---- FORMULARIO B: PASOS PROGRESIVOS ----
       Los cinco pasos no estan todos a la vista desde el arranque. Un
       formulario de cinco bloques asusta antes de que la persona escriba la
       primera palabra; de a uno, cada paso llega cuando el anterior ya le dio
       sentido. El que todavia no corresponde no esta atenuado: no esta. */
    /* El alto de este bloque lo anima desplegar() en JavaScript, no una regla
       de aca: a un alto automatico no se le puede animar, y ademas el alto de
       un paso depende de cuantos chips le toco. Los 22px del margen estan
       repetidos en esa funcion, que los anima junto con el alto; si se cambia
       uno de los dos, va el otro.

       Aca vivio una clase .entra que apuntaba a @keyframes czSube. No hacia
       nada: czSube declara solamente su fotograma final, y sin uno inicial el
       navegador arranca del estado actual, que ya era opacidad 1 y sin
       transform. Por eso el paso aparecia de golpe. (.cz-sube si anda porque
       declara el estado inicial en su propia regla, ver mas abajo.) */
    #screen-cotizaciones .cz-paso-b{margin-bottom:22px}
    #screen-cotizaciones .cz-paso-cab{display:flex;align-items:center;gap:9px;margin-bottom:7px}
    #screen-cotizaciones .cz-paso-n{
      width:24px;height:24px;flex-shrink:0;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:${VERDE};color:#fff;font-size:.7rem;font-weight:800;
    }
    #screen-cotizaciones .cz-paso-tit{font-size:.88rem;font-weight:700;color:#1A1A1A;line-height:1.3}
    #screen-cotizaciones .cz-paso-ayuda{font-size:.75rem;line-height:1.45;color:${TENUE};margin:0 0 10px}

    /* Los chips de producto son sugerencias derivadas de lo que la persona
       escribio, NUNCA una lista fija. Por eso al lado siempre hay una forma
       de agregar el propio: si lo que vende no esta, el formulario no puede
       obligarla a elegir algo que no es. */
    #screen-cotizaciones .cz-chips-prod{display:flex;flex-wrap:wrap;gap:8px}
    #screen-cotizaciones .cz-chip-prod{
      min-height:44px;padding:9px 16px;border-radius:999px;cursor:pointer;
      font-family:inherit;font-size:.81rem;font-weight:600;
      border:1.5px solid #E2E6E4;background:#fff;color:${GRIS};
      transition:background-color 180ms ease-out,border-color 180ms ease-out,
                 color 180ms ease-out,transform 160ms var(--cz-salida);
    }
    #screen-cotizaciones .cz-chip-prod:active{transform:scale(.96)}
    #screen-cotizaciones .cz-chip-prod[aria-pressed="true"]{
      background:${VERDE};border-color:${VERDE};color:#fff;font-weight:700;
    }
    #screen-cotizaciones .cz-chip-prod.propio{border-style:dashed}

    /* ---- BARRA DE RUBROS SEGUIDOS ----
       Un filtro que esconde pedidos sin decirlo es la peor version de esto: el
       proveedor concluye que la seccion esta muerta y se va. Por eso no es un
       icono ni un menu escondido, es una linea fija que dice que se esta
       filtrando, cuanto, y como ver todo de un toque.

       Sin vidrio a proposito: viaja con el scroll del feed, y el liquid glass
       de la seccion vive solo en las seis superficies acordadas. Un
       backdrop-filter mas, y encima uno que scrollea, es justo lo que hace
       arrastrar el feed en los Android de gama baja. */
    #screen-cotizaciones .cz-seg-barra{
      display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
      background:${SOFT};border:1px solid ${BORDE};border-radius:12px;padding:8px 10px 8px 13px;
    }
    #screen-cotizaciones .cz-seg-txt{
      flex:1;min-width:150px;font-size:.76rem;font-weight:600;color:${VERDE_OSC};line-height:1.4;
    }
    #screen-cotizaciones .cz-seg-acc{display:flex;gap:6px;flex-shrink:0}
    /* 44px como el resto de los botones de la seccion. Achicarlos dejaria la
       unica salida del filtro mas dificil de tocar que lo que la activo. */
    #screen-cotizaciones .cz-seg-btn{
      min-height:44px;padding:8px 14px;border-radius:999px;cursor:pointer;
      font-family:inherit;font-size:.75rem;font-weight:700;
      background:#fff;color:${VERDE_OSC};border:1.5px solid ${BORDE};
      transition:transform 160ms var(--cz-salida);
    }
    #screen-cotizaciones .cz-seg-btn:active{transform:scale(.96)}
    #screen-cotizaciones .cz-seg-btn.fuerte{background:${VERDE};border-color:${VERDE};color:#fff}

    /* "su rubro": la sugerencia del rubro con el que se registro. */
    #screen-cotizaciones .cz-seg-suyo{
      margin-left:7px;border-radius:6px;padding:2px 6px;
      font-size:.62rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
      background:#fff;border:1px solid ${BORDE};color:${VERDE_OSC};
    }
    /* Marcado, el chip pasa a verde lleno: la etiqueta tiene que darse vuelta
       o se pierde contra el fondo. */
    #screen-cotizaciones .cz-chip-prod[aria-pressed="true"] .cz-seg-suyo{
      background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.5);color:#fff;
    }
    #screen-cotizaciones .cz-sumar{display:flex;gap:8px;margin-top:10px}
    #screen-cotizaciones .cz-sumar input{flex:1;min-width:0}
    #screen-cotizaciones .cz-sumar button{
      flex-shrink:0;min-height:44px;padding:10px 16px;border-radius:12px;cursor:pointer;
      font-family:inherit;font-size:.8rem;font-weight:700;
      background:${SOFT};color:${VERDE_OSC};border:1.5px solid ${BORDE};
      transition:transform 160ms var(--cz-salida);
    }
    #screen-cotizaciones .cz-sumar button:active{transform:scale(.97)}

    /* Los dos botones de "¿ya vende?": mismo peso, uno al lado del otro. */
    #screen-cotizaciones .cz-dos{display:flex;gap:8px}
    #screen-cotizaciones .cz-dos button{
      flex:1;min-height:56px;padding:12px;border-radius:14px;cursor:pointer;
      font-family:inherit;font-size:.81rem;font-weight:600;line-height:1.35;
      border:1.5px solid #E2E6E4;background:#fff;color:#1A1A1A;text-wrap:balance;
      transition:background-color 180ms ease-out,border-color 180ms ease-out,
                 color 180ms ease-out,transform 160ms var(--cz-salida);
    }
    #screen-cotizaciones .cz-dos button:active{transform:scale(.97)}
    #screen-cotizaciones .cz-dos button[aria-pressed="true"]{
      background:${VERDE};border-color:${VERDE};color:#fff;font-weight:700;
    }

    /* ---- RESULTADO EN VIVO ----
       Superficie de vidrio. Es la unica pieza del formulario que le contesta
       algo mientras lo completa: cuantos proveedores lo van a ver y cuantos
       trabajan con minimos que puede pagar. Los numeros salen de la base, no
       de una estimacion.
       OJO: junto con el encabezado y la barra de accion, esta pantalla llega
       a 3 capas de vidrio simultaneas, que es el tope. No agregar una cuarta. */
    #screen-cotizaciones .cz-vivo-caja{
      border-radius:16px;padding:15px;margin-bottom:6px;
      -webkit-backdrop-filter:blur(14px) saturate(var(--cz-glass-sat));
              backdrop-filter:blur(14px) saturate(var(--cz-glass-sat));
      background:var(--cz-glass-bg-fuerte);
      border:1px solid var(--cz-glass-borde);
      box-shadow:inset 0 1px 0 var(--cz-glass-luz),var(--cz-glass-sombra);
    }
    #screen-cotizaciones .cz-vivo-fila{display:flex;align-items:flex-start;gap:9px}
    #screen-cotizaciones .cz-vivo-fila + .cz-vivo-fila{margin-top:9px}
    #screen-cotizaciones .cz-vivo-fila svg{flex-shrink:0;margin-top:2px;color:${VERDE}}
    /* #065F46 sobre el vidrio fuerte: 7,1:1 con fondo claro por debajo, que
       es lo unico que puede pasar por detras de este bloque (el formulario es
       todo blanco). Verificado, no estimado. */
    #screen-cotizaciones .cz-vivo-txt{font-size:.84rem;line-height:1.5;color:#065F46}
    #screen-cotizaciones .cz-vivo-txt b{font-weight:800}

    /* ---- REMITO DEL PROVEEDOR ----
       Marcar que puede abastecer es la accion principal de la pantalla, asi
       que son filas grandes y tocables enteras, no casillas chiquitas al lado
       de un texto. */
    #screen-cotizaciones .cz-check{
      display:flex;align-items:center;gap:12px;width:100%;text-align:left;
      min-height:52px;padding:12px 14px;margin-bottom:8px;cursor:pointer;
      font-family:inherit;font-size:.86rem;font-weight:600;color:#1A1A1A;
      background:#fff;border:1.5px solid ${BORDE};border-radius:12px;
      transition:background-color 180ms ease-out,border-color 180ms ease-out,
                 transform 160ms var(--cz-salida);
    }
    #screen-cotizaciones .cz-check:active{transform:scale(.985)}
    #screen-cotizaciones .cz-check[aria-pressed="true"]{
      border-color:${VERDE};background:${SOFT};
    }
    #screen-cotizaciones .cz-check-caja{
      width:23px;height:23px;flex-shrink:0;border-radius:7px;
      display:flex;align-items:center;justify-content:center;
      border:2px solid ${BORDE};background:#fff;color:#fff;
      transition:background-color 180ms ease-out,border-color 180ms ease-out;
    }
    #screen-cotizaciones .cz-check[aria-pressed="true"] .cz-check-caja{
      background:${VERDE};border-color:${VERDE};
    }
    #screen-cotizaciones .cz-check-caja svg{opacity:0;transition:opacity 140ms ease-out}
    #screen-cotizaciones .cz-check[aria-pressed="true"] .cz-check-caja svg{opacity:1}

    /* Contexto del comprador: lo que el proveedor necesita saber para decidir
       si le sirve el pedido. Nunca su contacto. */
    #screen-cotizaciones .cz-ctx{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
    #screen-cotizaciones .cz-ctx span{
      font-size:.72rem;font-weight:600;border-radius:8px;padding:4px 9px;
      background:${SOFT};color:${VERDE_OSC};
    }

    /* ---- COBERTURA ----
       La cifra que reemplaza al precio en los pedidos de proveedor. La barra
       no es decoracion: "4 de 5" se lee, pero lo que hace que el comprador
       compare de un vistazo es el largo relativo de las barras entre
       tarjetas. Por eso el ancho sale del dato y no de un valor fijo. */
    #screen-cotizaciones .cz-cob{margin-bottom:11px}
    #screen-cotizaciones .cz-cob-fila{
      display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px;
    }
    #screen-cotizaciones .cz-cob-n{font-size:.86rem;font-weight:800;color:${VERDE_OSC}}
    #screen-cotizaciones .cz-cob-falta{font-size:.72rem;color:${TENUE};text-align:right;min-width:0}
    #screen-cotizaciones .cz-cob-barra{
      height:7px;border-radius:4px;background:#E4EBE7;overflow:hidden;
    }
    #screen-cotizaciones .cz-cob-relleno{
      height:100%;border-radius:4px;background:${VERDE};
      transition:width 320ms var(--cz-salida);
    }
    /* Cobertura total: se distingue del resto sin gritar. */
    #screen-cotizaciones .cz-cob.completa .cz-cob-relleno{
      background:linear-gradient(90deg,#0A7A4B,${VERDE});
    }
    /* La tarjeta del que quedo fuera del presupuesto declarado. No se
       esconde ni se tacha: se corre abajo y se explica por que. */
    #screen-cotizaciones .cz-bandeja.cz-fuera{
      border-color:#FDE68A;background:rgba(253,230,138,.16);
    }

    /* ---- ACUSE DE RECIBO ----
       El titular es el unico texto grande de la seccion que puede llevar un
       numero adentro, asi que text-wrap:balance importa: sin el, "22
       proveedores de Blanquería" parte el numero de su sustantivo. */
    #screen-cotizaciones .cz-ok-redondel{
      width:62px;height:62px;margin:0 auto 18px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:${SOFT};color:${VERDE};
    }
    #screen-cotizaciones .cz-ok-redondel svg{width:30px;height:30px;stroke-width:2}
    #screen-cotizaciones .cz-ok-tit{
      font-size:1.28rem;font-weight:800;color:#1A1A1A;line-height:1.24;
      letter-spacing:-.025em;margin:0 0 9px;text-wrap:balance;
    }
    #screen-cotizaciones .cz-ok-baj{
      font-size:.88rem;line-height:1.55;color:${GRIS};margin:0;
      max-width:34ch;margin-left:auto;margin-right:auto;
    }
    /* La frase que evita el pedido publicado tres veces. Va separada y con
       peso propio: si se mezcla con el resto del parrafo, no se lee. */
    #screen-cotizaciones .cz-ok-repetir{
      margin:16px auto 0;max-width:34ch;
      font-size:.83rem;line-height:1.5;font-weight:700;color:${VERDE_OSC};
    }

    /* ---- BIFURCACION ----
       Las dos opciones pesan lo mismo a proposito: no hay una "principal".
       Quien entra no sabe todavia cual de las dos es su caso, y destacar una
       lo empuja al formulario equivocado. Mismo tamaño, mismo borde, mismo
       icono; lo unico que las diferencia es el texto. */
    #screen-cotizaciones .cz-bif{padding:6px 16px 30px}
    #screen-cotizaciones .cz-bif-intro{
      font-size:.86rem;line-height:1.55;color:${GRIS};margin:0 0 18px;
    }
    #screen-cotizaciones .cz-bif-op{
      display:block;width:100%;text-align:left;cursor:pointer;font-family:inherit;
      background:#fff;border:1.5px solid ${BORDE};border-radius:18px;
      padding:18px;margin-bottom:12px;
      transition:border-color 180ms ease-out,transform 180ms var(--cz-salida),
                 box-shadow 180ms ease-out;
    }
    #screen-cotizaciones .cz-bif-op:active{transform:scale(.98);border-color:${VERDE}}
    #screen-cotizaciones .cz-bif-cab{display:flex;align-items:center;gap:12px;margin-bottom:10px}
    #screen-cotizaciones .cz-bif-ico{
      width:44px;height:44px;flex-shrink:0;border-radius:13px;
      display:flex;align-items:center;justify-content:center;
      background:${SOFT};color:${VERDE};
    }
    #screen-cotizaciones .cz-bif-tit{
      font-size:1rem;font-weight:800;color:#1A1A1A;line-height:1.28;
      letter-spacing:-.015em;text-wrap:balance;
    }
    #screen-cotizaciones .cz-bif-baj{font-size:.85rem;line-height:1.5;color:${GRIS};margin:0 0 7px}
    /* El ejemplo es lo que hace que la persona se reconozca en la opcion. En
       cursiva para que se lea como un caso y no como una instruccion mas. */
    #screen-cotizaciones .cz-bif-ej{font-size:.79rem;font-style:italic;color:${TENUE};margin:0}

    /* ---- CANTIDAD POR ATAJOS ----
       Los chips reemplazan al campo numerico en blanco. "No sé, dígame su
       mínimo" viene elegido de fabrica: es la respuesta honesta de la mayoria
       y es la que estaba ESCONDIDA detras de un campo opcional vacio. */
    #screen-cotizaciones .cz-cant{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
    #screen-cotizaciones .cz-cant-chip{
      min-height:44px;padding:9px 15px;border-radius:999px;cursor:pointer;
      font-family:inherit;font-size:.8rem;font-weight:600;
      border:1.5px solid #E2E6E4;background:#fff;color:${GRIS};
      transition:background-color 180ms ease-out,border-color 180ms ease-out,
                 color 180ms ease-out,transform 160ms var(--cz-salida);
    }
    #screen-cotizaciones .cz-cant-chip:active{transform:scale(.96)}
    #screen-cotizaciones .cz-cant-chip[aria-pressed="true"]{
      background:${VERDE};border-color:${VERDE};color:#fff;font-weight:700;
    }
    #screen-cotizaciones .cz-cant-nota{
      background:${SOFT};border-radius:10px;padding:9px 12px;margin-bottom:11px;
      font-size:.76rem;line-height:1.45;color:#065F46;
    }
    /* Aviso de cantidad fuera de escala. Ambar y no rojo: no es un error, es
       una pregunta. Se avisa, nunca se bloquea. */
    #screen-cotizaciones .cz-aviso-ambar{
      display:flex;gap:9px;align-items:flex-start;
      background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;
      padding:9px 12px;margin-bottom:11px;
      font-size:.76rem;line-height:1.45;color:#92400E;
    }
    #screen-cotizaciones .cz-aviso-ambar svg{flex-shrink:0;margin-top:1px}

    /* ---- RUBRO DETECTADO ----
       Reemplaza al <select> obligatorio. El <select> sigue existiendo en el
       DOM (escondido) para que leerFormulario() y validarPedido() no cambien
       en nada; lo unico que cambia es quien lo completa. */
    #screen-cotizaciones .cz-rubro-auto{
      display:flex;align-items:center;gap:9px;
      background:${SOFT};border:1px solid ${BORDE};border-radius:10px;
      padding:10px 12px;font-size:.82rem;color:#065F46;
    }
    #screen-cotizaciones .cz-rubro-auto b{font-weight:800;color:${VERDE_OSC}}
    #screen-cotizaciones .cz-rubro-auto svg{flex-shrink:0}
    #screen-cotizaciones .cz-rubro-cambiar{
      margin-left:auto;flex-shrink:0;min-height:32px;padding:4px 8px;
      background:none;border:none;cursor:pointer;font-family:inherit;
      font-size:.78rem;font-weight:700;color:${VERDE_OSC};
      text-decoration:underline;text-underline-offset:3px;
    }

    /* ---- ADJUNTAR FOTO ----
       Va despues del titulo porque es la salida para quien no sabe como se
       llama lo que busca: primero intenta escribirlo, y si no le sale, saca
       una foto. */
    /* flex:1 y no width:100%: al lado vive el boton de quitar. Son dos botones
       hermanos y no uno adentro del otro, que ademas de HTML invalido dejaba
       al lector de pantalla anunciando un control dentro de otro. */
    #screen-cotizaciones .cz-foto{
      display:flex;align-items:center;gap:11px;flex:1;min-width:0;text-align:left;
      background:none;border:none;padding:6px 0;cursor:pointer;font-family:inherit;
    }
    #screen-cotizaciones .cz-foto-caja{
      width:44px;height:44px;flex-shrink:0;border-radius:11px;
      display:flex;align-items:center;justify-content:center;overflow:hidden;
      border:1.5px dashed ${BORDE};background:#fff;color:${TENUE};
      transition:border-color 180ms ease-out,background-color 180ms ease-out;
    }
    #screen-cotizaciones .cz-foto-caja img{width:100%;height:100%;object-fit:cover}
    #screen-cotizaciones .cz-foto.puesta .cz-foto-caja{
      border-style:solid;border-color:${VERDE};background:${SOFT};color:${VERDE};
    }
    #screen-cotizaciones .cz-foto-tit{font-size:.83rem;font-weight:700;color:#1A1A1A}
    #screen-cotizaciones .cz-foto.puesta .cz-foto-tit{color:${VERDE_OSC}}
    #screen-cotizaciones .cz-foto-sub{font-size:.74rem;line-height:1.4;color:${TENUE};margin-top:2px}
    #screen-cotizaciones .cz-foto-quitar{
      flex-shrink:0;width:44px;height:44px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:none;border:none;cursor:pointer;color:${TENUE};
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
    /* transition en propiedades nombradas y no en "all": con "all" el navegador
       tiene que vigilar TODO lo que cambie (incluido el font-weight, que ademas
       dispara relayout) y basta que una regla nueva toque cualquier propiedad
       para que empiece a animarse sola.
       OJO: ESTILOS es un template literal, asi que aca adentro no puede
       entrar ni un acento invertido ni ${'$'}{ } sin escapar. */
    #screen-cotizaciones .cz-chip{
      flex-shrink:0;min-height:44px;padding:8px 17px;border-radius:22px;
      font-size:.79rem;cursor:pointer;font-family:inherit;
      transition:background-color 180ms ease-out,border-color 180ms ease-out,
                 color 180ms ease-out,transform 160ms var(--cz-salida);
    }
    /* Todo lo que se toca tiene que acusar recibo del toque. Sin esto el chip
       cambia recien cuando vuelve la respuesta y parece que no registro el dedo. */
    #screen-cotizaciones .cz-chip:active{transform:scale(.96)}

    /* Foco visible por teclado en TODO lo interactivo de la pantalla.
       :focus-visible y no :focus para no dibujar el anillo al tocar con el dedo. */
    #screen-cotizaciones button:focus-visible,
    #screen-cotizaciones input:focus-visible,
    #screen-cotizaciones select:focus-visible,
    #screen-cotizaciones textarea:focus-visible{
      outline:2px solid ${VERDE};outline-offset:2px;border-radius:12px;
    }
    #screen-cotizaciones .cz-chip:focus-visible,
    #screen-cotizaciones .cz-btn2:focus-visible,
    #screen-cotizaciones .nv-cta-full:focus-visible,
    #screen-cotizaciones .cz-fab:focus-visible{border-radius:999px}

    /* El campo activo tiene que avisar que lo esta, no solo al tabular.
       El halo va ademas del borde: con el borde solo, en una pantalla al sol
       (que es donde se usa esto: parado en un local) el cambio de 1,5px de
       color no se ve. */
    #screen-cotizaciones input:focus,
    #screen-cotizaciones select:focus,
    #screen-cotizaciones textarea:focus{
      border-color:${VERDE};box-shadow:0 0 0 3px rgba(0,96,57,.13);
    }
    #screen-cotizaciones input,
    #screen-cotizaciones select,
    #screen-cotizaciones textarea{
      transition:border-color 160ms ease-out,box-shadow 160ms ease-out;
    }

    #screen-cotizaciones button:disabled{opacity:.55;cursor:progress}

    /* Mientras publica/envia, el codigo reemplaza el contenido del boton por
       texto plano ("Publicando...") y se lleva puesto el redondel de la
       flecha. Como .nv-cta-full reparte con space-between, el texto quedaba
       pegado a la izquierda y el boton parecia roto justo en el segundo en
       que la persona esta esperando.
       :has() no lo soportan navegadores viejos; ahi la regla se descarta
       entera y queda el comportamiento de siempre. Es una mejora progresiva,
       no algo de lo que dependa nada. */
    #screen-cotizaciones .nv-cta-full:not(:has(.nv-redondel)){
      justify-content:center;padding-right:20px;
    }

    /* Feedback de toque en los botones secundarios (btnSec / btnEsquina), que
       se pintan con estilo en linea y por eso no pueden traer :active propio. */
    #screen-cotizaciones .cz-btn2:active{transform:scale(.97)}

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
    /* Vidrio verde, no un circulo opaco: flota sobre una lista que scrollea y
       tiene que dejar ver que hay contenido abajo. El blur es menor que el del
       encabezado (14px) porque la superficie es chica: 20px sobre 52 pixeles
       de diametro no se distingue y cuesta lo mismo.
       Sin will-change ni transform 3D: sobre un elemento con backdrop-filter
       obligan a recomponer el fondo en cada cuadro. El scale del :active es
       un toque puntual, no una animacion sostenida. */
    #screen-cotizaciones .cz-fab{
      position:fixed;right:18px;bottom:calc(84px + env(safe-area-inset-bottom,0px));
      z-index:var(--cz-z-fab);
      width:52px;height:52px;border-radius:50%;cursor:pointer;
      display:flex;align-items:center;justify-content:center;color:#fff;
      background:var(--cz-glass-verde);
      border:1px solid rgba(255,255,255,.22);
      -webkit-backdrop-filter:blur(14px) saturate(var(--cz-glass-sat));
              backdrop-filter:blur(14px) saturate(var(--cz-glass-sat));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.34),0 10px 26px -10px rgba(0,96,57,.75);
      transition:transform 220ms var(--cz-salida);
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
      position:relative;overflow:hidden;border-radius:20px;padding:13px 15px 14px;
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
      font-size:clamp(1.9rem,8vw,2.3rem);font-weight:900;line-height:.9;
      letter-spacing:-.04em;color:#fff;font-variant-numeric:tabular-nums;
    }
    #screen-cotizaciones .cz-cifra-lab{
      font-size:.85rem;font-weight:600;line-height:1.25;color:rgba(255,255,255,.82);
    }
    /* Las metricas secundarias van en un renglon de texto y no en pastillas:
       las pastillas se iban a tres filas y empujaban los pedidos fuera de la
       primera pantalla, que es lo que la gente entra a ver. */
    #screen-cotizaciones .cz-stats{
      margin:9px 0 0;font-size:.73rem;line-height:1.45;color:rgba(255,255,255,.74);
    }
    #screen-cotizaciones .cz-stats b{font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
    #screen-cotizaciones .cz-pulso-fila{
      display:flex;align-items:center;justify-content:space-between;gap:10px;
    }
    #screen-cotizaciones .cz-pulso-link{
      flex-shrink:0;min-height:34px;display:inline-flex;align-items:center;gap:6px;
      border-radius:999px;padding:7px 12px;cursor:pointer;font-family:inherit;
      border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);
      color:#fff;font-size:.72rem;font-weight:700;
      transition:background 220ms ease-out;
    }
    #screen-cotizaciones .cz-pulso-link svg{width:12px;height:12px}

    /* ---- CARRIL "BUSCADO SIN RESPUESTA" ----
       Va en naranja y no en verde: el verde es lo que la plataforma YA
       resuelve (pedidos, cotizaciones) y esto es justamente el agujero, la
       oportunidad. Que se distinga de un vistazo del resto del feed. */
    #screen-cotizaciones .cz-demanda{padding:14px 15px 13px}
    #screen-cotizaciones .cz-dem-ojo{
      display:inline-flex;align-items:center;gap:7px;
      font-family:var(--cz-mono) !important;font-size:.62rem;font-weight:700;
      letter-spacing:.14em;text-transform:uppercase;color:#B24500;
    }
    #screen-cotizaciones .cz-dem-ojo svg{width:13px;height:13px;flex-shrink:0}
    #screen-cotizaciones .cz-dem-tit{
      margin:9px 0 4px;font-size:.92rem;font-weight:800;color:#1A1A1A;
      line-height:1.3;letter-spacing:-.015em;text-wrap:balance;
    }
    #screen-cotizaciones .cz-dem-baj{margin:0 0 11px;font-size:.76rem;line-height:1.45;color:${GRIS}}
    /* Una sola fila con scroll horizontal. Envueltos se iban a cinco filas y
       el carril se comia la pantalla entera; los pedidos, que son el motivo
       por el que la gente entra, quedaban abajo del todo.
       Los margenes negativos hacen que los chips lleguen al borde de la
       tarjeta: el que queda cortado a la derecha es lo que avisa que hay mas. */
    #screen-cotizaciones .cz-dem-chips{
      display:flex;gap:8px;overflow-x:auto;
      margin:0 -15px;padding:2px 15px 4px;
      scrollbar-width:none;-webkit-overflow-scrolling:touch;
    }
    #screen-cotizaciones .cz-dem-chips::-webkit-scrollbar{display:none}
    #screen-cotizaciones .cz-dem-chip{
      flex-shrink:0;white-space:nowrap;
      display:inline-flex;align-items:center;gap:7px;min-height:36px;
      padding:7px 11px;border-radius:10px;font-family:inherit;
      font-size:.8rem;font-weight:700;color:#1A1A1A;text-align:left;
      background:#FFF8F3;border:1.5px solid #FFD9BC;
      transition:transform 200ms cubic-bezier(.23,1,.32,1),border-color 200ms ease-out;
    }
    #screen-cotizaciones button.cz-dem-chip{cursor:pointer}
    #screen-cotizaciones button.cz-dem-chip:active{transform:scale(.96)}
    #screen-cotizaciones .cz-dem-n{
      flex-shrink:0;font-size:.7rem;font-weight:700;color:#B24500;background:#FFEBDC;
      border-radius:6px;padding:2px 7px;font-variant-numeric:tabular-nums;
    }

    /* ---- TARJETA DEL FEED ----
       Un pedido cargado solo con titulo salia como dos renglones sueltos y
       nada mas. Ahora el piso minimo de toda tarjeta es: quien pide, que
       pide, cuanto le queda abierta y en que estado esta. Todo con datos que
       ya venian en la fila. */
    /* ---- QUE CLASE DE PEDIDO ES ----
       El proveedor baja por el feed decidiendo a que le entra, y las dos cosas
       que le pueden aparecer no se contestan igual: un pedido puntual se
       responde con un precio, y uno de abastecimiento con un remito de todo lo
       que puede cubrir. Antes la unica marca era un "Busca proveedor" con el
       mismo peso visual que el rubro y la provincia, perdido en la fila de
       datos: para el ojo era un dato mas, no la clase de pedido.

       La cinta va en los DOS tipos, no solo en el B. Marcando uno solo, el
       otro no se lee como el otro tipo: se lee como "pedido normal", y la
       distincion desaparece justo en el caso mas comun. */
    #screen-cotizaciones .cz-tipo{
      display:inline-flex;align-items:center;gap:5px;margin:0 0 9px;
      border-radius:8px;padding:4px 10px;
      font-size:.68rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;
    }
    #screen-cotizaciones .cz-tipo svg{width:13px;height:13px;flex-shrink:0}
    /* Puntual = el caso comun, en gris: si gritara, gritarian todas las
       tarjetas y no se distinguiria ninguna. Mismo par de colores que .cz-dato,
       ya medido sobre este fondo. */
    #screen-cotizaciones .cz-tipo.a{background:#F4F7F5;border:1px solid #E7EDE9;color:#41564C}
    /* Abastecimiento = el que el proveedor no se quiere perder, en verde
       lleno. Blanco sobre ${VERDE} da 7,68:1. */
    #screen-cotizaciones .cz-tipo.b{background:${VERDE};border:1px solid ${VERDE};color:#fff}

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
       El esqueleto ocupa el mismo lugar que lo que viene.

       Usa el @keyframes shimmer y la duracion (--sk-vel) del sistema base
       de css/styles.css, no uno propio: si el feed se ve al lado de otra
       seccion, los dos esqueletos tienen que latir al mismo compas.
       La paleta SI es propia: el gris generico ensucia este fondo. */
    #screen-cotizaciones .cz-sk{
      border-radius:12px;
      background:linear-gradient(90deg,#EDF1EF 0%,#F7F9F8 50%,#EDF1EF 100%);
      background-size:200% 100%;
      animation:shimmer var(--sk-vel,1.5s) ease-in-out infinite;
    }
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
    return `<button onclick="cotizPedir()" aria-label="Pedir una cotización" title="Pedir una cotización"
      class="cz-fab">${ICO.mas}</button>`;
  }

  // `accion` = botoncito chico a la derecha (ej: "Mis pedidos").
  //
  // Antes era un bloque blanco opaco pegado arriba. Ahora es la superficie de
  // vidrio de la seccion: el contenido le pasa por debajo en vez de cortarse
  // contra un rectangulo solido. El fallback (sin backdrop-filter o con
  // transparencia reducida) lo deja opaco y se ve igual de terminado.
  function header(titulo, onBack, accion) {
    return `<div class="cz-header cz-vidrio">
      ${onBack ? `<button class="cz-hvolver" onclick="${onBack}" aria-label="Volver">${ICO.volver}</button>` : ''}
      <div class="cz-htit">${esc(titulo)}</div>
      ${accion ? `<div style="margin-left:auto">${accion}</div>` : ''}
    </div>`;
  }

  // Boton chico de la esquina, con puntito verde si hay algo para mirar.
  function btnEsquina(texto, onclick, aviso) {
    return `<button class="cz-btn2" onclick="${onclick}" style="display:flex;align-items:center;gap:6px;min-height:44px;background:${SOFT};color:${VERDE_OSC};border:1.5px solid ${BORDE};border-radius:999px;padding:8px 15px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;transition:transform .18s ease-out">
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
    const { data, error } = await conFallback(() => sb.from('solicitudes').select(colsSol())
      .eq('usuario_id', uid).order('created_at', { ascending: false }).limit(50));
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

    /* El visitante sin sesion no toca la tabla, asi que conFallback() nunca
       corre y nivelSql se quedaria en 2 aunque la migracion no este. La
       funcion del feed publico lista sus columnas una por una: si las filas
       vuelven sin `tipo`, es que el SQL de la fase 4 todavia no se corrio.
       Sin esto, un visitante veria la bifurcacion y recien se enteraria al
       final, despues de iniciar sesion, de que su pedido no se puede guardar. */
    if (st.feed.length && st.feed[0].tipo === undefined && nivelSql >= 2) {
      nivelSql = 1;
    }
  }

  async function cargarFeed() {
    if (!currentUser) return cargarFeedPublico();

    const { data, error } = await conFallback(() => sb.from('solicitudes').select(colsSol())
      .eq('estado', 'abierta').gt('cierra_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(60));
    if (error) { console.warn('[cotiz] feed', error); st.feed = []; return; }
    st.feed = data || [];

    // Que pedidos ya cotice, para no ofrecer cotizar dos veces.
    const provId = currentUser?.proveedorId;
    st.misCotiz = {};
    if (provId) {
      // created_at hace falta para la pantalla "Mis cotizaciones" (el "hace X").
      // tipo y cubre, para que la pastilla de "ya respondio" diga lo correcto
      // en un pedido de proveedor, donde no hay precio que mostrar.
      const { data: mias } = await conFallback(() => sb.from('cotizaciones')
        .select('solicitud_id,precio,created_at' + (nivelSql >= 2 ? ',tipo,cubre' : ''))
        .eq('proveedor_id', provId));
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
     aparece y la pantalla queda como estaba.

     OJO con la guarda de "una sola vez": st.demanda sigue valiendo null
     durante TODA la consulta, asi que dos llamadas seguidas la pasaban las
     dos y mandaban la consulta dos veces. Por eso se comparte la promesa en
     vuelo: el segundo que llega se cuelga de la primera en lugar de abrir
     otra. */
  let demandaEnVuelo = null;

  function cargarDemanda() {
    if (st.demanda !== null) return Promise.resolve();
    if (demandaEnVuelo) return demandaEnVuelo;
    demandaEnVuelo = (async () => {
      try {
        const { data, error } = await sb.rpc('cotiz_demanda_sin_respuesta', { p_limit: 10 });
        if (error) throw error;
        st.demanda = (data || []).filter(d => d && d.termino);
      } catch (e) {
        console.warn('[cotiz] demanda', e);
        st.demanda = [];
      } finally {
        demandaEnVuelo = null;
      }
    })();
    return demandaEnVuelo;
  }

  /* Trae las cotizaciones de UN pedido y deja sus proveedores en provsCache.
     Devuelve la lista en vez de escribir st.cotizaciones porque tambien la
     llama el cierre del pedido desde "Mis pedidos", donde st.pedidoActual
     puede ser otro pedido (o ninguno): escribir el estado ahi dejaria la
     pantalla mostrando las cotizaciones equivocadas. */
  async function traerCotizaciones(solId) {
    const { data, error } = await conFallback(() => sb.from('cotizaciones').select(colsCot())
      .eq('solicitud_id', solId).order('created_at', { ascending: false }));
    if (error) { console.warn('[cotiz] cotizaciones', error); return []; }
    const lista = data || [];

    const faltan = [...new Set(lista.map(c => c.proveedor_id))]
      .filter(id => !st.provsCache[id]);
    if (faltan.length) {
      const { data: provs } = await sb.from('proveedores')
        .select('id,nombre,logo_url,plan,plan_hasta,rubro,provincia,whatsapp,pedido_minimo')
        .in('id', faltan);
      (provs || []).forEach(p => { st.provsCache[p.id] = p; });
    }
    return lista;
  }

  async function cargarCotizaciones(solId) {
    st.cotizaciones = await traerCotizaciones(solId);
  }

  /* ---------------- RUBROS SEGUIDOS (proveedor) ----------------

     Un proveedor de indumentaria baja por pedidos de electronica, ferreteria
     y alimentos hasta encontrar el suyo, y cuanto mas crece el feed, peor: el
     exito de la seccion la vuelve inservible para el que la usa. Seguir un
     rubro es lo mismo que seguir a alguien en Instagram — de eso en adelante
     el feed es el suyo.

     Va en una consulta PROPIA y no pegada al SELECT de checkSession() en
     app.js, a proposito. Pedir una columna que todavia no existe hace fallar
     la consulta ENTERA (no devuelve el campo vacio), y ese SELECT es el que
     arma la sesion del proveedor: pushear esto antes de correr el SQL
     dejaria a todos los proveedores sin poder entrar. Aca, si la columna no
     esta, lo unico que pasa es que el filtro no existe y el feed se ve
     completo, que es exactamente como funcionaba ayer.

     st.seguidos = null significa "no eligio nada" y muestra TODO. No se
     confunde con "eligio y despues borro todo": guardar la lista vacia
     tambien deja NULL en la base (lo pide el CHECK), y las dos cosas
     significan lo mismo. */
  async function cargarSeguidos() {
    const provId = currentUser?.proveedorId;
    if (!provId) { st.seguidos = null; return; }
    try {
      const { data, error } = await sb.from('proveedores')
        .select('rubros_seguidos').eq('id', provId).maybeSingle();
      if (error) throw error;
      st.haySeguidos = true;
      st.seguidos = normalizarSeguidos(data && data.rubros_seguidos);
    } catch (e) {
      // 42703 (no existe la columna) o 403 (falta el GRANT por columna, que
      // ADD COLUMN no hereda). En los dos casos la respuesta es la misma:
      // apagar el filtro, no romper la pantalla.
      console.warn('[cotiz] rubros seguidos: falta correr sql/2026-08-20_rubros_seguidos.sql', e);
      st.haySeguidos = false;
      st.seguidos = null;
    }
  }

  // Se descarta lo que no sea texto con contenido: la columna es text[] y el
  // CHECK ya lo impide del lado de la base, pero esta lista termina pintada y
  // comparada contra los rubros del feed. Mismo criterio que listaTexto().
  function normalizarSeguidos(v) {
    if (!Array.isArray(v)) return null;
    const l = v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
    return l.length ? l : null;
  }

  // El filtro esta actuando ahora mismo. Las tres condiciones tienen que
  // valer: que la base lo soporte, que sea un proveedor, y que haya elegido.
  const filtroSeguidosActivo = () =>
    st.haySeguidos && esProveedor() && !!st.seguidos && !st.verTodos;

  /* Guarda la lista elegida. El array vacio se guarda como NULL para que la
     base tenga UN solo estado que signifique "sin filtro" — es lo que pide el
     CHECK proveedores_rubros_seguidos_chk. */
  async function guardarSeguidos(lista) {
    const provId = currentUser?.proveedorId;
    if (!provId) return false;
    const valor = (lista && lista.length) ? lista : null;
    try {
      const { error } = await sb.from('proveedores')
        .update({ rubros_seguidos: valor }).eq('id', provId);
      if (error) throw error;
      st.seguidos = valor;
      // Si acaba de elegir rubros, el escape de "ver todo" ya no corresponde:
      // dejarlo prendido mostraria el feed completo justo despues de filtrarlo.
      st.verTodos = false;
      // La sesion en memoria tambien, para que no quede desactualizada si otra
      // parte de la app lee provData sin volver a consultar.
      try { if (currentUser.provData) currentUser.provData.rubros_seguidos = valor; } catch (e) { }
      return true;
    } catch (e) {
      console.warn('[cotiz] guardar rubros seguidos', e);
      return false;
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
    /* El esqueleto de carga va PRIMERO, antes que la portada.
       Antes iba despues y eso lo volvia inalcanzable justo donde mas falta
       hacia: cotizIr() prende st.cargando ANTES de cambiar st.vista, asi que
       al salir de la portada con "Probar" esta condicion todavia leia
       'portada' y repintaba la portada identica en lugar del esqueleto. La
       pantalla parecia no responder hasta que llegaban los datos, y la gente
       volvia a tocar el boton.

       La portada sigue pintandose sin esperar datos: los tres caminos que
       entran a ella (abrirCotizaciones, cotizPedirPara, cotizVerPortada)
       dejan st.cargando en false a proposito. */
    if (st.cargando) html = pantallaCargando();
    else if (st.vista === 'portada') html = pantallaPortada();
    else if (st.vista === 'login') html = pantallaLogin();
    else if (st.vista === 'bifurcacion') html = pantallaBifurcacion();
    else if (st.vista === 'confirmado') html = pantallaConfirmado();
    else if (st.vista === 'publicarB') html = pantallaPublicarB();
    else if (st.vista === 'resultadoB') html = pantallaResultadoB();
    else if (st.vista === 'publicar') html = pantallaPublicar();
    else if (st.vista === 'respuestas') html = pantallaRespuestas();
    else if (st.vista === 'cotizar') html = pantallaCotizar();
    else if (st.vista === 'cotizarB') html = pantallaCotizarB();
    else if (st.vista === 'mis') html = pantallaMisPedidos();
    else if (st.vista === 'misCotiz') html = pantallaMisCotizaciones();
    else if (st.vista === 'seguidos') html = pantallaSeguidos();
    else html = pantallaFeed();
    cont.innerHTML = ESTILOS + html;
    animarCifras(cont);
    // El formulario A tiene tres bloques que se pintan por estado (rubro,
    // cantidad, foto) y no por template: se los monta recien ahora, cuando el
    // HTML ya esta en el DOM.
    if (st.vista === 'publicar') montarFormularioA();
    if (st.vista === 'publicarB') pintarFormB();
    if (st.vista === 'cotizarB') montarRemito();
    window.scrollTo(0, 0);
  }

  function montarFormularioA() {
    const sel = $('cz-rubro');
    if (sel && st.rubroTocado) sel.dataset.tocado = '1';
    pintarRubro();
    pintarCantidad();
    pintarFoto();
    // El presupuesto se rotula segun la unidad elegida ("$ por docena"): si el
    // borrador traia una unidad distinta de la primera de la lista, hay que
    // poner el rotulo al dia antes de que la persona lo lea.
    try { window.cotizUnidadCambio(); } catch (e) { }
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

  // st.cargando explicito: la portada es la unica pantalla que se pinta sin
  // esperar datos, y desde que el esqueleto tiene prioridad en render() una
  // bandera colgada de una carga anterior la taparia.
  window.cotizVerPortada = function () { st.vista = 'portada'; st.cargando = false; render(); };

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
            ${d.cantidad || d.rubro ? `<div style="font-size:.74rem;color:${GRIS};margin-top:5px">${[cantidadTexto(d), esc(d.rubro || '')].filter(Boolean).join(' · ')}</div>` : ''}
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
        ${btnPrimario('Escribir mi pedido', 'cotizPedir()')}
      </div>
      <div style="font-size:.78rem;color:${GRIS};text-align:center;margin-top:14px;line-height:1.5">Para ver los pedidos de la comunidad hace falta iniciar sesión.</div>
    </div>`;
  }

  /* ---------------- FEED PUBLICO (portada, las dos puntas) ---------------- */

  const esProveedor = () => currentUser?.type === 'proveedor';
  const esMio = s => st.uid && String(s.usuario_id) === String(st.uid);

  /* El feed tal como lo tiene que ver ESTE proveedor, ya recortado a los
     rubros que sigue. Es la base de la pantalla del feed: los chips de rubro,
     el pulso y las tarjetas salen todos de aca, para que el numero grande de
     arriba diga lo mismo que se cuenta abajo.

     OJO: "Mis cotizaciones" y cotizRetirarCotiz() siguen leyendo st.feed
     crudo. Si usaran esto, una cotizacion enviada a un pedido de un rubro que
     el proveedor despues dejo de seguir desapareceria de su propia lista. Lo
     que se filtra es lo que se le OFRECE, nunca lo que ya hizo. */
  function feedVisible() {
    if (!filtroSeguidosActivo()) return st.feed;
    return st.feed.filter(s => s.rubro && st.seguidos.indexOf(s.rubro) >= 0);
  }

  // Solo los rubros que REALMENTE tienen pedidos: no ofrecer filtros vacios.
  function rubrosDelFeed() {
    const cuenta = {};
    feedVisible().forEach(s => { if (s.rubro) cuenta[s.rubro] = (cuenta[s.rubro] || 0) + 1; });
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
    // Cuenta sobre el feed YA filtrado por los rubros que sigue: un "40
    // pedidos abiertos" arriba de tres tarjetas es un numero que el proveedor
    // no puede verificar, y deja de creerle al resto.
    const visible = feedVisible();
    const nPedidos = visible.length;
    const nCotiz = visible.reduce((a, s) => a + (s.respuestas || 0), 0);
    const nRubros = rubrosDelFeed().length;
    const nHoy = visible.filter(s => esDeHoy(s.created_at)).length;

    const stats = [];
    if (nCotiz) stats.push([nCotiz, nCotiz === 1 ? 'cotización enviada' : 'cotizaciones enviadas']);
    if (nHoy) stats.push([nHoy, nHoy === 1 ? 'publicado hoy' : 'publicados hoy']);
    if (nRubros > 1) stats.push([nRubros, 'rubros activos']);

    // Los numeros arrancan en 0 y suben, asi que la version visual va con
    // aria-hidden y al lado queda el texto real para el lector de pantalla:
    // si no, se anuncia "0 pedidos abiertos".
    const lab = nPedidos === 1 ? 'pedido abierto' : 'pedidos abiertos';
    const statsTxt = stats.map(([n, t]) => n + ' ' + t).join(' · ');

    // Sin el parrafo explicativo que habia antes: ahora TODOS pasan por la
    // portada al entrar a la seccion, asi que repetirlo aca era gastar media
    // pantalla en algo que la persona acaba de leer.
    return `<div class="cz-pulso">
      <div class="cz-pulso-fila">
        <span class="cz-eyebrow"><span class="cz-vivo"></span> Demanda en vivo</span>
        <button class="cz-pulso-link" onclick="cotizVerPortada()">Cómo funciona ${ICO.flecha}</button>
      </div>
      <p style="display:flex;align-items:center;gap:10px;margin:11px 0 0">
        <span class="cz-oculto">${nPedidos} ${lab}</span>
        <span class="cz-cifra" data-cuenta="${nPedidos}" aria-hidden="true">${nPedidos}</span>
        <span class="cz-cifra-lab" aria-hidden="true">${lab}</span>
      </p>
      ${stats.length ? `<p class="cz-stats">
        <span class="cz-oculto">${esc(statsTxt)}</span>
        <span aria-hidden="true">${stats.map(([n, t]) =>
        `<b data-cuenta="${n}">${n}</b> ${esc(t)}`).join(' · ')}</span>
      </p>` : ''}
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
        <p class="cz-dem-baj">${total.toLocaleString('es-AR')} búsquedas de este mes se fueron con las manos vacías. ${prov
        ? 'Si vende alguno, cárguelo en su catálogo.'
        : 'Toque uno para pedir cotización.'}</p>
        <div class="cz-dem-chips">${lista.map(chip).join('')}</div>
      </div></div>
    </div>`;
  }

  /* Repinta SOLO el hueco del carril, nunca render().

     El carril llega tarde a proposito (su consulta es la mas cara y ya no
     bloquea al feed), y un render() entero en ese momento haria dos cosas
     malas: volver a arrancar de cero la cuenta ascendente del pulso, y mandar
     la pantalla al tope justo cuando la persona empezo a bajar. Mismo criterio
     que pintarSeguidos().

     No hace falta preguntar en que vista estamos: el hueco solo existe dentro
     de pantallaFeed(). Si el feed no esta pintado, no hay nodo y no pasa nada. */
  function pintarCarril() {
    const hueco = $('cz-carril');
    if (hueco) hueco.innerHTML = carrilDemanda();
  }

  /* La barra que dice si el feed esta recortado y como salirse.

     Un filtro que esconde cosas sin decirlo es la peor version de esto: el
     proveedor cree que no hay pedidos y se va. Por eso siempre esta a la
     vista que se esta filtrando, cuantos rubros, y como ver todo de un toque.

     Los tres estados:
       sin elegir  -> invitacion, y solo si el feed tiene rubros de sobra.
       filtrando   -> cuantos sigue + salida a ver todo.
       ver todo    -> aviso de que el filtro esta en pausa + como volver. */
  function barraSeguidos() {
    if (!st.haySeguidos || !esProveedor()) return '';

    const armar = (txt, botones) => `<div class="cz-ancho" style="padding:10px 16px 0">
      <div class="cz-seg-barra">
        <span class="cz-seg-txt">${txt}</span>
        <span class="cz-seg-acc">${botones}</span>
      </div></div>`;

    const cambiar = `<button type="button" class="cz-seg-btn" onclick="cotizIr('seguidos')">Cambiar</button>`;

    if (!st.seguidos) {
      // Sin rubros elegidos la barra es una oferta, no un estado. Con dos o
      // tres rubros en todo el feed no hay nada que recortar y solo estorba.
      if (rubrosDelFeed().length < 4) return '';
      return armar('Reciba solo los rubros que le interesan.',
        `<button type="button" class="cz-seg-btn fuerte" onclick="cotizIr('seguidos')">Elegir rubros</button>`);
    }

    const n = st.seguidos.length;
    if (st.verTodos) {
      return armar('Viendo todo el feed.',
        `<button type="button" class="cz-seg-btn fuerte" onclick="cotizSoloMisRubros()">Volver a mis rubros</button>` + cambiar);
    }
    return armar(`Siguiendo ${n} ${n === 1 ? 'rubro' : 'rubros'}.`,
      `<button type="button" class="cz-seg-btn" onclick="cotizVerTodos()">Ver todos</button>` + cambiar);
  }

  window.cotizVerTodos = function () { st.verTodos = true; st.rubro = 'Todos'; vibrar('light'); render(); };
  window.cotizSoloMisRubros = function () { st.verTodos = false; st.rubro = 'Todos'; vibrar('light'); render(); };

  /* ---------------- ELEGIR QUE RUBROS SEGUIR ----------------

     El tope de 10 esta espejado en el CHECK de la base
     (proveedores_rubros_seguidos_chk). Si se cambia aca, va tambien alla, o
     el guardado se cae con un 23514 y la pantalla no sabria por que.

     Se listan los 27 rubros de RUBROS_LISTA y no solo los que hoy tienen
     pedidos: el proveedor esta eligiendo a que le quiere prestar atencion de
     ahora en mas, y un rubro sin pedidos hoy es justamente el que le
     conviene marcar para que le avise cuando aparezca el primero. */
  const SEG_TOPE = 10;

  function pantallaSeguidos() {
    const rubros = (typeof RUBROS_LISTA !== 'undefined' ? RUBROS_LISTA : []);
    const sel = st.segEdit || [];
    /* Los rubros con los que se registro son la apuesta mas obvia, asi que se
       señalan. Se OFRECEN, no se marcan solos: dar por hecho lo que quiere
       ver es la forma de esconderle sin aviso lo que tambien le interesa.

       OJO: proveedores.rubro NO es un rubro, es una lista separada por comas
       ("Indumentaria, Textil y Telas"). El resto de app.js ya la parte asi
       (ver el picker de rubros del perfil). Compararla entera contra
       RUBROS_LISTA no daria nunca, y la sugerencia no aparecia en ningun
       proveedor con mas de un rubro. */
    const propios = String((currentUser && currentUser.provData && currentUser.provData.rubro) || '')
      .split(',').map(r => r.trim()).filter(Boolean);

    return header('Rubros que sigue', "cotizIr('feed')") + `
      <div class="cz-ancho" style="padding:4px 16px 150px">
        <p class="cz-paso-ayuda" style="margin-bottom:14px">
          Elija los rubros que le interesan y el feed le muestra solo esos.
          Puede cambiarlo cuando quiera, y siempre le queda la salida de ver todo.
        </p>

        <div id="cz-seg-chips" class="cz-chips-prod">
          ${rubros.map(r => `<button type="button" class="cz-chip-prod" data-r="${esc(r)}"
            aria-pressed="${sel.indexOf(r) >= 0}"
            onclick="cotizSegChip('${jsArg(r)}')">${esc(r)}${propios.indexOf(r) >= 0
        ? '<span class="cz-seg-suyo">su rubro</span>' : ''}</button>`).join('')}
        </div>

        <div class="cz-barra cz-vidrio">
          <div id="cz-seg-cuenta" class="cz-barra-nota" style="margin-bottom:10px">${esc(textoSegCuenta(sel))}</div>
          ${btnPrimario('Guardar', 'cotizSegGuardar(this)')}
          <button type="button" class="cz-link" onclick="cotizSegTodos()">Seguir todos los rubros</button>
        </div>
      </div>`;
  }

  function textoSegCuenta(sel) {
    if (!sel.length) return 'Sin ninguno elegido va a seguir viendo todos los pedidos.';
    return 'Siguiendo ' + sel.length + (sel.length === 1 ? ' rubro' : ' rubros') +
      ' de ' + SEG_TOPE + ' posibles.';
  }

  /* Repinta SOLO los chips y el contador. Nunca llama a render(): render()
     manda la pantalla al tope, y con 27 chips eso significa perder el lugar
     donde venia tocando en cada toque. */
  function pintarSeguidos() {
    const sel = st.segEdit || [];
    const cont = $('cz-seg-chips');
    if (cont) Array.from(cont.children).forEach(b => {
      b.setAttribute('aria-pressed', sel.indexOf(b.dataset.r) >= 0 ? 'true' : 'false');
    });
    const cuenta = $('cz-seg-cuenta');
    if (cuenta) cuenta.textContent = textoSegCuenta(sel);
  }

  window.cotizSegChip = function (r) {
    if (!st.segEdit) st.segEdit = [];
    const i = st.segEdit.indexOf(r);
    if (i >= 0) st.segEdit.splice(i, 1);
    else {
      if (st.segEdit.length >= SEG_TOPE) {
        toast('Puede seguir hasta ' + SEG_TOPE + ' rubros. Para ver más, siga todos.');
        return;
      }
      st.segEdit.push(r);
    }
    vibrar('light');
    pintarSeguidos();
  };

  // "Seguir todos" es lo mismo que no seguir ninguno: el feed sin recortar.
  // Se guarda derecho, sin pedir confirmacion, porque no esconde nada.
  window.cotizSegTodos = function () {
    st.segEdit = [];
    pintarSeguidos();
    window.cotizSegGuardar();
  };

  window.cotizSegGuardar = async function (btn) {
    // Mismo patron que el resto de los botones de envio de la seccion:
    // textContent, no innerHTML. Se come el redondel de la flecha mientras
    // guarda y lo repone el render() de abajo.
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; btn.style.opacity = '.7'; }
    const ok = await guardarSeguidos(st.segEdit || []);
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    if (!ok) {
      if (btn) btn.textContent = 'Guardar';
      toast('No se pudo guardar. Intente de nuevo.');
      return;
    }
    vibrar('success');
    toast(st.seguidos
      ? 'Listo: su feed muestra solo esos rubros'
      : 'Listo: va a ver todos los pedidos');
    st.vista = 'feed';
    st.rubro = 'Todos';
    render();
  };

  function pantallaFeed() {
    const base = feedVisible();
    const lista = st.rubro === 'Todos' ? base : base.filter(s => s.rubro === st.rubro);

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

    /* El vacio por FILTRO no se puede contar como el vacio de verdad. Si el
       recorte por rubros dejo la pantalla en cero, decirle "todavia no hay
       pedidos abiertos" a alguien que tiene 40 esperandolo un toque mas alla
       es mentirle, y encima lo hace irse. */
    const vacioPorFiltro = filtroSeguidosActivo() && st.rubro === 'Todos'
      && !base.length && st.feed.length > 0;

    const cuerpo = !lista.length
      ? (vacioPorFiltro
        ? vacioBox(
          'No hay pedidos abiertos en sus rubros',
          'Hay ' + st.feed.length + (st.feed.length === 1 ? ' pedido abierto en otros rubros' : ' pedidos abiertos en otros rubros') + '. Puede verlos todos o cambiar los rubros que sigue.',
          btnPrimario('Ver todos los pedidos', 'cotizVerTodos()'))
        : vacioBox(
          st.rubro === 'Todos' ? 'Todavía no hay pedidos abiertos' : 'No hay pedidos en ' + st.rubro,
          st.rubro === 'Todos'
            ? (esProveedor()
              ? 'Cuando un emprendedor publique lo que necesita comprar, va a aparecer acá.'
              : 'Sea el primero: publique lo que necesita comprar y reciba precios de varios proveedores.')
            : 'Pruebe con otra categoría o mire todos los pedidos.',
          esProveedor() ? '' : btnPrimario('Pedir una cotización', 'cotizPedir()')))
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
            ${btnPrimario('Pedir una cotización', 'cotizPedir()')}
          </div>
        </div>`
      : '';

    // Sin ningun pedido abierto el pulso seria un "0" gigante arriba del cartel
    // de vacio, que ya dice lo mismo y mejor. En ese caso no se pinta.
    // Con boton de volver: el feed es la pantalla donde se queda parado el que
    // entra a la seccion, y sin flecha no habia forma de salir al inicio salvo
    // por la barra de abajo.
    // El pulso se pinta segun lo que hay DESPUES del filtro: con el recorte
    // dejando la pantalla vacia, seria un "0" gigante arriba del cartel que ya
    // explica lo mismo y mejor.
    return header('Cotizaciones', 'closeCotiz()', accion) + `
      ${base.length ? `<div class="cz-ancho" style="padding:13px 16px 2px">${pulso()}</div>` : ''}
      ${barraSeguidos()}
      <div id="cz-carril">${carrilDemanda()}</div>
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
      ? (n > 0 ? btnCta(esPedidoB(s)
        ? `Ver ${n} ${n === 1 ? 'respuesta' : 'respuestas'}`
        : `Ver mis ${n} ${n === 1 ? 'cotización' : 'cotizaciones'}`, `cotizVerRespuestas('${s.id}')`) : '')
      : esProveedor()
        ? (ya
          // La pastilla sola dejaba la cotizacion enviada como algo definitivo.
          // Abajo va la salida: equivocarse de precio no puede ser para siempre.
          ? `<div class="cz-pastilla">${ICO.ok} ${esc(resumenCotiz(ya, s))}</div>
             <div style="display:flex;margin-top:8px">${btnSec(
            esPedidoB(s) ? 'Retirar mi respuesta' : 'Retirar mi cotización',
            `cotizRetirarCotiz('${s.id}')`, 'rojo')}</div>`
          : btnCta(esPedidoB(s) ? 'Responder este pedido' : 'Enviar cotización', `cotizAbrirForm('${s.id}')`))
        : '';

    // El comprador que mira el pedido de otro no tiene accion posible, asi que
    // el estado es lo unico que cierra la tarjeta: sin esto quedaba cortada.
    const estado = n > 0
      ? `<span class="cz-estado hay">${n} ${esPedidoB(s)
        ? (n === 1 ? 'respuesta' : 'respuestas')
        : (n === 1 ? 'cotización' : 'cotizaciones')}</span>`
      : `<span class="cz-estado">${esPedidoB(s) ? 'Sin respuestas todavía' : 'Sin cotizar todavía'}</span>`;

    /* Un pedido de proveedor no tiene cantidad ni presupuesto por unidad: lo
       que lo describe es la LISTA de productos que quiere que le abastezcan.
       Se muestra como datos y no como parrafo para que se lea de un vistazo,
       que es como el proveedor decide si le sirve. */
    const tipoB = esPedidoB(s);
    const productos = productosDe(s);

    /* La cinta reemplaza al viejo chip "Busca proveedor", que estaba en esta
       misma fila de datos con el mismo peso que la provincia. El lugar que
       deja libre lo ocupa la cantidad de productos: en un pedido A el dato
       fuerte es CUANTO se pide, y en uno B es DE CUANTO ES EL SURTIDO, que es
       lo que dice si esto es un cliente de un producto o de una lista entera. */
    const nProd = productos.length;
    const datos = (tipoB
      ? [
        nProd ? `<span class="cz-dato fuerte">${nProd} ${nProd === 1 ? 'producto' : 'productos'}</span>` : '',
        s.rubro ? `<span class="cz-dato">${esc(s.rubro)}</span>` : '',
        s.provincia ? `<span class="cz-dato">${ICO.pin}${esc(s.provincia)}</span>` : ''
      ].concat(productos.slice(0, 5).map(x => `<span class="cz-dato">${esc(x)}</span>`))
        .concat(productos.length > 5 ? [`<span class="cz-dato">y ${productos.length - 5} más</span>`] : [])
      : [
        s.cantidad ? `<span class="cz-dato fuerte">${cantidadTexto(s)}</span>` : '',
        s.rubro ? `<span class="cz-dato">${esc(s.rubro)}</span>` : '',
        s.provincia ? `<span class="cz-dato">${ICO.pin}${esc(s.provincia)}</span>` : '',
        s.presupuesto ? `<span class="cz-dato">Hasta ${plata(s.presupuesto)} por ${uSingular(s)}</span>` : ''
      ]).filter(Boolean).join('');

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

      ${cintaTipo(s)}
      <h3 class="cz-titulo">${esc(s.titulo)}</h3>
      ${datos ? `<div class="cz-datos">${datos}</div>` : ''}
      ${fotoPedido(s)}
      ${s.detalles ? `<p class="cz-detalle">${esc(s.detalles)}</p>` : ''}

      <div class="cz-pie">
        <span class="cz-cierre">${anilloTiempo(dias)}${esc(textoCierre(dias))}</span>
        ${estado}
      </div>
      ${accion ? `<div class="cz-cta-zona">${accion}</div>` : ''}
    </div></div>`;
  }

  /* La cinta que dice de que clase es el pedido, arriba del titulo.

     Se apoya en nivelSql y no en formBDisponible(): si el founder apaga
     FORM_B_LISTO, dejan de PUBLICARSE pedidos de proveedor, pero los que ya
     estan en la base siguen en el feed y siguen necesitando su cinta.

     Con nivelSql < 2 la columna `tipo` no existe todavia, asi que no hay dos
     clases que distinguir: todos los pedidos son de producto. Ahi la cinta no
     se pinta — poner "PRODUCTO PUNTUAL" en todas las tarjetas cuando no existe
     la otra clase es ruido repetido que no separa nada. */
  function cintaTipo(s) {
    if (nivelSql < 2) return '';
    return esPedidoB(s)
      ? `<span class="cz-tipo b">${ICO.local}Busca proveedor fijo</span>`
      : `<span class="cz-tipo a">${ICO.caja}Producto puntual</span>`;
  }

  /* La foto que adjunto el comprador, tal como la ve el proveedor.
     Sin vidrio encima ni degradados: sobre una foto que sube cualquiera el
     contraste es impredecible y no hay forma de garantizar AA. Se muestra
     limpia, con un borde y nada mas.
     Si la fila no trae foto_url (migracion sin correr, o pedido viejo) esto
     devuelve '' y la tarjeta queda exactamente como antes. */
  function fotoPedido(s) {
    if (!s || !s.foto_url) return '';
    return `<div style="margin:0 0 11px;border-radius:12px;overflow:hidden;border:1px solid #EEF2F0;background:#FAFBFA">
      <img loading="lazy" src="${esc(s.foto_url)}" alt="Foto del pedido"
        style="display:block;width:100%;max-height:190px;object-fit:cover"
        onerror="this.parentNode.remove()"></div>`;
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
        btnPrimario('Pedir una cotización', 'cotizPedir()'));
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
        ? `<span style="font-size:.7rem;font-weight:800;background:${SOFT};color:${VERDE_OSC};padding:3px 9px;border-radius:10px">${n} ${esPedidoB(p)
          ? (n === 1 ? 'respuesta' : 'respuestas')
          : (n === 1 ? 'cotización' : 'cotizaciones')}</span>`
        : `<span style="font-size:.7rem;font-weight:700;background:#F1F3F2;color:${GRIS};padding:3px 9px;border-radius:10px">Esperando respuestas</span>`;

    return `<div style="background:#fff;border:1px solid ${BORDE};border-radius:14px;padding:14px;margin-bottom:10px;${!viv ? 'opacity:.7' : ''}">
      <div onclick="cotizVerRespuestas('${p.id}')" style="cursor:pointer">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px">
          ${badge}
          <span style="font-size:.72rem;color:${TENUE};flex-shrink:0">${esc(hace(p.created_at))}</span>
        </div>
        <div style="font-family:'Inter',sans-serif;font-size:.9rem;font-weight:700;color:#1A1A1A;line-height:1.4;margin-bottom:9px">${esc(p.titulo)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.74rem;color:${GRIS}">
          ${p.cantidad ? `<span>${cantidadTexto(p)}</span>` : ''}
          ${esPedidoB(p) && productosDe(p).length ? `<span>${productosDe(p).length} ${productosDe(p).length === 1 ? 'producto' : 'productos'}</span>` : ''}
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
              <span style="font-size:.7rem;font-weight:800;background:${SOFT};color:${VERDE_OSC};padding:3px 9px;border-radius:10px">${esc(resumenCotiz(cot, sol))}</span>
              <span style="font-size:.72rem;color:${TENUE};flex-shrink:0">${esc(hace(cot.created_at))}</span>
            </div>
            <div style="font-family:'Inter',sans-serif;font-size:.88rem;font-weight:700;color:#1A1A1A;line-height:1.4;margin-bottom:7px">${esc(sol.titulo)}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:.74rem;color:${GRIS}">
              <span>${esc(sol.comprador_nombre)}</span>
              ${sol.cantidad ? `<span>· ${cantidadTexto(sol)}</span>` : ''}
              ${sol.respuestas > 1 ? `<span>· compite con ${sol.respuestas - 1} ${sol.respuestas - 1 === 1 ? 'proveedor más' : 'proveedores más'}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;padding-top:11px;border-top:1px solid #F1F3F2">
              ${btnSec(esPedidoB(sol) ? 'Retirar mi respuesta' : 'Retirar mi cotización',
        `cotizRetirarCotiz('${sol.id}')`, 'rojo')}
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* El proveedor se arrepintio: puso mal el precio, se quedo sin stock, o
     simplemente ya no quiere el pedido. Borra su propia fila.

     NO HIZO FALTA SQL. Verificado contra produccion antes de escribir esto:
     la policy cot_delete (proveedor dueño de la fila, u admin) y el
     GRANT DELETE sobre cotizaciones a authenticated ya estaban puestos, y el
     trigger cotiz_respuestas_trg corre AFTER INSERT OR DELETE, asi que el
     contador solicitudes.respuestas baja solo. Tampoco hay ninguna tabla con
     FK contra cotizaciones, asi que el borrado no arrastra nada.

     Se borra por el par (solicitud_id, proveedor_id) y no por id porque
     st.misCotiz no guarda el id — la consulta que lo llena pide solo las
     columnas que la pantalla muestra. El par alcanza: la RLS acota igual el
     DELETE a las filas de este proveedor, asi que ni un par mal armado podria
     tocar la cotizacion de otro.

     Al comprador no se le avisa nada, porque hoy en esta seccion no existe
     ninguna notificacion en ningun sentido. La cotizacion deja de estar la
     proxima vez que entra. El dia que haya avisos, esto tiene que mandar uno. */
  window.cotizRetirarCotiz = async function (solId) {
    const provId = currentUser?.proveedorId;
    if (!provId) return;

    const sol = st.feed.find(s => String(s.id) === String(solId));
    const esB = esPedidoB(sol);
    const cosa = esB ? 'su respuesta' : 'su cotización';

    // Se aclara que puede volver a mandarla: sin eso, "no se puede deshacer"
    // suena a que pierde el pedido para siempre y nadie toca el boton.
    // Es verdad mientras el pedido siga abierto — es lo que exige la policy
    // cot_insert, que pide estado='abierta' y cierra_at > now().
    if (!confirm('Va a retirar ' + cosa + '. El comprador deja de verla.\n\n' +
      'No se puede deshacer, pero puede volver a responder mientras el pedido siga abierto.')) return;

    try {
      const { error } = await sb.from('cotizaciones').delete()
        .eq('solicitud_id', solId).eq('proveedor_id', provId);
      if (error) throw error;
      vibrar('success');
      toast(esB ? 'Respuesta retirada' : 'Cotización retirada');
      // Se recarga el feed entero: el contador de respuestas lo cambio el
      // trigger en la base, no nosotros. Descontarlo a mano en memoria dejaria
      // la pantalla mostrando un numero distinto al real.
      await cargarFeed();
      render();
    } catch (e) {
      console.warn('[cotiz] retirar', e);
      toast('No se pudo retirar. Intente de nuevo.');
    }
  };

  /* ---------------- BIFURCACION: que esta buscando ----------------

     Hay dos pedidos distintos escondidos abajo del mismo formulario, y no se
     responden con las mismas preguntas:

       A) "necesito 500 remeras"          -> cuanto sale, cuando llega
       B) "necesito quien me abastezca"   -> quien me cubre el surtido, con
                                             que minimo, todos los meses

     Meterlos en un solo formulario obliga a preguntar cantidad exacta a
     alguien que todavia no sabe que va a vender, que es donde se caia.

     EL INTERRUPTOR: FORM_B_LISTO dice que el CODIGO del formulario B esta
     terminado. No alcanza con eso: formBDisponible() exige ademas que la
     base tenga las columnas de la fase 4 (nivelSql >= 2). Si esto se pushea
     antes de correr sql/2026-08-20_pedidos_de_proveedor.sql, la bifurcacion
     no aparece, el "+" sigue yendo derecho al formulario A y la seccion
     funciona igual que antes. Nadie ve una opcion que no lleva a ningun lado.
     Ponerlo en false vuelve a apagar toda la fase 4 de un solo lugar. */

  const FORM_B_LISTO = true;

  function pantallaBifurcacion() {
    const opcion = (accion, ico, titulo, bajada, ejemplo) =>
      `<button type="button" class="cz-bif-op" onclick="${accion}">
        <span class="cz-bif-cab">
          <span class="cz-bif-ico" aria-hidden="true">${ico}</span>
          <span class="cz-bif-tit">${esc(titulo)}</span>
        </span>
        <span class="cz-bif-baj" style="display:block">${esc(bajada)}</span>
        <span class="cz-bif-ej" style="display:block">${esc(ejemplo)}</span>
      </button>`;

    return header('¿Qué está buscando?', "cotizIr('feed')") + `
      <div class="cz-bif cz-ancho">
        <p class="cz-bif-intro">Elija según lo que necesite. Cada opción le hace preguntas distintas para conseguirle mejores respuestas.</p>
        ${opcion("cotizIr('publicar')", ICO.caja,
      'Un producto puntual, en cantidad',
      'Necesita algo concreto y quiere saber cuánto sale.',
      'Por ejemplo: 50 juegos de sábanas de 2 plazas')}
        ${opcion("cotizIr('publicarB')", ICO.local,
      'Un proveedor que me abastezca',
      'Tiene un negocio y necesita quien le reponga varios productos.',
      'Por ejemplo: una blanquería que le reponga todos los meses')}
      </div>`;
  }

  /* Puerta de entrada unica a "pedir". La usan el "+" y todos los botones de
     "Pedir una cotizacion". No la usa cotizPedirPara(): el que viene de una
     busqueda sin resultados YA sabe que quiere un producto puntual, y hacerlo
     elegir de nuevo seria preguntarle algo que acaba de contestar. */
  window.cotizPedir = function () {
    return cotizIr(formBDisponible() ? 'bifurcacion' : 'publicar');
  };

  /* ---------------- FORMULARIO B: BUSCAR QUIEN ME ABASTEZCA ----------------

     Cinco pasos que aparecen de a uno. El formulario ARRANCA VACIO: el
     prototipo lo mostraba precargado con "blanquería" y eso escondia
     justamente el momento que importa, que es la persona escribiendo lo que
     quiere vender sin saber todavia como se llama el rubro.

     Los chips del paso 2 son SUGERENCIAS derivadas de lo que escribio, nunca
     una lista fija: salen de CAT_SUBCATS (app.js) a traves del rubro que
     deduce rubroDeTermino(). Si no se deduce nada, no hay chips impuestos: se
     le pide que escriba los suyos. Y aunque haya, siempre puede sumar el
     propio, porque ninguna taxonomia nuestra le va a acertar a todos. */

  function chipsSugeridos(texto) {
    const r = rubroDeTermino(texto || '');
    if (!r) return [];
    try {
      if (typeof CAT_SUBCATS === 'object' && CAT_SUBCATS && Array.isArray(CAT_SUBCATS[r])) {
        return CAT_SUBCATS[r].slice(0, 8);
      }
    } catch (e) { }
    return [];
  }

  function estadoB() {
    if (!st.formB) {
      st.formB = {
        texto: '', sugeridos: [], elegidos: [],
        yaVende: '', inversion: '', provincia: '',
        rubro: '', conteo: null, contando: false
      };
    }
    return st.formB;
  }

  function pantallaPublicarB() {
    const b = estadoB();
    const provs = (typeof PROVINCIAS !== 'undefined' ? PROVINCIAS : []);

    const cab = (n, tit) => `<div class="cz-paso-cab">
      <span class="cz-paso-n" aria-hidden="true">${n}</span>
      <span class="cz-paso-tit">${esc(tit)}</span>
    </div>`;

    return header('Buscar un proveedor', "cotizIr('bifurcacion')") + `
      <div class="cz-form">

        <div class="cz-paso-b">
          ${cab(1, '¿Qué quiere vender?')}
          <p class="cz-paso-ayuda">Escríbalo como se le ocurra. No hace falta que sepa cómo se llama el rubro.</p>
          <input id="cz-b-texto" maxlength="80" value="${esc(b.texto)}" oninput="cotizBTexto()"
            placeholder="ej: blanquería, ropa de bebé, bazar" style="${INPUT_CSS}">
        </div>

        <div id="cz-b-paso2" class="cz-paso-b" style="display:none">
          ${cab(2, '¿Cuáles de estos vende?')}
          <p class="cz-paso-ayuda" id="cz-b-ayuda2">Toque los que le sirvan. Si falta alguno, agréguelo.</p>
          <div id="cz-b-chips" class="cz-chips-prod"></div>
          <div class="cz-sumar">
            <input id="cz-b-propio" maxlength="40" placeholder="Otro producto que venda"
              aria-label="Agregar otro producto" onkeydown="cotizBTecla(event)" style="${INPUT_CSS}">
            <button type="button" onclick="cotizBSumar()">Agregar</button>
          </div>
        </div>

        <div id="cz-b-paso3" class="cz-paso-b" style="display:none">
          ${cab(3, '¿Ya está vendiendo?')}
          <div class="cz-dos" id="cz-b-vende">
            ${YA_VENDE.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="false" onclick="cotizBVende('${v}')">${esc(t)}</button>`).join('')}
          </div>
          <p class="cz-paso-ayuda" style="margin:9px 0 0">Hay mayoristas con mínimos bajos para los que recién empiezan.</p>
        </div>

        <div id="cz-b-paso4" class="cz-paso-b" style="display:none">
          ${cab(4, '¿Cuánto piensa invertir en la primera compra?')}
          <div id="cz-b-inv" class="cz-chips-prod">
            ${INVERSIONES.map(([v, t]) => `<button type="button" class="cz-chip-prod" data-v="${v}" aria-pressed="false" onclick="cotizBInversion('${v}')">${esc(t)}</button>`).join('')}
          </div>
          <p class="cz-paso-ayuda" style="margin:10px 0 0">Sirve para mostrarle solo proveedores con un mínimo de compra que usted pueda cubrir. No se le muestra a nadie más.</p>
        </div>

        <div id="cz-b-paso5" class="cz-paso-b" style="display:none">
          ${cab(5, '¿Dónde está su negocio?')}
          <select id="cz-b-prov" onchange="cotizBProvincia()" style="${INPUT_CSS}">
            <option value="">Elegir provincia</option>
            ${provs.map(r => `<option value="${esc(r)}"${b.provincia === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}
          </select>
        </div>

        <div id="cz-b-vivo" class="cz-vivo-caja" style="display:none"></div>

        <div class="cz-barra cz-vidrio">
          <div id="cz-error" style="display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:10px 12px;font-size:.8rem;margin-bottom:12px"></div>
          ${btnPrimario('Buscar quién me abastezca', 'cotizPublicarB(this)')}
          <div class="cz-barra-nota">Los proveedores ven su nombre, no su teléfono. Usted elige a quién le escribe.</div>
          <div class="cz-barra-nota">Buscar proveedor no lo compromete a nada.</div>
        </div>
      </div>`;
  }

  /* Repinta SOLO lo que cambio. Nunca llama a render(): eso reconstruiria el
     campo de texto abajo del cursor y le borraria lo que viene escribiendo. */
  function pintarFormB() {
    const b = estadoB();

    // Paso 2: aparece apenas escribio algo.
    const hayTexto = b.texto.trim().length >= 3;
    mostrar('cz-b-paso2', hayTexto, false);

    const cont = $('cz-b-chips');
    if (cont) {
      // Los sugeridos que quedaron y ademas los propios que la persona sumo:
      // si escribio "toallas" a mano, ese chip tiene que seguir en pantalla
      // aunque cambie el texto del paso 1 y las sugerencias sean otras.
      const propios = b.elegidos.filter(x => b.sugeridos.indexOf(x) < 0);
      const todos = b.sugeridos.concat(propios);
      cont.innerHTML = todos.map(nom => {
        const on = b.elegidos.indexOf(nom) >= 0;
        const propio = b.sugeridos.indexOf(nom) < 0;
        return `<button type="button" class="cz-chip-prod${propio ? ' propio' : ''}" aria-pressed="${on}"
          onclick="cotizBChip('${jsArg(nom)}')">${esc(nom)}</button>`;
      }).join('');
    }
    const ayuda = $('cz-b-ayuda2');
    if (ayuda) {
      ayuda.textContent = b.sugeridos.length
        ? 'Toque los que le sirvan. Si falta alguno, agréguelo.'
        : 'No encontramos productos de ese rubro. Escriba abajo los que vende.';
    }

    // Los pasos 3, 4 y 5 se encadenan: cada uno espera al anterior. Los tres
    // nacen de un toque, asi que los tres se acercan.
    mostrar('cz-b-paso3', hayTexto && b.elegidos.length > 0, true);
    mostrar('cz-b-paso4', !!b.yaVende && b.elegidos.length > 0, true);
    mostrar('cz-b-paso5', !!b.inversion && !!b.yaVende, true);

    pintarPresionado('cz-b-vende', b.yaVende);
    pintarPresionado('cz-b-inv', b.inversion);
    pintarVivoB();
  }

  /* `traer` = el paso aparece porque la persona ACABA de tocar algo, asi que
     conviene acercarselo. En el paso 2 va en false: ese aparece mientras
     escribe, y moverle la pantalla abajo del teclado mientras tipea es
     exactamente lo contrario de ayudar. */
  function mostrar(id, si, traer) {
    const el = $(id);
    if (!el) return;
    const antes = el.style.display !== 'none';
    el.style.display = si ? 'block' : 'none';
    // Solo cuando el paso aparece de nuevo, no en cada repintado: si no, el
    // bloque se despliega entero cada vez que se toca un chip.
    if (si && !antes) desplegar(el, traer);
  }

  /* Despliega el paso que acaba de aparecer.

     Se anima el ALTO, no solo la opacidad. Lo brusco nunca fue que el bloque
     apareciera: era que la barra de accion y todo lo de abajo saltaran de una
     los 120px que ocupa el paso nuevo. El alto hay que medirlo aca porque a
     `auto` no se le puede animar, y porque depende de cuantos chips entraron.

     El margen se anima JUNTO con el alto. Dejandolo fijo, lo de abajo se corre
     los 22px enteros en el primer fotograma y el salto vuelve, mas chico.

     Sin `el.animate` (WebView vieja) el paso aparece como aparecia antes: la
     animacion es decoracion, el formulario funciona igual. */
  function desplegar(el, traer) {
    const acercar = () => {
      if (!traer) return;
      // 'nearest' no hace nada si el paso ya se ve entero. Solo corrige el
      // caso real: el paso 4 o 5 naciendo abajo del borde de la pantalla.
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { }
    };

    let quieto = false;
    try { quieto = window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { }
    if (quieto || typeof el.animate !== 'function') { acercar(); return; }

    const alto = el.scrollHeight;
    if (!alto) { acercar(); return; }

    // Mientras el alto va en menos del real, el contenido sobra por abajo y se
    // veria encima del bloque que sigue.
    const overflowPrevio = el.style.overflow;
    el.style.overflow = 'hidden';

    const anim = el.animate([
      { height: '0px', marginBottom: '0px', opacity: 0, transform: 'translateY(8px)' },
      { height: alto + 'px', marginBottom: '22px', opacity: 1, transform: 'none' }
    ], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });

    // Se devuelve el overflow SIEMPRE, tambien si la animacion se cancela
    // (la persona contesto el paso siguiente antes de que terminara). Sin
    // esto, un paso podria quedarse recortado para siempre.
    const limpiar = () => { el.style.overflow = overflowPrevio; };
    anim.addEventListener('finish', limpiar);
    anim.addEventListener('cancel', limpiar);
    // Se acerca durante el despliegue, no despues: encadenarlos se siente
    // como dos movimientos separados en vez de uno solo.
    acercar();
  }

  function pintarPresionado(contId, valor) {
    const cont = $(contId);
    if (!cont) return;
    Array.from(cont.children).forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.v === valor ? 'true' : 'false');
    });
  }

  let temporizadorB = null;

  window.cotizBTexto = function () {
    const b = estadoB();
    b.texto = ($('cz-b-texto')?.value || '');
    clearTimeout(temporizadorB);
    temporizadorB = setTimeout(() => {
      const nuevos = chipsSugeridos(b.texto);
      const rubro = rubroDeTermino(b.texto) || '';
      // Si el rubro deducido no cambio, no se tocan los chips: repintarlos
      // borraria lo que ya venia marcado por nada.
      if (rubro !== b.rubro) {
        b.rubro = rubro;
        b.sugeridos = nuevos;
        // Se conservan solo los que la persona escribio a mano; las
        // sugerencias viejas eran de otro rubro y ya no aplican.
        b.elegidos = b.elegidos.filter(x => nuevos.indexOf(x) >= 0 || b.sugeridos.indexOf(x) < 0);
        b.conteo = null;
      }
      pintarFormB();
    }, 280);
  };

  window.cotizBChip = function (nom) {
    const b = estadoB();
    const i = b.elegidos.indexOf(nom);
    if (i >= 0) b.elegidos.splice(i, 1); else b.elegidos.push(nom);
    vibrar('light');
    pintarFormB();
  };

  window.cotizBSumar = function () {
    const b = estadoB();
    const inp = $('cz-b-propio');
    const v = (inp?.value || '').trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (b.elegidos.length >= 12) { toast('Hasta 12 productos por pedido'); return; }
    // Sin distinguir mayusculas: "Toallas" y "toallas" son el mismo producto
    // y duplicarlos dejaria el pedido pidiendo dos veces lo mismo.
    if (!b.elegidos.some(x => x.toLowerCase() === v.toLowerCase())) b.elegidos.push(v);
    if (inp) inp.value = '';
    vibrar('light');
    pintarFormB();
  };

  window.cotizBTecla = function (ev) {
    if (ev && ev.key === 'Enter') { ev.preventDefault(); window.cotizBSumar(); }
  };

  window.cotizBVende = function (v) {
    const b = estadoB();
    b.yaVende = v; vibrar('light'); pintarFormB();
  };

  window.cotizBInversion = function (v) {
    const b = estadoB();
    b.inversion = v; b.conteo = null; vibrar('light'); pintarFormB();
  };

  window.cotizBProvincia = function () {
    const b = estadoB();
    b.provincia = $('cz-b-prov')?.value || '';
    b.conteo = null;
    pintarFormB();
  };

  /* Bloque de resultado en vivo. Aparece recien con la provincia elegida,
     que es cuando por fin hay con que contestar algo cierto.
     El conteo se cachea en b.conteo y se invalida cuando cambia el rubro, la
     inversion o la provincia: sin eso se dispararia una consulta por tecla. */
  async function pintarVivoB() {
    const b = estadoB();
    const caja = $('cz-b-vivo');
    if (!caja) return;

    const listo = b.rubro && b.provincia && b.inversion && b.elegidos.length;
    if (!listo) { caja.style.display = 'none'; return; }

    if (b.conteo === null && !b.contando) {
      b.contando = true;
      caja.style.display = 'block';
      caja.innerHTML = `<div class="cz-vivo-fila"><span class="cz-vivo-txt">Buscando proveedores de ${esc(b.rubro)}...</span></div>`;
      const c = await contarProveedores(b.rubro, b.provincia);
      b.contando = false;
      // Mientras se contaba, la persona pudo cambiar algo o irse: se descarta.
      if (st.vista !== 'publicarB') return;
      b.conteo = c || { n: 0, enProv: 0, lista: [] };
    }
    if (b.conteo === null) return;

    const { n, enProv, lista } = b.conteo;
    const dentro = dentroDelPresupuesto(lista, b.inversion);

    if (!n) {
      caja.innerHTML = `<div class="cz-vivo-fila">${ICO.lupaChica}
        <span class="cz-vivo-txt">Todavía no hay proveedores de <b>${esc(b.rubro)}</b> aprobados. Su pedido queda publicado 14 días y lo usamos para salir a buscarlos.</span>
      </div>`;
    } else {
      caja.innerHTML = `<div class="cz-vivo-fila">${ICO.lupaChica}
          <span class="cz-vivo-txt"><b>${n} ${n === 1 ? 'proveedor' : 'proveedores'}</b> de ${esc(b.rubro)} pueden ver su pedido${enProv ? `, <b>${enProv}</b> en ${esc(b.provincia)}` : ''}.</span>
        </div>
        ${dentro !== null ? `<div class="cz-vivo-fila">${ICO.chequeRedondo}
          <span class="cz-vivo-txt"><b>${dentro}</b> ${dentro === 1 ? 'trabaja' : 'trabajan'} con un mínimo de compra que entra en lo que piensa invertir.</span>
        </div>` : ''}`;
    }
    caja.style.display = 'block';
  }

  window.cotizPublicarB = async function (btn) {
    const b = estadoB();
    const err = $('cz-error');
    const fallar = m => { if (err) { err.textContent = m; err.style.display = 'block'; } vibrar('error'); };

    if (b.texto.trim().length < 3) return fallar('Escriba qué quiere vender.');
    if (!b.elegidos.length) return fallar('Elija o agregue al menos un producto que quiera vender.');
    if (!b.yaVende) return fallar('Díganos si ya está vendiendo o recién arranca.');
    if (!b.inversion) return fallar('Elija cuánto piensa invertir en la primera compra.');
    if (!b.provincia) return fallar('Elija dónde está su negocio.');
    if (err) err.style.display = 'none';

    // El rubro puede no haberse deducido (escribio algo que el diccionario no
    // conoce). El pedido igual vale: cae en "Otro" y sigue estando en el feed
    // publico, donde lo ven todos los proveedores.
    const rubro = b.rubro || 'Otro';

    const datos = {
      tipo: TIPO_B,
      // El titulo lo arma la pantalla y no la persona: en un pedido de
      // proveedor lo que identifica al pedido es el rubro, no una frase.
      // El CHECK de la base pide entre 3 y 160 caracteres; esto siempre entra.
      titulo: 'Busco proveedor de ' + rubro,
      rubro,
      provincia: b.provincia,
      productos: b.elegidos.slice(0, 12),
      yaVende: b.yaVende,
      inversion: b.inversion,
      detalles: b.texto.trim() ? 'Quiere vender: ' + b.texto.trim() : null,
      cantidad: null, unidad: null, presupuesto: null, foto: null
    };

    if (!currentUser) {
      guardarBorrador({ ...datos, intento: true });
      try { if (typeof trackEvent === 'function') trackEvent('rfq_login_pedido', { rubro: rubro }); } catch (e) { }
      vibrar('light');
      st.vista = 'login';
      return render();
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Buscando...'; btn.style.opacity = '.7'; }
    const r = await publicarPedido(datos);
    if (r.ok) {
      limpiarBorrador();
      await irAResultadoB(datos, b.conteo);
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Buscar quién me abastezca'; btn.style.opacity = '1'; }
    fallar(r.mensaje);
  };

  /* ---------------- RESULTADO DEL PEDIDO B ----------------

     El pedido es la parte LENTA: alguien tiene que entrar, mirarlo y
     contestar. El directorio es la respuesta instantanea: proveedores del
     rubro que ya estan cargados, con su pedido minimo real.

     Por eso esta pantalla no es un acuse de recibo con un boton: es el acuse
     de recibo Y una lista con la que puede empezar a trabajar ahora mismo.
     Nadie se va con las manos vacias. */
  async function irAResultadoB(datos, conteoPrevio) {
    st.resultadoB = {
      rubro: datos.rubro, provincia: datos.provincia,
      productos: datos.productos, inversion: datos.inversion,
      conteo: conteoPrevio || null
    };
    st.vista = 'resultadoB';
    st.cargando = false;
    st.formB = null;              // el formulario se vacia: el pedido ya salio
    render();

    if (!st.resultadoB.conteo) {
      const c = await contarProveedores(datos.rubro, datos.provincia);
      if (st.vista !== 'resultadoB' || !st.resultadoB) return;
      st.resultadoB.conteo = c || { n: 0, enProv: 0, lista: [] };
      render();
    }
  }

  function pantallaResultadoB() {
    const r = st.resultadoB;
    if (!r) return pantallaFeed();
    const c = r.conteo;
    const lista = (c && c.lista ? c.lista : []).slice(0, 6);
    const techo = techoInversion(r.inversion);

    const tarjeta = p => {
      const fuera = techo !== null && isFinite(techo) && minimoEnPesos(p.pedido_minimo) > techo;
      const wa = p.whatsapp
        ? `<button class="nv-cta-full" style="flex:1;min-height:44px;padding:5px 6px 5px 14px;font-size:.82rem"
             onclick="cotizContactarDirecto('${jsArg(p.id)}')">
             <span style="display:inline-flex;align-items:center;gap:7px">${ICO.wa} Contactar</span>
             <span class="nv-redondel" style="width:30px;height:30px">${ICO.flecha}</span></button>`
        : '';
      return `<div class="cz-bandeja${fuera ? ' cz-fuera' : ''}" style="margin-bottom:10px"><div class="cz-nucleo">
        <div style="display:flex;align-items:center;gap:11px;margin-bottom:11px">
          ${p.logo_url
          ? `<div style="width:40px;height:40px;border-radius:11px;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${esc(p.logo_url)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()"></div>`
          : avatar(p.nombre, null, 40)}
          <div style="flex:1;min-width:0">
            <div style="font-size:.86rem;font-weight:800;color:#1A1A1A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.nombre || 'Proveedor')}</div>
            <div style="font-size:.73rem;color:${TENUE};margin-top:2px">${esc(p.provincia || '')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:11px">
          <span style="font-size:.72rem;color:${TENUE}">Mínimo de compra</span>
          <span style="font-size:.88rem;font-weight:800;color:${fuera ? '#92400E' : '#1A1A1A'}">${esc(p.pedido_minimo || 'Consultar')}</span>
        </div>
        ${fuera ? `<div class="cz-aviso-ambar">${ICO.alerta}<span>Su mínimo está por encima de lo que indicó que pensaba invertir.</span></div>` : ''}
        <div style="display:flex;gap:8px">
          ${wa}
          ${btnSec('Ver perfil', `cotizVerPerfil('${jsArg(p.id)}')`)}
        </div>
      </div></div>`;
    };

    const n = c ? c.n : null;
    const bajada = n === null ? 'Ya está publicado. Le avisamos apenas alguien le responda.'
      : n === 0 ? 'Todavía no hay proveedores de ' + esc(r.rubro) + ' aprobados. Su pedido queda abierto 14 días y lo usamos para salir a buscarlos.'
        : 'Su pedido ya lo pueden ver ' + n + ' ' + (n === 1 ? 'proveedor' : 'proveedores') + ' de ' + esc(r.rubro) + '.';

    return header('Su pedido está publicado', "cotizIr('feed')") + `
      <div class="cz-ancho" style="padding:22px 16px 40px">
        <div style="text-align:center;margin-bottom:22px">
          <div class="cz-ok-redondel" aria-hidden="true">${ICO.chequeRedondo}</div>
          <h2 class="cz-ok-tit">Buscamos quién le abastezca ${esc(r.rubro)}</h2>
          <p class="cz-ok-baj">${bajada}</p>
          <p class="cz-ok-repetir">No hace falta que lo vuelva a publicar.</p>
        </div>

        ${lista.length ? `
          <div style="display:flex;align-items:center;gap:10px;margin:0 0 14px">
            <span style="height:1px;flex:1;background:${BORDE}"></span>
            <span style="font-size:.7rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${TENUE}">Mientras tanto</span>
            <span style="height:1px;flex:1;background:${BORDE}"></span>
          </div>
          <div style="font-size:.95rem;font-weight:800;color:#1A1A1A;margin-bottom:4px">Estos ya venden lo que busca</div>
          <div style="font-size:.82rem;color:${GRIS};line-height:1.5;margin-bottom:14px">Puede escribirles ahora mismo, sin esperar a que le respondan el pedido.</div>
          ${lista.map(tarjeta).join('')}
        ` : ''}

        <div style="margin-top:18px">${btnPrimario('Ver mis pedidos', "cotizIr('mis')")}</div>
      </div>`;
  }

  // Contacto directo desde el directorio. Es la misma metrica de siempre
  // (registrarContactoWA), asi que estas consultas cuentan igual que las que
  // salen del perfil de un proveedor.
  window.cotizContactarDirecto = function (provId) {
    const c = st.resultadoB && st.resultadoB.conteo;
    const p = (c && c.lista || []).find(x => String(x.id) === String(provId));
    if (!p) return;
    const r = st.resultadoB;
    const que = (r.productos || []).slice(0, 4).join(', ');
    const msg = `Hola! Soy ${currentUser?.name || ''} de EmprendeGO. ` +
      `Estoy buscando un proveedor de ${r.rubro}${que ? ' (' + que + ')' : ''}. ` +
      '¿Me pasa lista de precios y su mínimo de compra?';
    try { registrarContactoWA(provId, p); } catch (e) { }
    try { abrirWA(p.whatsapp, msg); } catch (e) { toast('WhatsApp no disponible'); }
  };

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

  // Solo se lee cuando el select esta a la vista, o sea cuando no se detecto
  // nada o la persona toco "cambiar". La pista del caso automatico se fue con
  // el select: ahora eso lo dice el propio cartel "Rubro detectado: X".
  const PISTA_RUBRO = 'Es lo que hace que su pedido le llegue a los proveedores de ese rubro.';

  /* ---------------- TITULO DEMASIADO VAGO ----------------
     Una sola palabra generica ("textil", "ropa", "perfumes") no es un pedido:
     el proveedor no sabe que cotizar y no puede preguntar, porque a proposito
     no ve el contacto del comprador. El pedido se queda sin respuestas y la
     seccion parece muerta.

     Se AVISA, no se bloquea. Poner un muro mas en el unico formulario que
     tiene la seccion es la forma mas rapida de quedarse sin pedidos: ya se
     pierde gente de sobra en el login. */
  const AVISO_TITULO_VAGO = 'Con una sola palabra el proveedor no sabe qué cotizar. Agregue material, modelo, color o medida.';

  function tituloVago(t) {
    const limpio = String(t || '').trim().replace(/\s+/g, ' ');
    if (limpio.length < 3) return false;          // de eso ya se ocupa validarPedido()
    if (/\d/.test(limpio)) return false;          // "medias 3/4" ya dice algo
    return limpio.indexOf(' ') === -1;            // una sola palabra
  }

  function pintarAvisoTitulo() {
    const el = $('cz-titulo-aviso'), tit = $('cz-titulo');
    if (!el || !tit) return;
    el.style.display = tituloVago(tit.value) ? 'block' : 'none';
  }

  /* ---------------- RUBRO DETECTADO DESDE EL TITULO ----------------
     El rubro es obligatorio: sin el, el pedido no le llega a los proveedores
     de ningun rubro en particular. Pero pedirselo con un <select> de 27
     opciones era hacerle hacer a la persona un trabajo de taxonomia que no le
     interesa y que ademas hace mal (elige "Otro" y el pedido muere ahi).

     Ahora lo deduce rubroDeTermino() de lo que escribio, y la pantalla lo
     MUESTRA para que lo pueda corregir: "Rubro detectado: X · cambiar".
     El <select> sigue existiendo en el DOM, escondido, y es el que lee
     leerFormulario(). O sea: el camino de los datos no cambio en nada, cambio
     quien lo completa.

     Nunca pisa una eleccion manual: apenas la persona toca "cambiar" se marca
     el select como tocado y el automatico se calla para siempre. */

  let temporizadorRubro = null;

  window.cotizAutoRubro = function () {
    clearTimeout(temporizadorRubro);
    temporizadorRubro = setTimeout(function () {
      aplicarRubroSugerido();
      pintarAvisoTitulo();
    }, 250);
  };

  function aplicarRubroSugerido() {
    const sel = $('cz-rubro'), tit = $('cz-titulo');
    if (!sel || !tit || sel.dataset.tocado === '1') return;
    const t = tit.value.trim();
    // Con menos de 4 caracteres rubroDeTermino() puede enganchar por la rama
    // de "la clave contiene lo escrito" y tirar cualquier cosa a media palabra.
    if (t.length < 4) return;
    const r = rubroDeTermino(t);
    if (!r || r === sel.value) { pintarRubro(); return; }
    if (!Array.from(sel.options).some(o => o.value === r)) return;
    sel.value = r;
    pintarRubro();
  }

  /* Decide cual de las dos caras se ve: el cartel con el rubro detectado, o el
     <select> para elegirlo a mano. Se llama despues de cada tecla del titulo y
     al abrir el formulario.

     Con el select tocado a mano, o sin nada detectado, gana el select: no hay
     forma de quedarse sin manera de cargar el rubro. */
  function pintarRubro() {
    const sel = $('cz-rubro'), auto = $('cz-rubro-auto'), manual = $('cz-rubro-manual');
    if (!sel || !auto || !manual) return;
    const detectado = sel.dataset.tocado !== '1' && !!sel.value;
    auto.style.display = detectado ? 'flex' : 'none';
    manual.style.display = detectado ? 'none' : 'block';
    if (detectado) {
      const nom = $('cz-rubro-nombre');
      if (nom) nom.textContent = sel.value;
    }
  }

  window.cotizRubroCambiar = function () {
    const sel = $('cz-rubro');
    if (!sel) return;
    sel.dataset.tocado = '1';
    pintarRubro();
    vibrar('light');
    try { sel.focus({ preventScroll: true }); } catch (e) { }
  };

  /* ---------------- CANTIDAD POR ATAJOS ----------------
     El campo numerico en blanco pedia una precision que el comprador muchas
     veces no tiene todavia, y quedarlo vacio era la unica salida: el pedido
     salia sin cantidad y sin decir por que. Ahora "La que ustedes manejen" es
     una respuesta explicita y es la que viene elegida.

     El texto de ese chip decia "No sé, dígame su mínimo". Se cambio porque
     ninguna de las dos mitades ayudaba: "no sé" obliga al comprador a
     declararse perdido para usar la opcion mas razonable del formulario, y
     "dígame su mínimo" describe lo que hace el proveedor, no lo que el
     comprador esta contestando. La pregunta es "¿que cantidad necesita?" y
     ahora la respuesta es una cantidad, no una disculpa.

     Sigue siendo la opcion por defecto: sacarla devolveria el campo numerico
     vacio como unica salida para el que todavia no sabe cuanto comprar, que
     es exactamente donde se caia antes.

     Los tres atajos numericos no son magia: son los tres numeros que aparecen
     en casi todos los pedidos reales que ya estan publicados. */

  const CANT_ATAJOS = ['20', '50', '100'];

  /* Cuantas unidades reales representa cada unidad de medida.
     Solo la docena tiene un factor honesto. Un "pack" o una "caja" no tienen
     tamaño fijo, asi que cuentan como uno: inventarles un multiplicador haria
     saltar el aviso de cantidad absurda cuando no corresponde.

     OJO: el prototipo disparaba el aviso SOLO si la unidad era "docenas", asi
     que "500.000 unidades" pasaba sin que nadie dijera nada. Se mide el total
     real, sea cual sea la unidad. */
  const UNIDADES_POR = { docenas: 12 };
  const CANT_ABSURDA = 30000;

  function totalEnUnidades(cantidad, unidad) {
    const n = Number(String(cantidad == null ? '' : cantidad).replace(/[^0-9]/g, ''));
    if (!isFinite(n) || n <= 0) return 0;
    return n * (UNIDADES_POR[unidad] || 1);
  }

  // Modo inicial a partir de lo que venga cargado (prefill o borrador). Un
  // pedido guardado con cantidad "500" tiene que reabrir en "Otra cantidad"
  // con el 500 puesto, no en el modo por defecto.
  function modoDeCantidad(cant) {
    const c = String(cant || '').trim();
    if (!c) return 'minimo';
    return CANT_ATAJOS.indexOf(c) >= 0 ? c : 'otra';
  }

  window.cotizCantModo = function (modo) {
    st.cantModo = modo;
    vibrar('light');
    pintarCantidad();
    // Al pasar a "Otra cantidad" el campo aparece recien ahora: hay que
    // llevarle el foco, si no queda un input nuevo que nadie toco.
    if (modo === 'otra') { const i = $('cz-cantidad'); if (i) try { i.focus({ preventScroll: true }); } catch (e) { } }
  };

  /* Repinta SOLO el bloque de cantidad. Nunca llama a render(): repintar la
     pantalla entera en medio del formulario le borraria a la persona todo lo
     que venia escribiendo en los otros campos. */
  function pintarCantidad() {
    const chips = $('cz-cant-chips');
    if (chips) Array.from(chips.children).forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.modo === st.cantModo ? 'true' : 'false');
    });

    const esMinimo = st.cantModo === 'minimo';
    const caja = $('cz-cant-unidad'), otra = $('cz-cant-otra'), nota = $('cz-cant-nota');
    if (caja) caja.style.display = esMinimo ? 'none' : 'block';
    if (otra) otra.style.display = st.cantModo === 'otra' ? 'block' : 'none';
    if (nota) nota.style.display = esMinimo ? 'block' : 'none';

    pintarAvisoCantidad();
  }

  // Aviso suave, nunca un bloqueo: mismo criterio que el aviso de titulo vago.
  // Poner un muro mas en el unico formulario de la seccion es la forma mas
  // rapida de quedarse sin pedidos.
  function pintarAvisoCantidad() {
    const el = $('cz-cant-absurdo');
    if (!el) return;
    const d = leerCantidad();
    const total = totalEnUnidades(d.cantidad, d.unidad);
    if (total <= CANT_ABSURDA) { el.style.display = 'none'; return; }
    const txt = $('cz-cant-absurdo-txt');
    if (txt) {
      txt.textContent = 'Eso da ' + total.toLocaleString('es-AR') + ' unidades. ' +
        'Si es correcto, siga adelante. Si se le fue un cero, corríjalo ahora: ' +
        'un pedido de esa magnitud puede espantar a los proveedores en vez de atraerlos.';
    }
    el.style.display = 'flex';
  }

  // Cantidad + unidad tal como quedan segun el modo elegido. Lo usan
  // leerFormulario() y el aviso de cantidad, para que los dos lean lo mismo.
  function leerCantidad() {
    const unidadSel = $('cz-unidad')?.value || '';
    const cantidad = st.cantModo === 'minimo' ? null
      : st.cantModo === 'otra' ? (($('cz-cantidad')?.value || '').trim() || null)
        : st.cantModo;
    return {
      cantidad,
      // Sin cantidad la unidad no dice nada, y lo que llegue del select se
      // valida contra la lista: la base tiene un CHECK con los mismos valores
      // y un valor raro haria fallar el insert entero.
      unidad: cantidad && UNIDADES.indexOf(unidadSel) >= 0 ? unidadSel : null
    };
  }

  /* ---------------- FOTO DEL PEDIDO ----------------
     Es la salida para quien no sabe como se llama lo que necesita. Se sube en
     el momento y lo que se guarda es la URL: el borrador vive en localStorage
     y un archivo no entra ahi, una URL si.

     Subir exige sesion (la policy de storage pide auth.uid() no nulo, ver
     sql/2026-08-13_hardening_storage_paso2.sql). Sin sesion se avisa y no se
     abre el selector: la foto es opcional, asi que esto no bloquea nada. */

  window.cotizFotoElegir = function () {
    if (!currentUser) {
      toast('Para adjuntar una foto primero inicie sesión. Puede publicar el pedido sin foto.');
      return;
    }
    const inp = $('cz-foto-input');
    if (inp) inp.click();
  };

  window.cotizFotoCambio = async function (input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Elija una imagen'); input.value = ''; return; }

    const tit = $('cz-foto-tit');
    if (tit) tit.textContent = 'Subiendo la foto...';
    try {
      st.foto = await subirFotoPedido(file);
      vibrar('success');
    } catch (e) {
      console.warn('[cotiz] foto', e);
      toast('No se pudo subir la foto. Puede publicar el pedido sin ella.');
    }
    input.value = '';   // permite volver a elegir el mismo archivo
    pintarFoto();
  };

  window.cotizFotoQuitar = function (ev) {
    // Los dos botones son hermanos, asi que hoy el toque no se propaga. Se
    // corta igual: si algun dia el de quitar vuelve a quedar adentro del otro,
    // quitar la foto abriria el selector de archivos en el mismo toque.
    if (ev && ev.stopPropagation) ev.stopPropagation();
    st.foto = null;
    vibrar('light');
    pintarFoto();
  };

  async function subirFotoPedido(file) {
    // comprimirImagen() es de app.js. Si no estuviera, se sube el original:
    // vale mas una foto pesada que ninguna.
    if (typeof comprimirImagen === 'function') file = await comprimirImagen(file, 1000, 0.72);
    const ext = (String(file.name || 'foto.jpg').split('.').pop() || 'jpg').toLowerCase();
    const uid = (await getUid()) || 'anon';
    // Nombre unico y upsert:false. El bucket 'productos' SOLO tiene policy de
    // INSERT: pedir upsert exigiria UPDATE, que no existe, y devuelve 400.
    const path = `pedidos/${uid}/${Math.random().toString(36).slice(2)}_${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('productos').upload(path, file);
    if (error) throw error;
    const { data } = sb.storage.from('productos').getPublicUrl(path);
    return data.publicUrl;
  }

  function pintarFoto() {
    const fila = $('cz-foto-fila');
    if (!fila) return;
    const caja = $('cz-foto-caja'), tit = $('cz-foto-tit'),
      sub = $('cz-foto-sub'), quitar = $('cz-foto-quitar');
    if (st.foto) {
      fila.classList.add('puesta');
      if (caja) caja.innerHTML = `<img src="${esc(st.foto)}" alt="">`;
      if (tit) tit.textContent = 'Foto adjuntada';
      if (sub) sub.textContent = 'Los proveedores la ven junto con su pedido.';
      if (quitar) quitar.style.display = 'flex';
    } else {
      fila.classList.remove('puesta');
      if (caja) caja.innerHTML = ICO.camara;
      if (tit) tit.textContent = 'Adjuntar una foto (opcional)';
      if (sub) sub.textContent = 'No hace falta que sepa el nombre técnico. Escríbalo como pueda o mande una foto.';
      if (quitar) quitar.style.display = 'none';
    }
  }

  /* Enlace "¿No sabe bien qué pedir?".
     INTERINO: por ahora lleva a la seccion Mercado, que muestra que se esta
     vendiendo de verdad segun las tendencias de ML. La ayuda completa (que
     sugiera productos a partir de lo que escribio y los cargue de vuelta en
     este formulario) queda pendiente.

     Lo escrito se guarda ANTES de salir: irse a mirar ideas no puede costarle
     el pedido que ya venia escribiendo. */
  window.cotizRecomendame = function () {
    try { guardarBorrador({ ...leerFormulario(), intento: false }); } catch (e) { }
    vibrar('light');
    try {
      if (typeof trackEvent === 'function') trackEvent('rfq_recomendame', {});
    } catch (e) { }
    if (typeof window.abrirEmprendedor === 'function') return window.abrirEmprendedor();
    toast('No se pudo abrir la sección Mercado');
  };

  // El presupuesto se carga POR UNIDAD, asi que si la unidad cambia, ese
  // campo tiene que cambiar con ella: "$100.000 por unidad" y "$100.000 por
  // rollo" son dos pedidos distintos, y el campo se completa despues de
  // elegir la unidad. Se toca solo el texto, nunca lo que la persona escribio.
  window.cotizUnidadCambio = function () {
    const u = UNIDAD_SINGULAR[$('cz-unidad')?.value] || 'unidad';
    const inp = $('cz-presup');
    if (inp) inp.placeholder = '$ por ' + u;
    const lbl = document.querySelector('label[for="cz-presup"]');
    if (lbl) lbl.textContent = `Presupuesto máximo por ${u} (opcional)`;
    // Cambiar de "unidades" a "docenas" multiplica por 12 el total real, asi
    // que el aviso de cantidad tiene que recalcularse aca tambien.
    pintarAvisoCantidad();
  };

  window.cotizCantInput = function () { pintarAvisoCantidad(); };

  // El select solo se ve cuando ya se toco "cambiar" (o cuando no se detecto
  // nada), asi que esto es la segunda mitad de esa decision: deja constancia
  // de que el rubro lo eligio una persona y no el detector.
  window.cotizRubroManual = function () {
    const sel = $('cz-rubro');
    if (!sel) return;
    sel.dataset.tocado = '1';
  };

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

    // El rubro con el que arranca el formulario. Si no viene ninguno cargado
    // se deduce del titulo en el momento, para que quien vuelve a un borrador
    // ya vea el cartel resuelto y no un select vacio.
    const rubroInicial = (pre.rubro || rubroDeTermino(pre.titulo || '') || '');

    // `tocado` = lo eligio una persona, no el detector. Solo en ese caso el
    // formulario abre con el select a la vista en vez del cartel. `rubroAuto`
    // lo marca cotizPedirPara(); la comparacion contra el titulo queda para
    // los borradores guardados antes de que existiera esa marca.
    const rubroSugerido = !!(pre.rubro && (pre.rubroAuto || (pre.titulo && rubroDeTermino(pre.titulo) === pre.rubro)));
    const rubroTocado = !!pre.rubro && !rubroSugerido;

    // El modo de cantidad y la foto viven en st porque el formulario se
    // repinta entero en cada render(). Se siembran desde lo que venia cargado.
    st.cantModo = modoDeCantidad(pre.cantidad);
    st.foto = pre.foto || null;
    st.rubroTocado = rubroTocado;

    // Lo que la persona busco NO se copia al titulo: un termino de busqueda
    // no es un pedido. "textil" entro asi y quedo un pedido que ningun
    // proveedor puede cotizar. Se muestra como referencia y lo escribe ella.
    const pistaTitulo = pre.termino
      ? `Buscó <b>“${esc(pre.termino)}”</b>. Escríbalo completo: qué producto, de qué material o modelo, color y medida.`
      : 'Cuanto más preciso, mejor le cotizan. “Remeras” no alcanza; “remeras de algodón blancas talle M” sí.';

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
      <div class="cz-form">
        ${cabecera}

        ${campo('¿Qué necesita comprar?', `<input id="cz-titulo" maxlength="160" value="${esc(pre.titulo || '')}" oninput="cotizAutoRubro()" placeholder="ej: 500 pares de medias deportivas blancas" style="${INPUT_CSS}">`, pistaTitulo)}
        <div id="cz-titulo-aviso" style="${tituloVago(pre.titulo) ? '' : 'display:none;'}background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:10px;padding:9px 12px;font-size:.76rem;line-height:1.45;margin:-10px 0 16px">${AVISO_TITULO_VAGO}</div>

        <div style="margin-bottom:16px">
          <label for="cz-rubro" style="display:block;font-size:.82rem;font-weight:700;color:#1A1A1A;margin-bottom:6px">Rubro</label>
          <div id="cz-rubro-auto" class="cz-rubro-auto" style="display:none">
            ${ICO.chequeRedondo}
            <span>Rubro detectado: <b id="cz-rubro-nombre"></b></span>
            <button type="button" class="cz-rubro-cambiar" onclick="cotizRubroCambiar()">cambiar</button>
          </div>
          <div id="cz-rubro-manual" style="display:none">
            <select id="cz-rubro" onchange="cotizRubroManual()" style="${INPUT_CSS}"><option value="">Elegir rubro</option>${rubros.map(r => `<option value="${esc(r)}"${rubroInicial === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
            <div style="font-size:.72rem;color:${TENUE};margin-top:5px">${PISTA_RUBRO}</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:2px">
          <button type="button" id="cz-foto-fila" class="cz-foto" onclick="cotizFotoElegir()">
            <span id="cz-foto-caja" class="cz-foto-caja" aria-hidden="true">${ICO.camara}</span>
            <span style="flex:1;min-width:0">
              <span id="cz-foto-tit" class="cz-foto-tit" style="display:block">Adjuntar una foto (opcional)</span>
              <span id="cz-foto-sub" class="cz-foto-sub" style="display:block">No hace falta que sepa el nombre técnico. Escríbalo como pueda o mande una foto.</span>
            </span>
          </button>
          <button type="button" id="cz-foto-quitar" class="cz-foto-quitar" aria-label="Quitar la foto"
            style="display:none" onclick="cotizFotoQuitar(event)">${ICO.cruz}</button>
        </div>
        <input type="file" id="cz-foto-input" class="cz-oculto" accept="image/*"
          onchange="cotizFotoCambio(this)" tabindex="-1" aria-hidden="true">

        <div style="margin:16px 0">
          <label style="display:block;font-size:.82rem;font-weight:700;color:#1A1A1A;margin-bottom:8px">¿Qué cantidad necesita?</label>
          <div id="cz-cant-chips" class="cz-cant">
            ${[...CANT_ATAJOS.map(v => [v, v]), ['otra', 'Otra cantidad'], ['minimo', 'La que ustedes manejen']]
        .map(([modo, txt]) => `<button type="button" class="cz-cant-chip" data-modo="${modo}" aria-pressed="false" onclick="cotizCantModo('${modo}')">${esc(txt)}</button>`).join('')}
          </div>
          <div id="cz-cant-unidad" style="display:none;margin-bottom:10px">
            <div style="display:flex;gap:8px">
              <div id="cz-cant-otra" style="display:none;flex:1;min-width:0">
                <input id="cz-cantidad" inputmode="numeric" value="${esc(pre.cantidad || '')}" placeholder="ej: 500" aria-label="Cantidad" oninput="cotizCantInput()" style="${INPUT_CSS}">
              </div>
              <select id="cz-unidad" aria-label="Unidad de medida" onchange="cotizUnidadCambio()" style="${INPUT_CSS};flex:1;min-width:0">${UNIDADES.map(u => `<option value="${u}"${uPlural(pre) === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
            </div>
            <div style="font-size:.72rem;color:${TENUE};margin-top:5px">Metros, rollos, pares, kilos... La unidad cambia por completo el precio que le van a pasar.</div>
          </div>
          <div id="cz-cant-nota" class="cz-cant-nota" style="display:none">Cada proveedor le va a responder con su cantidad mínima y el precio a esa cantidad. Usted compara y elige.</div>
          <div id="cz-cant-absurdo" class="cz-aviso-ambar" style="display:none">${ICO.alerta}<span id="cz-cant-absurdo-txt"></span></div>
        </div>

        ${campo('¿Dónde lo necesita?', `<select id="cz-prov" style="${INPUT_CSS}"><option value="">Elegir provincia</option>${provs.map(r => `<option value="${esc(r)}"${pre.provincia === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>`)}
        ${campo('Detalles (opcional)', `<textarea id="cz-detalles" rows="3" maxlength="600" placeholder="Colores, talles, material, packaging, plazo..." style="${INPUT_CSS};resize:vertical">${esc(pre.detalles || '')}</textarea>`)}
        ${campo(`Presupuesto máximo por ${uSingular(pre)} (opcional)`, `<input id="cz-presup" inputmode="decimal" value="${esc(pre.presupuesto || '')}" placeholder="$ por ${uSingular(pre)}" style="${INPUT_CSS}">`, 'Ayuda a que le coticen en serio. Si lo deja vacío, no se muestra.')}

        <div style="font-size:.74rem;color:${TENUE};line-height:1.5;margin-bottom:4px">El pedido queda abierto 14 días. Puede cerrarlo cuando quiera.</div>

        <div class="cz-barra cz-vidrio">
          <div id="cz-error" style="${errPend ? '' : 'display:none;'}background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:10px 12px;font-size:.8rem;margin-bottom:12px">${errPend ? esc(errPend) : ''}</div>
          ${btnPrimario('Publicar pedido', 'cotizPublicar(this)')}
          <button type="button" class="cz-link" onclick="cotizRecomendame()">¿No sabe bien qué pedir? Recomendame</button>
          <div class="cz-barra-nota">Los proveedores ven su nombre, no su teléfono. Usted elige a quién le escribe.</div>
          <div class="cz-barra-nota">Pedir precio no lo compromete a nada.</div>
        </div>
      </div>`;
  }

  // Lo que el usuario escribio, sin nada de identidad: es lo que se guarda
  // como borrador mientras inicia sesion.
  function leerFormulario() {
    const { cantidad, unidad } = leerCantidad();
    return {
      titulo: ($('cz-titulo')?.value || '').trim(),
      cantidad,
      unidad,
      // El select del rubro sigue siendo la fuente de verdad aunque este
      // escondido detras del cartel "Rubro detectado": lo completa el detector
      // o lo completa la persona, pero se lee siempre del mismo lugar.
      rubro: $('cz-rubro')?.value || null,
      provincia: $('cz-prov')?.value || null,
      detalles: ($('cz-detalles')?.value || '').trim() || null,
      presupuesto: parsearMonto($('cz-presup')?.value),
      // Ya es una URL de Storage: la subida pasa cuando se elige el archivo,
      // no al publicar. Asi el borrador de localStorage la puede guardar.
      foto: st.foto || null
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
    // Antes caia derecho en "Mis pedidos", que es una lista: no confirmaba
    // nada. Ahora pasa por el acuse de recibo; ver pantallaConfirmado().
    if (r.ok) { limpiarBorrador(); await irAConfirmacion(datos); return; }
    if (btn) { btn.disabled = false; btn.textContent = 'Publicar pedido'; btn.style.opacity = '1'; }
    mostrarErr(r.mensaje);
  };

  /* "Esta columna no existe". PostgREST lo dice de dos formas segun por donde
     falle: PGRST204 cuando no la encuentra en su cache de esquema, y 42703
     (undefined_column) cuando el error sube directo de Postgres. Se miran las
     dos, y ademas el texto, porque el codigo cambio entre versiones. */
  function esColumnaFaltante(error) {
    const cod = String(error?.code || '');
    if (cod === 'PGRST204' || cod === '42703') return true;
    return /column .* does not exist|could not find the .* column/i.test(String(error?.message || ''));
  }

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
      unidad: datos.unidad || null,
      rubro: datos.rubro || null,
      provincia: datos.provincia || null,
      detalles: datos.detalles || null,
      presupuesto: datos.presupuesto
    };

    // La foto viaja en foto_url, que llega con
    // sql/2026-08-19_solicitudes_foto.sql. Se agrega solo si hay foto: asi un
    // pedido sin foto se publica igual aunque la migracion todavia no se haya
    // corrido.
    if (datos.foto) fila.foto_url = datos.foto;

    /* Los campos del pedido de proveedor. Solo viajan si el pedido ES de
       proveedor: un pedido de producto no manda tipo y cae en el default
       'producto' de la base, asi que sigue publicandose igual aunque la
       migracion de la fase 4 no este corrida.

       Para el tipo B NO hay reintento sin columnas, a diferencia de la foto:
       un pedido de proveedor al que se le sacan los productos y el tipo no es
       un pedido degradado, es basura en el feed. Si falla, falla con un
       mensaje que se entiende. */
    const esB = datos.tipo === TIPO_B;
    if (esB) {
      fila.tipo = TIPO_B;
      fila.productos = (datos.productos || []).slice(0, 12);
      fila.ya_vende = datos.yaVende || null;
      fila.inversion = datos.inversion || null;
    }

    try {
      // OJO: insert() SIN .select(). Encadenar .select() hace que PostgREST
      // devuelva la fila entera, incluida usuario_email, que esta revocada a
      // proposito -> "permission denied for table solicitudes" (42501).
      // Verificado contra el API real: sin .select() da 201, con .select() da 403.
      let { error } = await sb.from('solicitudes').insert(fila);

      // Si la columna todavia no existe (migracion sin correr), PostgREST
      // rechaza la fila ENTERA. Antes que perder el pedido, se reintenta sin
      // la foto y se avisa. Es el unico caso en que vale la pena reintentar:
      // el pedido es lo importante, la foto es un extra.
      let sinFoto = false;
      if (error && esB && esColumnaFaltante(error)) {
        console.warn('[cotiz] faltan las columnas de la fase 4', error);
        throw Object.assign(new Error('falta migracion fase 4'), { czMigracion: true });
      }
      if (error && fila.foto_url && esColumnaFaltante(error)) {
        console.warn('[cotiz] falta solicitudes.foto_url; se publica sin foto', error);
        delete fila.foto_url;
        sinFoto = true;
        ({ error } = await sb.from('solicitudes').insert(fila));
      }
      if (error) throw error;
      vibrar('success');
      toast(sinFoto ? 'Pedido publicado (la foto no se pudo adjuntar)' : 'Pedido publicado');
      try { if (typeof trackEvent === 'function') trackEvent('rfq_publicado', { rubro: fila.rubro || '', provincia: fila.provincia || '' }); } catch (e) { }
      return { ok: true };
    } catch (e) {
      console.warn('[cotiz] publicar', e);
      // El tope de pedidos por dia lo pone un trigger en la base
      // (limite_solicitudes_por_dia). El mensaje que tira ya esta escrito para
      // que lo lea una persona, asi que se muestra tal cual: decirle "no se
      // pudo publicar" cuando en realidad llego al tope no explica nada.
      const esAviso = e?.hint === 'limite_diario' || String(e?.code || '') === 'P0001';
      if (e && e.czMigracion) {
        return {
          ok: false,
          mensaje: 'Esta función todavía no está habilitada en el servidor. Pruebe con "Un producto puntual, en cantidad".'
        };
      }
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

  /* ---------------- ACUSE DE RECIBO ----------------

     POR QUE EXISTE: un comprador publico el mismo pedido tres veces en dos
     dias. No estaba impaciente: no tenia forma de saber si le habia llegado a
     alguien. Publicaba, volvia al feed y no pasaba nada visible, asi que
     asumia que se habia perdido y lo escribia de nuevo.

     Por eso la frase que mas trabaja de esta pantalla no es el numero, es
     "No hace falta que lo vuelva a publicar".

     SOBRE EL NUMERO: es real, sale de contar proveedores aprobados del rubro.
     Y dice "lo pueden ver", no "se envio": hoy al proveedor no le llega
     ninguna notificacion, el pedido aparece en el listado publico y el entra a
     mirarlo. El dia que exista el aviso al proveedor, esta frase cambia.
     Prometer un envio que no ocurre es exactamente el tipo de mentira que
     despues hace que nadie crea en los numeros de la seccion. */

  /* Cuenta contra la base, no contra una estimacion.

     Se traen las filas y se filtra en el cliente en vez de resolverlo con un
     .eq(): proveedores.rubro es una LISTA separada por comas (hasta 7) y
     ademas puede tener nombres viejos ("Moda" por "Indumentaria"). El unico
     lugar donde esa equivalencia esta bien resuelta es matchesCat() de
     app.js, que es la misma que usa el directorio. Usando esa, el numero de
     esta pantalla no puede contradecir a lo que la persona ve si despues
     entra a buscar proveedores de ese rubro.

     Son dos columnas de ~130 filas: pesa nada. El .limit(1000) es el tope que
     la API de Supabase aplica igual; si algun dia hay mas de mil proveedores
     aprobados, esto empieza a quedarse corto y hay que paginar con .range(). */
  async function contarProveedores(rubro, provincia) {
    if (!rubro) return null;
    try {
      // Se piden tambien las columnas con las que despues se pinta el
      // directorio en la pantalla de resultado del pedido B: es la misma
      // consulta, no una segunda.
      const { data, error } = await sb.from('proveedores')
        .select('id,nombre,logo_url,rubro,provincia,pedido_minimo,whatsapp,plan,plan_hasta')
        .eq('estado', 'aprobado').limit(1000);
      if (error) throw error;

      const suyos = (data || []).filter(p => {
        // matchesCat() devuelve true con rubro vacio (para el filtro "Todas");
        // aca eso contaria proveedores sin rubro cargado, asi que se corta antes.
        if (!p || !p.rubro) return false;
        if (typeof matchesCat === 'function') return matchesCat(p.rubro, rubro);
        return p.rubro.split(',').map(r => r.trim()).indexOf(rubro) >= 0;
      });

      // `lista` la usan el bloque de resultado en vivo del formulario B y el
      // directorio que se muestra apenas se publica. Los de la provincia del
      // comprador van primero: es la unica ventaja real que puede ofrecer un
      // proveedor que no es el mas barato ni el que mas cubre.
      const lista = suyos.slice().sort((a, b) => {
        const pa = provincia && a.provincia === provincia ? 0 : 1;
        const pb = provincia && b.provincia === provincia ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return minimoEnPesos(a.pedido_minimo) - minimoEnPesos(b.pedido_minimo);
      });

      return {
        n: suyos.length,
        enProv: provincia ? suyos.filter(p => p.provincia === provincia).length : 0,
        lista
      };
    } catch (e) {
      console.warn('[cotiz] contar proveedores', e);
      return null;   // la pantalla se muestra igual, sin el numero
    }
  }

  // Cuantos de esos proveedores tienen un minimo que el comprador puede
  // cubrir con lo que declaro que piensa invertir.
  function dentroDelPresupuesto(lista, inversion) {
    const techo = techoInversion(inversion);
    if (techo === null) return null;           // "No sé todavía": no se filtra
    return (lista || []).filter(p => minimoEnPesos(p.pedido_minimo) <= techo).length;
  }

  /* Se pinta PRIMERO y se cuenta despues. El acuse de recibo es lo urgente:
     hacerlo esperar a una consulta seria repetir el problema que vino a
     resolver. Si la cuenta falla o tarda, la pantalla ya cumplio su trabajo. */
  async function irAConfirmacion(datos) {
    st.confirmado = {
      rubro: datos.rubro || '', provincia: datos.provincia || '',
      titulo: datos.titulo || '', n: null, enProv: 0, contando: true
    };
    st.vista = 'confirmado';
    st.cargando = false;
    render();

    const c = await contarProveedores(datos.rubro, datos.provincia);
    // Si mientras contabamos la persona se fue a otra pantalla, no se la
    // arrastra de vuelta con un render().
    if (st.vista !== 'confirmado' || !st.confirmado) return;
    st.confirmado = { ...st.confirmado, ...(c || {}), contando: false };
    render();
  }

  function pantallaConfirmado() {
    const c = st.confirmado;
    if (!c) return pantallaFeed();

    const rubro = esc(c.rubro || '');
    let titular, bajada;

    if (c.contando) {
      titular = 'Su pedido está publicado';
      bajada = 'Estamos viendo a cuántos proveedores del rubro les llega.';
    } else if (c.n === null) {
      // No se pudo contar. Se dice lo que SI se sabe con certeza.
      titular = 'Su pedido está publicado';
      bajada = 'Ya aparece en el listado de pedidos abiertos, donde lo ven los proveedores mayoristas.';
    } else if (c.n === 0) {
      // Cero no se disfraza. Pero tampoco se lo deja como un fracaso: el
      // pedido igual queda publicado y sirve para salir a buscar ese rubro.
      titular = 'Su pedido está publicado';
      bajada = 'Todavía no hay proveedores de ' + rubro + ' aprobados en EmprendeGO. ' +
        'Su pedido queda abierto 14 días y lo usamos para salir a buscarlos.';
    } else {
      titular = 'Su pedido ya lo pueden ver ' + c.n + ' ' +
        (c.n === 1 ? 'proveedor' : 'proveedores') + ' de ' + rubro;
      bajada = c.enProv > 0
        ? c.enProv + (c.enProv === 1 ? ' está' : ' están') + ' en ' + esc(c.provincia) + '.'
        : 'Varios trabajan con envío a todo el país.';
    }

    const paso = (n, txt) => `<div style="display:flex;gap:11px;align-items:flex-start;margin-bottom:11px">
      <div aria-hidden="true" style="width:22px;height:22px;flex-shrink:0;margin-top:1px;border-radius:50%;background:${VERDE};color:#fff;display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:800">${n}</div>
      <div style="font-size:.82rem;line-height:1.5;color:#065F46">${txt}</div>
    </div>`;

    return header('Pedido publicado', "cotizIr('feed')") + `
      <div class="cz-ancho" style="padding:26px 20px 40px;text-align:center">
        <div class="cz-ok-redondel" aria-hidden="true">${ICO.chequeRedondo}</div>

        <h2 class="cz-ok-tit">${titular}</h2>
        <p class="cz-ok-baj">${bajada}</p>

        <p class="cz-ok-repetir">No hace falta que lo vuelva a publicar. Le avisamos apenas alguien le cotice.</p>

        <div style="text-align:left;background:${SOFT};border:1px solid ${BORDE};border-radius:16px;padding:16px;margin:20px 0">
          <div style="font-size:.8rem;font-weight:800;color:${VERDE_OSC};margin-bottom:11px">¿Qué pasa ahora?</div>
          ${paso(1, 'Los proveedores del rubro ven su pedido en el listado y le mandan su precio, su mínimo y su tiempo de entrega.')}
          ${paso(2, 'Usted compara las cotizaciones que reciba y elige la que más le convenga.')}
          ${paso(3, 'Le escribe por WhatsApp solo al que usted elija. Su teléfono no se comparte antes.')}
        </div>

        ${btnPrimario('Ver mis pedidos', "cotizIr('mis')")}
        <button type="button" class="cz-link" onclick="cotizPedir()">Publicar otro pedido</button>
      </div>`;
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
        // El que publica por este camino viene de irse a Google y volver: es
        // justo el que menos idea tiene de si su pedido sobrevivio al viaje.
        // El acuse de recibo le hace mas falta que a nadie.
        //
        // Un pedido de proveedor tiene su propia pantalla de llegada, con el
        // directorio: mandarlo al acuse generico le sacaria justamente lo que
        // puede usar ya mismo.
        if (d.tipo === TIPO_B) await irAResultadoB(d, null);
        else await irAConfirmacion(d);
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
      if (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION') {
        intentarPublicarBorrador();
        // Se cuelga del mismo evento para no tocar app.js: el modulo se entera
        // solo de que hay sesion y decide si tiene algo para avisar.
        esperarUsuario(8000).then(ok => { if (ok) avisarCotizacionesNuevas(); });
      }
    });
  } catch (e) { console.warn('[cotiz] onAuthStateChange', e); }

  /* ---------------- AVISO: "LE COTIZARON" ----------------
     Espejo del cartel de intencion de catalogo que ya ve el proveedor al
     entrar (app.js, mostrarAvisoIntencion): mismo lugar, misma cadencia de
     una vez por dia, misma espera de 5 segundos para no tapar la pantalla
     apenas abre.

     Sin columnas nuevas: lo que se vio se recuerda en localStorage, igual que
     eg_avisoint_ / eg_consulta_ / eg_intentocat_. Se compara el contador
     denormalizado solicitudes.respuestas contra el ultimo valor visto. La
     contra es que es por dispositivo: si entra desde otro telefono lo vuelve
     a ver una vez. Es el mismo trato que ya hacen los otros avisos.

     Solo para compradores: al proveedor le puede estar por saltar el cartel
     de catalogo en la misma carga y dos modales encimados es peor que nada. */

  const VISTAS = id => 'eg_cotvistas_' + id;
  const AVISO_DIA = 'eg_cotaviso_dia';

  function vistasDe(id) {
    try { return parseInt(localStorage.getItem(VISTAS(id)) || '0', 10) || 0; } catch (e) { return 0; }
  }

  function marcarVistas(id, n) {
    try { localStorage.setItem(VISTAS(id), String(n || 0)); } catch (e) { }
  }

  async function avisarCotizacionesNuevas() {
    try {
      if (!currentUser || esProveedor()) return;
      const hoy = new Date().toISOString().slice(0, 10);
      let yaHoy = false;
      try { yaHoy = localStorage.getItem(AVISO_DIA) === hoy; } catch (e) { }
      if (yaHoy) return;

      const uid = await getUid();
      if (!uid) return;

      const { data, error } = await conFallback(() => sb.from('solicitudes')
        .select('id,titulo,respuestas,estado,cierra_at' + (nivelSql >= 2 ? ',tipo' : ''))
        .eq('usuario_id', uid).gt('respuestas', 0)
        .order('created_at', { ascending: false }).limit(20));
      if (error || !data || !data.length) return;

      let nuevas = 0, pedidos = 0, ultimo = null, conNovedad = [];
      data.forEach(p => {
        const d = (p.respuestas || 0) - vistasDe(p.id);
        if (d > 0) { nuevas += d; pedidos++; ultimo = p; conNovedad.push(p); }
      });
      if (nuevas <= 0) return;

      // "Le cotizaron" solo si de verdad le cotizaron. Si todo lo que tiene
      // novedades son pedidos de proveedor, no hubo ninguna cotizacion: hubo
      // respuestas, y asi hay que decirlo.
      const soloB = conNovedad.length > 0 && conNovedad.every(esPedidoB);

      try { localStorage.setItem(AVISO_DIA, hoy); } catch (e) { }
      setTimeout(() => pintarAvisoCotiz(nuevas, pedidos, ultimo, soloB), 5000);
    } catch (e) { console.warn('[cotiz] aviso', e); }
  }

  /* La redaccion del aviso, aparte del DOM: es lo unico de este modal que
     cambia segun el caso, y separada se puede revisar sin abrir un navegador.

     Un pedido de proveedor no recibe cotizaciones, recibe respuestas: nadie
     le puso precio a nada. Y lo que hay para comparar tampoco es lo mismo,
     asi que la frase de abajo tambien cambia. */
  function textoAvisoCotiz(nuevas, pedidos, ultimo, soloB) {
    const queComparar = soloB
      ? 'Compare cuánto le cubre cada uno, su mínimo y su envío, y contacte al que le sirva.'
      : 'Compare precio, mínimo y entrega, y contacte al que le sirva.';
    return {
      rotulo: soloB ? 'Le respondieron' : 'Le cotizaron',
      titulo: soloB
        ? (nuevas === 1 ? 'respuesta nueva' : 'respuestas nuevas')
        : (nuevas === 1 ? 'cotización nueva' : 'cotizaciones nuevas'),
      detalle: pedidos === 1 && ultimo
        ? `En su pedido “${esc(ultimo.titulo)}”. ${queComparar}`
        : `En ${pedidos} de sus pedidos. ${queComparar}`
    };
  }

  function pintarAvisoCotiz(nuevas, pedidos, ultimo, soloB) {
    if (document.getElementById('modal-aviso-cotiz')) return;
    // Si el proveedor ya tiene abierto su propio cartel, no encimar otro.
    if (document.getElementById('modal-aviso-intencion')) return;

    let quieto = false;
    try { quieto = window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { }

    const { rotulo, titulo, detalle } = textoAvisoCotiz(nuevas, pedidos, ultimo, soloB);
    // Con un solo pedido se entra derecho a sus cotizaciones; con varios, a la lista.
    const accion = pedidos === 1 && ultimo
      ? `cerrarAvisoCotiz();abrirCotizaciones().then(function(){cotizVerRespuestas('${esc(String(ultimo.id))}')})`
      : `cerrarAvisoCotiz();abrirCotizaciones().then(function(){cotizIr('mis')})`;

    const overlay = document.createElement('div');
    overlay.id = 'modal-aviso-cotiz';
    // El vidrio de un modal va en el VELO, no en la tarjeta: una tarjeta
    // translucida sobre un velo oscuro deja el texto negro flotando sobre un
    // fondo impredecible y ahi se cae el contraste. La tarjeta queda opaca.
    // El velo es negro verdoso y no negro puro: tintado desde la marca.
    // Los estilos van en linea porque este overlay vive en <body>, fuera de
    // #screen-cotizaciones, donde las clases .cz-* no llegan.
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(6,26,18,.55);' +
      '-webkit-backdrop-filter:blur(6px) saturate(140%);backdrop-filter:blur(6px) saturate(140%);' +
      'z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .3s ease';
    overlay.innerHTML = `<div class="cz-aviso-card" role="dialog" aria-modal="true" aria-labelledby="cz-aviso-tit"
        style="background:#fff;border-radius:22px;padding:24px 22px 22px;width:100%;max-width:400px;position:relative;transform:scale(.94);opacity:0;transition:transform .32s cubic-bezier(.2,.8,.25,1),opacity .3s ease">
      <button onclick="cerrarAvisoCotiz()" aria-label="Cerrar" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.3rem;color:#aaa;cursor:pointer;line-height:1">&times;</button>
      <div style="font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#F97316;margin-bottom:12px">${esc(rotulo)}</div>
      <div id="cz-aviso-tit" style="display:flex;align-items:baseline;gap:9px;margin-bottom:6px">
        <span style="font-size:2.6rem;font-weight:900;color:${VERDE};line-height:1;font-variant-numeric:tabular-nums">${nuevas}</span>
        <span style="font-size:.92rem;font-weight:800;color:#1A1A1A;line-height:1.2">${titulo}</span>
      </div>
      <div style="font-size:.82rem;color:#777;line-height:1.5;margin-bottom:18px">${detalle}</div>
      <button onclick="${accion}" style="width:100%;background:${VERDE};color:#fff;border:none;border-radius:12px;padding:14px;font-family:inherit;font-size:.9rem;font-weight:800;cursor:pointer;margin-bottom:8px">${soloB ? 'Ver las respuestas' : 'Ver las cotizaciones'}</button>
      <button onclick="cerrarAvisoCotiz()" style="width:100%;background:none;border:none;color:#999;font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer;padding:4px">Ver más tarde</button>
    </div>`;
    overlay.onclick = e => { if (e.target === overlay) cerrarAvisoCotiz(); };
    document.body.appendChild(overlay);

    const card = overlay.querySelector('.cz-aviso-card');
    if (quieto) { overlay.style.opacity = '1'; if (card) { card.style.transform = 'none'; card.style.opacity = '1'; } }
    else requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      if (card) { card.style.transform = 'scale(1)'; card.style.opacity = '1'; }
    });

    try { if (typeof trackEvent === 'function') trackEvent('rfq_aviso_visto', { cotizaciones: nuevas }); } catch (e) { }
    vibrar('light');
  }

  window.cerrarAvisoCotiz = function () {
    const el = document.getElementById('modal-aviso-cotiz');
    if (el) el.remove();
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
    // Recien aca se dan por vistas: entrar a "Mis pedidos" y ver el contador no
    // es lo mismo que haber mirado las cotizaciones. Se guarda el largo real de
    // la lista y no p.respuestas, que es el contador denormalizado y podria ir
    // adelantado si una cotizacion fue borrada.
    marcarVistas(p.id, Math.max(st.cotizaciones.length, p.respuestas || 0));
    st.cargando = false; st.vista = 'respuestas'; render();
  };

  function pantallaRespuestas() {
    const p = st.pedidoActual;
    if (!p) return pantallaFeed();

    const tipoB = esPedidoB(p);
    let lista = st.cotizaciones.slice();

    /* ORDEN DE LAS RESPUESTAS

       En un pedido de proveedor se ordena por COBERTURA y nunca por precio.
       No es solo que no haya precio que ordenar: ordenar por el numero mas
       bajo entrena al comprador a mirar unicamente eso, y al proveedor —que
       es quien paga la app— le destruye el margen. Lo que le sirve de verdad
       al comprador es quien le cubre mas del surtido de una sola vez.

       Los que quedan fuera del presupuesto que declaro van al fondo, pero NO
       se esconden: puede que le convenga igual, y esconderlos seria decidir
       por el. Cada uno lleva su nota explicando por que esta ahi abajo. */
    if (tipoB) {
      const pedidos = productosDe(p).length;
      const puntaje = c => {
        const cubre = cubreDe(c).filter(x => productosDe(p).indexOf(x) >= 0).length;
        return pedidos ? cubre / pedidos : 0;
      };
      lista.sort((a, b) => {
        const fa = fueraDePresupuesto(a, p) ? 1 : 0;
        const fb = fueraDePresupuesto(b, p) ? 1 : 0;
        if (fa !== fb) return fa - fb;                       // dentro del presupuesto primero
        const d = puntaje(b) - puntaje(a);                   // mas cobertura primero
        if (d) return d;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    } else if (st.orden === 'precio') {
      lista.sort((a, b) => Number(a.precio) - Number(b.precio));
    }

    const cuerpo = !lista.length
      ? vacioBox(tipoB ? 'Todavía no le respondieron' : 'Todavía no le cotizaron',
        vigente(p)
          ? (tipoB
            ? 'Apenas un proveedor le diga qué puede abastecerle, lo va a ver acá, ordenado por cuánto le cubre.'
            : 'Apenas un proveedor responda, lo va a ver acá. Los pedidos con cantidad y rubro cargados reciben más respuestas.')
          : 'Este pedido está cerrado.')
      : `<div style="padding:2px 16px 30px">
          ${tipoB ? `<div style="font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${TENUE};margin:2px 2px 12px">Ordenados por cobertura</div>` : ''}
          ${lista.map(cardCotizacion).join('')}
        </div>`;

    return header(tipoB ? 'Proveedores que respondieron' : 'Cotizaciones recibidas', "cotizIr('feed')") + `
      <div style="padding:13px 16px;background:#FAFBFA;border-bottom:1px solid ${BORDE}">
        <div style="font-size:.88rem;font-weight:800;color:#1A1A1A;line-height:1.4;margin-bottom:5px">${esc(p.titulo)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:.74rem;color:${GRIS}">
          ${p.cantidad ? `<span>${cantidadTexto(p)}</span>` : ''}
          ${p.provincia ? `<span style="display:inline-flex;align-items:center;gap:3px">${ICO.pin}${esc(p.provincia)}</span>` : ''}
          <span>${esc(hace(p.created_at))}</span>
        </div>
        ${tipoB && productosDe(p).length ? `<div style="margin-top:8px;font-size:.74rem;color:#41564C;line-height:1.5">${esc(productosDe(p).join(' · '))}</div>` : ''}
      </div>
      ${lista.length > 1 && !tipoB ? `<div style="display:flex;gap:8px;padding:12px 16px 8px">
        ${['recientes', 'precio'].map(o => `<button onclick="cotizOrden('${o}')" style="padding:6px 13px;border-radius:16px;border:1.5px solid ${st.orden === o ? VERDE : '#E2E6E4'};background:${st.orden === o ? SOFT : '#fff'};color:${st.orden === o ? VERDE_OSC : GRIS};font-size:.76rem;font-weight:${st.orden === o ? 700 : 500};cursor:pointer;font-family:inherit">${o === 'recientes' ? 'Más recientes' : 'Menor precio'}</button>`).join('')}
      </div>` : ''}
      ${cuerpo}
      ${vigente(p) ? `<div style="padding:0 16px 34px"><button onclick="cotizCerrar('${p.id}')" style="width:100%;background:#fff;color:${GRIS};border:1.5px solid #E2E6E4;border-radius:12px;padding:12px;font-size:.83rem;font-weight:700;cursor:pointer;font-family:inherit">Cerrar este pedido</button></div>` : ''}`;
  }

  /* Bloque de cobertura: la cifra que reemplaza al precio en un pedido de
     proveedor. `cubre` son los productos que el proveedor marco; `productos`
     los que pidio el comprador. Lo que NO cubre se dice con todas las letras:
     esconderlo obligaria al comprador a cruzar dos listas a mano. */
  function bloqueCobertura(cot, sol) {
    const pedidos = productosDe(sol);
    const cubre = cubreDe(cot);
    if (!pedidos.length) return '';
    // Se cuenta contra lo que el comprador pidio, no contra lo que el
    // proveedor marco: si marco algo que no estaba en el pedido, no suma.
    const cubiertos = pedidos.filter(x => cubre.indexOf(x) >= 0);
    const faltan = pedidos.filter(x => cubre.indexOf(x) < 0);
    const pct = Math.round((cubiertos.length / pedidos.length) * 100);
    return `<div class="cz-cob${cubiertos.length === pedidos.length ? ' completa' : ''}">
      <div class="cz-cob-fila">
        <span class="cz-cob-n">Cubre ${cubiertos.length} de ${pedidos.length}</span>
        ${faltan.length ? `<span class="cz-cob-falta">No cubre: ${esc(faltan.join(', '))}</span>` : ''}
      </div>
      <div class="cz-cob-barra" role="img" aria-label="Cubre ${cubiertos.length} de ${pedidos.length} productos">
        <div class="cz-cob-relleno" style="width:${pct}%"></div>
      </div>
    </div>`;
  }

  // Cuanto del presupuesto declarado se come el minimo de este proveedor.
  // Devuelve null cuando no hay con que comparar (el comprador no declaro
  // inversion, o el proveedor no dijo su minimo): en ese caso no se opina.
  function fueraDePresupuesto(cot, sol) {
    const techo = techoInversion(sol && sol.inversion);
    if (techo === null || !isFinite(techo)) return null;
    if (!cot || !cot.minimo) return null;
    return minimoEnPesos(cot.minimo) > techo;
  }

  function cardCotizacion(c) {
    const p = st.provsCache[c.proveedor_id] || {};
    const sol = st.pedidoActual;
    const tipoB = esRespuestaB(c) || esPedidoB(sol);
    const total = (sol?.cantidad || '').replace(/[^0-9]/g, '');
    // Sin precio no hay total que estimar. Antes esto daba 0 y se pintaba
    // "Total estimado $0".
    const totalNum = (!tipoB && total && c.precio) ? Number(total) * Number(c.precio) : null;
    const pro = esPro(p);
    const fuera = fueraDePresupuesto(c, sol);

    /* El cuerpo cambia entero segun el tipo. En un pedido de proveedor no hay
       "precio por unidad" ni "total estimado": lo que el comprador compara es
       cuanto le cubre cada uno y con que minimo de compra. */
    const cuerpo = tipoB
      ? `${bloqueCobertura(c, sol)}
        <div style="display:flex;gap:8px;margin-bottom:11px">
          <div style="flex:1;min-width:0;background:#FAFBFA;border-radius:10px;padding:10px 12px">
            <div style="font-size:.68rem;color:${TENUE};margin-bottom:2px">Mínimo de compra</div>
            <div style="font-size:.95rem;font-weight:800;color:#1A1A1A">${esc(c.minimo || 'Consultar')}</div>
          </div>
          <div style="flex:1;min-width:0;background:#FAFBFA;border-radius:10px;padding:10px 12px">
            <div style="font-size:.68rem;color:${TENUE};margin-bottom:2px">Envío</div>
            <div style="font-size:.82rem;font-weight:700;color:#1A1A1A;line-height:1.3">${esc(c.envio || 'Consultar')}</div>
          </div>
        </div>
        ${fuera ? `<div class="cz-aviso-ambar">${ICO.alerta}<span>Su mínimo está por encima de lo que usted indicó que pensaba invertir. Igual puede consultarle.</span></div>` : ''}`
      : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px">
          <div style="background:#FAFBFA;border-radius:10px;padding:10px 12px">
            <div style="font-size:.68rem;color:${TENUE};margin-bottom:2px">Por ${uSingular(sol)}</div>
            <div style="font-size:1.05rem;font-weight:800;color:${VERDE}">${plata(c.precio) || '-'}</div>
          </div>
          <div style="background:#FAFBFA;border-radius:10px;padding:10px 12px">
            <div style="font-size:.68rem;color:${TENUE};margin-bottom:2px">${totalNum ? 'Total estimado' : 'Entrega'}</div>
            <div style="font-size:1.05rem;font-weight:800;color:#1A1A1A">${totalNum ? plata(totalNum) : esc(c.entrega || '-')}</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:.76rem;color:${GRIS};margin-bottom:${c.nota ? '10px' : '13px'}">
          ${totalNum && c.entrega ? `<span>Entrega: ${esc(c.entrega)}</span>` : ''}
          ${c.minimo ? `<span>Mínimo: ${esc(c.minimo)}</span>` : ''}
          ${c.pagos ? `<span>${esc(c.pagos)}</span>` : ''}
        </div>`;

    return `<div class="cz-bandeja${fuera ? ' cz-fuera' : ''}" style="margin-bottom:12px"><div class="cz-nucleo">
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

      ${cuerpo}

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
    // En un pedido de proveedor no hay precio que citar: se lo saluda por lo
    // que respondio (cuanto del surtido cubre) y no por un numero que no dio.
    const detalle = esRespuestaB(c) || esPedidoB(ped)
      ? (cubreDe(c).length ? ` y me dijo que cubre ${cubreDe(c).length} de los productos que busco` : '')
      : (c && plata(c.precio) ? ` a ${plata(c.precio)} por ${uSingular(ped)}` : '');
    const msg = `Hola! Soy ${currentUser?.name || ''} de EmprendeGO. ` +
      `${esPedidoB(ped) ? 'Respondió' : 'Cotizó'} mi pedido "${ped?.titulo || ''}"` +
      detalle + '. Quería avanzar.';
    try { registrarContactoWA(provId, p); } catch (e) { }
    try { abrirWA(p.whatsapp, msg); } catch (e) { toast('WhatsApp no disponible'); }
  };

  // abrirDetalle() ya hace su propio goTo('detalle') (app.js:1715): no navegar antes
  // o el usuario pasa por 'inicio' y se ensucia el stack del boton Atras.
  window.cotizVerPerfil = function (provId) {
    try { abrirDetalle(provId); } catch (e) { toast('No se pudo abrir el perfil'); }
  };

  /* ---------------- CIERRE DEL PEDIDO + RESEÑA ----------------

     Cerrar el pedido era un update y nada mas. Ahora es el unico momento
     del producto en el que preguntar "como le fue" tiene sentido: el
     comprador acaba de terminar (o de descartar) una operacion y todavia
     se acuerda.

     Y hay algo que solo se sabe ACA: quien le cotizo a quien. Una reseña
     que nace de este flujo no es "una estrella que puso cualquiera", es
     una estrella que puso alguien a quien ese proveedor efectivamente le
     paso un precio. Por eso viaja con solicitud_id, y por eso la base
     tiene una policy RESTRICTIVE que verifica el vinculo
     (sql/2026-08-12_resenas_cotizaciones.sql) — el frontend propone, pero
     el que decide si esa reseña es legitima es Postgres.

     Tres reglas que no se negocian:
     - Cerrar el pedido NUNCA depende de que la reseña se guarde. Si el
       insert falla, se avisa y el pedido se cierra igual.
     - Calificar es siempre salteable, en los dos pasos.
     - Si al pedido no le cotizo nadie no hay a quien calificar: se cierra
       derecho, como antes. */

  /* Doble escapado para un valor que termina DENTRO de una cadena de
     JavaScript que a su vez vive dentro de un atributo HTML
     (onclick="fn('...')"). Primero se neutraliza lo que rompe la cadena de
     JS, despues lo que rompe el atributo; con un solo escapado, en
     cualquiera de los dos ordenes, el otro vector pasa.

     Hoy lo unico que se le pasa son uuid de la base, que no pueden traer
     ni comillas ni barras. Va igual: el dia que alguien meta ahi algo que
     escribio una persona, esto ya esta puesto. */
  function jsArg(v) {
    return esc(String(v ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, '\\n'));
  }

  // Estrella en SVG y no el caracter tipografico: es la unica forma de que
  // se vea igual en Android, iOS y escritorio (y de que no la reemplace el
  // sistema por su propio emoji).
  function estrellaSVG(llena, px) {
    return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true"
      fill="${llena ? '#F59E0B' : 'none'}" stroke="${llena ? '#F59E0B' : '#C3CDC8'}"
      stroke-width="1.7" stroke-linejoin="round" style="display:block">
      <polygon points="12 2.7 15.1 9 22 10 17 14.9 18.2 21.8 12 18.5 5.8 21.8 7 14.9 2 10 8.9 9 12 2.7"/></svg>`;
  }

  const ESTRELLA_TXT = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];

  // Estado del cierre en curso. Vive aparte de st.pedidoActual porque el
  // cierre se puede disparar desde "Mis pedidos", donde el pedido abierto
  // en pantalla es otro.
  st.cierre = null;

  window.cotizCerrar = async function (id) {
    const p = st.misPedidos.find(x => String(x.id) === String(id))
      || (st.pedidoActual && String(st.pedidoActual.id) === String(id) ? st.pedidoActual : null);

    // Las cotizaciones ya estan a mano si viene de la pantalla de
    // respuestas; desde "Mis pedidos" hay que ir a buscarlas.
    let cots = (st.pedidoActual && String(st.pedidoActual.id) === String(id))
      ? st.cotizaciones
      : null;
    if (!cots) {
      st.cargando = true; render();
      cots = await traerCotizaciones(id);
      // Sin este segundo render la pantalla se queda con el esqueleto de carga
      // pintado debajo del modal, y si el comprador cancela queda ahi para
      // siempre: nada mas vuelve a llamar a render() en ese camino.
      st.cargando = false; render();
    }

    const candidatos = cots
      .map(c => ({ prov: st.provsCache[c.proveedor_id], cot: c }))
      .filter(x => x.prov);

    // Sin cotizaciones no hay a quien calificar: se cierra como siempre.
    if (!candidatos.length) return cerrarPedido(id);

    st.cierre = {
      id: String(id),
      titulo: p ? p.titulo : '',
      // La fila entera, no solo el titulo: resumenCotiz() necesita saber si
      // es un pedido de producto o de proveedor para redactar la linea de
      // abajo de cada candidato ("Cotizó $X" vs "Cubre 4 de 5").
      pedido: p || null,
      candidatos,
      elegido: null,
      estrellas: 0,
      comentario: '',
      guardando: false
    };
    pintarCierre();
  };

  // El update de siempre. `avisar` en false cuando ya se mostro un toast
  // mas especifico (el de la reseña guardada).
  async function cerrarPedido(id, avisar) {
    try {
      const { error } = await sb.from('solicitudes').update({ estado: 'cerrada' }).eq('id', id);
      if (error) throw error;
      if (avisar !== false) toast('Pedido cerrado');
      // Se cierra -> sale del feed publico, asi que hay que refrescar los dos.
      await Promise.all([cargarMisPedidos(), cargarFeed()]);
      st.vista = 'mis'; render();
    } catch (e) { console.warn('[cotiz] cerrar', e); toast('No se pudo cerrar'); }
  }

  function cerrarModalCierre() {
    const el = $('modal-cierre-cotiz');
    if (el) el.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', escCierre);
  }

  function escCierre(e) {
    if (e.key === 'Escape') { st.cierre = null; cerrarModalCierre(); }
  }

  function pintarCierre() {
    const c = st.cierre;
    if (!c) return;

    let overlay = $('modal-cierre-cotiz');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-cierre-cotiz';
      // Mismo criterio que el aviso "le cotizaron": el vidrio va en el velo,
      // la tarjeta queda opaca. Ver pintarAvisoCotiz().
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(6,26,18,.55);' +
        '-webkit-backdrop-filter:blur(6px) saturate(140%);backdrop-filter:blur(6px) saturate(140%);' +
        'z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
      // Tocar afuera cancela el cierre entero: no cierra el pedido ni
      // guarda nada. Cerrar un pedido por accidente no se puede deshacer.
      overlay.onclick = e => { if (e.target === overlay) { st.cierre = null; cerrarModalCierre(); } };
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', escCierre);
    }

    // min-width:0 no es decorativo: la tarjeta es un flex item del overlay y
    // por defecto su min-width es `auto`, o sea su min-content. Con un nombre
    // de proveedor largo el min-content pasa los 400px y la tarjeta se estira
    // hasta el borde de la pantalla, comiendose el margen de los costados.
    // Medido: con "<img src=x onerror=...>Proveedor" pasaba de 350 a 390px de
    // ancho en una pantalla de 390.
    overlay.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="cz-cierre-tit"
      style="background:#fff;border-radius:22px;padding:22px 20px 18px;width:100%;max-width:400px;min-width:0;position:relative;margin:auto">
      ${c.elegido ? pasoEstrellas(c) : pasoQuien(c)}
    </div>`;
  }

  /* Paso 1 — con quien cerro. */
  function pasoQuien(c) {
    const fila = x => {
      const p = x.prov;
      const foto = p.logo_url
        ? `<div style="width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${esc(p.logo_url)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()"></div>`
        : avatar(p.nombre, null, 38);
      return `<button type="button" onclick="cotizCierreElegir('${jsArg(p.id)}')"
        style="display:flex;align-items:center;gap:11px;width:100%;text-align:left;min-height:44px;background:#fff;border:1.5px solid ${BORDE};border-radius:13px;padding:11px 13px;margin-bottom:8px;cursor:pointer;font-family:inherit;transition:border-color .18s ease-out,background .18s ease-out"
        onmouseover="this.style.borderColor='${VERDE}';this.style.background='${SOFT}'"
        onmouseout="this.style.borderColor='${BORDE}';this.style.background='#fff'">
        ${foto}
        <span style="flex:1;min-width:0">
          <span style="display:block;font-family:'Inter',sans-serif;font-size:.86rem;font-weight:800;color:#1A1A1A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.nombre || 'Proveedor')}</span>
          <span style="display:block;font-size:.74rem;color:${TENUE};margin-top:1px">${esc(resumenCotiz(x.cot, st.cierre && st.cierre.pedido))}</span>
        </span>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${VERDE}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;display:block"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;
    };

    return `
      <button onclick="cotizCierreCancelar()" aria-label="Cancelar"
        style="position:absolute;top:7px;right:7px;width:44px;height:44px;background:none;border:none;color:#9AA8A1;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;padding:0">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div style="font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#F97316;margin-bottom:10px">Cerrar pedido</div>
      <div id="cz-cierre-tit" style="font-family:'Inter',sans-serif;font-size:1.05rem;font-weight:800;color:#1A1A1A;line-height:1.3;margin-bottom:5px">¿A quién le compró?</div>
      <div style="font-size:.81rem;color:${GRIS};line-height:1.5;margin-bottom:16px">Su calificación es lo único que tienen los demás compradores para saber con quién conviene trabajar.</div>

      <div style="max-height:44vh;overflow-y:auto;margin:0 -2px 4px;padding:0 2px">
        ${c.candidatos.map(fila).join('')}
      </div>

      <button onclick="cotizCierreNinguno()"
        style="width:100%;min-height:44px;background:none;border:none;color:${GRIS};font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;padding:11px 4px;margin-top:4px">
        No le compré a ninguno
      </button>`;
  }

  /* Paso 2 — estrellas y comentario. */
  function pasoEstrellas(c) {
    const p = (c.candidatos.find(x => String(x.prov.id) === String(c.elegido)) || {}).prov || {};
    const n = c.estrellas;

    const estrellas = [1, 2, 3, 4, 5].map(i => `
      <button type="button" onclick="cotizCierreEstrellas(${i})" aria-label="${i} de 5"
        aria-pressed="${n === i}"
        style="background:none;border:none;padding:5px;cursor:pointer;display:flex;border-radius:8px">
        ${estrellaSVG(i <= n, 32)}
      </button>`).join('');

    return `
      <button onclick="cotizCierreVolver()" aria-label="Volver"
        style="position:absolute;top:7px;left:7px;width:44px;height:44px;background:none;border:none;color:#9AA8A1;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;padding:0">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>

      <div style="text-align:center;padding-top:14px">
        <div style="font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#F97316;margin-bottom:11px">Su calificación</div>
        <div id="cz-cierre-tit" style="font-family:'Inter',sans-serif;font-size:1.02rem;font-weight:800;color:#1A1A1A;line-height:1.35;margin-bottom:3px">¿Cómo le fue con ${esc(p.nombre || 'este proveedor')}?</div>
        <div style="font-size:.79rem;color:${TENUE};margin-bottom:14px">Precio, cumplimiento y trato.</div>

        <div style="display:flex;justify-content:center;gap:2px;margin-bottom:6px">${estrellas}</div>
        <div style="font-size:.82rem;font-weight:800;color:${n ? VERDE : TENUE};min-height:20px;margin-bottom:15px">${n ? esc(ESTRELLA_TXT[n]) : 'Toque para calificar'}</div>
      </div>

      <textarea id="cz-cierre-texto" rows="3" maxlength="500"
        oninput="cotizCierreTexto(this.value)"
        placeholder="Si quiere, cuente cómo fue (opcional)"
        style="width:100%;padding:11px 13px;border:1.5px solid #E2E6E4;border-radius:11px;font-size:.86rem;font-family:inherit;outline:none;background:#fff;box-sizing:border-box;resize:none;line-height:1.5;margin-bottom:13px">${esc(c.comentario)}</textarea>

      <button onclick="cotizCierreEnviar()" ${c.guardando ? 'disabled' : ''}
        style="width:100%;min-height:48px;background:${n && !c.guardando ? VERDE : '#C9D6D0'};color:#fff;border:none;border-radius:12px;padding:14px;font-family:inherit;font-size:.89rem;font-weight:800;cursor:${n && !c.guardando ? 'pointer' : 'default'};margin-bottom:6px">
        ${c.guardando ? 'Guardando...' : 'Calificar y cerrar el pedido'}
      </button>
      <button onclick="cotizCierreOmitir()"
        style="width:100%;min-height:44px;background:none;border:none;color:${GRIS};font-family:inherit;font-size:.81rem;font-weight:700;cursor:pointer;padding:9px 4px">
        Cerrar sin calificar
      </button>`;
  }

  window.cotizCierreElegir = function (provId) {
    if (!st.cierre) return;
    st.cierre.elegido = String(provId);
    vibrar('light');
    pintarCierre();
  };

  window.cotizCierreVolver = function () {
    if (!st.cierre) return;
    st.cierre.elegido = null;
    pintarCierre();
  };

  window.cotizCierreEstrellas = function (n) {
    if (!st.cierre) return;
    st.cierre.estrellas = Number(n) || 0;
    vibrar('light');
    pintarCierre();
    // Repintar mata el foco del teclado: se lo devuelve a la estrella tocada.
    const btns = document.querySelectorAll('#modal-cierre-cotiz [aria-pressed]');
    if (btns[n - 1]) btns[n - 1].focus({ preventScroll: true });
  };

  // No repinta: escribir no puede reconstruir el textarea abajo del cursor.
  window.cotizCierreTexto = function (v) {
    if (st.cierre) st.cierre.comentario = String(v || '');
  };

  window.cotizCierreCancelar = function () {
    st.cierre = null;
    cerrarModalCierre();
  };

  // "No le compre a ninguno" y "Cerrar sin calificar" hacen lo mismo: el
  // pedido se cierra, sin reseña. Son dos botones porque son dos momentos
  // distintos del recorrido, no dos acciones distintas.
  window.cotizCierreNinguno = function () {
    const id = st.cierre && st.cierre.id;
    st.cierre = null;
    cerrarModalCierre();
    if (id) cerrarPedido(id);
  };
  window.cotizCierreOmitir = window.cotizCierreNinguno;

  window.cotizCierreEnviar = async function () {
    const c = st.cierre;
    if (!c || c.guardando) return;
    if (!c.estrellas) { toast('Elija de 1 a 5 estrellas'); return; }

    c.guardando = true; pintarCierre();

    const provId = c.elegido;
    const fila = {
      solicitud_id: c.id,
      proveedor_id: provId,
      // El nombre sale de la cuenta y no de un input, igual que en el modal
      // del perfil: una reseña no se firma con un nombre inventado.
      usuario_nombre: (currentUser && (currentUser.name || currentUser.email)) || 'Usuario',
      usuario_email: (currentUser && currentUser.email) || '',
      estrellas: c.estrellas,
      texto: c.comentario.trim()
    };

    let msg = 'Pedido cerrado. Gracias por calificar.';
    try {
      const { error } = await sb.from('resenas').insert(fila);
      if (error) throw error;
      try { if (typeof trackEvent === 'function') trackEvent('rfq_resena', { estrellas: fila.estrellas }); } catch (e) { }
      // El perfil del proveedor cachea sus reseñas en app.js. Sin invalidar,
      // el comprador entra al perfil y no ve la que acaba de dejar.
      try { if (typeof resenasCache === 'object' && resenasCache) delete resenasCache[String(provId)]; } catch (e) { }
      vibrar('success');
    } catch (e) {
      console.warn('[cotiz] resena', e);
      // 23505 = el indice unico (solicitud_id, proveedor_id). No es un error
      // del usuario: ya califico a este proveedor por este pedido.
      msg = e && e.code === '23505'
        ? 'Ya había calificado a este proveedor por este pedido. El pedido se cerró.'
        : 'No se pudo guardar la calificación, pero el pedido se cerró.';
    }

    st.cierre = null;
    cerrarModalCierre();
    toast(msg);
    await cerrarPedido(c.id, false);
  };

  /* ---------------- vista COTIZAR (proveedor responde) ---------------- */

  window.cotizAbrirForm = function (id) {
    const s = st.feed.find(x => String(x.id) === String(id));
    if (!s) return;
    st.pedidoActual = s;
    // Un pedido de proveedor no se cotiza con un precio: se responde como un
    // remito. Son dos formularios distintos porque son dos preguntas distintas.
    if (esPedidoB(s)) {
      st.remito = { cubre: [] };
      st.vista = 'cotizarB';
    } else {
      st.vista = 'cotizar';
    }
    render();
  };

  /* ---------------- FASE 5: EL PROVEEDOR RESPONDE UN PEDIDO B ----------------

     Se responde como un remito: se marca lo que se puede abastecer y se dice
     con que minimo y como se envia. No hay precio por unidad, y la base lo
     impone (CHECK cotizaciones_precio_chk): en una respuesta de este tipo
     precio TIENE que ser NULL.

     El indicador de cobertura no esta para adornar. Un proveedor que marca 2
     de 5 no se da cuenta solo de que va a quedar debajo del que marca 4; con
     el numero delante, muchos se acuerdan de que tambien venden las otras. */

  function pantallaCotizarB() {
    const s = st.pedidoActual;
    if (!s) return pantallaFeed();
    if (!st.remito) st.remito = { cubre: [] };

    const productos = productosDe(s);
    const ctx = [
      s.ya_vende ? etiquetaDe(YA_VENDE, s.ya_vende) : '',
      s.inversion && s.inversion !== 'nosabe' ? 'Piensa invertir: ' + etiquetaDe(INVERSIONES, s.inversion) : '',
      s.inversion === 'nosabe' ? 'Todavía no definió cuánto invertir' : ''
    ].filter(Boolean);

    return header('Responder el pedido', "cotizIr('feed')") + `
      <div style="padding:13px 16px;background:#FAFBFA;border-bottom:1px solid ${BORDE}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          ${avatar(s.comprador_nombre, s.comprador_foto, 30)}
          <div style="font-size:.78rem;font-weight:700;color:#41564C">${esc(s.comprador_nombre)}${s.provincia ? ' · ' + esc(s.provincia) : ''}</div>
        </div>
        <div style="font-size:.87rem;font-weight:800;color:#1A1A1A;line-height:1.4">${esc(s.titulo)}</div>
        ${ctx.length ? `<div class="cz-ctx">${ctx.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      </div>

      <div class="cz-form">
        <label style="display:block;font-size:.82rem;font-weight:700;color:#1A1A1A;margin-bottom:4px">¿Cuáles puede abastecer?</label>
        <p class="cz-paso-ayuda">Marque los productos que tenga disponibles. Puede responder aunque no los cubra todos.</p>

        <div id="cz-remito-lista">
          ${productos.length
        ? productos.map(nom => `<button type="button" class="cz-check" aria-pressed="false"
              data-p="${esc(nom)}" onclick="cotizRemitoTocar('${jsArg(nom)}')">
              <span class="cz-check-caja" aria-hidden="true">${ICO.ok}</span>
              <span style="flex:1;min-width:0">${esc(nom)}</span>
            </button>`).join('')
        : `<div style="font-size:.83rem;color:${GRIS};line-height:1.55;padding:4px 0 12px">Este pedido no trae una lista de productos. Cuéntele en la nota qué le puede ofrecer.</div>`}
        </div>

        ${productos.length ? `<div id="cz-remito-cob" class="cz-vivo-caja" style="margin:14px 0 18px"></div>` : ''}

        ${campo('Su mínimo de compra', `<input id="cz-b-minimo" maxlength="60" placeholder="ej: $50.000" style="${INPUT_CSS}">`,
          'El comprador dijo cuánto piensa invertir. Si su mínimo entra, su respuesta aparece más arriba.')}

        ${campo('Condiciones de envío', `<div id="cz-b-envio" style="display:flex;gap:7px;flex-wrap:wrap">
          ${ENVIOS.map(e => `<button type="button" class="cz-chip-prod" data-v="${esc(e)}" aria-pressed="false" onclick="cotizRemitoEnvio('${jsArg(e)}')">${esc(e)}</button>`).join('')}
        </div>`)}

        ${campo('Nota (opcional)', `<textarea id="cz-b-nota" rows="3" maxlength="400" placeholder="ej: Trabajo con reposición mensual, tengo lista de precios para revendedores" style="${INPUT_CSS};resize:vertical"></textarea>`)}

        <div class="cz-barra cz-vidrio">
          <div id="cz-error" style="display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:10px 12px;font-size:.8rem;margin-bottom:12px"></div>
          ${btnPrimario('Enviar respuesta', 'cotizEnviarB(this)')}
          <div class="cz-barra-nota">El comprador ve su respuesta junto con la de otros proveedores, ordenadas por cuánto cubre cada uno.</div>
        </div>
      </div>`;
  }

  function montarRemito() {
    pintarRemito();
  }

  function pintarRemito() {
    const s = st.pedidoActual;
    if (!s || !st.remito) return;
    const cont = $('cz-remito-lista');
    if (cont) Array.from(cont.children).forEach(b => {
      if (!b.dataset || !b.dataset.p) return;
      b.setAttribute('aria-pressed', st.remito.cubre.indexOf(b.dataset.p) >= 0 ? 'true' : 'false');
    });
    pintarPresionado('cz-b-envio', st.remito.envio || '');

    const caja = $('cz-remito-cob');
    if (!caja) return;
    const total = productosDe(s).length;
    const n = st.remito.cubre.length;
    const pct = total ? Math.round((n / total) * 100) : 0;
    // El empujon: cuando falta poco se lo dice, en vez de dejarlo en el 60%
    // sin que se entere de que el de al lado va a marcar los cinco.
    const empuje = !total || n === total ? ''
      : n === 0 ? 'Marque al menos uno para poder responder.'
        : total - n === 1 ? 'Le falta uno solo para cubrir el pedido entero.'
          : `Si también vende ${total - n} más, cubre el pedido entero.`;
    caja.innerHTML = `<div class="cz-cob${n === total && total ? ' completa' : ''}" style="margin:0">
        <div class="cz-cob-fila">
          <span class="cz-cob-n">Su cobertura: ${n} de ${total}</span>
        </div>
        <div class="cz-cob-barra"><div class="cz-cob-relleno" style="width:${pct}%"></div></div>
      </div>
      ${empuje ? `<div class="cz-vivo-txt" style="margin-top:9px">${esc(empuje)}</div>` : ''}`;
  }

  window.cotizRemitoTocar = function (nom) {
    if (!st.remito) st.remito = { cubre: [] };
    const i = st.remito.cubre.indexOf(nom);
    if (i >= 0) st.remito.cubre.splice(i, 1); else st.remito.cubre.push(nom);
    vibrar('light');
    pintarRemito();
  };

  window.cotizRemitoEnvio = function (v) {
    if (!st.remito) st.remito = { cubre: [] };
    // Se puede desmarcar: el envio es opcional y quedar trabado en la primera
    // opcion que se toco por error es peor que no tener ninguna.
    st.remito.envio = st.remito.envio === v ? '' : v;
    vibrar('light');
    pintarRemito();
  };

  window.cotizEnviarB = async function (btn) {
    const s = st.pedidoActual;
    const err = $('cz-error');
    const fallar = m => { if (err) { err.textContent = m; err.style.display = 'block'; } vibrar('error'); };
    if (!s || !st.remito) return;

    const productos = productosDe(s);
    if (productos.length && !st.remito.cubre.length) {
      return fallar('Marque al menos un producto que pueda abastecer.');
    }
    if (!currentUser?.proveedorId) return fallar('Su cuenta de proveedor todavía no está aprobada.');
    if (err) err.style.display = 'none';

    const fila = {
      solicitud_id: s.id,
      proveedor_id: currentUser.proveedorId,
      // precio NO se manda. La base exige que sea NULL en una respuesta de
      // tipo proveedor, y el tipo lo pone un trigger leyendo el pedido padre.
      cubre: st.remito.cubre.slice(0, 12),
      minimo: ($('cz-b-minimo')?.value || '').trim() || null,
      envio: st.remito.envio || null,
      nota: ($('cz-b-nota')?.value || '').trim() || null
    };

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; btn.style.opacity = '.7'; }
    try {
      const { error } = await sb.from('cotizaciones').insert(fila);
      if (error) throw error;
      vibrar('success');
      toast('Respuesta enviada');
      try { if (typeof trackEvent === 'function') trackEvent('rfq_respondido_b', { rubro: s.rubro || '', cubre: fila.cubre.length }); } catch (e) { }

      // Mismo aviso por mail que en una cotizacion normal: se dispara y se
      // sigue de largo. Si el mail falla, la respuesta ya esta guardada.
      try {
        fetch('/api/notificar-mensaje?action=cotizacion', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ solicitud_id: s.id })
        }).catch(() => { });
      } catch (e) { }

      st.remito = null;
      await cargarFeed();
      st.vista = 'feed';
      render();
    } catch (e) {
      console.warn('[cotiz] enviar respuesta B', e);
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar respuesta'; btn.style.opacity = '1'; }
      const dup = String(e?.code || '') === '23505';
      fallar(dup ? 'Ya respondió este pedido.'
        : esColumnaFaltante(e) ? 'Esta función todavía no está habilitada en el servidor.'
          : 'No se pudo enviar. Revise su conexión e intente de nuevo.');
    }
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
        <div style="font-size:.75rem;color:${GRIS}">${s.cantidad ? cantidadTexto(s) + ' · ' : ''}${esc(s.provincia || '')}</div>
        ${s.detalles ? `<div style="font-size:.78rem;color:#41564C;margin-top:8px;line-height:1.5">${esc(s.detalles)}</div>` : ''}
        ${s.foto_url ? `<div style="margin-top:9px;margin-bottom:-11px">${fotoPedido(s)}</div>` : ''}
      </div>

      <div class="cz-form">
        ${campo('Precio por ' + uSingular(s), `<input id="cz-precio" inputmode="decimal" placeholder="$ por ${uSingular(s)}" oninput="cotizCalcTotal()" style="${INPUT_CSS};font-size:1.05rem;font-weight:700">`)}
        <div id="cz-total" style="margin-top:-8px;margin-bottom:16px;font-size:.82rem;font-weight:700;color:${VERDE};display:none"></div>

        ${campo('Mínimo de compra (opcional)', `<input id="cz-minimo" maxlength="60" placeholder="ej: 100 ${uPlural(s)}" style="${INPUT_CSS}">`)}

        ${campo('Tiempo de entrega', `<div id="cz-entregas" style="display:flex;gap:7px;flex-wrap:wrap">
          ${ENTREGAS.map(e => `<button type="button" data-v="${esc(e)}" onclick="cotizChip(this,'cz-entregas',true)" style="min-height:44px;padding:9px 15px;border-radius:999px;border:1.5px solid #E2E6E4;background:#fff;color:${GRIS};font-size:.79rem;font-weight:500;cursor:pointer;font-family:inherit;transition:all .18s ease-out">${esc(e)}</button>`).join('')}
        </div>`)}

        ${campo('Formas de pago que acepta', `<div id="cz-pagos" style="display:flex;gap:7px;flex-wrap:wrap">
          ${PAGOS.map(e => `<button type="button" data-v="${esc(e)}" onclick="cotizChip(this,'cz-pagos',false)" style="min-height:44px;padding:9px 15px;border-radius:999px;border:1.5px solid #E2E6E4;background:#fff;color:${GRIS};font-size:.79rem;font-weight:500;cursor:pointer;font-family:inherit;transition:all .18s ease-out">${esc(e)}</button>`).join('')}
        </div>`)}

        ${campo('Nota (opcional)', `<textarea id="cz-nota" rows="3" maxlength="400" placeholder="ej: Tengo stock disponible, envío incluido a CABA" style="${INPUT_CSS};resize:vertical"></textarea>`)}

        <div class="cz-barra cz-vidrio">
          <div id="cz-error" style="display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:10px;padding:10px 12px;font-size:.8rem;margin-bottom:12px"></div>
          ${btnPrimario('Enviar cotización', 'cotizEnviar(this)')}
          <div class="cz-barra-nota">El comprador ve su cotización junto con las de otros proveedores. Si le sirve, lo contacta.</div>
        </div>
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
      el.textContent = 'Total por ' + cant + ' ' + uPlural(s) + ': ' + plata(cant * precio);
      el.style.display = 'block';
    } else el.style.display = 'none';
  };

  window.cotizEnviar = async function (btn) {
    const s = st.pedidoActual;
    const err = $('cz-error');
    const mostrarErr = m => { if (err) { err.textContent = m; err.style.display = 'block'; } vibrar('error'); };
    if (!s) return;

    const precio = parsearMonto($('cz-precio')?.value);
    if (!precio) return mostrarErr(`Ponga un precio por ${uSingular(s)} válido.`);
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

      // Avisarle por mail al comprador. Se dispara y se sigue de largo: si el
      // mail falla, la cotizacion ya esta guardada y no hay nada que deshacer.
      // El backend decide si corresponde mandarlo (baja, enfriamiento, y que
      // la cotizacion exista de verdad); desde aca solo se pasa el id.
      try {
        fetch('/api/notificar-mensaje?action=cotizacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ solicitud_id: s.id })
        }).catch(() => { });
      } catch (e) { }
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

  /* Guarda de reentrada. Sin esto, cada toque repetido mientras se cargaban
     los datos disparaba una carga ENTERA mas, y cada una terminaba con su
     propio render() al volver. Como animarCifras() baja la cifra del pulso a
     cero para animarla, tres toques se veian como el contador reiniciandose
     tres veces seguidas. Ademas mandaba la misma consulta N veces en paralelo
     contra la instancia, que es justo lo que la hacia mas lenta. */
  let cargandoDatos = false;

  window.cotizIr = async function (v) {
    vibrar('light');
    // El toque de mas no se encola ni se ignora en silencio: la pantalla ya
    // esta mostrando el esqueleto de esa misma carga.
    if (cargandoDatos) return;
    // Refrescar antes de pintar: si vengo de publicar/cotizar/borrar, los
    // contadores y el feed cambiaron.
    if (v === 'feed' || v === 'mis') {
      cargandoDatos = true;
      st.cargando = true; render();
      try {
        await cargarDatos();
      } finally {
        // En finally y no despues del await: si algo tirara, la pantalla se
        // quedaria trabada en el esqueleto y sin forma de reintentar.
        cargandoDatos = false;
        st.cargando = false;
      }
    }
    // La seleccion arranca de lo guardado y se edita aparte: si la persona
    // toca chips y se vuelve sin guardar, st.seguidos no se entero de nada.
    if (v === 'seguidos') st.segEdit = (st.seguidos || []).slice();
    st.vista = v;
    render();
  };

  /* Carga todo lo que necesita la portada: el feed publico (las dos puntas lo
     ven) y, ademas, mis pedidos para el puntito del boton "Mis pedidos".

     cargarDemanda() ESTABA acá adentro, colgada del mismo Promise.all, y era
     el motivo por el que la seccion tardaba: Promise.all espera a todas, asi
     que el feed (que vuelve en milisegundos) se quedaba esperando al carril,
     que es decorativo y es la consulta mas cara de toda la base.

     Ahora se pide aparte y SIN await. El feed se pinta apenas esta, y el
     carril aparece solo cuando llega. Si tarda o falla, lo unico que pasa es
     que el carril no se ve, que es exactamente lo que ya pasaba ante un
     error. */
  async function cargarDatos() {
    try {
      await getUid();
      await (esProveedor()
        ? Promise.all([cargarFeed(), cargarSeguidos()])
        : Promise.all([cargarFeed(), cargarMisPedidos()]));
    } catch (e) { console.warn('[cotiz] cargarDatos', e); }
    // Se dispara y sigue de largo. El .catch() es por las dudas: cargarDemanda
    // ya traga sus propios errores, pero una promesa suelta sin catch seria un
    // unhandled rejection si eso cambiara.
    cargarDemanda().then(pintarCarril).catch(() => { });
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

  /* Adivina el rubro desde lo que escribio, reusando el mapa que ya tiene la app.

     Antes ganaba la clave MAS LARGA de todas las que aparecian en el texto, y
     eso daba vuelta el resultado en cuanto el pedido mencionaba el material:
     "remeras de algodon blancas" caia en Textil y Telas, porque 'algodon' (7)
     le ganaba a 'remera' (6). El pedido no es de tela, es de remeras.

     Ahora gana la que aparece PRIMERO. En castellano el sustantivo principal
     va adelante y los calificativos (material, color, talle) atras, asi que la
     posicion dice mucho mas que el largo. El largo queda solo para desempatar
     dos claves que arrancan en el mismo lugar, que es lo que resuelve bien
     'velador' contra 'vela' y 'colchoneta' contra 'colchon'.

     La tercera pasada (claves que CONTIENEN lo escrito) es para cuando la
     persona escribio menos que la clave: "blanq" -> 'blanqueria'. Va ultima
     porque es la mas floja de las tres. */
  function rubroDeTermino(term) {
    try {
      if (typeof SUBCATEGORIA_MAP !== 'object' || !SUBCATEGORIA_MAP) return '';
      const t = String(term || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!t) return '';
      if (SUBCATEGORIA_MAP[t]) return SUBCATEGORIA_MAP[t][0] || '';

      let mejor = '', dondeMejor = Infinity, largoMejor = 0;
      for (const k of Object.keys(SUBCATEGORIA_MAP)) {
        const donde = t.indexOf(k);
        if (donde < 0) continue;
        if (donde < dondeMejor || (donde === dondeMejor && k.length > largoMejor)) {
          mejor = SUBCATEGORIA_MAP[k][0]; dondeMejor = donde; largoMejor = k.length;
        }
      }
      if (mejor) return mejor;

      let porPrefijo = '', largo = 0;
      for (const k of Object.keys(SUBCATEGORIA_MAP)) {
        if (k.length > largo && k.includes(t)) { porPrefijo = SUBCATEGORIA_MAP[k][0]; largo = k.length; }
      }
      return porPrefijo || '';
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
    // El termino NO va al titulo: va como referencia arriba del campo. Una
    // busqueda ("textil") no es un pedido, y publicada tal cual deja un pedido
    // que nadie puede cotizar. El rubro si se deduce y se marca como puesto
    // por nosotros, para que se pueda corregir.
    st.prefill = { termino: String(termino || '').trim(), rubro: rubroDeTermino(termino), rubroAuto: true };
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
