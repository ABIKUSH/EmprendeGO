// ===== SIDEBAR COLAPSABLE (desktop) =====
(function initSidebar() {
  if (window.innerWidth < 768) return;
  if (localStorage.getItem('eg_sidebar_collapsed') === '1') {
    document.getElementById('desktop-sidebar')?.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
  }
})();
function toggleSidebar() {
  const el = document.getElementById('desktop-sidebar');
  if (!el) return;
  const collapsed = el.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem('eg_sidebar_collapsed', collapsed ? '1' : '0');
}

// ===== ANALYTICS =====
function trackEvent(name, params) {
  if (typeof gtag === 'function') gtag('event', name, params || {});
}
// ===== Validación visible del registro =====
// Marca el campo en rojo, hace scroll hasta él y registra en GA4 qué campo trabó.
// Antes solo salía un toast fugaz: el usuario no veía por qué "no pasaba" y abandonaba.
function regClearErrors(containerId) {
  document.querySelectorAll('#' + containerId + ' .field-error').forEach(el => el.classList.remove('field-error'));
}
function regFail(step, field, el, msg) {
  showToast(msg);
  if (el) {
    el.classList.add('field-error');
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) { } }
  }
  // Mide EXACTAMENTE qué paso y qué campo hace abandonar (para atacar el correcto).
  trackEvent('reg_block', { step: step, field: field });
}
// Apenas el usuario toca un campo marcado, se le saca el rojo (no espera al reintento).
document.addEventListener('input', e => { if (e.target.classList?.contains('field-error')) e.target.classList.remove('field-error'); });
document.addEventListener('change', e => { if (e.target.classList?.contains('field-error')) e.target.classList.remove('field-error'); });
let _lastSearchTracked = '', _searchTrackTimer = null;
function trackSearch(q, resultCount) {
  clearTimeout(_searchTrackTimer);
  _searchTrackTimer = setTimeout(() => {
    // Salteamos prefijos incompletos: si es igual al último logueado, o el último ya lo contiene (backspace), no se registra.
    if (q.length < 2 || q === _lastSearchTracked || _lastSearchTracked.startsWith(q)) return;
    _lastSearchTracked = q;
    trackEvent('search', { search_term: q, results: resultCount });
    // Guardar la búsqueda real + cantidad de resultados en la base.
    // Permite ver en el admin qué se busca y, sobre todo, qué se busca SIN resultados (demanda a reclutar).
    // .then() es obligatorio: en supabase-js v2 el insert es "lazy" y sin then/await NO dispara la petición.
    try { sb.from('busquedas').insert({ termino: q, resultados: resultCount }).then(() => {}, () => {}); } catch (e) { }
  }, 1500);
}

// ===== VIBRACIÓN HÁPTICA =====
function haptic(type) {
  if (!navigator.vibrate) return;
  if (type === 'light') navigator.vibrate(10);
  else if (type === 'medium') navigator.vibrate(25);
  else if (type === 'success') navigator.vibrate([15, 50, 15]);
  else if (type === 'error') navigator.vibrate([30, 40, 30]);
  else navigator.vibrate(15);
}

// ===== PROVINCIAS =====
const PROVINCIAS = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];

// ===== RUBROS / CATEGORÍAS =====
const RUBROS_LISTA = ['Tecnología','Indumentaria','Calzado','Hogar y Deco','Bazar','Alimentos','Belleza y Salud','Deportes','Automotor','Construcción','Servicios','Juguetería','Ferretería','Iluminación','Muebles','Textil y Telas','Lencería','Librería y Papelería','Marroquinería y Bolsos','Limpieza','Blanquería','Mascotas','Bebés y Niños','Electrónica','Herramientas','Packaging','Otro'];
const RUBROS_ICONS = {
  'Tecnología':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  'Indumentaria':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.86H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.86l.58-3.57a2 2 0 0 0-1.34-2.23z"/></svg>`,
  'Calzado':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v-3c0-1.2.7-2.2 1.8-2.7L7 11l3 3h5c3 0 5 1.3 6.5 3l.5.6V18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><path d="M7 11V6a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v3"/></svg>`,
  'Hogar y Deco':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  'Bazar':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  'Alimentos':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3v7"/></svg>`,
  'Belleza y Salud':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  'Deportes':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`,
  'Automotor':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 9 7 5h10l2 4"/></svg>`,
  'Construcción':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>`,
  'Servicios':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  'Juguetería':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  'Ferretería':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91z"/></svg>`,
  'Iluminación':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  'Muebles':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z"/><path d="M4 18v2M20 18v2"/></svg>`,
  'Textil y Telas':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/></svg>`,
  'Lencería':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  'Librería y Papelería':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  'Marroquinería y Bolsos':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
  'Limpieza':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a8 8 0 0 1-8-8c0-4.314 7.5-12.5 8-12.5s8 8.186 8 12.5a8 8 0 0 1-8 8z"/></svg>`,
  'Blanquería':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M22 8V4H2"/><rect x="2" y="14" width="20" height="6" rx="2"/><path d="M6 14v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/></svg>`,
  'Mascotas':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/></svg>`,
  'Bebés y Niños':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></svg>`,
  'Electrónica':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  'Herramientas':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  'Packaging':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  'Otro':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
};
const SVG_BOX = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
const MAX_RUBROS = 7;

// Subcategorías → rubros principales (para búsqueda flexible)
const SUBCATEGORIA_MAP = {
  'ropa de mujer': ['Indumentaria'], 'ropa de hombre': ['Indumentaria'], 'ropa de bebe': ['Indumentaria', 'Bebés y Niños'],
  'ropa de bebe y ninos': ['Indumentaria', 'Bebés y Niños'], 'ropa infantil': ['Indumentaria', 'Bebés y Niños'], 'ropa deportiva': ['Indumentaria', 'Deportes'],
  'talles especiales': ['Indumentaria'], 'accesorios de moda': ['Indumentaria', 'Marroquinería y Bolsos'], 'carteras': ['Marroquinería y Bolsos'],
  'calzado': ['Calzado'], 'zapatillas': ['Calzado'], 'zapatilla': ['Calzado'], 'zapatos': ['Calzado'], 'zapato': ['Calzado'],
  'botas': ['Calzado'], 'bota': ['Calzado'], 'borcegos': ['Calzado'], 'sandalias': ['Calzado'], 'pantuflas': ['Calzado'], 'ojotas': ['Calzado'], 'botines': ['Calzado', 'Deportes'],
  'mochilas': ['Marroquinería y Bolsos'], 'marroquineria': ['Marroquinería y Bolsos'], 'textil': ['Textil y Telas'],
  'indumentaria': ['Indumentaria'], 'vestimenta': ['Indumentaria'],
  'sabanas': ['Blanquería', 'Textil y Telas'], 'sabana': ['Blanquería', 'Textil y Telas'], 'frazada': ['Blanquería', 'Textil y Telas'], 'blanqueria': ['Blanquería'],
  'acolchado': ['Blanquería'], 'toalla': ['Blanquería', 'Textil y Telas'], 'mantel': ['Textil y Telas'], 'tela': ['Textil y Telas'],
  'muebles': ['Muebles', 'Hogar y Deco'], 'decoracion': ['Hogar y Deco'], 'deco': ['Hogar y Deco'],
  'articulos de cocina': ['Hogar y Deco', 'Bazar'], 'limpieza': ['Limpieza'], 'hogar y deco': ['Hogar y Deco'],
  'perfumeria': ['Belleza y Salud'], 'cosmeticos': ['Belleza y Salud'], 'cuidado personal': ['Belleza y Salud'],
  'suplementos': ['Belleza y Salud'], 'nutricion': ['Belleza y Salud'], 'belleza': ['Belleza y Salud'],
  'electronica': ['Electrónica', 'Tecnología'], 'celulares': ['Tecnología'], 'accesorios de celular': ['Tecnología'],
  'computadoras': ['Tecnología'], 'gadgets': ['Tecnología'],
  'alimentos y bebidas': ['Alimentos'], 'comida': ['Alimentos'], 'bebidas': ['Alimentos'],
  'juguetes': ['Juguetería'], 'libreria': ['Librería y Papelería'], 'papeleria': ['Librería y Papelería'],
  'ferreteria': ['Ferretería'], 'herramientas': ['Herramientas', 'Ferretería'],
  'construccion': ['Construcción'], 'mascotas': ['Mascotas'],
  'bebes': ['Bebés y Niños'], 'ninos': ['Bebés y Niños'], 'packaging': ['Packaging'],
  'iluminacion': ['Iluminación'], 'automotor': ['Automotor'], 'servicios': ['Servicios'],
};

// Rubros que se pueden elegir al cargar un producto (carga múltiple, import de
// Excel). Tiene que cubrir los mismos rubros que RUBROS_LISTA: 'Lencería' y
// 'Calzado' faltaban acá, así que un proveedor de esos rubros no tenía forma de
// elegirlos y sus productos terminaban cayendo en Indumentaria.
const CAT_PRINCIPAL = ['Tecnología','Indumentaria','Calzado','Lencería','Hogar y Deco','Bazar','Alimentos','Belleza y Salud','Deportes','Automotor','Construcción','Servicios','Juguetería','Ferretería','Iluminación','Muebles','Textil y Telas','Librería y Papelería','Marroquinería y Bolsos','Limpieza','Blanquería','Mascotas','Bebés y Niños','Electrónica','Herramientas','Packaging','Otro'];

const CAT_SUBCATS = {
  'Tecnología': ['Smartphones', 'Computadoras', 'Tablets', 'Accesorios', 'Periféricos'],
  'Indumentaria': ['Ropa mujer', 'Ropa hombre', 'Ropa bebé', 'Deportiva', 'Accesorios de moda'],
  'Hogar y Deco': ['Decoración', 'Cocina', 'Baño', 'Jardín', 'Organización'],
  'Bazar': ['Descartables', 'Artículos de regalo', 'Vajilla', 'Mayoreo general'],
  'Alimentos': ['Secos', 'Bebidas', 'Snacks', 'Golosinas', 'Congelados'],
  'Belleza y Salud': ['Perfumería', 'Cuidado personal', 'Suplementos', 'Cosméticos'],
  'Deportes': ['Indumentaria deportiva', 'Equipamiento', 'Nutrición deportiva'],
  'Automotor': ['Accesorios', 'Repuestos', 'Limpieza automotor'],
  'Construcción': ['Materiales', 'Pinturas', 'Seguridad', 'Sanitarios'],
  'Servicios': ['Logística', 'Marketing', 'Diseño', 'Consultoría'],
  'Juguetería': ['0-3 años', '3-8 años', 'Juegos de mesa', 'Educativos'],
  'Ferretería': ['Fijaciones', 'Electricidad', 'Plomería', 'Pinturería'],
  'Iluminación': ['LED', 'Decorativa', 'Exterior', 'Industrial'],
  'Muebles': ['Living', 'Dormitorio', 'Cocina', 'Oficina', 'Jardín'],
  'Textil y Telas': ['Sábanas', 'Frazadas', 'Telas por metro', 'Toallas', 'Manteles'],
  'Librería y Papelería': ['Útiles escolares', 'Oficina', 'Arte y manualidades'],
  'Marroquinería y Bolsos': ['Carteras', 'Mochilas', 'Valijas', 'Billeteras', 'Cinturones'],
  'Limpieza': ['Hogar', 'Industrial', 'Higiene personal', 'Descartables'],
  'Blanquería': ['Sábanas', 'Acolchados', 'Almohadas', 'Toallas', 'Manteles'],
  'Mascotas': ['Perros', 'Gatos', 'Aves', 'Peces', 'Accesorios'],
  'Bebés y Niños': ['Ropa', 'Juguetes', 'Higiene', 'Alimentación', 'Accesorios'],
  'Electrónica': ['Audio', 'Video', 'Componentes', 'Cables', 'Cargadores'],
  'Herramientas': ['Manuales', 'Eléctricas', 'Medición', 'Seguridad'],
  'Packaging': ['Cajas', 'Bolsas', 'Papel de regalo', 'Etiquetas', 'Cinta'],
  'Otro': ['General'],
};

const EXCEL_COL_PATTERNS = {
  nombre: ['nombre', 'titulo', 'title', 'producto', 'articulo', 'item', 'name', 'denominacion'],
  precio: ['precio', 'price', 'costo', 'pvp', 'valor', 'importe', 'monto', 'cost', 'precio mayorista'],
  stock: ['stock', 'cantidad', 'cant', 'qty', 'disponible', 'inventario', 'inventory', 'existencias'],
  descripcion: ['descripcion', 'description', 'detalle', 'desc', 'descripcion larga'],
  categoria: ['categoria', 'category', 'rubro', 'tipo', 'categorias', 'cat', 'grupo'],
};

const EXCEL_CAT_MAP_RULES = [
  { patterns: ['sabana', 'frazada', 'blanqueria', 'blanquería', 'acolchado', 'toalla', 'mantel'], cat: 'Blanquería' },
  { patterns: ['textil', 'tela', 'telas'], cat: 'Textil y Telas' },
  { patterns: ['mueble', 'sillon', 'sofa', 'mesa', 'silla'], cat: 'Muebles' },
  { patterns: ['decorac', 'deco', 'cocina', 'hogar'], cat: 'Hogar y Deco' },
  { patterns: ['iluminac', 'lampara', 'led', 'foco', 'luz'], cat: 'Iluminación' },
  { patterns: ['limpieza', 'detergente', 'desinfect', 'jabón', 'jabon'], cat: 'Limpieza' },
  { patterns: ['ropa', 'moda', 'indumentaria', 'calzado', 'remera', 'pantalon', 'camisa', 'vestido', 'jean'], cat: 'Indumentaria' },
  { patterns: ['perfum', 'cosmetic', 'belleza', 'salud', 'cuidado', 'suplement'], cat: 'Belleza y Salud' },
  { patterns: ['tecnolog', 'celular', 'comput', 'tablet', 'notebook', 'smartphone'], cat: 'Tecnología' },
  { patterns: ['electr', 'audio', 'video', 'cable', 'component', 'cpu'], cat: 'Electrónica' },
  { patterns: ['bazar', 'descartable', 'mayoreo'], cat: 'Bazar' },
  { patterns: ['aliment', 'bebida', 'snack', 'comida', 'dulce', 'golosina'], cat: 'Alimentos' },
  { patterns: ['deport', 'gym', 'fitness', 'sport'], cat: 'Deportes' },
  { patterns: ['auto', 'moto', 'repuest', 'vehicul'], cat: 'Automotor' },
  { patterns: ['construc', 'material', 'pintura', 'cemento', 'ladrill'], cat: 'Construcción' },
  { patterns: ['ferret', 'fijacion', 'tornillo', 'clavo', 'tuerca'], cat: 'Ferretería' },
  { patterns: ['herramienta', 'taladro', 'sierra', 'destornill'], cat: 'Herramientas' },
  { patterns: ['juguete', 'juego', 'peluche', 'didact'], cat: 'Juguetería' },
  { patterns: ['papeler', 'librer', 'utiles', 'lapiz', 'cuaderno', 'carpeta'], cat: 'Librería y Papelería' },
  { patterns: ['cartera', 'bolso', 'mochila', 'valija', 'marroquin'], cat: 'Marroquinería y Bolsos' },
  { patterns: ['mascota', 'perro', 'gato', 'veterinar'], cat: 'Mascotas' },
  { patterns: ['bebe', 'nino', 'infan', 'maternal', 'pañal'], cat: 'Bebés y Niños' },
  { patterns: ['packag', 'caja', 'bolsa', 'embalaje', 'envase', 'nylon'], cat: 'Packaging' },
  { patterns: ['servic', 'logistic', 'transport', 'consultoria'], cat: 'Servicios' },
];

function quitarAcentos(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function mapExcelCat(raw) {
  if (!raw) return null;
  const n = quitarAcentos(raw.toLowerCase());
  for (const { patterns, cat } of EXCEL_CAT_MAP_RULES) {
    if (patterns.some(p => n.includes(quitarAcentos(p)))) return cat;
  }
  return null;
}

function autoDetectCols(headers) {
  const result = {};
  for (const [field, patterns] of Object.entries(EXCEL_COL_PATTERNS)) {
    const found = headers.find(h =>
      patterns.some(p => quitarAcentos(h.toLowerCase()).includes(quitarAcentos(p)))
    );
    if (found) result[field] = found;
  }
  return result;
}

function actualizarSubcats(principalId, subId, subGroupId) {
  const cat = document.getElementById(principalId)?.value;
  const subEl = document.getElementById(subId);
  const subGroup = document.getElementById(subGroupId);
  if (!subEl) return;
  const subs = CAT_SUBCATS[cat] || [];
  if (!cat || !subs.length) { if (subGroup) subGroup.style.display = 'none'; return; }
  subEl.innerHTML = '<option value="">General</option>' + subs.map(s => `<option value="${s}">${s}</option>`).join('');
  if (subGroup) subGroup.style.display = 'block';
}

function matchesQuery(p, q) {
  if (!q) return true;
  const qn = quitarAcentos(q.toLowerCase());
  if (quitarAcentos(p.nombre.toLowerCase()).includes(qn)) return true;
  if (quitarAcentos((p.rubro || '').toLowerCase()).includes(qn)) return true;
  if (matchesZona(p.provincia, qn)) return true;
  if (p.descripcion && quitarAcentos(p.descripcion.toLowerCase()).includes(qn)) return true;
  for (const [sub, rubros] of Object.entries(SUBCATEGORIA_MAP)) {
    if (sub.includes(qn) || qn.includes(sub.split(' ')[0])) {
      if (rubros.some(r => matchesCat(p.rubro, r))) return true;
    }
  }
  return false;
}

// Alias de zona → provincia tal como está cargada en `proveedores.provincia`.
// La gente busca por ciudad o por el nombre coloquial ("capital federal", "once",
// "rosario"), no por el nombre formal de la provincia. Sin esto esas búsquedas
// devuelven cero aunque haya oferta en esa zona. Todo en minúscula y sin acentos.
const ZONA_ALIAS = {
  'capital federal': 'caba', 'capital': 'caba', 'ciudad de buenos aires': 'caba',
  'once': 'caba', 'flores': 'caba', 'avellaneda': 'caba', 'microcentro': 'caba',
  'gba': 'buenos aires', 'amba': 'buenos aires', 'conurbano': 'buenos aires',
  'mar del plata': 'buenos aires', 'la plata': 'buenos aires', 'quilmes': 'buenos aires',
  'rosario': 'santa fe', 'cordoba capital': 'cordoba',
};

// Devuelve true si la query apunta a la provincia del proveedor, sea por nombre
// directo ("cordoba") o por alias de zona ("capital federal" → CABA).
// Nunca matchea por substring: un fragmento a mitad de palabra arrastraba el
// catálogo entero de una provincia ("nos" traía todo Buenos Aires). Pide 3+
// caracteres por el mismo motivo.
//   - Provincia: prefijo de cualquiera de sus palabras, porque es el nombre propio
//     del lugar y buscar "aires" para Buenos Aires es legítimo.
//   - Alias: prefijo de la FRASE COMPLETA únicamente. Si se permitiera por palabra,
//     "plata" (joyería) traería Buenos Aires vía "mar del plata".
function matchesZona(provincia, qn) {
  if (!provincia || qn.length < 3) return false;
  const pn = quitarAcentos(provincia.toLowerCase());
  if (pn === qn || pn.split(/[\s,]+/).some(w => w.startsWith(qn))) return true;
  for (const [alias, prov] of Object.entries(ZONA_ALIAS)) {
    if (alias.startsWith(qn) && pn.includes(prov)) return true;
  }
  return false;
}

// Búsqueda de producto con expansión de conceptos. Además del match literal por
// nombre/categoría/proveedor, si el término buscado es un tipo de producto conocido
// (ej. "zapatillas", "botas", "sandalias" → Calzado) también trae todos los productos
// de esa categoría aunque el nombre no contenga la palabra exacta. Mismo criterio que
// matchesQuery (búsqueda de proveedores), para que ambas pestañas se comporten igual.
// La provincia del proveedor entra al match porque mucha gente busca por zona
// ("mendoza", "cordoba", "rosario") desde el buscador de productos, que es el tab
// por defecto; sin esto esas búsquedas devolvían cero aunque hubiera oferta ahí.
function prodMatchesQuery(p, q) {
  const qn = quitarAcentos((q || '').toLowerCase().trim());
  if (!qn) return true;
  const nombre = quitarAcentos((p.nombre || '').toLowerCase());
  const cat = quitarAcentos((p.cat || '').toLowerCase());
  const catP = quitarAcentos((p.catPrincipal || '').toLowerCase());
  const prov = quitarAcentos((p.provNombre || '').toLowerCase());
  const desc = quitarAcentos((p.descripcion || '').toLowerCase());
  if (nombre.includes(qn) || cat.includes(qn) || catP.includes(qn) || prov.includes(qn) || desc.includes(qn)) return true;
  if (matchesZona(p.provincia, qn)) return true;
  const catReal = p.catPrincipal || p.cat || '';
  for (const [sub, rubros] of Object.entries(SUBCATEGORIA_MAP)) {
    if (sub.includes(qn) || qn.includes(sub.split(' ')[0])) {
      if (rubros.some(r => matchesCat(catReal, r))) return true;
    }
  }
  return false;
}

// ===== ESCALERA DE RESCATE DEL BUSCADOR =====
// Todo lo que sigue corre SOLO cuando la búsqueda literal ya devolvió cero, así que
// no puede empeorar un resultado que hoy funciona. Ver js/buscador.js para el porqué.

// Texto de la query tal cual se prueba en el primer intento: se le sacan los
// espacios de sobra pero se le respeta la puntuación, porque quitarla podría perder
// un match legítimo ("3.5mm"). La limpieza fuerte llega recién en el segundo intento.
function egTrim(q) {
  return (q == null ? '' : String(q)).toLowerCase().replace(/\s+/g, ' ').trim();
}

// El texto buscable de cada ficha, ya normalizado y partido en palabras. Se guarda
// en un WeakMap para no ensuciar los objetos que vienen de Supabase.
const _egBlobProv = new WeakMap();
function _provBlob(p) {
  let b = _egBlobProv.get(p);
  if (b === undefined) {
    b = egNorm([p.nombre, p.rubro, p.provincia, p.descripcion].join(' ')).split(' ');
    _egBlobProv.set(p, b);
  }
  return b;
}

const _egBlobProd = new WeakMap();
function _prodBlob(p) {
  let b = _egBlobProd.get(p);
  if (b === undefined) {
    b = egNorm([p.nombre, p.cat, p.catPrincipal, p.provNombre, p.descripcion].join(' ')).split(' ');
    _egBlobProd.set(p, b);
  }
  return b;
}

// Expansión por concepto para UNA palabra suelta. A diferencia de la que usa
// matchesQuery, acá se exige igualdad con la subcategoría o con su primera palabra:
// una palabra sola matcheando por substring es justo lo que hacía que "ropa"
// arrastrara "Europa".
function _tokenConcepto(rubroStr, token) {
  for (const [sub, rubros] of Object.entries(SUBCATEGORIA_MAP)) {
    if (sub === token || sub.split(' ')[0] === token) {
      if (rubros.some(r => matchesCat(rubroStr, r))) return true;
    }
  }
  return false;
}

// Una palabra suelta matchea por CABEZA de palabra, nunca por pedazo del medio.
// Con substring crudo, "ara" (de "perfumes ara") matcheaba "para" y "clara" y traía
// 30 proveedores que no tenían nada que ver. Los tokens de 3 letras exigen igualdad
// exacta porque a ese largo cualquier prefijo es ruido.
function _tokenEnPalabras(palabras, t) {
  if (t.length <= 3) return palabras.includes(t);
  for (const w of palabras) if (w.startsWith(t)) return true;
  return false;
}

function _contarTokens(palabras, provincia, rubroStr, tokens) {
  let n = 0;
  for (const t of tokens) {
    if (_tokenEnPalabras(palabras, t) || matchesZona(provincia, t) || _tokenConcepto(rubroStr, t)) n++;
  }
  return n;
}

// Recorre los intentos de menor a mayor apertura y se queda con el primero que
// devuelve algo. `modo` le dice a la UI qué aviso mostrar:
//   ''            → la búsqueda literal anduvo, no se avisa nada
//   'corregido'   → se buscó otra palabra ("basar" → "bazar")
//   'tokens'      → matchearon todas las palabras, pero sueltas
//   'relacionado' → matchearon algunas: son resultados parecidos, no exactos
function egEscaleraBusqueda(base, q, match, contar) {
  const literal = egTrim(q);
  let lista = base.filter(p => match(p, literal));
  if (lista.length) return { lista, modo: '', termino: literal };

  const { texto, cambio } = egCorregirBusqueda(q);
  if (texto && texto !== literal) {
    lista = base.filter(p => match(p, texto));
    if (lista.length) return { lista, modo: cambio ? 'corregido' : '', termino: texto };
  }

  const sing = egSingularBusqueda(texto || literal);
  if (sing && sing !== texto && sing !== literal) {
    lista = base.filter(p => match(p, sing));
    if (lista.length) return { lista, modo: 'corregido', termino: sing };
  }

  const toks = egTokensBusqueda(q);
  if (toks.length > 1) {
    lista = base.filter(p => contar(p, toks) === toks.length);
    if (lista.length) return { lista, modo: 'tokens', termino: toks.join(' ') };
  }
  if (toks.length) {
    const puntuados = [];
    for (const p of base) {
      const n = contar(p, toks);
      if (n > 0) puntuados.push({ p, n });
    }
    if (puntuados.length) {
      puntuados.sort((a, b) => b.n - a.n);
      return { lista: puntuados.map(x => x.p), modo: 'relacionado', termino: toks.join(' ') };
    }
  }
  return { lista: [], modo: '', termino: literal };
}

// Aviso sobre los resultados. Es importante que la persona vea que le cambiamos el
// término: si buscó "basar" y le mostramos bazar sin decirle nada, parece un bug.
function egAvisoBusqueda(res, original) {
  if (!res.modo) return '';
  const orig = escHtml(egTrim(original));
  const usado = escHtml(res.termino);
  const texto = res.modo === 'corregido'
    ? `No encontramos nada con <strong>${orig}</strong>. Le mostramos resultados para <strong>${usado}</strong>.`
    : res.modo === 'tokens'
      ? `No hay coincidencias exactas con <strong>${orig}</strong>. Le mostramos lo que contiene todas esas palabras.`
      : `No hay coincidencias exactas con <strong>${orig}</strong>. Estos son los resultados más parecidos.`;
  return `<div class="buscar-aviso">${texto}</div>`;
}

function egPintarAviso(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html || '';
}

// Mide cuánto está rescatando la escalera. Sin esto no hay forma de saber si el
// 46% de búsquedas sin resultados bajó por el arreglo o por otra cosa.
function egTrackRescate(original, res) {
  if (!res.modo) return;
  trackEvent('search_rescatada', {
    desde: egTrim(original).slice(0, 60),
    hacia: String(res.termino).slice(0, 60),
    modo: res.modo,
    results: res.lista.length,
  });
}

const RUBRO_LEGACY = {
  // Old rubros → new rubros
  'Moda': 'Indumentaria', 'Hogar': 'Hogar y Deco', 'Salud': 'Belleza y Salud',
  'Textiles': 'Textil y Telas', 'Otros': 'Otro',
  'Bolsos y Marroquinería': 'Marroquinería y Bolsos', 'Ropa de mujer': 'Indumentaria', 'Ropa de hombre': 'Indumentaria',
  'Ropa de bebé y niños': 'Bebés y Niños', 'Talles especiales': 'Indumentaria', 'Ropa deportiva': 'Deportes',
  'Accesorios de moda': 'Indumentaria', 'Muebles y decoración': 'Muebles',
  'Artículos de cocina': 'Hogar y Deco', 'Limpieza y hogar': 'Limpieza', 'Perfumería y cosméticos': 'Belleza y Salud',
  'Cuidado personal': 'Belleza y Salud', 'Suplementos y nutrición': 'Belleza y Salud', 'Tecnología y electrónica': 'Tecnología',
  'Accesorios de celular': 'Tecnología', 'Carteras y mochilas': 'Marroquinería y Bolsos', 'Zapatos': 'Calzado', 'Zapatillas': 'Calzado',
  'Telas e insumos textiles': 'Textil y Telas', 'Juguetes y juegos': 'Juguetería', 'Librería y papelería': 'Librería y Papelería',
  'Alimentos y bebidas': 'Alimentos', 'Tecnologia': 'Tecnología',
  // Current rubros map to themselves
  'Tecnología': 'Tecnología', 'Indumentaria': 'Indumentaria', 'Calzado': 'Calzado', 'Hogar y Deco': 'Hogar y Deco',
  'Bazar': 'Bazar', 'Alimentos': 'Alimentos', 'Belleza y Salud': 'Belleza y Salud',
  'Deportes': 'Deportes', 'Automotor': 'Automotor', 'Construcción': 'Construcción',
  'Servicios': 'Servicios', 'Juguetería': 'Juguetería', 'Ferretería': 'Ferretería',
  'Iluminación': 'Iluminación', 'Muebles': 'Muebles', 'Textil y Telas': 'Textil y Telas',
  'Librería y Papelería': 'Librería y Papelería', 'Marroquinería y Bolsos': 'Marroquinería y Bolsos',
  'Limpieza': 'Limpieza', 'Blanquería': 'Blanquería', 'Mascotas': 'Mascotas',
  'Bebés y Niños': 'Bebés y Niños', 'Electrónica': 'Electrónica', 'Herramientas': 'Herramientas',
  'Packaging': 'Packaging', 'Otro': 'Otro',
};

function matchesCat(rubroStr, cat) {
  if (!rubroStr || cat === 'Todas') return true;
  const rubros = rubroStr.split(',').map(r => r.trim()).filter(Boolean);
  const catNorm = RUBRO_LEGACY[cat] || cat;
  return rubros.some(r => {
    if (r === cat) return true;
    const rNorm = RUBRO_LEGACY[r] || r;
    return rNorm === cat || rNorm === catNorm;
  });
}

function renderRubrosPicker(containerId, preselected = []) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const normPre = preselected.map(r => RUBRO_LEGACY[r] || r);
  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px" id="${containerId}-chips">
      ${RUBROS_LISTA.map(r => {
    const sel = normPre.includes(r);
    return `<button type="button" data-rubro="${r}"
          onclick="toggleRubroChip(this,'${containerId}')"
          style="display:flex;align-items:center;gap:5px;border:1.5px solid ${sel ? '#006039' : '#ddd'};background:${sel ? '#e6faf4' : 'white'};color:${sel ? '#006039' : '#555'};border-radius:20px;padding:6px 14px;font-size:.82rem;font-weight:${sel ? '700' : '500'};cursor:pointer;font-family:inherit;transition:all .15s">
          ${RUBROS_ICONS[r] || ''} ${r}
        </button>`;
  }).join('')}
    </div>
    <div style="font-size:.75rem;color:#888" id="${containerId}-counter">${normPre.length}/${MAX_RUBROS} seleccionados</div>`;
}

// Puebla los <select> de categoría de producto (carga y edición) desde RUBROS_LISTA
// para que nunca se desincronicen de las categorías del buscador.
function poblarSelectsCategoria() {
  const opciones = RUBROS_LISTA.map(r => `<option>${r}</option>`).join('');
  ['new-prod-cat-principal', 'edit-prod-cat-principal'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">Seleccioná categoría...</option>${opciones}`;
  });
}
document.addEventListener('DOMContentLoaded', poblarSelectsCategoria);

function toggleRubroChip(btn, containerId) {
  const el = document.getElementById(containerId);
  const r = btn.dataset.rubro;
  const selected = btn.style.background !== 'white';
  if (!selected) {
    const count = el.querySelectorAll('button[data-rubro]').length - [...el.querySelectorAll('button[data-rubro]')].filter(b => b.style.background === 'white').length;
    if (count >= MAX_RUBROS) { showToast('Máximo ' + MAX_RUBROS + ' rubros'); return; }
    btn.style.border = '1.5px solid #006039';
    btn.style.background = '#e6faf4';
    btn.style.color = '#006039';
    btn.style.fontWeight = '700';
  } else {
    btn.style.border = '1.5px solid #ddd';
    btn.style.background = 'white';
    btn.style.color = '#555';
    btn.style.fontWeight = '500';
  }
  const count2 = [...el.querySelectorAll('button[data-rubro]')].filter(b => b.style.background !== 'white').length;
  const counter = document.getElementById(containerId + '-counter');
  if (counter) counter.textContent = count2 + '/' + MAX_RUBROS + ' seleccionados';
}

function getRubrosSeleccionados(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return [...el.querySelectorAll('button[data-rubro]')]
    .filter(b => b.style.background !== 'white')
    .map(b => b.dataset.rubro);
}

// ===== SPLASH SCREEN =====
(function initSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  // Ocultar después de 1.8 segundos
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => { splash.style.display = 'none'; }, 520);
  }, 1800);
})();

// ===== ESCAPE XSS =====
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== PLAN PRO - PROMO DEADLINE =====
function esPromoActiva() { return false; }

// Helper único para verificar si el proveedor logueado tiene Plan Pro activo.
// plan_hasta=null significa Pro permanente (activado manualmente o por admin).
// checkSession() ya invalida planes vencidos seteando plan='gratis', así que
// si plan==='pro' podemos confiar que está vigente; igual hacemos el check de fecha.
function esProvPro() {
  const pd = currentUser?.provData;
  if (!pd || pd.plan !== 'pro') return false;
  if (!pd.plan_hasta) return true; // Pro sin vencimiento definido = activo
  return new Date(pd.plan_hasta + 'T03:00:00Z') > new Date();
}

// ===== CONTADOR ANIMADO =====
function animarContador(el, target, prefix) {
  if (!el || target === 0) { if (el) el.textContent = '0'; return; }
  const duration = 1200;
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Easing ease-out
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);
    el.textContent = (prefix || '') + current.toLocaleString('es-AR');
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ===== BOTÓN VOLVER ARRIBA =====
(function initBtnTop() {
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('btn-top');
    if (!btn) return;
    if (window.scrollY > 300) {
      btn.style.display = 'flex';
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1)';
    } else {
      btn.style.opacity = '0';
      btn.style.transform = 'scale(.8)';
      setTimeout(() => { if (window.scrollY <= 300) btn.style.display = 'none'; }, 300);
    }
  }, { passive: true });
})();

// ===== SCROLL ANIMATIONS =====
function checkReveal() {
  const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-scale');
  els.forEach(el => {
    if (el.classList.contains('visible')) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 40) el.classList.add('visible');
  });
}
// Escuchar scroll en toda la página
window.addEventListener('scroll', checkReveal, { passive: true });
// También al cargar
document.addEventListener('DOMContentLoaded', () => {
  // Push a dummy state so popstate fires on Android back button
  history.pushState(null, '', window.location.pathname);
  window.addEventListener('popstate', () => {
    goBack('inicio');
    // Re-push so the next back press also fires popstate
    history.pushState(null, '', window.location.pathname);
  });

  setTimeout(checkReveal, 200);
  setTimeout(mostrarBurbujaReco, 3000);
  document.addEventListener('click', e => {
    if (!e.target.closest('#search-dropdown') && !e.target.closest('#searchInput')) {
      hideSearchDropdown();
    }
  });

  const tnParam = new URLSearchParams(window.location.search).get('tn');
  if (tnParam === 'ok') {
    setTimeout(() => showToast('Tienda Nube conectada. Ya podés sincronizar tus productos.'), 1200);
    history.replaceState({}, '', window.location.pathname);
  } else if (tnParam === 'error') {
    setTimeout(() => showToast('Error al conectar Tienda Nube. Intentá de nuevo.'), 1200);
    history.replaceState({}, '', window.location.pathname);
  }

  const mlParam = new URLSearchParams(window.location.search).get('ml');
  if (mlParam === 'ok') {
    setTimeout(() => showToast('Mercado Libre conectado. Ya podés sincronizar tus productos.'), 1200);
    history.replaceState({}, '', window.location.pathname);
  } else if (mlParam === 'error') {
    const reason = new URLSearchParams(window.location.search).get('reason');
    setTimeout(() => showToast(reason ? `Error al conectar Mercado Libre (${reason}). Intentá de nuevo.` : 'Error al conectar Mercado Libre. Intentá de nuevo.'), 1200);
    history.replaceState({}, '', window.location.pathname);
  }

  const pagoParam = new URLSearchParams(window.location.search).get('pago');
  if (pagoParam === 'ok') {
    history.replaceState({}, '', window.location.pathname);
    // El webhook de MP puede tardar unos segundos en llegar y actualizar Supabase.
    // Hacemos polling hasta confirmar que el plan se actualizó (máx ~16 seg).
    let intentos = 0;
    const MAX_INTENTOS = 8;
    const verificarPlan = async () => {
      intentos++;
      await checkSession();
      if (esProvPro()) {
        showToast('🎉 ¡Plan Pro activado! Ahora tenés acceso a todas las funciones.');
        goTo('perfil');
      } else if (intentos < MAX_INTENTOS) {
        setTimeout(verificarPlan, 2000);
      } else {
        showToast('Pago recibido. El Plan Pro se activará en minutos. Si no aparece, escribinos.');
        goTo('perfil');
      }
    };
    setTimeout(() => {
      showToast('⏳ Verificando pago...');
      verificarPlan();
    }, 2500);
  } else if (pagoParam === 'error') {
    history.replaceState({}, '', window.location.pathname);
    setTimeout(() => showToast('Hubo un problema con el pago. Intentá de nuevo.'), 800);
  } else if (pagoParam === 'pendiente') {
    history.replaceState({}, '', window.location.pathname);
    setTimeout(() => showToast('Tu pago está pendiente de acreditación. Te avisaremos cuando se confirme.'), 800);
  }

  // Deep-link a la pantalla de planes (ej: link de renovación enviado por WhatsApp).
  const irParam = new URLSearchParams(window.location.search).get('ir');
  if (irParam === 'planes') {
    history.replaceState({}, '', window.location.pathname);
    setTimeout(() => { try { goTo('planes'); } catch (e) { } }, 600);
  } else if (irParam === 'cotizaciones') {
    // Deep-link a Cotizaciones (ej: el botón del mail de anuncio).
    // cotizaciones.js se carga DESPUÉS que app.js, así que se reintenta un
    // momento por si el módulo todavía no registró su entrada global.
    history.replaceState({}, '', window.location.pathname);
    let intentosCotiz = 0;
    const abrirCotiz = () => {
      if (typeof window.abrirCotizaciones === 'function') {
        try { window.abrirCotizaciones(); } catch (e) { }
        return;
      }
      if (++intentosCotiz < 10) setTimeout(abrirCotiz, 300);
    };
    setTimeout(abrirCotiz, 600);
  }
});
setTimeout(checkReveal, 500);

// ===== ESTADO GLOBAL =====
let currentUser = null;
let historial = [];
let productos = [];
let proveedoresDB = [];
let currentCat = 'Todas';
let currentResult = '';
let pantallaAnterior = 'buscar'; // kept for legacy callers — mirrors navStack
let provActual = null;
let chatMsgs = [];
let buscarTab = 'productos';
let productoActual = null;
// Deep-link a un producto via ?p=<id>. Se captura al cargar el módulo (antes de que
// el setup de popstate normalice la URL) para poder abrir el producto una vez cargado el catálogo.
let _deepLinkProd = (() => { try { return new URLSearchParams(window.location.search).get('p'); } catch (e) { return null; } })();
// Deep-link a un proveedor via ?prov=<id> (mismo patrón que ?p=, para que las URLs
// de proveedor del sitemap aterricen en su ficha).
let _deepLinkProv = (() => { try { return new URLSearchParams(window.location.search).get('prov'); } catch (e) { return null; } })();
let pantallaAnteriorProd = 'inicio'; // kept for legacy callers — mirrors navStack
const navStack = []; // navigation history stack

function goBack(fallback) {
  navStack.pop(); // remove current screen
  const dest = navStack.length > 0 ? navStack.pop() : (fallback || 'inicio');
  goTo(dest); // goTo re-pushes dest onto stack
}
let provDetalleMostrarTodos = false;
let _searchDebounceTimer = null;
const BUSQ_RECIENTES_KEY = 'eg_busq_recientes';
const MAX_BUSQ_RECIENTES = 5;

// ===== FAVORITOS =====
let favs = [];
try { favs = JSON.parse(localStorage.getItem('eg_favs') || '[]'); } catch (e) { favs = []; }

function guardarFavs() {
  try { localStorage.setItem('eg_favs', JSON.stringify(favs)); } catch (e) { }
  refreshFavBadge();
}
function refreshFavBadge() {
  const b = document.getElementById('fav-badge');
  if (!b) return;
  if (favs.length > 0) { b.style.display = 'flex'; b.textContent = favs.length; }
  else b.style.display = 'none';
}
function esFav(id) { return favs.some(f => String(f.id) === String(id)); }
function toggleFav(id) {
  const lista = proveedoresDB;
  const p = lista.find(x => String(x.id) === String(id));
  if (!p) return;
  const idx = favs.findIndex(f => String(f.id) === String(id));
  if (idx >= 0) { favs.splice(idx, 1); showToast('Eliminado de favoritos'); haptic('light'); }
  else { favs.push(p); showToast('¡Guardado en favoritos!'); haptic('success'); }
  guardarFavs();
  renderFavs();
}
function toggleFavId(id, btn) {
  toggleFav(id);
  if (!btn) return;
  const faved = esFav(String(id));
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.setAttribute('fill', faved ? '#EF4444' : 'none');
    svg.setAttribute('stroke', faved ? '#EF4444' : '#CBD5E1');
  }
}
function toggleFavActual() {
  if (!provActual) return;
  toggleFav(provActual.id);
  const btn = document.getElementById('det-fav-btn');
  if (btn) btn.textContent = esFav(provActual.id) ? '❤️' : '♡';
}
function renderFavs() {
  const el = document.getElementById('favs-list');
  if (!el) return;
  if (!favs.length) {
    el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#6B7A99"><div style="font-size:3rem;margin-bottom:12px">❤️</div><p style="font-size:.88rem;line-height:1.6">Todavia no guardaste favoritos.<br>Toca el corazon en cualquier proveedor.</p></div>';
    return;
  }
  const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D'];
  el.innerHTML = favs.map((p, i) => {
    const pid = String(p.id);
    const bg = _monoColor(p.id);
    const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
    const avgR = getProvRating(pid).avg.toFixed(1);
    return `<div data-id="${pid}" style="background:white;border-radius:16px;border:1px solid #DCE8E2;margin-bottom:12px;overflow:hidden;cursor:pointer">
      <div style="display:flex;align-items:center;gap:11px;padding:12px 14px 8px">
        ${p.logo_url
        ? `<div style="width:44px;height:44px;border-radius:11px;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${escHtml(imgThumb(p.logo_url, 200, 75))}" style="width:100%;height:100%;object-fit:cover;background:#F3F4F6"></div>`
        : `<div style="width:44px;height:44px;border-radius:11px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;flex-shrink:0;font-family:'Inter',sans-serif">${escHtml(ini)}</div>`
      }
        <div style="flex:1;min-width:0">
          <div style="font-family:'Inter',sans-serif;font-size:.93rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.nombre)}</div>
          <div style="font-size:.75rem;color:#6B7A99;margin-top:2px">${escHtml(p.rubro || '')}${p.provincia ? ' · ' + escHtml(p.provincia) : ''}</div>
        </div>
        <div style="font-size:.76rem;font-weight:700;color:#F59E0B;flex-shrink:0">${avgR} ★</div>
      </div>
      <div style="padding:0 14px 13px">
        <p style="font-size:.79rem;color:#6B7A99;line-height:1.45;margin-bottom:9px">${p.desc || ''}</p>
        <div style="display:flex;gap:7px">
          <button data-favid="${pid}" style="background:#FFF0F5;color:#EF4444;border:none;border-radius:9px;padding:7px 12px;font-size:.76rem;font-weight:700;cursor:pointer">❤️ Quitar</button>
        </div>
      </div>
    </div>`;
  }).join('');
  el.onclick = function (e) {
    const fb = e.target.closest('[data-favid]');
    const card = e.target.closest('[data-id]');
    if (fb) { e.stopPropagation(); toggleFav(fb.dataset.favid); return; }
    if (card) abrirDetalle(card.dataset.id);
  };
}

// ===== SUPABASE =====
async function cargarProveedores() {
  try {
    const { data, error } = await sb.from('proveedores').select('id,nombre,rubro,descripcion,plan,plan_hasta,whatsapp,provincia,pedido_minimo,envios,instagram,logo_url,visitas,estado,created_at').eq('estado', 'aprobado').order('created_at', { ascending: false });
    if (error) throw error;
    if (data && data.length > 0) {
      proveedoresDB = data.map(p => ({
        id: String(p.id), nombre: p.nombre, rubro: p.rubro || 'General',
        desc: p.descripcion || '', pro: p.plan === 'pro' && (!p.plan_hasta || new Date(p.plan_hasta + 'T03:00:00Z') > new Date()),
        inicial: p.nombre.substring(0, 2).toUpperCase(), whatsapp: p.whatsapp || '',
        provincia: p.provincia || '', pedido_minimo: p.pedido_minimo || 'Sin minimo',
        envios: p.envios || 'Consultar', instagram: p.instagram || '',
        logo_url: p.logo_url || '', plan_hasta: p.plan_hasta || null, visitas: p.visitas || 0
      }));
    } else { proveedoresDB = []; }
  } catch (e) { proveedoresDB = []; }
  proveedoresDB.sort((a, b) => {
    const score = p => (p.pro ? 20 : 0) + Math.min(p.visitas, 500) * 0.06;
    return score(b) - score(a);
  });
  renderProvs(proveedoresDB.filter(p => !esProvSoloServicio(p)));
  renderServicios();
  actualizarContadorServicios();
  renderMapaProvincias();
  renderMapaAllProvs();
}


// ===== RESEÑAS (Supabase real) =====
// Cache en memoria para no pedir siempre lo mismo
const resenasCache = {};

function renderStarsHTML(rating, size) {
  const sizes = { sm: '1rem', xs: '.78rem' };
  const s = sizes[size] || '1rem';
  return [1, 2, 3, 4, 5].map(n => `<span style="color:${n <= Math.round(rating) ? '#F59E0B' : '#d1d5db'};font-size:${s}">★</span>`).join('');
}

function calcRatingStats(resenas) {
  if (!resenas.length) return { avg: 0, count: 0, dist: [0, 0, 0, 0, 0] };
  const dist = [0, 0, 0, 0, 0];
  resenas.forEach(r => { if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++; });
  const avg = resenas.reduce((s, r) => s + r.rating, 0) / resenas.length;
  return { avg, count: resenas.length, dist };
}

// Función para leer desde Supabase
async function cargarResenas(provId) {
  const pid = String(provId);
  // Si ya las tenemos en cache, las devolvemos
  if (resenasCache[pid]) return resenasCache[pid];
  try {
    const { data, error } = await sb
      .from('resenas')
      // Sin usuario_email: es privado (solo auditoría del dueño), no público.
      .select('id, proveedor_id, usuario_nombre, estrellas, texto, created_at')
      .eq('proveedor_id', pid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    resenasCache[pid] = (data || []).map(r => ({ ...r, autor: r.usuario_nombre, rating: r.estrellas, fecha: r.created_at }));
    return resenasCache[pid];
  } catch (e) {
    return [];
  }
}

// También expone rating para cards (sin await — usa cache o 0)
function getProvRating(provId) {
  const pid = String(provId);
  const cached = resenasCache[pid];
  if (!cached || !cached.length) return { avg: 0, count: 0, dist: [0, 0, 0, 0, 0] };
  return calcRatingStats(cached);
}

async function renderRatingSummary(provId) {
  const pid = String(provId);

  // Mostrar loading mientras carga
  const listEl = document.getElementById('det-resenas-list');
  if (listEl) listEl.innerHTML = '<p style="font-size:.82rem;color:var(--gray);text-align:center;padding:12px 0">Cargando reseñas...</p>';

  const resenas = await cargarResenas(pid);
  const { avg, count, dist } = calcRatingStats(resenas);

  // Avg
  const avgEl = document.getElementById('det-rating-avg');
  if (avgEl) avgEl.textContent = count > 0 ? avg.toFixed(1) : '—';

  // Stars
  const starsEl = document.getElementById('det-rating-stars');
  if (starsEl) starsEl.innerHTML = renderStarsHTML(avg, 'sm');

  // Count
  const countEl = document.getElementById('det-rating-count');
  if (countEl) countEl.textContent = count > 0 ? `${count} reseña${count !== 1 ? 's' : ''}` : 'Sin reseñas aún';

  // Barras
  const barsEl = document.getElementById('det-rating-bars');
  if (barsEl) {
    barsEl.innerHTML = [5, 4, 3, 2, 1].map(n => {
      const c = dist[n - 1];
      const pct = count > 0 ? Math.round((c / count) * 100) : 0;
      return `<div class="rating-bar-row">
        <span class="rating-bar-label">${n}</span>
        <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div>
        <span class="rating-bar-count">${c}</span>
      </div>`;
    }).join('');
  }

  // Lista de reseñas
  if (listEl) {
    if (!resenas.length) {
      listEl.innerHTML = '<p style="font-size:.82rem;color:var(--gray);text-align:center;padding:8px 0">Todavía no tiene reseñas. Sea el primero en dejar una.</p>';
    } else {
      listEl.innerHTML = resenas.slice(0, 5).map(r => {
        const fechaStr = r.fecha ? timeAgo(new Date(r.fecha)) : 'Reciente';
        return `<div class="resena-card">
          <div class="resena-header">
            <div>
              <div class="resena-autor">${escHtml(r.autor)}</div>
              <div style="display:flex;gap:2px;margin-top:2px">${renderStarsHTML(r.rating, 'xs')}</div>
            </div>
            <div class="resena-fecha">${escHtml(fechaStr)}</div>
          </div>
          <div class="resena-texto">${escHtml(r.texto)}</div>
        </div>`;
      }).join('');
    }
  }

  // Actualizar rating en cards si están visibles
  filterProvs();
}

let resenaRatingActual = 0;
function openResenaModal() {
  if (!provActual) return;
  if (!currentUser) { showToast('Inicie sesión para dejar una reseña'); return; }
  resenaRatingActual = 0;
  document.getElementById('resena-prov-name').textContent = provActual.nombre;
  // El nombre queda fijado a la cuenta (no editable) para que no se puedan
  // firmar reseñas con un nombre falso. El email se guarda para auditar.
  document.getElementById('resena-autor-input').value = currentUser.name || currentUser.email || 'Mi cuenta';
  document.getElementById('resena-texto-input').value = '';
  document.getElementById('resena-rating-label').textContent = 'Tocá para calificar';
  document.querySelectorAll('#resenaStars .star').forEach(s => s.classList.remove('filled'));
  document.getElementById('resenaModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeResenaModal() {
  document.getElementById('resenaModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeResenaOnBg(e) { if (e.target === document.getElementById('resenaModal')) closeResenaModal(); }

function setResenaRating(val) {
  resenaRatingActual = val;
  const labels = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
  document.getElementById('resena-rating-label').textContent = labels[val] || '';
  document.querySelectorAll('#resenaStars .star').forEach(s => {
    s.classList.toggle('filled', parseInt(s.dataset.val) <= val);
  });
}

async function submitResena() {
  if (!currentUser) { showToast('Inicie sesión para dejar una reseña'); return; }
  if (!resenaRatingActual) { showToast('Elija de 1 a 5 estrellas'); return; }
  const texto = document.getElementById('resena-texto-input').value.trim();
  if (!texto) { showToast('Cuente cómo fue su experiencia'); return; }

  // El nombre lo tomamos de la cuenta logueada, NO del input (que es de solo
  // lectura). Guardamos también el email para poder rastrear reseñas falsas.
  const autor = currentUser.name || currentUser.email || 'Usuario';
  const pid = String(provActual.id);
  // Usamos los nombres de columna reales de tu tabla Supabase
  const nuevaResena = {
    proveedor_id: pid,
    usuario_nombre: autor,
    usuario_email: currentUser.email || '',
    estrellas: resenaRatingActual,
    texto
  };

  // Guardar en Supabase
  try {
    const { data, error } = await sb.from('resenas').insert(nuevaResena).select().single();
    if (error) throw error;
    // Normalizar y agregar al cache
    if (!resenasCache[pid]) resenasCache[pid] = [];
    const normalizada = { ...data, autor: data.usuario_nombre, rating: data.estrellas, fecha: data.created_at };
    resenasCache[pid].unshift(normalizada);
    showToast('Reseña publicada. Gracias.');
  } catch (e) {
    console.error('Error guardando reseña:', e);
    // Fallback local si falla Supabase
    if (!resenasCache[pid]) resenasCache[pid] = [];
    resenasCache[pid].unshift({ usuario_nombre: autor, autor, estrellas: resenaRatingActual, rating: resenaRatingActual, texto, fecha: new Date().toISOString() });
    showToast('Reseña guardada (sin conexión)');
  }

  closeResenaModal();
  renderRatingSummary(pid);
}

// ===== NOTIFICACIONES =====
let notificaciones = [];
let notifLeidas = new Set();
try { notifLeidas = new Set(JSON.parse(localStorage.getItem('eg_notif_leidas') || '[]')); } catch (e) { }

async function initNotificaciones() {
  try {
    const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: nuevos } = await sb.from('proveedores')
      .select('id, nombre, rubro, logo_url, created_at')
      .eq('estado', 'aprobado')
      .gte('created_at', hace30dias)
      .order('created_at', { ascending: false })
      .limit(8);

    notificaciones = [];

    (nuevos || []).forEach(p => {
      const dias = Math.floor((Date.now() - new Date(p.created_at)) / 86400000);
      const tiempo = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : 'Hace ' + dias + ' días';
      const ini = (p.nombre || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
      notificaciones.push({
        id: 'prov-' + p.id,
        tipo: 'new',
        logo: p.logo_url || '', ini,
        titulo: p.nombre,
        texto: 'Se sumó a EmprendeGo · ' + (p.rubro || 'Proveedor'),
        tiempo,
        provId: String(p.id)
      });
    });

    if (!notificaciones.length) {
      notificaciones.push({ id: 'n-empty', tipo: 'tip', logo: '', ini: '', titulo: 'Sin novedades', texto: 'Cuando se sume un proveedor nuevo, te avisamos acá.', tiempo: '' });
    }
  } catch (e) {
    notificaciones = [];
  }

  const tieneNoLeidas = notificaciones.some(n => !notifLeidas.has(n.id));
  document.getElementById('notifDot').classList.toggle('show', tieneNoLeidas);
  const d2 = document.getElementById('notifDot2');
  if (d2) d2.classList.toggle('show', tieneNoLeidas);
}

function renderNotifPanel() {
  const el = document.getElementById('notifList');
  if (!el) return;
  el.innerHTML = notificaciones.map(n => `
    <div class="notif-item ${notifLeidas.has(n.id) ? '' : 'unread'}" onclick="onNotifClick('${n.id}','${n.provId || ''}')">
      <div class="notif-icon ${n.tipo}"><span class="ni-mono">${escHtml(n.ini || '')}</span>${n.logo ? `<img class="ni-img" src="${escHtml(imgThumb(n.logo, 96, 72))}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="notif-text"><strong>${escHtml(n.titulo)}</strong><span>${escHtml(n.texto)}</span></div>
      <div class="notif-time">${escHtml(n.tiempo)}</div>
    </div>`).join('');
}
function onNotifClick(id, provId) {
  notifLeidas.add(id);
  try { localStorage.setItem('eg_notif_leidas', JSON.stringify([...notifLeidas])); } catch (e) { }
  document.getElementById('notifDot').classList.remove('show');
  const d2 = document.getElementById('notifDot2');
  if (d2) d2.classList.remove('show');
  closeNotifPanel();
  if (provId) { setTimeout(() => abrirDetalle(provId), 150); }
}
function toggleNotifPanel() {
  const p = document.getElementById('notifPanel');
  const bg = document.getElementById('notifPanelBg');
  if (p.style.display === 'none' || !p.style.display) {
    renderNotifPanel();
    p.style.display = 'block';
    bg.style.display = 'block';
  } else { closeNotifPanel(); }
}
function closeNotifPanel() {
  document.getElementById('notifPanel').style.display = 'none';
  document.getElementById('notifPanelBg').style.display = 'none';
}
function limpiarNotificaciones() {
  notificaciones.forEach(n => notifLeidas.add(n.id));
  try { localStorage.setItem('eg_notif_leidas', JSON.stringify([...notifLeidas])); } catch (e) { }
  document.getElementById('notifDot').classList.remove('show');
  const d2 = document.getElementById('notifDot2');
  if (d2) d2.classList.remove('show');
  renderNotifPanel();
}

// ===== COMPARADOR =====
let comparadorList = [];
function toggleComparar() {
  if (!provActual) return;
  const idx = comparadorList.findIndex(p => String(p.id) === String(provActual.id));
  if (idx >= 0) {
    comparadorList.splice(idx, 1);
    showToast('Quitado del comparador');
  } else {
    if (comparadorList.length >= 3) { showToast('Máximo 3 proveedores a la vez'); return; }
    comparadorList.push(provActual);
    showToast('Agregado al comparador ✓');
  }
  updateComparadorFab();
  updateDetCompBtn();
}
function updateComparadorFab() {
  const fab = document.getElementById('comparadorFab');
  const cnt = document.getElementById('comparadorCount');
  fab.classList.toggle('show', comparadorList.length >= 2);
  cnt.textContent = comparadorList.length;
}
function updateDetCompBtn() {
  const btn = document.getElementById('det-comp-btn');
  if (!btn || !provActual) return;
  const enComp = comparadorList.some(p => String(p.id) === String(provActual.id));
  btn.textContent = enComp ? '✓ En comparador' : '⚖ Comparar';
  btn.style.background = enComp ? 'rgba(0,166,81,.3)' : 'rgba(255,255,255,.15)';
}
function openComparador() {
  if (comparadorList.length < 2) { showToast('Agregá al menos 2 proveedores'); return; }
  renderComparadorModal();
  document.getElementById('comparadorModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeComparador() {
  document.getElementById('comparadorModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeComparadorOnBg(e) { if (e.target === document.getElementById('comparadorModal')) closeComparador(); }

function renderComparadorModal() {
  const el = document.getElementById('compModalBody');
  if (!el) return;
  const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857'];
  const campos = [
    { key: 'rubro', label: 'Rubro' },
    { key: 'provincia', label: 'Provincia' },
    { key: 'pedido_minimo', label: 'Pedido mínimo' },
    { key: 'envios', label: 'Envíos' },
    { key: 'pro', label: 'Plan' },
    { key: '_rating', label: 'Rating' }
  ];

  // Headers
  let thead = '<thead><tr><th style="width:90px">Atributo</th>';
  comparadorList.forEach((p, i) => {
    const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
    thead += `<th><div class="comp-header-cell">
      <div class="comp-header-ini" style="background:${bgs[i]}">${escHtml(ini)}</div>
      <div class="comp-header-name">${escHtml(p.nombre)}</div>
      ${p.pro ? '<span style="font-size:.62rem;font-weight:800;background:linear-gradient(135deg,#064E3B,#022C22);color:#F0C775;border:1px solid rgba(233,185,73,.4);padding:2px 7px;border-radius:10px;letter-spacing:.04em">PRO</span>' : ''}
    </div></th>`;
  });
  thead += '</tr></thead>';

  // Rows
  let tbody = '<tbody>';
  campos.forEach(c => {
    tbody += `<tr><td>${c.label}</td>`;
    comparadorList.forEach(p => {
      let val = '';
      if (c.key === '_rating') {
        const { avg, count } = getProvRating(p.id);
        val = count > 0 ? `${avg.toFixed(1)} ★ (${count})` : 'Sin reseñas';
      } else if (c.key === 'pro') {
        val = p.pro ? '⭐ PRO' : 'Gratis';
      } else {
        val = p[c.key] || '—';
      }
      tbody += `<td>${escHtml(val)}</td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  el.innerHTML = `
    <div style="overflow-x:auto;margin-bottom:20px">
      <table class="comp-table">${thead}${tbody}</table>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${comparadorList.map(p => `
        <button onclick="closeComparador();abrirDetalle('${p.id}')" style="background:var(--blue-light);color:var(--blue);border:none;border-radius:12px;padding:12px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer">
          Ver perfil de ${escHtml(p.nombre)} →
        </button>`).join('')}
      <button onclick="comparadorList=[];updateComparadorFab();closeComparador();showToast('Comparador limpiado')" style="background:#fee2e2;color:#ef4444;border:none;border-radius:12px;padding:10px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;margin-top:4px">
        Limpiar comparador
      </button>
    </div>`;
}

// ===== MAPA PROVINCIAS =====
const _pinSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

function getProvsPorProvincia() {
  const lista = proveedoresDB;
  const mapa = {};
  lista.forEach(p => {
    const prov = p.provincia || 'Otra';
    if (!mapa[prov]) mapa[prov] = [];
    mapa[prov].push(p);
  });
  return mapa;
}

function renderMapaProvincias() {
  const el = document.getElementById('provinciasGrid');
  if (!el) return;
  const mapa = getProvsPorProvincia();
  const total = Object.values(mapa).reduce((s, a) => s + a.length, 0);
  const provincias = Object.keys(mapa).sort((a, b) => mapa[b].length - mapa[a].length);
  el.innerHTML = provincias.map(prov => {
    const count = mapa[prov].length;
    const pct = Math.round((count / total) * 100);
    return `<div class="prov-tile" data-prov="${prov}" onclick="filtrarPorProvincia('${prov}')">
      <div style="position:relative;z-index:1">
        <div style="margin-bottom:4px;opacity:.7">${_pinSvg}</div>
        <div class="prov-tile-name">${prov}</div>
        <div class="prov-tile-count">${count} proveedor${count !== 1 ? 'es' : ''}</div>
      </div>
      <div class="prov-tile-bar" style="width:${pct}%"></div>
    </div>`;
  }).join('');
}

function renderMapaAllProvs() {
  const el = document.getElementById('mapaAllList');
  if (!el) return;
  const lista = proveedoresDB;
  el.innerHTML = lista.slice(0, 6).map((p, i) => renderProvCardMini(p, i)).join('');
  el.onclick = function (e) {
    const card = e.target.closest('[data-id]');
    if (card) abrirDetalle(card.dataset.id);
  };
}

function filtrarPorProvincia(prov) {
  document.querySelectorAll('.prov-tile').forEach(t => t.classList.toggle('selected', t.dataset.prov === prov));
  const mapa = getProvsPorProvincia();
  const lista = mapa[prov] || [];
  document.getElementById('mapaResultados').style.display = 'block';
  document.getElementById('mapaAllProvs').style.display = 'none';
  document.getElementById('mapaResultLabel').textContent = `${lista.length} en ${prov}`;
  const el = document.getElementById('mapaProvList');
  el.innerHTML = lista.map((p, i) => renderProvCardMini(p, i)).join('');
  el.onclick = function (e) {
    const card = e.target.closest('[data-id]');
    if (card) abrirDetalle(card.dataset.id);
  };
}

function clearMapaFilter() {
  document.querySelectorAll('.prov-tile').forEach(t => t.classList.remove('selected'));
  document.getElementById('mapaResultados').style.display = 'none';
  document.getElementById('mapaAllProvs').style.display = 'block';
}

function renderProvCardMini(p, i) {
  const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D'];
  const bg = _monoColor(p.id);
  const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
  const { avg, count } = getProvRating(p.id);
  const pid = String(p.id);
  const faved = esFav(pid);
  const heartFill = faved ? '#EF4444' : 'none';
  const heartStroke = faved ? '#EF4444' : '#CBD5E1';
  const actionBtn = (p.whatsapp)
    ? `<a href="https://wa.me/${(p.whatsapp || '').replace(/\D/g, '')}" onclick="event.stopPropagation();registrarContactoWA('${pid}')" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#25D366,#128C7E);color:white;border-radius:10px;padding:9px;font-family:'Inter',sans-serif;font-size:.78rem;font-weight:700;text-decoration:none;margin-top:8px;box-shadow:0 2px 7px rgba(18,140,126,.32)"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>WhatsApp</a>`
    : `<button onclick="event.stopPropagation();abrirDetalle('${pid}')" style="width:100%;background:#EFF6F2;border:1.5px solid #DCE8E2;border-radius:10px;padding:9px;font-family:'Inter',sans-serif;font-size:.78rem;font-weight:700;color:#065F46;cursor:pointer;margin-top:8px">Ver perfil</button>`;
  return `<div data-id="${pid}" style="background:white;border-radius:14px;border:1px solid #DCE8E2;padding:14px;cursor:pointer">
    <div style="display:flex;align-items:center;gap:12px">
      ${p.logo_url
        ? `<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#fff"><img loading="lazy" src="${escHtml(imgThumb(p.logo_url, 200, 75))}" style="width:100%;height:100%;object-fit:cover;background:#F3F4F6" alt=""></div>`
        : `<div style="width:48px;height:48px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;font-family:'Inter',sans-serif;flex-shrink:0">${ini}</div>`
      }
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-family:'Inter',sans-serif;font-size:.88rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.nombre)}</span>
          ${p.pro ? '<span style="font-size:.6rem;font-weight:800;background:linear-gradient(135deg,#064E3B,#022C22);color:#F0C775;border:1px solid rgba(233,185,73,.4);padding:2px 7px;border-radius:8px;flex-shrink:0;letter-spacing:.04em">PRO</span>' : ''}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006039" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style="font-size:.73rem;color:#6B7A99;margin-top:2px">${escHtml(p.rubro)}${p.provincia ? ' · ' + escHtml(p.provincia) : ''}</div>
        ${count > 0 ? `<div style="font-size:.7rem;color:#F59E0B;margin-top:2px;font-weight:700">${avg.toFixed(1)} ★ · ${count} reseña${count !== 1 ? 's' : ''}</div>` : ''}
      </div>
      <button onclick="event.stopPropagation();toggleFavId('${pid}',this)" style="background:none;border:none;cursor:pointer;padding:4px;flex-shrink:0" aria-label="Favorito">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${heartFill}" stroke="${heartStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
    </div>
    ${actionBtn}
  </div>`;
}

// ===== SKELETON LOADERS =====
function skelProv(n = 4) {
  return Array.from({ length: n }).map(() => `
    <div style="background:white;border-radius:16px;border:1px solid #DCE8E2;margin-bottom:4px;padding:14px">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
        <div class="skel" style="width:44px;height:44px;border-radius:11px;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skel" style="height:13px;width:55%;margin-bottom:7px"></div>
          <div class="skel" style="height:10px;width:38%"></div>
        </div>
      </div>
      <div class="skel" style="height:10px;width:92%;margin-bottom:5px"></div>
      <div class="skel" style="height:10px;width:74%"></div>
    </div>`).join('');
}
function skelCarousel(n = 5) {
  return Array.from({ length: n }).map(() => `
    <div style="flex-shrink:0;width:140px;background:white;border-radius:14px;overflow:hidden;border:1px solid #eee">
      <div class="skel" style="width:140px;height:120px;border-radius:0"></div>
      <div style="padding:9px">
        <div class="skel" style="height:11px;width:80%;margin-bottom:6px"></div>
        <div class="skel" style="height:13px;width:50%"></div>
      </div>
    </div>`).join('');
}
function skelProvHoriz(n = 5) {
  return Array.from({ length: n }).map(() => `
    <div style="flex-shrink:0;width:130px;background:white;border-radius:14px;border:1px solid #DCE8E2;padding:14px 12px;display:flex;flex-direction:column;align-items:center;gap:9px">
      <div class="skel" style="width:48px;height:48px;border-radius:12px"></div>
      <div class="skel" style="height:11px;width:80%"></div>
      <div class="skel" style="height:9px;width:55%"></div>
    </div>`).join('');
}

// ===== RENDER PROVEEDORES =====
function renderProvs(list) {
  const el = document.getElementById('provList');
  if (!list || !list.length) {
    const q = (document.getElementById('searchInput')?.value || '').trim();
    const msg = q.length >= 2
      ? `No encontramos proveedores para "<strong>${escHtml(q)}</strong>". Probá con otro término.`
      : 'No encontramos proveedores con esos filtros.';
    const cats = RUBROS_LISTA.slice(0, 6).map(r =>
      `<button onclick="filterCat('${r}')" style="display:flex;align-items:center;gap:4px;background:white;border:1.5px solid #DCE8E2;border-radius:20px;padding:6px 14px;font-size:.78rem;font-weight:700;color:#065F46;cursor:pointer;white-space:nowrap">${RUBROS_ICONS[r] || ''} ${escHtml(r)}</button>`
    ).join('');
    el.innerHTML = `<div class="prov-list-empty" style="text-align:center;padding:40px 24px">
      <div style="margin-bottom:14px"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></div>
      <div style="font-family:'Inter',sans-serif;font-size:.95rem;font-weight:800;color:#1A1A1A;margin-bottom:16px">${msg}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:20px">${cats}</div>
      <button onclick="currentCat='Todas';document.getElementById('searchInput').value='';filterProvs()" style="background:#006039;color:white;border:none;border-radius:12px;padding:13px 24px;font-family:'Inter',sans-serif;font-size:.88rem;font-weight:800;cursor:pointer">Ver todos los proveedores</button>
      ${(q && q.length >= 2 && typeof cotizBloqueSinResultados === 'function') ? cotizBloqueSinResultados(q) : ''}
    </div>`;
    return;
  }
  renderProvCards(el, list);
}

// Pinta las tarjetas de proveedor en cualquier contenedor (usado por el listado de
// Proveedores y por la pestaña Servicios para Emprendedores).
function renderProvCards(el, list) {
  if (!el) return;
  el.innerHTML = list.map((p, i) => {
    const pid = String(p.id);
    const fav = esFav(pid);
    const bg = _monoColor(p.id);
    const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
    const { avg, count } = getProvRating(pid);
    const enComp = comparadorList.some(x => String(x.id) === pid);
    return `<div data-id="${pid}" style="background:white;border-radius:16px;border:1px solid #DCE8E2;overflow:hidden;cursor:pointer;display:flex;flex-direction:column">
      <div style="display:flex;align-items:flex-start;gap:11px;padding:12px 14px 8px">
        ${p.logo_url
        ? `<div style="width:44px;height:44px;border-radius:11px;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${escHtml(imgThumb(p.logo_url, 200, 75))}" style="width:100%;height:100%;object-fit:cover;background:#F3F4F6"></div>`
        : `<div style="width:44px;height:44px;border-radius:11px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;flex-shrink:0;font-family:'Inter',sans-serif">${escHtml(ini)}</div>`
      }
        <div style="flex:1;min-width:0">
          <div title="${escHtml(p.nombre)}" style="font-family:'Inter',sans-serif;font-size:.93rem;font-weight:800;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere">${escHtml(p.nombre)}</div>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-top:4px">
            <span style="font-size:.72rem;color:#6B7A99;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.provincia || p.rubro || 'General')}</span>
            ${p.pro ? '<span style="font-size:.6rem;font-weight:800;padding:2px 7px;border-radius:20px;background:linear-gradient(135deg,#064E3B,#022C22);color:#F0C775;border:1px solid rgba(233,185,73,.4);letter-spacing:.04em;flex-shrink:0">PRO</span>' : ''}
            ${count > 0 ? `<span style="font-size:.72rem;font-weight:700;color:#F59E0B;flex-shrink:0">${avg.toFixed(1)} ★</span>` : ''}
          </div>
        </div>
      </div>
      <div style="padding:0 14px 13px;display:flex;flex-direction:column;flex:1">
        <p style="font-size:.79rem;color:#6B7A99;line-height:1.45;margin-bottom:0">${escHtml(p.desc || '')}</p>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:auto;padding-top:9px;margin-bottom:8px">
          <span style="font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:20px;background:#E6F7EE;color:#00A651">✓ Verificado</span>
        </div>
        <div class="prov-card-actions">
          ${p.whatsapp
        ? `<button data-wa="${escHtml(p.whatsapp || '')}" data-pid="${pid}" data-nombre="${escHtml(p.nombre || '')}" data-rubro="${escHtml(p.rubro || '')}" style="display:flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;border-radius:9px;padding:7px 14px;font-size:.76rem;font-weight:700;cursor:pointer;flex:1;box-shadow:0 2px 7px rgba(18,140,126,.32)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.582 0 11.942-5.359 11.945-11.893a11.821 11.821 0 00-3.418-8.452z"/></svg>WhatsApp</button>`
        : `<button style="display:flex;align-items:center;justify-content:center;gap:6px;background:#EEF2FF;color:#065F46;border:none;border-radius:9px;padding:7px 14px;font-size:.76rem;font-weight:700;cursor:pointer;flex:1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Ver perfil</button>`}
          <button data-favid="${pid}" style="background:#f4f7ff;border:none;border-radius:9px;padding:7px 10px;cursor:pointer;font-size:.95rem;flex-shrink:0">${fav ? '❤️' : '♡'}</button>
          <button data-compid="${pid}" class="comparar-btn ${enComp ? 'added' : ''}" style="padding:7px 10px;font-size:.72rem;flex-shrink:0">${enComp ? '✓' : '⚖'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  el.onclick = function (e) {
    const fb = e.target.closest('[data-favid]');
    const wb = e.target.closest('[data-wa]');
    const cb = e.target.closest('[data-chatid]');
    const compb = e.target.closest('[data-compid]');
    const card = e.target.closest('[data-id]');
    if (fb) { e.stopPropagation(); toggleFav(fb.dataset.favid); return; }
    if (wb) { e.stopPropagation(); registrarContactoWA(wb.dataset.pid, { id: wb.dataset.pid, nombre: wb.dataset.nombre, rubro: wb.dataset.rubro }); abrirWA(wb.dataset.wa, mensajeWAProv({ nombre: wb.dataset.nombre, rubro: wb.dataset.rubro })); return; }
    if (cb) { e.stopPropagation(); abrirChatDirecto(cb.dataset.chatid); return; }
    if (compb) { e.stopPropagation(); toggleCompararById(compb.dataset.compid); return; }
    if (card) abrirDetalle(card.dataset.id);
  };
}

function toggleCompararById(id) {
  const lista = proveedoresDB;
  const p = lista.find(x => String(x.id) === String(id));
  if (!p) return;
  const idx = comparadorList.findIndex(x => String(x.id) === String(id));
  if (idx >= 0) { comparadorList.splice(idx, 1); showToast('Quitado del comparador'); }
  else {
    if (comparadorList.length >= 3) { showToast('Máximo 3 proveedores'); return; }
    comparadorList.push(p); showToast('Agregado al comparador');
  }
  updateComparadorFab();
  filterProvs();
}

// "Servicios" es un rubro más de la multi-selección: varios mayoristas de productos
// (indumentaria, tecnología) lo tienen como etiqueta extra. Por eso hay dos reglas:
//  - esProvServicio: aparece en la pestaña Servicios para Emprendedores.
//  - esProvSoloServicio: SOLO vende servicios → sale del catálogo mayorista.
// Un proveedor mixto se muestra en las dos pestañas; nunca se lo saca de Proveedores.
function esProvServicio(p) {
  return matchesCat(p.rubro, 'Servicios');
}

function esProvSoloServicio(p) {
  const rubros = (p.rubro || '').split(',').map(r => r.trim()).filter(Boolean);
  if (!rubros.length) return false;
  return rubros.every(r => r === 'Servicios' || r === 'Otro') && rubros.includes('Servicios');
}

function renderServicios() {
  const el = document.getElementById('serviciosList');
  if (!el) return;
  const q = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const lista = proveedoresDB.filter(p => esProvServicio(p) && matchesQuery(p, q));
  if (!lista.length) {
    el.innerHTML = `<div class="prov-list-empty" style="text-align:center;padding:36px 24px">
      <div style="font-family:'Inter',sans-serif;font-size:.95rem;font-weight:800;color:#1A1A1A;margin-bottom:6px">${q ? 'Sin servicios para esa búsqueda' : 'Estamos sumando los primeros servicios'}</div>
      <div style="font-size:.82rem;color:#6B7A99;line-height:1.5">Diseño web, contadores, fotografía de producto, packaging y logística. Muy pronto.</div>
    </div>`;
    return;
  }
  renderProvCards(el, lista);
}

// Badge "Nuevo" de la pestaña Servicios: mismo criterio que el de Novedades —
// se muestra hasta que la persona entra una vez, después sería ruido.
const SERV_CLAVE_VISTO = 'eg_servicios_visto';

function actualizarContadorServicios() {
  const badge = document.getElementById('badge-nuevo-servicios');
  if (!badge) return;
  const visto = localStorage.getItem(SERV_CLAVE_VISTO) === '1';
  badge.style.display = visto ? 'none' : 'inline-block';
}

function filterProvs() {
  const q = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const prov = document.getElementById('fil-prov')?.value || '';
  const plan = document.getElementById('fil-plan')?.value || '';
  const orden = document.getElementById('fil-orden')?.value || '';
  const rubroFil = document.getElementById('fil-rubro')?.value || '';
  // Los filtros que no son texto (rubro, provincia, plan) se aplican primero y no
  // se tocan nunca: el rescate juega solo con el término buscado.
  const base = proveedoresDB.filter(p => {
    const mc = matchesCat(p.rubro, currentCat);
    const mp = !prov || quitarAcentos(p.provincia || '') === quitarAcentos(prov);
    const mpl = !plan || (plan === 'pro' ? p.pro === true : p.pro !== true);
    const mrb = !rubroFil || matchesCat(p.rubro, rubroFil);
    return !esProvSoloServicio(p) && mc && mp && mpl && mrb;
  });
  const busq = q
    ? egEscaleraBusqueda(base, q,
        (p, texto) => matchesQuery(p, texto),
        (p, toks) => _contarTokens(_provBlob(p), p.provincia, p.rubro, toks))
    : { lista: base, modo: '', termino: '' };
  let result = busq.lista;
  egPintarAviso('buscar-aviso-prov', q ? egAvisoBusqueda(busq, q) : '');
  if (orden === 'rating') {
    result = result.slice().sort((a, b) => getProvRating(String(b.id)).avg - getProvRating(String(a.id)).avg);
  } else if (orden === 'minimo') {
    const num = s => parseInt((s || '').replace(/[^0-9]/g, '')) || 999999;
    result = result.slice().sort((a, b) => num(a.pedido_minimo) - num(b.pedido_minimo));
  } else if (orden === 'nuevo') {
    result = result.slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }
  renderProvs(result);
  // Se loguea la cantidad que la persona REALMENTE vio, no la del intento literal:
  // si el rescate le encontró resultados, eso ya no es demanda insatisfecha.
  if (q) { trackSearch(q, result.length); egTrackRescate(q, busq); }
}

function setChip(el, cat) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentCat = cat;
  if (buscarTab === 'productos') renderProdBuscar(currentCat, document.getElementById('searchInput')?.value || '');
  else if (buscarTab === 'servicios') renderServicios();
  else filterProvs();
}

function filterCat(cat) {
  goTo('buscar');
  // "Servicios" ya no vive en el listado de proveedores: tiene su propia pestaña.
  if (cat === 'Servicios') { switchBuscarTab('servicios', document.getElementById('tab-servicios')); return; }
  currentCat = cat;
  document.querySelectorAll('#buscar-chips .chip').forEach(c => {
    const label = (c.dataset.cat || c.textContent.replace(/[\s\S]*<\/svg>/,'').trim() || c.textContent.trim());
    const match = c.onclick?.toString().includes(`'${cat}'`) || label === cat;
    c.classList.toggle('active', match);
    if (match && c.dataset.extra !== undefined) {
      c.style.display = '';
      const masBtn = document.getElementById('chip-mas-btn');
      if (masBtn) { masBtn.dataset.expanded = '1'; masBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg> Menos`; document.querySelectorAll('#buscar-chips [data-extra]').forEach(e => { e.style.display = ''; }); }
    }
  });
  switchBuscarTab('proveedores', document.getElementById('tab-proveedores'));
  filterProvs();
}

function toggleMasRubros(btn) {
  const extras = document.querySelectorAll('#buscar-chips [data-extra]');
  const isExpanded = btn.dataset.expanded === '1';
  extras.forEach(e => { e.style.display = isExpanded ? 'none' : ''; });
  btn.dataset.expanded = isExpanded ? '0' : '1';
  btn.innerHTML = isExpanded
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg> Más rubros`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg> Menos`;
}

// Normaliza un teléfono al formato internacional que requiere wa.me (Argentina).
// Si el número se guardó sin código de país, WhatsApp interpreta el "1" inicial
// como +1 (EE.UU.) y lo rechaza como inválido. Acá garantizamos el prefijo 549.
// Acepta "@handle", "handle", "instagram.com/handle/?igsh=..." o el link de una tienda.
// Devuelve el handle pelado; si es un link que no es de Instagram, lo deja tal cual.
function normalizarIG(val) {
  let v = (val || '').trim();
  if (!v) return '';
  const m = v.match(/(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]+)/i);
  if (m) return m[1].toLowerCase();
  if (/^https?:\/\//i.test(v) || v.includes('.com') || v.includes('.ar')) return v;
  return v.replace(/^@+/, '').trim().toLowerCase();
}

function normalizarWAArg(num) {
  let n = (num || '').replace(/[^0-9]/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = n.slice(2);            // prefijo internacional 00 → quitar
  if (n.startsWith('54')) {                          // ya trae código de país AR
    let resto = n.slice(2);
    if (resto.startsWith('0')) resto = resto.slice(1);   // 54 0xx... → 54 xx...
    if (!resto.startsWith('9')) resto = '9' + resto;     // asegurar el 9 de celular
    return '54' + resto;
  }
  if (n.startsWith('0')) n = n.slice(1);             // formato nacional 011... → 11...
  if (n.startsWith('9') && n.length >= 11) return '54' + n;  // ya tiene el 9 de celular
  return '549' + n;                                  // número local sin país
}

function abrirWA(num, msg) {
  haptic('success');
  const n = normalizarWAArg(num);
  if (!n) { showToast('WhatsApp no disponible'); return; }
  const texto = msg || '¡Hola! Te encontré en EmprendeGO (el buscador de proveedores mayoristas) y me gustaría consultar sobre tus productos.';
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(texto), '_blank');
}

// Unico punto de entrada para todo clic a WhatsApp. Dispara el evento de GA4
// (clics crudos) y registra la consulta en la base (deduplicada). El proveedor
// se resuelve desde el id: no depender de provActual, que solo esta cargado si
// el usuario paso por el perfil y desde la ficha de producto apunta al equivocado.
function registrarContactoWA(id, prov) {
  const p = prov || (proveedoresDB || []).find(x => String(x.id) === String(id)) || {};
  trackEvent('contact_whatsapp', {
    provider_id: String(id || p.id || ''),
    provider_name: p.nombre || '',
    provider_rubro: p.rubro || ''
  });
  registrarConsulta(id || p.id);
}

// Registra una consulta (clic a "Contactar por WhatsApp") para el proveedor.
// Dedupe por dispositivo/proveedor/dia para no inflar el numero. Espejo de increment_visitas.
function registrarConsulta(id) {
  if (!id) return;
  // No contar las pruebas del propio proveedor sobre su perfil
  if (currentUser?.provData && String(currentUser.provData.id) === String(id)) return;
  try {
    const k = `eg_consulta_${id}`, t = parseInt(localStorage.getItem(k) || '0');
    if (Date.now() - t < 86400000) return;
    localStorage.setItem(k, Date.now());
    // registrar_consulta: inserta una fila con fecha en public.consultas (para reportes/tendencia
    // "este mes") Y mantiene el contador acumulado proveedores.consultas. Reemplaza a increment_consultas.
    sb.rpc('registrar_consulta', { proveedor_id: id }).then(() => {}).catch(() => {});
  } catch (e) { }
}

// Registra un "Quiero ver mas / catalogo completo" del comprador para el proveedor.
// Dedup por dispositivo/dia (localStorage) y excluye al propio proveedor. Espejo de registrarConsulta.
function registrarIntentoCatalogo(id) {
  if (!id) return;
  if (currentUser?.provData && String(currentUser.provData.id) === String(id)) return;
  try {
    const k = `eg_intentocat_${id}`, t = parseInt(localStorage.getItem(k) || '0');
    if (Date.now() - t < 86400000) return;
    localStorage.setItem(k, Date.now());
    sb.rpc('registrar_intento_catalogo', { proveedor_id: id }).then(() => {}).catch(() => {});
  } catch (e) { }
}

// Handler del boton "Quiero ver mas productos / catalogo completo" en la ficha del proveedor.
// Cuenta la intencion (dedup interno) y muestra un mensaje prolijo. No abre WhatsApp por si mismo;
// solo deja la opcion secundaria si el proveedor tiene numero cargado.
function pedirMasCatalogo(id) {
  registrarIntentoCatalogo(id);
  const nombre = provActual?.nombre || 'el proveedor';
  const tieneWA = !!provActual?.whatsapp;
  const existing = document.getElementById('modal-intento-catalogo');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'modal-intento-catalogo';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  const btnWA = tieneWA
    ? `<button onclick="document.getElementById('modal-intento-catalogo').remove();detWA()" style="width:100%;background:#f5f5f5;color:#065F46;border:none;border-radius:14px;padding:14px;font-family:'Inter',sans-serif;font-size:.88rem;font-weight:800;cursor:pointer">Escribirle por WhatsApp</button>`
    : '';
  overlay.innerHTML = `<div style="background:white;border-radius:24px 24px 0 0;padding:28px 24px 34px;width:100%;max-width:480px;text-align:center">
    <div style="width:56px;height:56px;border-radius:50%;background:#E9F5EF;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#006039" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
    </div>
    <div style="font-family:'Inter',sans-serif;font-size:1.1rem;font-weight:900;color:#1A1A1A;margin-bottom:8px">Listo, ya le avisamos</div>
    <div style="font-size:.86rem;color:#777;line-height:1.55;margin-bottom:22px">Le dijimos a ${escHtml(nombre)} que hay gente esperando ver más de su catálogo. Si lo necesita cuanto antes, también puede pedírselo por WhatsApp.</div>
    <button onclick="document.getElementById('modal-intento-catalogo').remove()" style="width:100%;background:#006039;color:white;border:none;border-radius:14px;padding:15px;font-family:'Inter',sans-serif;font-size:.92rem;font-weight:800;cursor:pointer;margin-bottom:10px">Entendido</button>
    ${btnWA}
  </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  haptic('light');
}

function mensajeWAProv(prov) {
  const nombre = prov?.nombre || 'tu negocio';
  const rubro = prov?.rubro || 'tus productos';
  return `¡Hola! Vi ${nombre} en EmprendeGO y me interesa conocer los precios mayoristas de ${rubro}. ¿Cuándo podemos hablar?`;
}

function mensajeWAProd(prod, prov) {
  const np = prod?.nombre || 'tu producto';
  const precio = prod?.precio ? ' (vi el precio de $' + Number(prod.precio).toLocaleString('es-AR') + ')' : '';
  return `¡Hola! Vi "${np}"${precio} en EmprendeGO. ¿Cuál es el precio mayorista y el mínimo de compra? Gracias!`;
}

async function cargarProductosDetalle(proveedorId) {
  provDetalleData = [];
  provDetalleOffset = 0;
  const el = document.getElementById('det-productos-carousels');
  if (!el) return;
  el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">Cargando productos...</div>';
  try {
    const hasta = provActual?.plan_hasta ?? null;
    // provActual.pro es booleano (pro: p.plan==='pro'), no existe campo .plan
    provDetalleEsPro = !!provActual?.pro && (!hasta || new Date(hasta + 'T03:00:00Z') > new Date());
    provDetalleLimite = provDetalleEsPro ? undefined : 30;
    console.log('[detalle] pro:', provActual?.pro, 'plan_hasta:', hasta, '→ esPro:', provDetalleEsPro);
    let q = sb.from('productos').select('*').eq('proveedor_id', proveedorId).eq('visible', true).order('created_at', { ascending: false });
    if (provDetalleLimite) q = q.limit(provDetalleLimite);
    const { data, error } = await q;
    if (error || !data || !data.length) {
      // Proveedor sin catalogo cargado: en vez de mandar a WhatsApp, mostramos el mismo boton de
      // intencion. Asi capturamos la demanda hacia proveedores vacios (a quien empujar a cargar).
      // pedirMasCatalogo ya cuenta el intento y deja la opcion de WhatsApp en su mensaje.
      const intentoBtn = `<button onclick="pedirMasCatalogo('${escHtml(String(proveedorId))}')" style="margin-top:14px;display:inline-block;background:linear-gradient(135deg,#006039,#12855C);border:none;border-radius:12px;padding:13px 22px;font-family:'Inter',sans-serif;font-size:.84rem;font-weight:800;color:#fff;cursor:pointer;box-shadow:0 8px 18px -8px rgba(0,60,36,.55)">Quiero ver más productos</button>`;
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">Este proveedor todavía no cargó su catálogo acá.<br>' + intentoBtn + '</div>';
      return;
    }
    const bgsColores = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D'];
    data.forEach((p, i) => {
      const existente = productosReales.find(x => x.idReal == p.id);
      if (!existente) {
        productosReales.push({
          id: 'real_' + p.id, idReal: p.id, nombre: p.nombre, precio: p.precio || 0,
          pedido_minimo: p.stock ? 'Stock: ' + p.stock + ' unidades' : 'Consultar',
          cat: p.categoria_principal || p.categoria || 'General',
          emoji: getEmojiCat(p.categoria_principal || p.categoria),
          provId: String(p.proveedor_id), provNombre: provActual?.nombre || 'Proveedor',
          provRubro: (provActual?.rubro || '') + (provActual?.provincia ? ' · ' + provActual.provincia : ''),
          provColor: _monoColor(p.proveedor_id), imgUrl: p.imagen_url || '',
          whatsapp: provActual?.whatsapp || '', esPro: provDetalleEsPro
        });
      }
    });
    provDetalleData = data;
    provDetalleFiltro = '';
    const cajaBusq = document.getElementById('det-prod-search');
    const inputBusq = document.getElementById('det-prod-q');
    if (inputBusq) inputBusq.value = '';
    // El buscador solo aparece si hay catalogo suficiente para que sirva.
    if (cajaBusq) cajaBusq.style.display = data.length >= 8 ? 'block' : 'none';
    await renderDetalleProductos(proveedorId);
  } catch (e) {
    const el2 = document.getElementById('det-productos-carousels');
    if (el2) el2.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">No se pudieron cargar los productos.</div>';
  }
}

// Filtra el catálogo del proveedor sin volver al servidor: busca sobre lo que ya
// está cargado, así respeta el tope de 30 productos de los proveedores no-Pro.
function filtrarCatalogoProv(q) {
  provDetalleFiltro = (q || '').toString();
  provDetalleOffset = 0;
  renderDetalleProductos(provActual?.id);
}
function _normProd(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function renderDetalleProductos(proveedorId) {
  const el = document.getElementById('det-productos-carousels');
  if (!el) return;
  const bgsColores = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D'];
  const filtro = _normProd(provDetalleFiltro).trim();
  const palabras = filtro.split(/\s+/).filter(Boolean);
  const data = palabras.length
    ? provDetalleData.filter(p => {
        const txt = _normProd(p.nombre) + ' ' + _normProd(p.categoria_principal || p.categoria);
        return palabras.every(w => txt.includes(w));
      })
    : provDetalleData;
  if (palabras.length && !data.length) {
    el.style.cssText = '';
    el.innerHTML = `<div style="text-align:center;padding:22px 14px;color:var(--gray);font-size:.82rem">Sin resultados para “${escHtml(provDetalleFiltro.trim())}” en este catálogo.</div>`;
    return;
  }
  const slice = data.slice(0, (provDetalleOffset + 1) * DETALLE_PAGE_SIZE);
  const resto = data.length - slice.length;
  el.style.cssText = '';
  const cards = slice.map((p, i) => {
    const prodId = 'real_' + p.id;
    const emoji = getEmojiCat(p.categoria_principal || p.categoria);
    const imgHtml = p.imagen_url
      ? `<img loading="lazy" src="${escHtml(imgThumb(p.imagen_url, 400, 70))}" style="width:100%;height:90px;object-fit:cover;display:block;background:#F3F4F6" onerror="this.style.display='none'">`
      : `<div style="height:90px;display:flex;align-items:center;justify-content:center;background:#F3F4F6"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;
    return `<div onclick="abrirDetalleProd('${escHtml(prodId)}')" style="background:white;border-radius:12px;overflow:hidden;border:1px solid #eee;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.05)">
      ${imgHtml}
      <div style="padding:8px 9px 10px">
        <div style="font-size:.72rem;font-weight:700;color:#111;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:2rem">${escHtml(p.nombre)}</div>
        <div style="font-size:.85rem;font-weight:900;color:#006039;margin-top:4px">$${Number(p.precio || 0).toLocaleString('es-AR')}</div>
        <div style="font-size:.62rem;color:#999;margin-top:2px">${p.stock ? 'Stock: ' + escHtml(String(p.stock)) : 'Consultar'}</div>
      </div>
    </div>`;
  }).join('');
  let notaLimite = '';
  let esCapado = false;
  if (!provDetalleEsPro && provDetalleData.length === provDetalleLimite) {
    const { count: totalReal } = await sb.from('productos').select('*', { count: 'exact', head: true }).eq('proveedor_id', proveedorId);
    if (totalReal && totalReal > provDetalleLimite) {
      esCapado = true;
      notaLimite = `<div style="text-align:center;padding:10px;font-size:.75rem;color:var(--gray);background:#f8fafc;border-radius:10px;margin-top:8px">Mostrando 30 de ${totalReal} productos. Este proveedor tiene más en su catálogo completo.</div>`;
    }
  }
  // Boton de intencion de compra: aparece solo al final del catalogo (sin busqueda activa y
  // sin mas paginas por cargar). Copy adaptado: si el catalogo esta capado en 30 pide "completo",
  // si ya se ve todo pide "mas productos". El tap cuenta la intencion (pedirMasCatalogo).
  let intentoBtn = '';
  if (resto <= 0 && !palabras.length && provDetalleData.length > 0) {
    const label = esCapado ? 'Quiero ver el catálogo completo' : 'Quiero ver más productos';
    intentoBtn = `<button onclick="pedirMasCatalogo('${escHtml(String(proveedorId))}')" style="width:100%;background:linear-gradient(135deg,#006039,#12855C);border:none;border-radius:12px;padding:14px;font-family:'Inter',sans-serif;font-size:.84rem;font-weight:800;color:#fff;cursor:pointer;margin-top:10px;box-shadow:0 8px 18px -8px rgba(0,60,36,.55)">${label}</button>`;
  }
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:${(resto > 0 || notaLimite || intentoBtn) ? '12px' : '0'}">
      ${cards}
    </div>
    ${resto > 0 ? `<button onclick="provDetalleOffset++;renderDetalleProductos('${proveedorId}')" style="width:100%;background:#eff6f2;border:1.5px solid #DCE8E2;border-radius:12px;padding:12px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:800;color:#065F46;cursor:pointer">Ver ${Math.min(resto, DETALLE_PAGE_SIZE)} producto${Math.min(resto, DETALLE_PAGE_SIZE) > 1 ? 's' : ''} más →</button>` : ''}
    ${notaLimite}
    ${intentoBtn}
  `;
}

// ===== DETALLE PROVEEDOR =====
function abrirDetalle(id) {
  const lista = proveedoresDB;
  let p = lista.find(x => String(x.id) === String(id));
  if (!p) {
    // El proveedor no está en proveedoresDB (ej: no aprobado aún). Lo construimos
    // con los datos del JOIN que ya tenemos embebidos en productosReales.
    const prod = productosReales.find(x => String(x.provId) === String(id));
    if (prod) {
      p = {
        id: String(id),
        nombre: prod.provNombre || 'Proveedor',
        rubro: prod.provRubro || 'General',
        desc: '',
        pro: prod.esPro || false,
        inicial: (prod.provNombre || 'PR').substring(0, 2).toUpperCase(),
        whatsapp: prod.whatsapp || '',
        provincia: '',
        pedido_minimo: 'Consultar',
        envios: 'Consultar',
        instagram: '',
        logo_url: ''
      };
    }
  }
  if (!p) { showToast('Proveedor no disponible'); return; }
  provActual = p;
  provDetalleMostrarTodos = false;
  addToHistorial(p);
  trackEvent('view_provider', { provider_id: String(p.id), provider_name: p.nombre, provider_rubro: p.rubro, is_pro: !!p.pro });

  const detLogoEl = document.getElementById('det-logo');
  const detIni = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
  if (p.logo_url) {
    detLogoEl.style.background = '#fff';
    detLogoEl.innerHTML = `<img src="${escHtml(p.logo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    detLogoEl.style.background = '';
    detLogoEl.innerHTML = '';
    detLogoEl.textContent = detIni;
  }
  document.getElementById('det-nombre').textContent = p.nombre;
  const rubrosArr = (p.rubro || 'General').split(',').map(r => r.trim()).filter(Boolean);
  const rubrosHtml = rubrosArr.map(r =>
    `<span style="display:inline-block;background:#eff6f2;color:#065F46;border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;margin:2px 2px">${escHtml(r)}</span>`
  ).join('');
  document.getElementById('det-rubro').innerHTML = rubrosHtml + (p.provincia ? `<span style="display:inline-block;color:var(--gray);font-size:.72rem;margin:2px 4px">· ${escHtml(p.provincia)}</span>` : '');
  document.getElementById('det-desc').textContent = p.desc || p.descripcion || 'Sin descripcion.';
  document.getElementById('det-minimo').textContent = p.pedido_minimo || 'Sin minimo';
  document.getElementById('det-envios').textContent = p.envios || 'Consultar';
  document.getElementById('det-provincia').textContent = p.provincia || '-';
  document.getElementById('det-instagram').textContent = p.instagram || '-';
  document.getElementById('det-pro-badge').style.display = p.pro ? 'inline-flex' : 'none';
  document.getElementById('det-fav-btn').textContent = esFav(p.id) ? '❤️' : '♡';
  document.getElementById('det-wa-btn').style.display = (p.whatsapp) ? 'flex' : 'none';

  // Reseñas para TODOS los proveedores, no solo Pro.
  //
  // Estaban detras del muro Pro y eso las mataba: hoy hay 4 Pro vigentes, asi
  // que casi todo el que cotiza es Free y su reseña nacia invisible. Con el
  // cierre de pedido en Cotizaciones pidiendo calificacion, eso pasaba a ser
  // pedirle al comprador que califique al vacio.
  //
  // Ademas la reputacion no es una funcion premium: es el incentivo para que
  // un Free se enganche. Nadie paga por poder mostrar reseñas cuando todavia
  // no tiene ninguna.
  const resenasSection = document.getElementById('det-resenas-section');
  if (resenasSection) resenasSection.style.display = 'block';

  // Reset calc
  ['calc-costo', 'calc-venta', 'calc-cantidad'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  const cr = document.getElementById('calc-result');
  if (cr) cr.style.display = 'none';

  // Rating (async — carga desde Supabase, para todos)
  renderRatingSummary(p.id);

  // Comp button
  updateDetCompBtn();

  const _esDueno = currentUser?.provData && String(currentUser.provData.id) === String(p.id);
  const _vk = `eg_visit_${p.id}`, _vt = parseInt(localStorage.getItem(_vk) || '0');
  if (!_esDueno && Date.now() - _vt > 86400000) {
    localStorage.setItem(_vk, Date.now());
    sb.rpc('increment_visitas', { proveedor_id: p.id }).then(() => {});
  }
  cargarProductosDetalle(p.id);
  goTo('detalle');
}

function volverDetalle() { goBack('buscar'); }
function detWA() { if (provActual && provActual.whatsapp) { registrarContactoWA(provActual.id, provActual); abrirWA(provActual.whatsapp, mensajeWAProv(provActual)); } else showToast('WhatsApp no disponible'); }
function detChat() { if (provActual) abrirChatDirecto(provActual.id); }

// ===== CALCULADORA =====
function calcGanancia() {
  const costo = parseFloat(document.getElementById('calc-costo').value);
  const venta = parseFloat(document.getElementById('calc-venta').value);
  const cantidad = parseFloat(document.getElementById('calc-cantidad').value);
  const resEl = document.getElementById('calc-result');
  if (!costo || !venta || !cantidad || costo <= 0 || venta <= 0 || cantidad <= 0) { if (resEl) resEl.style.display = 'none'; return; }
  const inv = costo * cantidad, tot = venta * cantidad, gan = tot - inv;
  const mrg = ((gan / inv) * 100).toFixed(0);
  document.getElementById('calc-inv').textContent = '$' + inv.toLocaleString('es-AR');
  document.getElementById('calc-gan').textContent = '$' + gan.toLocaleString('es-AR');
  document.getElementById('calc-mrg').textContent = mrg + '%';
  document.getElementById('calc-tot').textContent = '$' + tot.toLocaleString('es-AR');
  if (resEl) resEl.style.display = 'grid';
}

// ===== CHAT =====
async function abrirChatDirecto(id) {
  if (!currentUser) {
    showToast('Iniciá sesión para hablar con este proveedor');
    goTo('perfil');
    return;
  }

  // Resolve provider — try local cache first, then fetch from Supabase
  let p = proveedoresDB.find(x => String(x.id) === String(id));
  if (!p) {
    try {
      const { data } = await sb.from('proveedores').select('id,nombre,rubro,descripcion,plan,plan_hasta,whatsapp,provincia,pedido_minimo,envios,instagram,logo_url,visitas,estado,created_at').eq('id', id).maybeSingle();
      if (data) { p = data; proveedoresDB.push(data); }
    } catch (e) { }
  }
  if (!p) { showToast('Proveedor no disponible'); return; }

  provActual = p;
  document.getElementById('chat-nombre').textContent = p.nombre;
  document.getElementById('chat-rubro').textContent = p.rubro || 'Proveedor';

  chatMsgs = [];
  renderChat();
  goTo('chat');

  // Cargar historial filtrado por proveedor_id: mensajes del usuario + respuestas del proveedor
  try {
    const { data } = await sb.from('mensajes')
      .select('*')
      .eq('proveedor_id', p.id)
      .eq('usuario_email', currentUser.email)
      .order('created_at', { ascending: true });

    if (data && data.length) {
      chatMsgs = data.map(m => ({
        tipo: m.de_tipo === 'proveedor' ? 'recv' : 'sent',
        texto: m.texto,
        hora: m.created_at ? timeAgo(new Date(m.created_at)) : '',
        dbId: m.id,
        nombre: m.de_tipo === 'proveedor' ? p.nombre : null
      }));
      renderChat();
      // Marcar mensajes del proveedor como leídos para este usuario (fire-and-forget)
      sb.from('mensajes').update({ leido: true })
        .eq('proveedor_id', p.id)
        .eq('de_tipo', 'proveedor')
        .eq('usuario_email', currentUser.email)
        .eq('leido', false)
        .then(() => {});
    } else {
      chatMsgs = [{ tipo: 'recv', texto: 'Hola! Soy ' + p.nombre + '. En que te puedo ayudar?', hora: '', nombre: p.nombre }];
      renderChat();
    }
  } catch (e) {
    chatMsgs = [{ tipo: 'recv', texto: 'Hola! Soy ' + p.nombre + '. En que te puedo ayudar?', hora: '', nombre: p.nombre }];
    renderChat();
  }

  iniciarChatPolling(p.id);
}
function volverChat() {
  detenerChatPolling();
  goBack('buscar');
  // Refrescar lista de conversaciones para que desaparezca el badge
  setTimeout(() => cargarMisConversaciones(), 150);
}

// ===== MENSAJES USUARIO (buyer) =====
async function cargarMensajesUsuario() {
  const el = document.getElementById('mensajes-list');
  if (!el) return;

  if (!currentUser) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:2.5rem;margin-bottom:14px">💬</div>
        <div style="font-family:'Fraunces',serif;font-size:1.1rem;font-weight:700;color:#111;margin-bottom:6px">Iniciá sesión para ver tus mensajes</div>
        <div style="font-size:.83rem;color:#888;margin-bottom:24px">Accedé con Google para ver tus conversaciones con proveedores</div>
        <button onclick="goTo('perfil')" style="background:#006039;color:white;border:none;border-radius:12px;padding:12px 24px;font-family:'DM Sans',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">Iniciar sesión</button>
      </div>`;
    return;
  }

  el.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:.85rem">Cargando...</div>';

  try {
    const { data, error } = await sb.from('mensajes')
      .select('*')
      .eq('usuario_email', currentUser.email)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || !data.length) {
      el.innerHTML = `
        <div style="text-align:center;padding:60px 20px">
          <div style="font-size:2.5rem;margin-bottom:14px">💬</div>
          <div style="font-family:'Fraunces',serif;font-size:1.1rem;font-weight:700;color:#111;margin-bottom:6px">Todavía no hablaste con ningún proveedor</div>
          <div style="font-size:.83rem;color:#888;margin-bottom:24px;line-height:1.5">Encontrá uno y escribile directo</div>
          <button onclick="goTo('buscar')" style="background:#006039;color:white;border:none;border-radius:12px;padding:12px 24px;font-family:'DM Sans',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">Buscar proveedores</button>
        </div>`;
      return;
    }

    // Group by proveedor_id, keep latest message per provider
    const convMap = {};
    data.forEach(m => {
      const pid = String(m.proveedor_id);
      if (!convMap[pid]) convMap[pid] = { provId: pid, lastMsg: m };
    });

    // Get provider names from proveedoresDB (already loaded) or fetch
    const convs = Object.values(convMap);
    const provIds = convs.map(c => c.provId);
    let provsInfo = {};
    proveedoresDB.forEach(p => { if (provIds.includes(String(p.id))) provsInfo[String(p.id)] = p; });

    // Fetch any missing providers
    const missing = provIds.filter(id => !provsInfo[id]);
    if (missing.length) {
      const { data: provData } = await sb.from('proveedores').select('id,nombre,rubro,logo_url').in('id', missing);
      if (provData) provData.forEach(p => { provsInfo[String(p.id)] = p; });
    }

    el.innerHTML = convs.map(c => {
      const prov = provsInfo[c.provId];
      const nombre = prov?.nombre || 'Proveedor';
      const rubro = prov?.rubro || '';
      const ini = nombre.substring(0, 2).toUpperCase();
      const lastMsg = c.lastMsg;
      const preview = (lastMsg.texto || '').replace(/\n/g, ' ').substring(0, 55) + ((lastMsg.texto || '').length > 55 ? '…' : '');
      const tiempo = timeAgo(new Date(lastMsg.created_at));
      const esRecibido = lastMsg.de_tipo === 'proveedor';
      return `<div class="conv-item" onclick="abrirChatDirecto('${escHtml(c.provId)}')" style="display:flex;align-items:center;gap:12px;padding:14px 12px;background:white;border-radius:14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.07);cursor:pointer">
        <div style="width:46px;height:46px;border-radius:50%;background:#E8F5EE;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:1rem;font-weight:700;color:#006039;flex-shrink:0">${escHtml(ini)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem;color:#111;margin-bottom:2px">${escHtml(nombre)}</div>
          <div style="font-size:.75rem;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esRecibido ? '→ ' : ''} ${escHtml(preview)}</div>
        </div>
        <div style="flex-shrink:0;text-align:right">
          <div style="font-size:.7rem;color:#bbb">${escHtml(tiempo)}</div>
        </div>
      </div>`;
    }).join('');

  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#bbb;font-size:.85rem">Error al cargar mensajes.</div>';
  }
}

function getHora() { return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
function renderChat() {
  const el = document.getElementById('chat-msgs');
  if (!el) return;
  el.innerHTML = chatMsgs.map(m => {
    const nombre = m.tipo === 'recv' && m.nombre ? '<div style="font-size:.68rem;font-weight:700;color:var(--blue);margin-bottom:3px">' + escHtml(m.nombre) + '</div>' : '';
    return '<div style="display:flex;flex-direction:column;align-items:' + (m.tipo === 'sent' ? 'flex-end' : 'flex-start') + '">' + nombre + '<div class="chat-msg ' + m.tipo + '">' + escHtml(m.texto || '').replace(/\n/g, '<br>') + '<div class="chat-msg-time">' + escHtml(m.hora) + '</div></div></div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}
let chatPollingInterval = null;

function iniciarChatPolling(provId) {
  if (chatPollingInterval) clearInterval(chatPollingInterval);
  chatPollingInterval = setInterval(async () => {
    if (!provActual || !currentUser) return;
    try {
      const { data } = await sb.from('mensajes')
        .select('*')
        .eq('proveedor_id', provId)
        .eq('usuario_email', currentUser.email)
        .order('created_at', { ascending: true });
      if (!data || !data.length) return;
      const hayNuevos = data.some(m => !chatMsgs.some(cm => cm.dbId === m.id));
      if (hayNuevos) {
        chatMsgs = data.map(m => ({
          tipo: m.de_tipo === 'proveedor' ? 'recv' : 'sent',
          texto: m.texto,
          hora: timeAgo(new Date(m.created_at)),
          dbId: m.id,
          nombre: m.de_tipo === 'proveedor' ? (provActual?.nombre || 'Proveedor') : null
        }));
        renderChat();
      }
    } catch (e) { }
  }, 8000);
}

function detenerChatPolling() {
  if (chatPollingInterval) { clearInterval(chatPollingInterval); chatPollingInterval = null; }
}

async function sendMsg() {
  if (!currentUser) {
    showToast('Iniciá sesión para enviar mensajes');
    goTo('perfil');
    return;
  }

  const inp = document.getElementById('chat-inp');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  chatMsgs.push({ tipo: 'sent', texto: txt, hora: getHora() });
  renderChat();

  // Guardar en Supabase
  if (provActual) {
    try {
      await sb.from('mensajes').insert({
        proveedor_id: provActual.id,
        de_tipo: 'usuario',
        de_nombre: currentUser.name,
        usuario_email: currentUser.email,
        texto: txt,
        leido: false
      });

      // Notificar al proveedor por email (fire-and-forget)
      fetch('/api/notificar-mensaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: provActual.id,
          de_nombre: currentUser.name,
          texto: txt
        })
      }).catch(() => {});

    } catch (e) { }
  }

}

// ===== AUTH =====
let _googleLoginInFlight = false;
async function simulateGoogleLogin(btnEl) {
  // Guard contra múltiples clicks: cada signInWithOAuth genera un state nuevo
  // que sobreescribe el anterior en localStorage. Si el usuario hace doble-click,
  // el callback de Google viene con un state que ya no coincide → falla silenciosamente.
  if (_googleLoginInFlight) return;
  _googleLoginInFlight = true;
  const btn = btnEl || (typeof event !== 'undefined' && event?.currentTarget) || document.querySelector('button.google-btn');
  const txtOrig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.style.cursor = 'wait'; btn.innerHTML = 'Redirigiendo a Google…'; }
  try {
    // Limpiar TODA la auth data de Supabase en localStorage antes de iniciar OAuth.
    // Si quedan entradas viejas (sesiones vencidas, code_verifiers huérfanos), el SDK
    // las encuentra primero al volver del callback, intenta refrescarlas, falla, y
    // nunca llega a procesar el #access_token= del hash → usuario queda sin sesión.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-seubtijmyoahnyspvidq-'))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) { }
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://emprendego.com.ar' } });
    if (error) throw error;
    // No reseteamos el flag: la página está por navegar a Google.
  } catch (e) {
    _googleLoginInFlight = false;
    if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; btn.innerHTML = txtOrig; }
    showToast('Error al iniciar sesion. Intenta de nuevo.');
  }
}

// ===== AUTH EMAIL + CONTRASEÑA =====
let authMode = 'login'; // 'login' | 'signup'

function toggleAuthMode(e) {
  if (e) e.preventDefault();
  authMode = authMode === 'login' ? 'signup' : 'login';
  const isLogin = authMode === 'login';
  const $ = id => document.getElementById(id);
  $('login-title').textContent = isLogin ? 'Ingresá a tu cuenta' : 'Creá tu cuenta';
  $('auth-submit-btn').textContent = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
  $('auth-toggle-question').textContent = isLogin ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?';
  $('auth-toggle-link').textContent = isLogin ? 'Registrate' : 'Iniciá sesión';
  $('auth-password').setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
  const fw = $('auth-forgot-wrap');
  if (fw) fw.style.display = isLogin ? '' : 'none';
  hideAuthError();
}

async function solicitarRecuperarContrasena(e) {
  e.preventDefault();
  const email = (document.getElementById('auth-email')?.value || '').trim();
  if (!email) { showAuthError('Ingresá tu email primero para recuperar la contraseña.'); return; }
  const btn = document.getElementById('auth-submit-btn');
  if (btn) btn.disabled = true;
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: 'https://emprendego.com.ar' });
    if (error) throw error;
    showAuthSuccess('Te enviamos un link para restablecer tu contraseña. Revisá tu casilla (también spam).');
  } catch (err) {
    showAuthError('No pudimos enviar el email. Verificá que la dirección sea correcta.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function reenviarConfirmacion(e) {
  if (e) e.preventDefault();
  const email = (document.getElementById('auth-email')?.value || '').trim().toLowerCase();
  if (!email) { showAuthError('Ingresá tu email primero.'); return; }
  try {
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: 'https://emprendego.com.ar' } });
    if (error) throw error;
    showAuthSuccess('Reenviamos el email de confirmación. Revisá tu casilla (también spam).');
  } catch (err) {
    showAuthError('No pudimos reenviar el email. Intentá en unos minutos.');
  }
}

function mostrarModalNuevaContrasena() {
  const el = document.getElementById('nuevaPasswordModal');
  if (!el) return;
  document.getElementById('nueva-password-input').value = '';
  document.getElementById('nueva-password-confirm').value = '';
  document.getElementById('nueva-password-error').style.display = 'none';
  document.getElementById('nueva-password-btn').textContent = 'Guardar contraseña';
  document.getElementById('nueva-password-btn').disabled = false;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function cerrarNuevaPasswordModal(e) {
  if (e.target === document.getElementById('nuevaPasswordModal')) {
    document.getElementById('nuevaPasswordModal').classList.remove('open');
    document.body.style.overflow = '';
  }
}
async function submitNuevaContrasena(e) {
  e.preventDefault();
  const pass = (document.getElementById('nueva-password-input')?.value || '');
  const confirm = (document.getElementById('nueva-password-confirm')?.value || '');
  const errEl = document.getElementById('nueva-password-error');
  const btn = document.getElementById('nueva-password-btn');
  const showErr = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };
  errEl.style.display = 'none';
  if (pass.length < 6) { showErr('La contraseña debe tener al menos 6 caracteres.'); return; }
  if (pass !== confirm) { showErr('Las contraseñas no coinciden.'); return; }
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) throw error;
    document.getElementById('nuevaPasswordModal').classList.remove('open');
    document.body.style.overflow = '';
    showToast('Contraseña actualizada correctamente.');
  } catch (err) {
    showErr('No se pudo actualizar la contraseña. Intentá de nuevo.');
    btn.disabled = false; btn.textContent = 'Guardar contraseña';
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.background = '#fef2f2';
  el.style.border = '1px solid #fecaca';
  el.style.color = '#b91c1c';
  el.style.display = 'block';
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.background = '#f0fdf4';
  el.style.border = '1px solid #86efac';
  el.style.color = '#15803d';
  el.style.display = 'block';
}

function hideAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
  const rw = document.getElementById('auth-resend-wrap');
  if (rw) rw.style.display = 'none';
}

function traducirErrorAuth(error) {
  const msg = (error && error.message ? error.message : String(error || '')).toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email o contraseña incorrectos. Si te registraste con Google, ingresá con el botón "Continuar con Google".';
  if (msg.includes('user already registered')) return 'Este email ya está registrado. Iniciá sesión.';
  if (msg.includes('rate limit')) return 'Demasiados intentos. Esperá un momento e intentá de nuevo.';
  if (msg.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('unable to validate email') || msg.includes('invalid email') || msg.includes('email address') && msg.includes('invalid')) return 'El email no es válido.';
  if (msg.includes('email not confirmed')) return 'Tenés que confirmar tu email antes de ingresar. Revisá tu casilla.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.';
  if (msg.includes('signup') && msg.includes('disabled')) return 'El registro está temporalmente deshabilitado.';
  return 'Algo salió mal. Intentá de nuevo.';
}

async function submitAuthForm(e) {
  e.preventDefault();
  hideAuthError();
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-password');
  const btn = document.getElementById('auth-submit-btn');
  if (!emailEl || !passEl || !btn) return;
  const email = emailEl.value.trim().toLowerCase();
  const password = passEl.value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError('Ingresá un email válido.'); return; }
  if (password.length < 6) { showAuthError('La contraseña debe tener al menos 6 caracteres.'); return; }

  const txtOrig = btn.textContent;
  btn.disabled = true;
  btn.textContent = authMode === 'login' ? 'Ingresando...' : 'Creando cuenta...';
  try {
    let result;
    if (authMode === 'login') {
      result = await sb.auth.signInWithPassword({ email, password });
    } else {
      result = await sb.auth.signUp({ email, password, options: { emailRedirectTo: 'https://emprendego.com.ar' } });
    }
    if (result.error) {
      showAuthError(traducirErrorAuth(result.error));
      // Si el email no está confirmado, ofrecer reenviar el mail de confirmación.
      const emsg = (result.error.message || '').toLowerCase();
      if (emsg.includes('email not confirmed')) {
        const rw = document.getElementById('auth-resend-wrap');
        if (rw) rw.style.display = 'block';
      }
      btn.disabled = false; btn.textContent = txtOrig;
      return;
    }
    // Si "Confirm email" está activo en Supabase, signUp devuelve user pero sin session.
    if (authMode === 'signup' && !result.data?.session) {
      // Supabase ofusca el "email ya registrado": devuelve user con identities = [] y NO
      // manda ningún mail. Sin esto, mostraríamos "te enviamos un email" que nunca llega.
      const identities = result.data?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        toggleAuthMode(); // pasa a modo login dejando el email cargado (limpia el error y reetiqueta el botón)
        showAuthError('Este email ya está registrado. Iniciá sesión con tu contraseña. Si la olvidaste, tocá "¿Olvidaste tu contraseña?".');
        btn.disabled = false; // toggleAuthMode ya dejó el botón como "Iniciar sesión"
        return;
      }
      showAuthSuccess('Te enviamos un email de confirmación. Revisá tu casilla (también spam) y volvé a ingresar.');
      btn.disabled = false; btn.textContent = txtOrig;
      return;
    }
    // Éxito: onAuthStateChange dispara checkSession() automáticamente. Limpiamos el form.
    passEl.value = '';
  } catch (err) {
    showAuthError(traducirErrorAuth(err));
    btn.disabled = false; btn.textContent = txtOrig;
  }
}

async function notificarAdmin(tipo, datos) {
  try {
    const esProveedor = tipo === 'proveedor';
    const title = esProveedor ? 'Nueva solicitud de proveedor' : 'Nuevo usuario registrado';
    const ig = (datos.instagram || '').trim();
    const igUrl = ig ? (/^https?:\/\//i.test(ig) ? ig : 'https://instagram.com/' + ig.replace(/^@+/, '')) : '';
    const body = esProveedor
      ? [
          datos.nombre,
          ig ? (ig.startsWith('http') ? ig : '@' + ig.replace(/^@+/, '')) : 'SIN INSTAGRAM',
          datos.whatsapp,
          datos.cuit,
          datos.rubro,
          datos.provincia
        ].filter(Boolean).join(' | ')
      : `${datos.nombre} | ${datos.email}`;
    const headers = { 'Title': title, 'Priority': 'high', 'Tags': esProveedor ? 'office' : 'bust_in_silhouette' };
    // Tocar la notificación abre el IG del proveedor: verificamos sin entrar al panel.
    if (esProveedor && igUrl) {
      headers['Click'] = igUrl;
      headers['Actions'] = `view, Ver Instagram, ${igUrl}; view, Abrir panel, https://emprendego.com.ar/admin.html`;
    }
    await fetch('https://ntfy.sh/emprendego-admin-x9k2', { method: 'POST', body, headers });
  } catch (e) {}
}

async function checkSession(sessionOverride) {
  try {
    let session;
    if (sessionOverride === undefined) {
      const { data } = await sb.auth.getSession();
      session = data?.session ?? null;
      console.log('[checkSession] getSession:', !!session, session?.user?.email);
    } else {
      session = sessionOverride;
      console.log('[checkSession] session from caller:', !!session, session?.user?.email);
    }
    if (session && session.user) {
      const user = session.user;
      const name = user.user_metadata?.full_name || user.email.split('@')[0];
      const email = user.email;
      const picture = user.user_metadata?.avatar_url || '';
      try {
        const emailNorm = email.toLowerCase().trim();
        const { data: existingUser } = await sb.from('usuarios').select('id').eq('email', emailNorm).maybeSingle();
        await sb.from('usuarios').upsert({ email: emailNorm, nombre: name, foto_url: picture }, { onConflict: 'email' });
        if (!existingUser) notificarAdmin('usuario', { nombre: name, email: emailNorm });
        // Aviso a Meta Pixel: mide el éxito de las campañas (costo por resultado).
        // Bandera para no contar de más: checkSession() corre en cada carga y en onAuthStateChange.
        try {
          if (typeof fbq === 'function' && !window._egLoginTracked) {
            window._egLoginTracked = true;
            fbq('trackCustom', 'Login'); // todo inicio de sesión
            // CompleteRegistration NO va acá: ese evento queda reservado para el submit
            // exitoso del formulario de registro (perfil nuevo), según pidió la publicista.
          }
        } catch (e) {}
      } catch (e) { console.warn('[checkSession] upsert usuarios:', e); }
      // No pedimos la columna `email` de vuelta: ya la tenemos de la sesión (`email`), y
      // está revocada de la API pública por privacidad (PII). Filtramos por email igual.
      const { data: provList } = await sb.from('proveedores').select('id,nombre,plan,plan_desde,plan_hasta,rubro,provincia,descripcion,whatsapp,instagram,pedido_minimo,envios,estado,logo_url,tn_store_id,ml_connected,ml_user_id,ml_nickname,ml_categoria_map').eq('email', email.toLowerCase().trim());
      console.log('[checkSession] provList:', provList?.length, provList?.[0]?.estado);
      const prov = provList && provList.length > 0 ? provList[0] : null;
      if (prov && prov.estado === 'aprobado') {
        if (prov.plan === 'pro' && prov.plan_hasta) {
          const hasta = new Date(prov.plan_hasta + 'T03:00:00Z');
          if (hasta < new Date()) {
            await sb.from('proveedores').update({ plan: 'gratis', plan_desde: null }).eq('id', prov.id);
            prov.plan = 'gratis'; prov.plan_desde = null;
          }
        }
        handleLogin({ name: prov.nombre || name, email, picture, type: 'proveedor', proveedorId: prov.id, provData: prov });
        verificarExpiracionPlan(prov);
      } else {
        handleLogin({ name, email, picture, type: 'user' });
      }
      console.log('[checkSession] handleLogin done, type:', prov && prov.estado === 'aprobado' ? 'proveedor' : 'user');
    } else {
      console.log('[checkSession] no session/user — login skipped');
    }
  } catch (e) { console.error('[checkSession]', e); }
}
function handleLogin(user) {
  currentUser = user;
  if (user.type === 'user') cargarHistorialLocal(user.email);
  updateTopbar();
  try { updatePerfilUI(); } catch (e) { console.error('[updatePerfilUI]', e); }
}

function verificarExpiracionPlan(prov) {
  if (!prov) return;
  const banner = document.getElementById('pro-expiry-banner');
  if (!banner) return;
  if (!prov.plan_hasta) return; // nunca fue Pro o removido manualmente — no mostrar
  const hasta = new Date(prov.plan_hasta + 'T03:00:00Z');
  if (hasta >= new Date()) return; // plan todavía activo
  banner.style.display = 'block';
  banner.innerHTML = `<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:14px;padding:14px 16px;margin:0 0 10px;box-shadow:0 3px 12px rgba(0,0,0,.18)">
    <div style="font-size:.82rem;font-weight:800;color:#dc2626;margin-bottom:4px">⚠️ Tu Plan Pro venció</div>
    <div style="font-size:.78rem;color:#b91c1c;line-height:1.5">Solo se muestran 30 de tus productos.</div>
    <button onclick="iniciarPagoPro(this)" style="margin-top:10px;background:#dc2626;color:white;border:none;border-radius:8px;padding:8px 16px;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit">Pagar ahora →</button>
  </div>`;
}

function mostrarAvisoPlanProximo(fechaVence) {
  const banner = document.getElementById('pro-expiry-banner');
  if (!banner) return;
  const fechaStr = fechaVence.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  banner.style.display = 'block';
  banner.innerHTML = `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:14px;padding:14px 16px;margin:0 0 10px;box-shadow:0 3px 12px rgba(0,0,0,.18)">
    <div style="font-size:.82rem;font-weight:800;color:#b45309;margin-bottom:4px">⚡ Tu Plan Pro vence el ${fechaStr}</div>
    <div style="font-size:.78rem;color:#92400e;line-height:1.5">¡Renová ahora para no perder visibilidad!</div>
    <button onclick="iniciarPagoPro(this)" style="margin-top:10px;background:#d97706;color:white;border:none;border-radius:8px;padding:8px 16px;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit">Renovar ahora →</button>
  </div>`;
}
async function logout() {
  try { await sb.auth.signOut(); } catch (e) { }
  currentUser = null; historial = [];
  try { localStorage.removeItem('eg_historial'); } catch (e) { }
  document.getElementById('perfil-login').style.display = 'block';
  document.getElementById('perfil-user').style.display = 'none';
  document.getElementById('perfil-proveedor').style.display = 'none';
  updateTopbar(); showToast('Sesion cerrada');
}
function openDrawer() {
  document.getElementById('mobile-drawer')?.classList.add('open');
  document.getElementById('drawer-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  updateDrawerUser();
}
function closeDrawer() {
  document.getElementById('mobile-drawer')?.classList.remove('open');
  document.getElementById('drawer-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}
function drawerNavTo(screen) {
  closeDrawer();
  goTo(screen);
}
function updateDrawerUser() {
  const nameEl = document.getElementById('drawer-user-name');
  const subEl = document.getElementById('drawer-user-sub');
  const avatarEl = document.getElementById('drawer-avatar');
  const loginLabel = document.getElementById('drawer-login-label');
  if (currentUser) {
    if (nameEl) nameEl.textContent = currentUser.name.split(' ')[0];
    if (subEl) subEl.textContent = currentUser.type === 'proveedor' ? 'Proveedor' : 'Comprador';
    if (loginLabel) loginLabel.textContent = 'Mi perfil';
    if (avatarEl && currentUser.avatar) {
      avatarEl.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    }
  } else {
    if (nameEl) nameEl.textContent = 'Invitado';
    if (subEl) subEl.textContent = 'Tocá para iniciar sesión';
    if (loginLabel) loginLabel.textContent = 'Iniciar sesión';
  }
}

function updateTopbar() {
  const btn = document.getElementById('topbar-login-btn');
  if (btn) btn.textContent = currentUser ? currentUser.name.split(' ')[0] : '→ Ingresar';
  const greet = document.getElementById('hero-greeting');
  if (greet) {
    if (currentUser) {
      const hora = new Date().getHours();
      const saludo = hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
      greet.textContent = saludo + ', ' + currentUser.name.split(' ')[0] + '! 👋';
      greet.style.display = 'block';
    } else {
      greet.style.display = 'none';
    }
  }
}
function updatePerfilUI() {
  if (!currentUser) return;
  document.getElementById('perfil-login').style.display = 'none';
  if (currentUser.type === 'proveedor') {
    console.log('[dashboard] plan:', currentUser?.provData?.plan, '| plan_hasta:', currentUser?.provData?.plan_hasta, '| esProvPro():', esProvPro());
    document.getElementById('perfil-user').style.display = 'none';
    document.getElementById('perfil-proveedor').style.display = 'block';
    document.getElementById('dash-nombre').textContent = currentUser.name;
    document.getElementById('dash-avatar-initials').textContent = currentUser.name.substring(0, 2).toUpperCase();
    if (currentUser.provData) {
      const pd = currentUser.provData;
      const rl = document.getElementById('dash-rubro-label');
      if (rl) rl.textContent = (pd.rubro || 'Rubro') + ' · ' + (pd.provincia || 'Argentina');
      const en = document.getElementById('edit-nombre'); if (en) en.value = pd.nombre || '';
      const ed = document.getElementById('edit-desc'); if (ed) ed.value = pd.descripcion || '';
      const ewa = document.getElementById('edit-wa'); if (ewa) ewa.value = pd.whatsapp || '';
      const eig = document.getElementById('edit-instagram'); if (eig) eig.value = pd.instagram || '';
      if (pd.logo_url) {
        const prev = document.getElementById('edit-logo-preview'); if (prev) { prev.src = pd.logo_url; prev.style.display = 'block'; }
        const ph = document.getElementById('edit-logo-ph'); if (ph) ph.style.display = 'none';
      }
    }
    cargarProductosProveedor();
    cargarStatsDashboard();
    mostrarAvisoIntencion();
    cargarRankingRubro();
    cargarLogoProveedor();
    cargarPedidosRecientes();
    calcularCompletitudPerfil();
    renderBannerProDashboard();
    renderTiendaNubeSection();
    renderMercadoLibreSection();
    const badge = document.getElementById('dash-pro-badge-el');
    if (badge && currentUser.provData) {
      const pd2 = currentUser.provData;
      const planHasta = pd2.plan_hasta ? new Date(pd2.plan_hasta + 'T03:00:00Z') : null;
      const vence = document.getElementById('dash-pro-vence');
      if (pd2.plan === 'pro' && planHasta && planHasta > new Date()) {
        badge.textContent = 'PRO';
        badge.style.display = 'inline-flex';
        if (vence) {
          vence.textContent = 'Plan Pro activo hasta el ' + planHasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
          vence.style.display = 'block';
        }
        const diasRestantes = Math.ceil((planHasta - new Date()) / 86400000);
        if (diasRestantes <= 7) mostrarAvisoPlanProximo(planHasta);
      } else {
        badge.style.display = 'none';
        if (vence) vence.style.display = 'none';
      }
    }
  } else {
    document.getElementById('perfil-user').style.display = 'block';
    document.getElementById('perfil-proveedor').style.display = 'none';
    document.getElementById('user-display-name').textContent = currentUser.name;
    document.getElementById('user-display-email').textContent = currentUser.email;
    document.getElementById('user-avatar-placeholder').textContent = currentUser.name.substring(0, 1).toUpperCase();
    if (currentUser.picture) {
      const img = document.getElementById('user-avatar-img');
      img.src = currentUser.picture; img.style.display = 'block';
      document.getElementById('user-avatar-placeholder').style.display = 'none';
    }
    try {
      const favCard = document.getElementById('perfil-favs-card');
      const favLabel = document.getElementById('perfil-favs-label');
      const n = Array.isArray(favs) ? favs.length : 0;
      if (favCard && favLabel) {
        if (n > 0) {
          favLabel.textContent = n + (n === 1 ? ' proveedor guardado' : ' proveedores guardados');
          favCard.style.display = 'flex';
        } else {
          favCard.style.display = 'none';
        }
      }
    } catch (e) { }
    cargarAvatarUsuario();
    cargarHistorial();
  }
}
// ===== COMPLETITUD DEL PERFIL =====
function calcularCompletitudPerfil() {
  if (!currentUser?.provData) return;
  const pd = currentUser.provData;
  const checks = [
    { ok: !!(pd.nombre && pd.nombre.length > 2), tip: 'nombre del negocio' },
    { ok: !!(pd.descripcion && pd.descripcion.length > 10), tip: 'descripción' },
    { ok: !!(pd.whatsapp && pd.whatsapp.length > 6), tip: 'WhatsApp' },
    { ok: !!(pd.rubro && pd.rubro !== 'General'), tip: 'rubro' },
    { ok: !!(pd.provincia && pd.provincia.length > 1), tip: 'provincia' },
    { ok: !!(pd.logo_url && pd.logo_url.length > 5), tip: 'foto/logo' },
    { ok: !!(pd.instagram && pd.instagram.length > 1), tip: 'Instagram' },
    { ok: !!(pd.pedido_minimo && pd.pedido_minimo !== 'Sin minimo'), tip: 'pedido mínimo' },
  ];
  const completados = checks.filter(c => c.ok).length;
  const pct = Math.round((completados / checks.length) * 100);
  const faltantes = checks.filter(c => !c.ok).map(c => c.tip);

  const bar = document.getElementById('perfil-pct-bar');
  const label = document.getElementById('perfil-pct-label');
  const tip = document.getElementById('perfil-pct-tip');
  const wrap = document.getElementById('perfil-completitud-wrap');

  if (bar) setTimeout(() => { bar.style.width = pct + '%'; }, 100);
  if (label) {
    label.textContent = pct + '%';
    label.style.color = pct >= 80 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#EF4444';
  }
  if (tip) {
    if (pct === 100) {
      tip.textContent = '🎉 ¡Perfil completo! Aparecés mejor en las búsquedas.';
      tip.style.color = '#16A34A';
    } else {
      tip.textContent = `Te falta: ${faltantes.slice(0, 3).join(', ')}${faltantes.length > 3 ? ' y más' : ''}.`;
    }
  }
  // Ocultar si está completo
  if (wrap && pct === 100) wrap.style.display = 'none';
}

// ===== EDITAR PERFIL RÁPIDO =====
function abrirEditarPerfil() {
  const tab = document.getElementById('tab-perfil-info');
  if (!tab) return;
  tab.style.display = tab.style.display === 'none' ? 'block' : 'none';
  if (tab.style.display === 'block') {
    const preselected = (currentUser?.provData?.rubro || '').split(',').map(r => r.trim()).filter(Boolean);
    renderRubrosPicker('edit-rubros-picker', preselected);
    tab.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ===== MODAL PRO =====
function showModalPro(feature) {
  const existing = document.getElementById('modal-pro-upgrade');
  if (existing) existing.remove();
  const f = feature || 'Esta función';
  const overlay = document.createElement('div');
  overlay.id = 'modal-pro-upgrade';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML = `<div style="background:white;border-radius:24px 24px 0 0;padding:28px 24px 36px;width:100%;max-width:480px;text-align:center">
    <div style="font-size:2.5rem;margin-bottom:12px">⭐</div>
    <div style="font-family:'Inter',sans-serif;font-size:1.1rem;font-weight:900;color:#1A1A1A;margin-bottom:8px">${escHtml(f)} es exclusivo del Plan Pro</div>
    <div style="font-size:.85rem;color:#777;line-height:1.5;margin-bottom:24px">Desbloqueá todas las funciones avanzadas para hacer crecer tu negocio mayorista.</div>
    <button onclick="document.getElementById('modal-pro-upgrade').remove();goTo('planes')" style="width:100%;background:#006039;color:white;border:none;border-radius:14px;padding:16px;font-family:'Inter',sans-serif;font-size:.95rem;font-weight:800;cursor:pointer;margin-bottom:10px">Activar Plan Pro →</button>
    <button onclick="document.getElementById('modal-pro-upgrade').remove()" style="width:100%;background:#f5f5f5;color:#555;border:none;border-radius:14px;padding:14px;font-family:'Inter',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer">Ahora no</button>
  </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ===== STATS DASHBOARD =====
// Registra un snapshot diario (localStorage) de consultas/visitas y dibuja la
// mini-tendencia de "Consultas por WhatsApp". Dato real, por dispositivo: la línea
// se completa a medida que el proveedor entra al panel en días distintos.
function renderConsultasTrend(provId, consultas, visitas) {
  try {
    if (!provId) return;
    const key = 'eg_metricas_' + provId;
    const hoy = new Date().toISOString().slice(0, 10);
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { hist = []; }
    if (!Array.isArray(hist)) hist = [];
    hist = hist.filter(h => h && h.f !== hoy);
    hist.push({ f: hoy, c: consultas, v: visitas });
    hist.sort((a, b) => (a.f < b.f ? -1 : 1));
    hist = hist.slice(-30);
    try { localStorage.setItem(key, JSON.stringify(hist)); } catch (e) { }

    const spark = document.getElementById('consultas-spark');
    const deltaEl = document.getElementById('consultas-delta');
    if (hist.length < 2) {
      if (spark) spark.style.display = 'none';
      if (deltaEl) deltaEl.style.display = 'none';
      return;
    }

    // Delta contra ~7 días atrás (o el primer snapshot disponible)
    const ultimo = hist[hist.length - 1].c;
    const hace7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const base = hist.find(h => h.f >= hace7) || hist[0];
    const delta = ultimo - base.c;
    if (deltaEl) {
      if (delta > 0) {
        deltaEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>+' + delta + ' esta semana';
        deltaEl.style.display = 'inline-flex';
      } else {
        deltaEl.style.display = 'none';
      }
    }

    // Sparkline de consultas acumuladas
    if (spark) {
      const vals = hist.map(h => h.c);
      const min = Math.min.apply(null, vals);
      const max = Math.max.apply(null, vals);
      const W = 96, H = 40, pad = 4;
      const range = (max - min) || 1;
      const pts = vals.map(function (v, i) {
        const x = pad + (i / (vals.length - 1)) * (W - 2 * pad);
        const y = H - pad - ((v - min) / range) * (H - 2 * pad);
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      const last = pts[pts.length - 1].split(',');
      spark.innerHTML = '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#7fe0ac" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="#7fe0ac"/>';
      spark.style.display = 'block';
    }
  } catch (e) { }
}

async function cargarStatsDashboard() {
  if (!currentUser || !currentUser.proveedorId) return;
  const esPro = esProvPro();
  try {
    const { data: prov } = await sb.from('proveedores').select('visitas,consultas').eq('id', currentUser.proveedorId).single();
    if (prov) {
      // Consultas por WhatsApp: visible siempre (free y Pro) — es la prueba de valor.
      const elC = document.getElementById('stat-consultas');
      if (elC) elC.textContent = prov.consultas || 0;
      renderConsultasTrend(currentUser.proveedorId, prov.consultas || 0, prov.visitas || 0);

      // Dato REAL del mes desde la base (tabla consultas con fecha). Sobrescribe el delta
      // aproximado por localStorage con la prueba de valor exacta: "X este mes". Se resuelve
      // async, así que gana sobre renderConsultasTrend (sincrónico) sin condición de carrera.
      sb.rpc('consultas_mes', { proveedor_id: currentUser.proveedorId }).then(({ data: mes }) => {
        if (typeof mes !== 'number' || mes <= 0) return;
        const d = document.getElementById('consultas-delta');
        if (d) {
          d.textContent = mes + (mes === 1 ? ' contacto este mes' : ' contactos este mes');
          d.style.display = 'inline-flex';
        }
      }).catch(() => {});

      // ===== MOMENTO MÁGICO: consultas nuevas desde la última visita (solo free) =====
      // Compara el total actual contra el guardado la última vez que entró.
      // Solo una vez por carga de página (window._egConsultaChecked) para no parpadear.
      if (!esPro && !window._egConsultaChecked) {
        window._egConsultaChecked = true;
        const key = 'eg_last_consultas_' + currentUser.proveedorId;
        const raw = localStorage.getItem(key);
        const ahora = prov.consultas || 0;
        const banner = document.getElementById('dash-consulta-banner');
        if (banner && raw !== null) {
          const prev = parseInt(raw, 10) || 0;
          const nuevas = ahora - prev;
          if (nuevas > 0) {
            banner.style.display = 'block';
            banner.innerHTML = `<div style="background:linear-gradient(135deg,#F59E0B,#F97316);border-radius:14px;padding:14px 16px;margin-bottom:10px;box-shadow:0 3px 12px rgba(245,158,11,.3)">
              <div style="font-family:'Inter',sans-serif;font-size:.9rem;font-weight:900;color:white;margin-bottom:4px">🎉 ¡Te contactaron ${nuevas} ${nuevas === 1 ? 'vez' : 'veces'} desde tu última visita!</div>
              <div style="font-size:.76rem;color:rgba(255,255,255,.92);line-height:1.5;margin-bottom:10px">Los proveedores que aparecen primero reciben hasta 3x más consultas.</div>
              <button onclick="goTo('planes');haptic('light')" style="background:white;color:#B45309;border:none;border-radius:9px;padding:9px 16px;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit">Aparecer primero →</button>
            </div>`;
          }
        }
        try { localStorage.setItem(key, String(ahora)); } catch (e) { }
      }

      const el = document.getElementById('stat-visitas');
      if (el) {
        el.textContent = prov.visitas || 0; // número real siempre; el free lo ve borroso
        el.style.filter = esPro ? '' : 'blur(6px)';
        el.style.userSelect = esPro ? '' : 'none';
      }
    }
    const { data: msgs } = await sb.from('mensajes').select('id,leido').eq('proveedor_id', currentUser.proveedorId).eq('de_tipo', 'usuario');
    const totalMsgs = msgs ? msgs.length : 0;
    const elMsgs = document.getElementById('dash-msgs-count');
    if (elMsgs) elMsgs.textContent = totalMsgs;
    // Stat "Productos" (reemplaza a la stat muerta de Mensajes — el chat está desactivado)
    try {
      const { count: prodCount } = await sb.from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('proveedor_id', currentUser.proveedorId)
        .eq('visible', true);
      const elProd = document.getElementById('dash-prodstat-count');
      if (elProd) elProd.textContent = prodCount || 0;
    } catch (e) { }
    const elLeads = document.getElementById('stat-leads');
    if (elLeads) {
      elLeads.textContent = totalMsgs; // real siempre; el free lo ve borroso
      elLeads.style.filter = esPro ? '' : 'blur(6px)';
      elLeads.style.userSelect = esPro ? '' : 'none';
    }
    const noLeidos = msgs ? msgs.filter(m => !m.leido).length : 0;
    const elNew = document.getElementById('dash-msgs-new');
    if (elNew && noLeidos > 0) { elNew.style.display = 'inline'; elNew.textContent = noLeidos + ' New'; }
    // Mostrar candado sobre stats si plan gratis
    const statsGrid = document.getElementById('dash-stats-grid');
    if (statsGrid && !esPro) {
      statsGrid.style.position = 'relative';
      // Capa clickeable transparente + candadito en la esquina (deja ver los números borrosos).
      if (!statsGrid.querySelector('.stats-lock-overlay')) {
        const lockDiv = document.createElement('div');
        lockDiv.className = 'stats-lock-overlay';
        lockDiv.onclick = () => showModalPro('Tus estadísticas');
        lockDiv.style.cssText = 'position:absolute;inset:0;cursor:pointer';
        lockDiv.innerHTML = '<span style="position:absolute;top:6px;right:8px;font-size:.9rem">🔒</span>';
        statsGrid.appendChild(lockDiv);
      }
      // CTA de desbloqueo con los números REALES (lo que más deseo genera).
      let cta = document.getElementById('dash-unlock-cta');
      if (!cta && statsGrid.parentNode) {
        cta = document.createElement('div');
        cta.id = 'dash-unlock-cta';
        cta.onclick = () => showModalPro('Tus estadísticas');
        cta.style.cssText = 'margin-top:8px;text-align:center;cursor:pointer;font-size:.72rem;font-weight:700;color:rgba(255,255,255,.92);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 10px';
        statsGrid.parentNode.insertBefore(cta, statsGrid.nextSibling);
      }
      if (cta) cta.innerHTML = `🔓 Desbloqueá tus <b>${(prov && prov.visitas) || 0} visitas</b> y <b>${totalMsgs} contactos</b> con Pro →`;
    } else if (statsGrid) {
      const lock = statsGrid.querySelector('.stats-lock-overlay');
      if (lock) lock.remove();
      const cta = document.getElementById('dash-unlock-cta');
      if (cta) cta.remove();
    }
  } catch (e) { }
}

// ===== CARTEL DE INTENCION AL ENTRAR AL PANEL =====
// Si hubo intentos de "ver mas catalogo" este mes, se lo mostramos al proveedor apenas entra,
// como cartel al frente (no en la campanita). Maximo una vez por dia para no cansar.
// Copy adaptado: si el catalogo esta capado en 30 (free con >30) pide Pro; si no, pide cargar mas.
async function mostrarAvisoIntencion() {
  try {
    if (!currentUser || !currentUser.proveedorId) return;
    const provId = currentUser.proveedorId;
    const hoy = new Date().toISOString().slice(0, 10);
    const seenKey = `eg_avisoint_${provId}`;
    if (localStorage.getItem(seenKey) === hoy) return; // ya lo vio hoy
    const { data: mes } = await sb.rpc('intentos_catalogo_mes', { proveedor_id: provId });
    const n = typeof mes === 'number' ? mes : 0;
    if (n <= 0) return;
    const { count } = await sb.from('productos').select('id', { count: 'exact', head: true }).eq('proveedor_id', provId);
    const total = count || 0;
    const capado = !esProvPro() && total > 30; // se le corta el catalogo en 30
    if (window._egAvisoPend) return; // evita encolar dos timers en la misma carga

    const sustantivo = n === 1 ? 'persona' : 'personas';
    const verbo = capado
      ? (n === 1 ? 'intentó ver su catálogo completo' : 'intentaron ver su catálogo completo')
      : (n === 1 ? 'intentó ver más productos suyos' : 'intentaron ver más productos suyos');
    const desc = capado
      ? `Este mes. Usted muestra 30 de ${total} productos: los demás no los pudieron ver.`
      : 'Este mes. Sume más a su catálogo así no pierde esas ventas.';
    const ctaTxt = capado ? 'Mostrar todo con Pro →' : 'Cargar productos →';
    // El CTA lo lleva a su panel para hacerse Pro (no a la pantalla pelada de planes).
    const ctaAccion = `document.getElementById('modal-aviso-intencion').remove();goTo('perfil')`;

    // Esperamos ~5s desde que abre la app para que primero vea la pantalla, y el cartel
    // entra suave (fade + scale), no de golpe.
    window._egAvisoPend = true;
    setTimeout(() => {
      window._egAvisoPend = false;
      if (localStorage.getItem(seenKey) === hoy) return;            // ya se mostro (otra pestana)
      if (document.getElementById('modal-aviso-intencion')) return; // ya hay uno abierto
      localStorage.setItem(seenKey, hoy);
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const overlay = document.createElement('div');
      overlay.id = 'modal-aviso-intencion';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .3s ease';
      overlay.innerHTML = `<div class="eg-aviso-card" style="background:white;border-radius:22px;padding:24px 22px 22px;width:100%;max-width:400px;position:relative;transform:scale(.94);opacity:0;transition:transform .32s cubic-bezier(.2,.8,.25,1),opacity .3s ease">
        <button onclick="document.getElementById('modal-aviso-intencion').remove()" aria-label="Cerrar" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.3rem;color:#aaa;cursor:pointer;line-height:1">&times;</button>
        <div style="font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#F97316;margin-bottom:12px">Intención de compra</div>
        <div style="display:flex;align-items:baseline;gap:9px;margin-bottom:6px">
          <span style="font-size:2.6rem;font-weight:900;color:#006039;line-height:1;font-variant-numeric:tabular-nums">${n}</span>
          <span style="font-size:.92rem;font-weight:800;color:#1A1A1A;line-height:1.2">${sustantivo} ${verbo}</span>
        </div>
        <div style="font-size:.82rem;color:#777;line-height:1.5;margin-bottom:18px">${desc}</div>
        <button onclick="${ctaAccion}" style="width:100%;background:#006039;color:white;border:none;border-radius:12px;padding:14px;font-family:'Inter',sans-serif;font-size:.9rem;font-weight:800;cursor:pointer;margin-bottom:8px">${ctaTxt}</button>
        <button onclick="document.getElementById('modal-aviso-intencion').remove()" style="width:100%;background:none;border:none;color:#999;font-family:'Inter',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;padding:4px">Ver más tarde</button>
      </div>`;
      overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
      const card = overlay.querySelector('.eg-aviso-card');
      if (reduce) { overlay.style.opacity = '1'; if (card) { card.style.transform = 'none'; card.style.opacity = '1'; } }
      else { requestAnimationFrame(() => { overlay.style.opacity = '1'; if (card) { card.style.transform = 'scale(1)'; card.style.opacity = '1'; } }); }
    }, 5000);
  } catch (e) { }
}

// ===== CAMBIO 2: RANKING EN EL RUBRO (vendedor de Pro más potente) =====
// Calcula el puesto del proveedor dentro de su rubro principal, con el mismo
// criterio del buscador (Pro primero, luego visitas). Solo lectura, sin columnas nuevas.
async function cargarRankingRubro() {
  const card = document.getElementById('dash-ranking-card');
  if (!card) return;
  try {
    if (!currentUser || !currentUser.proveedorId || !currentUser.provData) { card.style.display = 'none'; return; }
    const miId = String(currentUser.proveedorId);
    const miRubro = (currentUser.provData.rubro || '').split(',')[0].trim();
    if (!miRubro) { card.style.display = 'none'; return; }
    const { data: provs } = await sb.from('proveedores')
      .select('id,rubro,plan,plan_hasta,visitas').eq('estado', 'aprobado');
    if (!provs || !provs.length) { card.style.display = 'none'; return; }
    // Cohorte: proveedores que comparten el rubro principal (contempla rubros múltiples con coma).
    const cohorte = provs.filter(p => (p.rubro || '').split(',').map(r => r.trim().toLowerCase()).includes(miRubro.toLowerCase()));
    const esProRow = p => p.plan === 'pro' && (!p.plan_hasta || new Date(p.plan_hasta + 'T03:00:00Z') > new Date());
    const score = p => (esProRow(p) ? 100000 : 0) + (p.visitas || 0);
    cohorte.sort((a, b) => score(b) - score(a));
    const puesto = cohorte.findIndex(p => String(p.id) === miId) + 1;
    const total = cohorte.length;
    if (puesto < 1 || total < 2) { card.style.display = 'none'; return; } // sin competencia no hay pitch
    card.style.display = 'block';
    if (esProvPro()) {
      card.innerHTML = `<div style="display:flex;align-items:center;gap:13px;background:#fdf6e6;border:1.5px solid #ecd9a8;border-radius:16px;padding:14px 15px">
        <span style="width:46px;height:46px;border-radius:13px;background:rgba(200,150,46,.16);display:grid;place-items:center;flex-shrink:0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c8962e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5"/></svg>
        </span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:6px"><span style="font-family:'Inter',sans-serif;font-size:1.7rem;font-weight:900;color:#b07d17;line-height:1;letter-spacing:-.02em">#${puesto}</span><span style="font-size:.72rem;color:#9a8544;font-weight:700">de ${total} en ${escHtml(miRubro)}</span></div>
          <div style="font-family:'Inter',sans-serif;font-size:.82rem;font-weight:800;color:#1A1A1A;margin-top:4px">Tu puesto en el rubro</div>
          <div style="font-size:.7rem;color:#8a7734;margin-top:2px;line-height:1.4">Aparecés por encima de los proveedores del plan gratis</div>
        </div>
      </div>`;
    } else {
      card.innerHTML = `<div style="background:white;border:1.5px solid #E8F2EE;border-radius:14px;padding:16px">
        <div style="font-family:'Inter',sans-serif;font-size:.82rem;font-weight:800;color:#1A1A1A;margin-bottom:8px">Tu posición en ${escHtml(miRubro)}</div>
        <div style="text-align:center;padding:2px 0 12px">
          <div style="font-size:.72rem;color:#6B7A99;margin-bottom:2px">Estás en el puesto</div>
          <div style="font-family:'Inter',sans-serif;font-size:2.2rem;font-weight:900;color:#006039;line-height:1">#${puesto}<span style="font-size:.9rem;color:#9CA3AF;font-weight:700"> de ${total}</span></div>
          <div style="font-size:.74rem;color:#6B7A99;margin-top:8px;line-height:1.5">Los proveedores <b>Pro</b> aparecen en el <b>top 3</b> de cada rubro y reciben más consultas.</div>
        </div>
        <button onclick="showModalPro('Aparecer primero en tu rubro')" style="width:100%;background:#006039;color:white;border:none;border-radius:12px;padding:13px;font-family:'Inter',sans-serif;font-size:.86rem;font-weight:800;cursor:pointer">Subir al top 3 con Pro</button>
      </div>`;
    }
  } catch (e) { card.style.display = 'none'; }
}
// ===== HISTORIAL =====
function guardarHistorialLocal() {
  try { localStorage.setItem('eg_historial', JSON.stringify(historial)); } catch (e) { }
}
function cargarHistorialLocal(userId) {
  try {
    const raw = localStorage.getItem('eg_historial');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) historial = parsed;
  } catch (e) { }
}

async function addToHistorial(proveedor) {
  if (!currentUser || currentUser.type !== 'user') return;
  historial = historial.filter(h => h.id !== proveedor.id);
  historial.unshift({ ...proveedor, visitedAt: new Date() });
  if (historial.length > 10) historial = historial.slice(0, 10);
  guardarHistorialLocal();
}

async function cargarHistorial() {
  const el = document.getElementById('historialList');
  if (!historial.length) {
    el.innerHTML = '<div class="empty-state"><div class="ei">🔍</div><p>Todavía no exploraste proveedores.<br>¡Empezá a buscar!</p></div>';
  } else {
    const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D', '#C2410C'];
    const grupos = {};
    historial.forEach(p => {
      const d = new Date(p.visitedAt);
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
      let label = d >= hoy ? 'Hoy' : d >= ayer ? 'Ayer' : 'Anteriores';
      if (!grupos[label]) grupos[label] = [];
      grupos[label].push(p);
    });
    el.innerHTML = Object.entries(grupos).map(([label, items]) => `
      <div style="font-size:.7rem;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:.06em;margin:10px 0 6px">${label}</div>
      ${items.map((p, i) => {
      const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
      const bg = _monoColor(p.id);
      return `<div class="hist-item" onclick="abrirDetalle('${p.id}')">
          ${p.logo_url
          ? `<div class="hist-logo" style="background:#fff;padding:0;overflow:hidden"><img loading="lazy" src="${escHtml(imgThumb(p.logo_url, 200, 75))}" style="width:100%;height:100%;object-fit:cover;border-radius:9px"></div>`
          : `<div class="hist-logo" style="background:${bg}">${escHtml(ini)}</div>`
        }
          <div class="hist-info"><strong>${escHtml(p.nombre)}</strong><span>${escHtml(p.rubro || '')}${p.pro ? ' · PRO' : ''}</span></div>
          <span class="hist-time">${timeAgo(new Date(p.visitedAt))}</span>
        </div>`;
    }).join('')}
    `).join('');
  }
  await cargarMisConversaciones();
}

function leerConvUsuario(row, provId) {
  const badge = row.querySelector('[id^="conv-badge-"]');
  if (badge) badge.remove();
  abrirChatDirecto(provId);
}

async function cargarMisConversaciones() {
  const el = document.getElementById('mis-conversaciones-list');
  if (!el || !currentUser) return;
  try {
    // Paso 1: traer todos los proveedor_id donde el usuario envió mensajes
    const { data: misEnvios } = await sb.from('mensajes')
      .select('proveedor_id')
      .eq('de_tipo', 'usuario')
      .eq('usuario_email', currentUser.email);

    const provIds = [...new Set((misEnvios || []).map(m => m.proveedor_id).filter(Boolean))];
    if (!provIds.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">💬</div><p style="font-size:.85rem">Todavía no hablaste con ningún proveedor.</p></div>';
      return;
    }

    // Paso 2: traer nombre del proveedor por separado (sin join, por diferencia de tipos)
    const provNombres = {};
    const lista = proveedoresDB;
    provIds.forEach(pid => {
      const prov = lista.find(p => String(p.id) === String(pid));
      provNombres[pid] = prov ? prov.nombre : 'Proveedor';
    });

    // Paso 3: traer los mensajes de estas conversaciones filtrados por este usuario
    const { data: todosLosMsgs } = await sb.from('mensajes')
      .select('proveedor_id, texto, created_at, de_tipo, leido')
      .in('proveedor_id', provIds)
      .eq('usuario_email', currentUser.email)
      .order('created_at', { ascending: false });

    if (!todosLosMsgs || !todosLosMsgs.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">💬</div><p style="font-size:.85rem">Todavía no hablaste con ningún proveedor.</p></div>';
      return;
    }

    // Agrupar por proveedor_id
    const convMap = {};
    todosLosMsgs.forEach(m => {
      const pid = m.proveedor_id;
      if (!pid) return;
      if (!convMap[pid]) {
        convMap[pid] = {
          provId: pid,
          provNombre: provNombres[pid] || 'Proveedor',
          ultimoMsg: m.texto,
          ultimaFecha: m.created_at,
          noLeidos: 0
        };
      }
      if (new Date(m.created_at) > new Date(convMap[pid].ultimaFecha)) {
        convMap[pid].ultimoMsg = m.texto;
        convMap[pid].ultimaFecha = m.created_at;
      }
      if (m.de_tipo === 'proveedor' && !m.leido) convMap[pid].noLeidos++;
    });

    const convs = Object.values(convMap).slice(0, 8);
    if (!convs.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">💬</div><p style="font-size:.85rem">Todavía no hablaste con ningún proveedor.</p></div>';
      return;
    }

    const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D'];
    el.innerHTML = convs.map((c, i) => {
      const ini = escHtml(c.provNombre.substring(0, 2).toUpperCase());
      const preview = escHtml((c.ultimoMsg || '').split(String.fromCharCode(10)).join(' ').substring(0, 45) + ((c.ultimoMsg || '').length > 45 ? '...' : ''));
      const badgeId = `conv-badge-${c.provId}`;
      return `<div class="hist-item" onclick="leerConvUsuario(this,'${escHtml(String(c.provId))}')" style="position:relative">` +
        `<div class="hist-logo" style="background:${_monoColor(c.provId)};color:white">${ini}</div>` +
        `<div class="hist-info"><strong>${escHtml(c.provNombre)}</strong><span>${preview}</span></div>` +
        `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">` +
        `<span class="hist-time">${escHtml(timeAgo(new Date(c.ultimaFecha)))}</span>` +
        (c.noLeidos > 0 ? `<span id="${escHtml(badgeId)}" style="background:var(--blue);color:white;font-size:.62rem;font-weight:800;padding:2px 6px;border-radius:10px">${c.noLeidos}</span>` : '') +
        '</div></div>';
    }).join('');
  } catch (e) {
    console.error('Error cargando conversaciones:', e);
  }
}
function timeAgo(date) {
  const mins = Math.floor((new Date() - date) / 60000);
  if (mins < 1) return 'Ahora'; if (mins < 60) return `${mins}m`; if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

// ===== CATALOGO PROVEEDOR =====
const iconMap = {}; // emojis reemplazados por colores en renderProdGrid
function renderProdGrid() {
  const el = document.getElementById('prodGrid');
  if (!el) return;
  if (!productos.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray)"><div style="font-size:2rem;margin-bottom:8px">📦</div><p style="font-size:.88rem">No tenés productos aún.</p></div>'; return; }
  el.innerHTML = productos.map(p => {
    const oculto = p.visible === false;
    const img = p.imagen_url
      ? `<img loading="lazy" src="${escHtml(imgThumb(p.imagen_url, 150, 70))}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;background:#F3F4F6;${oculto ? 'opacity:.45' : ''}">`
      : `<div style="width:56px;height:56px;border-radius:10px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;${oculto ? 'opacity:.45' : ''}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>`;
    return `<div style="background:${oculto ? '#f8f8f8' : 'white'};border-radius:12px;padding:12px;border:1.5px solid ${oculto ? '#e0e0e0' : '#eee'};display:flex;align-items:center;gap:12px;margin-bottom:8px">
      ${img}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <div style="font-size:.85rem;font-weight:700;color:${oculto ? '#999' : '#111'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.nombre)}</div>
          ${oculto ? '<span style="font-size:.6rem;font-weight:800;background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;padding:1px 6px;border-radius:20px;flex-shrink:0">OCULTO</span>' : ''}
        </div>
        <div style="font-size:.95rem;font-weight:900;color:${oculto ? '#bbb' : '#006039'}">$${(p.precio || 0).toLocaleString('es-AR')}</div>
        <div style="font-size:.7rem;color:#999;margin-top:2px">${p.stock ? 'Stock: ' + escHtml(String(p.stock)) : 'Sin stock definido'} · ${escHtml(p.categoria || 'General')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button onclick="editarProducto('${escHtml(String(p.id))}','${escHtml(p.nombre || '')}',${p.precio || 0},'${escHtml(String(p.stock || 0))}','${escHtml(p.categoria || p.cat || '')}','${escHtml(p.categoria_principal || '')}')" style="background:#f5f5f5;border:none;border-radius:8px;padding:6px 12px;font-size:.72rem;font-weight:700;color:#555;cursor:pointer">Editar</button>
        <button onclick="toggleVisibleProduct('${escHtml(String(p.id))}',${oculto})" style="background:${oculto ? '#E8F2EE' : '#FFF8E1'};border:none;border-radius:8px;padding:6px 12px;font-size:.72rem;font-weight:700;color:${oculto ? '#006039' : '#92400e'};cursor:pointer">${oculto ? 'Mostrar' : 'Ocultar'}</button>
        <button onclick="deleteProduct('${escHtml(String(p.id))}')" style="background:#fff0f0;border:none;border-radius:8px;padding:6px 12px;font-size:.72rem;font-weight:700;color:#ef4444;cursor:pointer">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}
async function cargarProductosProveedor() {
  if (!currentUser || !currentUser.proveedorId) { productos = []; renderProdGrid(); return; }
  try {
    const esPro = esProvPro();
    const { data } = await sb.from('productos').select('*').eq('proveedor_id', currentUser.proveedorId).order('created_at', { ascending: false });
    productos = data || [];
    if (!esPro && productos.length > 0) {
      const total = productos.length;
      const notaEl = document.getElementById('prod-limit-nota');
      if (notaEl) {
        if (total > 30) {
          notaEl.style.display = 'block';
          notaEl.textContent = `Mostrando 30 de ${total} productos. Pasá a Pro para mostrar todos.`;
        } else {
          notaEl.style.display = 'none';
        }
      }
      productos = productos.slice(0, 30);
    }
  } catch (e) { productos = []; }
  renderProdGrid();
  const countEl = document.getElementById('dash-prod-count');
  if (countEl) countEl.textContent = productos.length + (productos.length === 1 ? ' publicado' : ' publicados');
}
async function deleteProduct(id) {
  if (!currentUser?.proveedorId) return;
  try { await sb.from('productos').delete().eq('id', id).eq('proveedor_id', currentUser.proveedorId); } catch (e) { }
  productos = productos.filter(p => String(p.id) !== String(id));
  renderProdGrid();
  const modal = document.getElementById('misProductosModal');
  if (modal && modal.classList.contains('open')) ordenarMisProds(_misProdSort);
  showToast('Producto eliminado');
}
async function toggleVisibleProduct(id, estaOculto) {
  if (!currentUser?.proveedorId) return;
  const nuevoVisible = estaOculto;
  try {
    await sb.from('productos').update({ visible: nuevoVisible }).eq('id', id).eq('proveedor_id', currentUser.proveedorId);
    const idx = productos.findIndex(p => String(p.id) === String(id));
    if (idx >= 0) productos[idx].visible = nuevoVisible;
    renderProdGrid();
    const modal = document.getElementById('misProductosModal');
    if (modal && modal.classList.contains('open')) {
      const searchVal = document.getElementById('mis-prod-search')?.value || '';
      if (searchVal) buscarMisProds(searchVal);
      else ordenarMisProds(_misProdSort);
    }
    showToast(nuevoVisible ? '✓ Producto visible' : 'Producto ocultado');
  } catch (e) { showToast('Error al actualizar'); }
}
// ===== FOTO UPLOAD =====
let fotoFile = null;

function previewFoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('La foto es muy grande. Máx 5MB'); return; }
  fotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('foto-preview-img');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('foto-placeholder').style.display = 'none';
    document.getElementById('foto-remove-btn').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeFoto() {
  fotoFile = null;
  document.getElementById('foto-preview-img').style.display = 'none';
  document.getElementById('foto-preview-img').src = '';
  document.getElementById('foto-placeholder').style.display = 'block';
  document.getElementById('foto-remove-btn').style.display = 'none';
  document.getElementById('foto-input').value = '';
}

// ===== OPTIMIZACIÓN DE IMÁGENES (ahorro de egress) =====
// Comprime del lado del cliente ANTES de subir a Storage. Reduce drásticamente el
// peso almacenado y servido (egress) y acelera la carga. Devuelve un File JPEG;
// si algo falla, cae al archivo original para no romper la subida.
async function comprimirImagen(file, maxWidth, quality) {
  try {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    // GIF (animado) y SVG (vectorial) no se tocan: canvas los arruinaría.
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
    let width = img.width, height = img.height;
    // Solo achicar si supera el máximo; si ya es más chica, solo se recomprime.
    if (width > maxWidth) {
      height = Math.round(height * (maxWidth / width));
      width = maxWidth;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // Fondo blanco: JPEG no soporta transparencia; sin esto los PNG con alfa
    // quedarían con fondo negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    // Si el original ya era más liviano y no hubo redimensión, conservarlo.
    if (blob.size >= file.size && width === img.width) return file;
    const base = (file.name || 'img').replace(/\.[^.]+$/, '');
    return new File([blob], base + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    console.warn('comprimirImagen: usando original', e);
    return file;
  }
}

// Reescribe una URL pública de Storage a la CDN de transformación de Supabase
// (solo Plan Pro con "Image Transformations" habilitado). Sirve miniaturas
// livianas en las listas → menos egress. Apagado por defecto: al activar el flag
// todas las llamadas imgThumb() empiezan a pedir versiones reducidas.
const USAR_TRANSFORM_IMG = false; // ← poné true cuando Supabase Pro tenga transformaciones activas
function imgThumb(url, width, quality) {
  if (!USAR_TRANSFORM_IMG || !url || typeof url !== 'string') return url;
  if (!url.includes('/storage/v1/object/public/')) return url; // solo URLs de Storage propio
  const sep = url.includes('?') ? '&' : '?';
  return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    + sep + 'width=' + width + '&quality=' + (quality || 70);
}

async function subirFotoStorage(file, provId) {
  // Fotos de producto: máx 800px de ancho, calidad 0.7.
  file = await comprimirImagen(file, 800, 0.7);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  // Nombre único (token aleatorio + timestamp) para no depender de upsert.
  // El bucket 'productos' solo tiene política RLS de INSERT (no UPDATE); usar
  // upsert:true dispararía un 400 al exigir permiso de UPDATE inexistente.
  const path = `${provId}/${Math.random().toString(36).substring(2)}_${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('productos').upload(path, file);
  if (error) throw error;
  const { data: urlData } = sb.storage.from('productos').getPublicUrl(path);
  return urlData.publicUrl;
}

// ===== FOTOS EXTRA (galería manual) =====
// Aditivo: la foto principal sigue usando el flujo de siempre (fotoFile / editFotoFile).
// Acá solo manejamos las fotos adicionales de la galería.
const MAX_FOTOS_GALERIA = 8; // 1 principal + hasta 7 extra
let fotoFilesExtra = [];      // alta: nuevas fotos extra (File)
let editFotoFilesExtra = [];  // edición: nuevas fotos extra (File)
let editFotoExisting = [];    // edición: URLs de galería existentes a conservar (sin la principal)

function _fotoTile(src, removeCall) {
  return `<div style="position:relative;width:60px;height:60px;flex:0 0 auto"><img src="${escHtml(src)}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb" onerror="this.style.display='none'"><button type="button" onclick="${removeCall}" aria-label="Quitar" style="position:absolute;top:-6px;right:-6px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:.7rem;line-height:1;cursor:pointer;padding:0">✕</button></div>`;
}
function _fotoAddTile(inputId) {
  return `<div onclick="document.getElementById('${inputId}').click()" style="width:60px;height:60px;flex:0 0 auto;border:2px dashed #b9d4c6;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--blue);font-size:1.5rem;font-weight:300">+</div>`;
}
function _pushFotos(input, arr, existingCount) {
  const files = Array.from(input.files || []);
  for (const f of files) {
    if (f.size > 5 * 1024 * 1024) { showToast('Una foto supera 5MB y se omitió'); continue; }
    if (existingCount + arr.length >= MAX_FOTOS_GALERIA - 1) { showToast('Máximo ' + MAX_FOTOS_GALERIA + ' fotos por producto'); break; }
    arr.push(f);
  }
  input.value = '';
}

// --- Alta ---
function renderFotoExtraStrip() {
  const strip = document.getElementById('foto-extra-strip');
  if (!strip) return;
  strip.innerHTML = fotoFilesExtra.map((f, i) => _fotoTile(URL.createObjectURL(f), `removeFotoExtra(${i})`)).join('') + _fotoAddTile('foto-extra-input');
}
function addFotosExtra(input) { _pushFotos(input, fotoFilesExtra, 0); renderFotoExtraStrip(); }
function removeFotoExtra(i) { fotoFilesExtra.splice(i, 1); renderFotoExtraStrip(); }
function resetFotosExtra() { fotoFilesExtra = []; renderFotoExtraStrip(); }

// --- Edición ---
function renderEditFotoExtraStrip() {
  const strip = document.getElementById('edit-foto-extra-strip');
  if (!strip) return;
  const ex = editFotoExisting.map((u, i) => _fotoTile(u, `removeEditFotoExisting(${i})`)).join('');
  const nw = editFotoFilesExtra.map((f, i) => _fotoTile(URL.createObjectURL(f), `removeEditFotoExtra(${i})`)).join('');
  strip.innerHTML = ex + nw + _fotoAddTile('edit-foto-extra-input');
}
function addEditFotosExtra(input) { _pushFotos(input, editFotoFilesExtra, editFotoExisting.length); renderEditFotoExtraStrip(); }
function removeEditFotoExtra(i) { editFotoFilesExtra.splice(i, 1); renderEditFotoExtraStrip(); }
function removeEditFotoExisting(i) { editFotoExisting.splice(i, 1); renderEditFotoExtraStrip(); }

// ===== TABS MODAL ===
function switchAddTab(tab) {
  // Ocultar todos los paneles
  ['uno', 'ml', 'excel', 'multi'].forEach(t => {
    const panel = document.getElementById('add-tab-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('tab-' + t);
    if (btn) {
      if (t === tab) {
        btn.style.background = 'white';
        btn.style.color = 'var(--blue)';
        btn.style.borderRadius = '10px';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--gray)';
      }
    }
  });
}

// ===== MERCADOLIBRE IMPORT =====
let mlProductoImportado = null;
let mlImportadosCount = 0;

function extraerMLId(url) {
  // 1. item_id in query params (?pdp_filters=item_id:MLA1576860927)
  const qMatch = url.match(/item_id[=:](MLA\d+)/i);
  if (qMatch) return qMatch[1].replace(/MLA/i, '');
  // 2. MLA with or without dash: MLA-1234567890 or MLA1234567890
  const directMatch = url.match(/MLA-?(\d+)/i);
  if (directMatch) return directMatch[1];
  return null;
}

async function importarDesdeML() {
  const url = document.getElementById('ml-url-input').value.trim();
  if (!url) { showToast('Pegá el link de MercadoLibre'); return; }

  const itemId = extraerMLId(url);
  if (!itemId) { showToast('Link inválido. Copiá la URL completa del producto'); return; }

  const btn = document.getElementById('ml-import-btn-text');
  btn.textContent = '⏳ Buscando producto...';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const r = await fetch('/api/ml?id=' + itemId, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      throw new Error(errData.error || 'Error del servidor');
    }
    const data = await r.json();
    if (!data || !data.title) throw new Error('No se encontró el producto');

    const fotos = (data.pictures || []).map(x => (x.url || x.secure_url || '')).filter(Boolean).slice(0, 8);
    const foto = data.thumbnail || fotos[0] || '';

    mlProductoImportado = {
      nombre: data.title,
      precio: data.price || 0,
      foto,
      fotos,
      desc: data.subtitle || '',
      cat: 'General'
    };

    // Mostrar preview
    document.getElementById('ml-preview-name').textContent = data.title;
    document.getElementById('ml-preview-price').textContent = data.price
      ? '$' + Number(data.price).toLocaleString('es-AR')
      : 'Precio a confirmar';

    const imgEl = document.getElementById('ml-preview-img');
    imgEl.style.display = foto ? 'block' : 'none';
    if (foto) {
      imgEl.src = foto;
      imgEl.onerror = () => { imgEl.style.display = 'none'; };
    }

    // Pre-llenar precio editable (vacío si no se encontró)
    document.getElementById('ml-precio-edit').value = data.price || '';

    document.getElementById('ml-preview').style.display = 'block';
    document.getElementById('ml-save-btn').style.display = 'block';
    btn.textContent = '🔍 Traer datos del producto';
    showToast('✓ Producto encontrado');

  } catch (e) {
    btn.textContent = '🔍 Traer datos del producto';
    const msg = e.name === 'AbortError' ? 'Tiempo de espera agotado. Intentá de nuevo.' : 'No se pudo importar. Verificá el link.';
    showToast(msg);
  }
}

async function guardarProductoML() {
  if (!mlProductoImportado) return;
  const precio = parseFloat(document.getElementById('ml-precio-edit').value);
  const stock = parseInt(document.getElementById('ml-stock-edit').value) || null;
  const cat = document.getElementById('ml-cat-edit').value;
  if (!precio) { showToast('Ingresá el precio mayorista'); return; }

  const newProd = {
    nombre: mlProductoImportado.nombre,
    precio,
    stock,
    categoria: cat,
    categoria_principal: cat,
    visible: true,
    imagen_url: mlProductoImportado.foto,
    imagenes: (mlProductoImportado.fotos && mlProductoImportado.fotos.length) ? mlProductoImportado.fotos : null,
    proveedor_id: currentUser?.proveedorId || null
  };

  try {
    const { data } = await sb.from('productos').insert(newProd).select().single();
    productos.unshift(data || { ...newProd, id: Date.now() });
  } catch (e) {
    productos.unshift({ ...newProd, id: Date.now() });
  }

  mlImportadosCount++;
  renderProdGrid();
  showToast('✓ Producto importado al catálogo!');

  // Mostrar opción de importar otro
  document.getElementById('ml-preview').style.display = 'none';
  document.getElementById('ml-save-btn').style.display = 'none';
  document.getElementById('ml-url-input').value = '';
  mlProductoImportado = null;

  const importadosEl = document.getElementById('ml-importados');
  const labelEl = document.getElementById('ml-importados-label');
  importadosEl.style.display = 'block';
  labelEl.textContent = `✓ ${mlImportadosCount} producto${mlImportadosCount !== 1 ? 's' : ''} importado${mlImportadosCount !== 1 ? 's' : ''} en esta sesión`;
}

function importarOtro() {
  document.getElementById('ml-preview').style.display = 'none';
  document.getElementById('ml-save-btn').style.display = 'none';
  document.getElementById('ml-url-input').value = '';
  mlProductoImportado = null;
  document.getElementById('ml-import-btn-text').textContent = '🔍 Traer datos del producto';
}

// ===== CARGA MÚLTIPLE =====
let filasMulti = [];
function initFilasMulti() {
  filasMulti = [{ id: Date.now() }];
  renderFilasMulti();
}
function agregarFilaMulti() {
  if (filasMulti.length >= 10) { showToast('Máximo 10 productos a la vez'); return; }
  filasMulti.push({ id: Date.now() });
  renderFilasMulti();
}
function eliminarFilaMulti(id) {
  filasMulti = filasMulti.filter(f => f.id !== id);
  renderFilasMulti();
}
function renderFilasMulti() {
  const el = document.getElementById('multi-prod-list');
  if (!el) return;
  el.innerHTML = filasMulti.map((f, i) => `
    <div style="background:#f8f9ff;border-radius:12px;padding:12px;border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:.78rem;font-weight:800;color:var(--blue)">Producto ${i + 1}</span>
        ${filasMulti.length > 1 ? `<button onclick="eliminarFilaMulti(${f.id})" style="background:#fee2e2;color:#ef4444;border:none;border-radius:7px;padding:3px 8px;font-size:.72rem;cursor:pointer">✕</button>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input type="text" data-field="nombre" data-id="${f.id}" placeholder="Nombre del producto *" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input type="number" data-field="precio" data-id="${f.id}" placeholder="Precio *" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
          <input type="number" data-field="stock" data-id="${f.id}" placeholder="Stock" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
        </div>
        <select data-field="cat" data-id="${f.id}" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
          ${CAT_PRINCIPAL.map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
    </div>`).join('');
}

async function addProductosMultiples() {
  const rows = document.querySelectorAll('#multi-prod-list [data-field="nombre"]');
  const prods = [];
  let hayError = false;
  rows.forEach(row => {
    const id = row.dataset.id;
    const nombre = row.value.trim();
    const precio = parseFloat(document.querySelector(`[data-field="precio"][data-id="${id}"]`)?.value || '0');
    const stock = parseInt(document.querySelector(`[data-field="stock"][data-id="${id}"]`)?.value || '0') || null;
    const cat = document.querySelector(`[data-field="cat"][data-id="${id}"]`)?.value || 'General';
    if (!nombre || !precio) { hayError = true; return; }
    prods.push({ nombre, precio, stock, categoria: cat, categoria_principal: cat, visible: true, proveedor_id: currentUser?.proveedorId || null });
  });
  if (hayError) { showToast('Completá nombre y precio en todas las filas'); return; }
  if (!prods.length) { showToast('No hay productos para guardar'); return; }
  const btn = document.getElementById('multi-btn-text');
  if (btn) btn.textContent = 'Guardando...';
  try {
    const { data } = await sb.from('productos').insert(prods).select();
    (data || prods.map((p, i) => ({ ...p, id: Date.now() + i }))).forEach(p => productos.unshift(p));
    showToast(`✓ ${prods.length} productos guardados`);
  } catch (e) {
    prods.forEach((p, i) => productos.unshift({ ...p, id: Date.now() + i }));
    showToast(`${prods.length} productos guardados`);
  }
  renderProdGrid();
  closeAddProduct();
  if (btn) btn.textContent = 'Guardar todos los productos ✓';
}

function openAddProduct() {
  const esPro = esProvPro();
  if (!esPro && productos.length >= 30) {
    showModalPro('Más de 30 productos');
    return;
  }
  fotoFile = null;
  removeFoto();
  resetFotosExtra();
  document.getElementById('addProdModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAddTab('uno');
  mlImportadosCount = 0;
  mlProductoImportado = null;
  const impEl = document.getElementById('ml-importados');
  if (impEl) impEl.style.display = 'none';
  initFilasMulti();
}
function closeAddProduct() { document.getElementById('addProdModal').classList.remove('open'); document.body.style.overflow = ''; }
function closeAddProductOnBg(e) { if (e.target === document.getElementById('addProdModal')) closeAddProduct(); }

async function addProduct() {
  if (!currentUser?.proveedorId) { showToast('Solo proveedores pueden agregar productos'); return; }
  const name = document.getElementById('new-prod-name').value.trim();
  const price = document.getElementById('new-prod-price').value;
  const stock = document.getElementById('new-prod-stock').value;
  const catPrincipal = document.getElementById('new-prod-cat-principal')?.value || 'Otro';
  const catSub = document.getElementById('new-prod-cat-sub')?.value || '';
  const desc = document.getElementById('new-prod-desc')?.value?.trim() || null;
  if (!name || !price) { showToast('Completá nombre y precio'); return; }

  const btn = document.getElementById('add-btn-text');
  if (btn) btn.textContent = 'Guardando...';

  // Subir foto principal + fotos extra de la galería
  const imgUrls = [];
  if (currentUser?.proveedorId) {
    if (fotoFile) {
      try { const u = await subirFotoStorage(fotoFile, currentUser.proveedorId); if (u) imgUrls.push(u); }
      catch (e) { showToast('No se pudo subir la foto principal'); }
    }
    for (const f of fotoFilesExtra) {
      try { const u = await subirFotoStorage(f, currentUser.proveedorId); if (u) imgUrls.push(u); } catch (e) { }
    }
  }
  const imgUrl = imgUrls[0] || null;

  const newProd = {
    nombre: name, precio: parseFloat(price),
    stock: stock ? parseInt(stock) : null,
    descripcion: desc,
    categoria: catSub || catPrincipal,
    categoria_principal: catPrincipal,
    subcategoria: catSub || null,
    visible: true,
    imagen_url: imgUrl,
    imagenes: imgUrls.length > 1 ? imgUrls : null,
    proveedor_id: currentUser?.proveedorId || null
  };
  try {
    const { data } = await sb.from('productos').insert(newProd).select().single();
    productos.unshift(data || { ...newProd, id: Date.now() });
  } catch (e) {
    productos.unshift({ ...newProd, id: Date.now() });
  }
  renderProdGrid();
  closeAddProduct();
  showToast('✓ Producto guardado');
  if (btn) btn.textContent = 'Agregar al catálogo ✓';
}
function editarProducto(id, nombre, precio, stock, cat, catPrincipal) {
  document.getElementById('edit-prod-id').value = id;
  // Reset foto principal + cargar galería existente (todas menos la principal)
  editFotoFile = null; removeEditFoto();
  editFotoFilesExtra = [];
  const _row = productos.find(x => String(x.id) === String(id));
  editFotoExisting = _normImgs(_row && _row.imagenes, _row && _row.imagen_url).slice(1);
  renderEditFotoExtraStrip();
  document.getElementById('edit-prod-name').value = nombre;
  document.getElementById('edit-prod-price').value = precio;
  document.getElementById('edit-prod-stock').value = stock;
  const principalEl = document.getElementById('edit-prod-cat-principal');
  if (principalEl) {
    const matched = catPrincipal
      || CAT_PRINCIPAL.find(c => c.toLowerCase() === (cat || '').toLowerCase())
      || mapExcelCat(cat)
      || 'Otro';
    principalEl.value = matched;
    actualizarSubcats('edit-prod-cat-principal', 'edit-prod-cat-sub', 'edit-prod-subcat-group');
    const subEl = document.getElementById('edit-prod-cat-sub');
    if (subEl && cat && cat !== matched) {
      Array.from(subEl.options).forEach((opt, i) => {
        if (opt.value === cat || opt.text === cat) subEl.selectedIndex = i;
      });
    }
  }
  document.getElementById('editProdModal').classList.add('open'); document.body.style.overflow = 'hidden';
}
function closeEditProduct() { document.getElementById('editProdModal').classList.remove('open'); document.body.style.overflow = ''; }
function closeEditProductOnBg(e) { if (e.target === document.getElementById('editProdModal')) closeEditProduct(); }
// ===== EDIT FOTO =====
let editFotoFile = null;

function previewEditFoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('La foto es muy grande. Máx 5MB'); return; }
  editFotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('edit-foto-preview-img');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('edit-foto-placeholder').style.display = 'none';
    document.getElementById('edit-foto-remove-btn').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeEditFoto() {
  editFotoFile = null;
  document.getElementById('edit-foto-preview-img').style.display = 'none';
  document.getElementById('edit-foto-preview-img').src = '';
  document.getElementById('edit-foto-placeholder').style.display = 'block';
  document.getElementById('edit-foto-remove-btn').style.display = 'none';
  document.getElementById('edit-foto-input').value = '';
}
async function guardarEdicionProducto() {
  const id = document.getElementById('edit-prod-id').value;
  const name = document.getElementById('edit-prod-name').value.trim();
  const price = document.getElementById('edit-prod-price').value;
  const stock = document.getElementById('edit-prod-stock').value;
  const catPrincipal = document.getElementById('edit-prod-cat-principal')?.value || 'Otro';
  const catSub = document.getElementById('edit-prod-cat-sub')?.value || '';
  if (!name || !price) { showToast('Completá nombre y precio'); return; }
  // Foto principal: si eligió una nueva, reemplaza; si no, se conserva la actual.
  let mainUrl;
  if (editFotoFile && currentUser?.proveedorId) {
    try { mainUrl = await subirFotoStorage(editFotoFile, currentUser.proveedorId); } catch (e) { }
  }
  // Subir las fotos extra nuevas
  const nuevasExtra = [];
  if (currentUser?.proveedorId) {
    for (const f of editFotoFilesExtra) {
      try { const u = await subirFotoStorage(f, currentUser.proveedorId); if (u) nuevasExtra.push(u); } catch (e) { }
    }
  }
  const _row = productos.find(x => String(x.id) === String(id));
  const primary = mainUrl || (_row && _row.imagen_url) || editFotoExisting[0] || null;
  // Galería final: principal + extras conservadas + extras nuevas, sin duplicados
  let galeria = [];
  if (primary) galeria.push(primary);
  galeria = galeria.concat(editFotoExisting, nuevasExtra).filter(Boolean);
  galeria = [...new Set(galeria)];
  try {
    const upd = {
      nombre: name, precio: parseFloat(price), stock: stock ? parseInt(stock) : null,
      categoria: catSub || catPrincipal,
      categoria_principal: catPrincipal,
      subcategoria: catSub || null,
      imagenes: galeria.length > 1 ? galeria : null
    };
    if (mainUrl) upd.imagen_url = mainUrl; // solo tocar la principal si cambió
    await sb.from('productos').update(upd).eq('id', id).eq('proveedor_id', currentUser?.proveedorId);
    const idx = productos.findIndex(p => String(p.id) === String(id));
    if (idx >= 0) productos[idx] = { ...productos[idx], nombre: name, precio: parseFloat(price), stock: stock ? parseInt(stock) : null, categoria: catSub || catPrincipal, categoria_principal: catPrincipal, imagenes: upd.imagenes, ...(mainUrl ? { imagen_url: mainUrl } : {}) };
    renderProdGrid(); closeEditProduct(); showToast('Producto actualizado!');
  } catch (e) { showToast('Error al guardar'); }
}

// ===== NAV =====
function goTo(s) {
  haptic('light');
  if (s !== 'detalle-producto') _resetProdSEO();
  if (s === 'registro' && !currentUser) {
    showToast('Iniciá sesión antes de registrarte como proveedor');
    s = 'perfil';
  }
  // Push to navigation stack (avoid consecutive duplicates)
  if (navStack[navStack.length - 1] !== s) {
    navStack.push(s);
    if (navStack.length > 30) navStack.shift(); // cap
  }
  // Keep legacy variables in sync for any remaining callers
  if (navStack.length >= 2) {
    pantallaAnterior = navStack[navStack.length - 2];
    pantallaAnteriorProd = navStack[navStack.length - 2];
  }
  document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.dsb-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach(n => n.classList.remove('active'));
  const scr = document.getElementById('screen-' + s);
  if (scr) scr.classList.add('active');
  const nav = document.getElementById('nav-' + s);
  if (nav) nav.classList.add('active');
  const dsb = document.getElementById('dsb-' + s);
  if (dsb) dsb.classList.add('active');
  const dnav = document.getElementById('dnav-' + s);
  if (dnav) dnav.classList.add('active');
  if (s === 'perfil' && currentUser) updatePerfilUI();
  if (s === 'perfil' && currentUser?.type === 'user') cargarHistorial();
  if (s === 'favoritos') renderFavs();
  if (s === 'novedades') {
    const sem = document.getElementById('nv-semana');
    if (sem) sem.textContent = nvTextoSemana();
    nvInitRiel();
    nvActualizarPublicar();
    cargarNovedades();
    cargarMisNovedades();
    nvMarcarVisto();
  }
  if (s === 'planes') renderPlanes();
  if (s === 'mapa') { renderMapaProvincias(); renderMapaAllProvs(); }
  if (s === 'mensajes') cargarMensajesUsuario();
  const fab = document.getElementById('soporte-fab');
  if (fab) fab.style.display = s === 'perfil' ? 'flex' : 'none';
  const guiaFab = document.getElementById('guia-prod-fab');
  if (guiaFab) {
    const dismissed = localStorage.getItem('eg_guia_prod_dismissed');
    guiaFab.style.display = (s === 'perfil' && !dismissed && currentUser?.type === 'proveedor') ? 'flex' : 'none';
  }
  window.scrollTo(0, 0);
  setTimeout(checkReveal, 100);
  trackEvent('screen_view', { screen_name: s });
}
function switchTab(tab, el) {
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  // Cargar mensajes automáticamente al abrir el tab
  if (tab === 'mensajes-prov') cargarConversaciones();
}

// ===== REGISTRO =====
function showRegStep(step) {
  if (step === 1 && currentUser?.email) {
    setTimeout(() => {
      const emailInput = document.querySelector('#reg-step1 input[type="email"]');
      if (emailInput) {
        emailInput.value = currentUser.email;
        emailInput.readOnly = true;
        emailInput.style.background = '#f5f5f5';
        emailInput.style.color = '#999';
        emailInput.style.cursor = 'not-allowed';
      }
    }, 0);
  }
  if (step === 2) {
    regClearErrors('reg-step1');
    const nEl = document.querySelector('#reg-step1 input[type="text"]');
    const eEl = document.querySelector('#reg-step1 input[type="email"]');
    const wEl = document.querySelector('#reg-step1 input[type="tel"]');
    const pEl = document.querySelector('#reg-step1 select');
    if (!nEl?.value?.trim()) { return regFail(1, 'nombre', nEl, 'Ingresá el nombre del negocio'); }
    if (!eEl?.value?.trim()) { return regFail(1, 'email', eEl, 'Ingresá tu email'); }
    if (!wEl?.value?.trim()) { return regFail(1, 'whatsapp', wEl, 'Ingresá tu WhatsApp'); }
    if (!pEl?.value) { return regFail(1, 'provincia', pEl, 'Seleccioná tu provincia'); }
  }
  if (step === 2) { renderRubrosPicker('reg-rubros-picker'); }
  if (step === 3) {
    regClearErrors('reg-step2');
    const rEl = document.querySelectorAll('#reg-step2 input[type="text"]')[0];
    const cEl = document.querySelectorAll('#reg-step2 input[type="text"]')[1];
    const igEl = document.getElementById('reg-instagram');
    const dEl = document.querySelector('#reg-step2 textarea');
    const ru = getRubrosSeleccionados('reg-rubros-picker');
    const c = cEl?.value?.trim() || '';
    const ig = normalizarIG(igEl?.value || '');
    if (!rEl?.value?.trim()) { return regFail(2, 'razon_social', rEl, 'Ingresá la razón social'); }
    if (!c) { return regFail(2, 'cuit', cEl, 'Ingresá el CUIT o CUIL'); }
    if (c.replace(/\D/g, '').length !== 11) { return regFail(2, 'cuit_formato', cEl, 'El CUIT/CUIL debe tener 11 números'); }
    if (!ru.length) { return regFail(2, 'rubro', document.getElementById('reg-rubros-picker'), 'Seleccioná al menos un rubro'); }
    if (!ig || ig.length < 3) { return regFail(2, 'instagram', igEl, 'Ingresá tu Instagram (o el link de tu tienda)'); }
    if (!dEl?.value?.trim()) { return regFail(2, 'descripcion', dEl, 'Ingresá una descripción'); }
  }
  ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3', 'reg-success'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  const map = { 0: 'reg-intro', 1: 'reg-step1', 2: 'reg-step2', 3: 'reg-step3' };
  const e = document.getElementById(map[step] || 'reg-intro');
  if (e) e.style.display = 'block';
  // Mide cuántos LLEGAN a cada paso → con reg_block arma el embudo exacto en GA4.
  if (step >= 1 && step <= 3) trackEvent('reg_step' + step, { step: step });
  window.scrollTo(0, 0);
}
async function showRegSuccess() {
  regClearErrors('reg-step3');
  const enviosEl = document.querySelectorAll('#reg-step3 select')[0];
  const minimoEl = document.querySelectorAll('#reg-step3 select')[1];
  const envios = enviosEl?.value;
  const minimo = minimoEl?.value;
  if (!envios) { return regFail(3, 'envios', enviosEl, 'Seleccioná si hacés envíos'); }
  if (!minimo) { return regFail(3, 'pedido_minimo', minimoEl, 'Seleccioná el pedido mínimo'); }
  const btn = document.querySelector('#reg-step3 .submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  const email = (document.querySelector('#reg-step1 input[type="email"]')?.value || '').toLowerCase().trim();
  const datos = {
    nombre: document.querySelector('#reg-step1 input[type="text"]')?.value || '',
    razon_social: document.querySelectorAll('#reg-step2 input[type="text"]')[0]?.value || '',
    cuit: document.querySelectorAll('#reg-step2 input[type="text"]')[1]?.value || '',
    email,
    whatsapp: normalizarWAArg(document.querySelector('#reg-step1 input[type="tel"]')?.value || ''),
    instagram: normalizarIG(document.getElementById('reg-instagram')?.value || ''),
    rubro: getRubrosSeleccionados('reg-rubros-picker').join(', '),
    provincia: document.querySelector('#reg-step1 select')?.value || '',
    descripcion: document.querySelector('#reg-step2 textarea')?.value || '',
    envios, pedido_minimo: minimo
  };

  try {
    // Dedup por email/CUIT vía RPC SECURITY DEFINER: el rol anon ya NO puede leer
    // email/cuit/razon_social directamente (PII fuera de la API pública), así que
    // la verificación de duplicados corre server-side sin exponer esas columnas.
    const { data: dup } = await sb.rpc('registro_lookup', { p_email: email, p_cuit: datos.cuit || null });
    const info = Array.isArray(dup) ? dup[0] : dup;

    // Verificar si ya existe por email
    if (info && info.email_estado) {
      if (info.email_estado === 'pendiente') {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
        showToast('Tu solicitud ya está siendo revisada. Te avisamos en 24-48hs por WhatsApp.');
        return;
      }
      if (info.email_estado === 'aprobado') {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
        showToast('¡Ya tenés cuenta aprobada! Iniciá sesión para acceder a tu dashboard.');
        return;
      }
      if (info.email_estado === 'rechazado' || info.email_estado === 'suspendido') {
        if (btn) btn.textContent = 'Enviando...';
        const { error } = await sb.from('proveedores').update({ ...datos, estado: 'pendiente', plan: 'gratis' }).eq('id', info.email_id);
        if (error) throw error;
        ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        document.getElementById('reg-success').style.display = 'block';
        window.scrollTo(0, 0);
        return;
      }
    }

    // Verificar si ya existe por CUIT (otro email) — la RPC solo lo devuelve si el CUIT
    // pertenece a un email distinto al que se está registrando.
    if (datos.cuit && info && info.cuit_estado) {
      if (info.cuit_estado === 'aprobado' || info.cuit_estado === 'pendiente') {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
        showToast('Ya existe una cuenta con ese CUIT. Iniciá sesión con el email registrado.');
        return;
      }
      if (info.cuit_estado === 'suspendido' || info.cuit_estado === 'rechazado') {
        if (btn) btn.textContent = 'Enviando...';
        const { error } = await sb.from('proveedores').update({ ...datos, email, estado: 'pendiente', plan: 'gratis' }).eq('id', info.cuit_id);
        if (error) throw error;
        ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        document.getElementById('reg-success').style.display = 'block';
        window.scrollTo(0, 0);
        return;
      }
    }

    // No existe: insertar nuevo
    if (btn) btn.textContent = 'Enviando...';
    const { error } = await sb.from('proveedores').insert({ ...datos, plan: 'gratis', estado: 'pendiente' });
    if (error) throw error;
    notificarAdmin('proveedor', datos);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
    showToast('Error al enviar: ' + (e.message || 'intentá de nuevo'));
    return;
  }

  ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  document.getElementById('reg-success').style.display = 'block';
  window.scrollTo(0, 0);
  trackEvent('sign_up', { method: 'proveedor_registro' });
  // Meta Pixel: registro de proveedor completado (perfil nuevo creado) → conversión de campaña.
  // Va acá, después del insert OK, para NO contar registros que fallaron o duplicados.
  try { if (typeof fbq === 'function') fbq('track', 'CompleteRegistration'); } catch (e) {}
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ===== AI TEST =====
// Recomendador de PROVEEDOR (antes "test de rubro"). Q1 se completa dinámicamente
// en openTest() con los rubros que realmente tienen proveedores cargados, para no
// ofrecer rubros vacíos. Cada opción de Q1 lleva un `value` = rubro (o null = "no sé").
const questions = [
  {
    dynamic: 'rubro',
    text: "¿Qué estás buscando?", sub: "Elegí el rubro que querés comprar al por mayor.",
    options: []   // se llena en openTest() → buildRubroOptions()
  },
  {
    text: "¿Desde dónde comprás?", sub: "Para priorizar quién te envía o está cerca tuyo.", options: [
      { icon: "🚚", label: "Que me lo envíen", sub: "Compro a distancia" },
      { icon: "🏙", label: "AMBA (CABA / Bs. As. / GBA)", sub: "Zona metropolitana" },
      { icon: "🌆", label: "Interior del país", sub: "Otra provincia" }
    ]
  },
  {
    text: "¿Cuánto querés invertir por pedido?", sub: "Para descartar los que te piden un mínimo muy alto.", options: [
      { icon: "💵", label: "Menos de $50.000", sub: "Arranco chico" },
      { icon: "💰", label: "$50.000 a $200.000", sub: "Presupuesto moderado" },
      { icon: "💼", label: "$200.000 a $500.000", sub: "Puedo invertir" },
      { icon: "🎯", label: "Más de $500.000 / me da igual", sub: "Sin problema con el mínimo" }
    ]
  },
  {
    text: "¿Qué es lo más importante para vos?", sub: "Con esto ordenamos cuál te mostramos primero.", options: [
      { icon: "🏷", label: "El precio y pedido mínimo bajo", sub: "Que me convenga la plata" },
      { icon: "📦", label: "Que envíe a todo el país", sub: "Necesito envíos" },
      { icon: "🔥", label: "Que sea de los más elegidos", sub: "Los que más consultan" },
      { icon: "✨", label: "Mostrame el mejor en general", sub: "No tengo una preferencia" }
    ]
  }
];
let currentStep = 0, answers = [], selectedOption = null;
// Rubros tal como aparecen (y en el mismo orden) en los chips del buscador.
const RUBROS_BUSCADOR = [
  'Blanquería', 'Indumentaria', 'Bazar', 'Tecnología', 'Packaging', 'Belleza y Salud',
  'Electrónica', 'Juguetería', 'Limpieza', 'Bebés y Niños', 'Hogar y Deco', 'Textil y Telas',
  'Lencería', 'Herramientas', 'Muebles', 'Librería y Papelería', 'Ferretería', 'Mascotas',
  'Alimentos', 'Iluminación', 'Construcción', 'Marroquinería y Bolsos', 'Deportes',
  'Automotor', 'Servicios', 'Otro'
];

// Opciones de la 1ª pregunta: "Todavía no lo tengo claro" primero, y luego los
// rubros del buscador EN SU ORDEN, incluyendo solo los que tienen al menos un
// proveedor. Un proveedor con varios rubros (coma) cuenta en cada uno (matchesCat).
function buildRubroOptions() {
  const opts = [{ icon: "🤔", label: "Todavía no lo tengo claro", sub: "Ayudame a elegir", value: null }];
  RUBROS_BUSCADOR.forEach(r => {
    const n = (proveedoresDB || []).filter(p => matchesCat(p.rubro, r)).length;
    if (n > 0) opts.push({
      icon: `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${catColors[r] || '#006039'}"></span>`,
      label: r, sub: n + (n === 1 ? ' proveedor' : ' proveedores'), value: r
    });
  });
  return opts;
}

function openTest() {
  questions[0].options = buildRubroOptions();
  resetTest();
  document.getElementById('testModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Burbuja flotante que invita al recomendador. Aparece 1 vez por sesión, 3s
// después de entrar, y solo si el usuario está parado en el inicio.
function mostrarBurbujaReco() {
  return; // Burbuja del recomendador desactivada temporalmente.
  try { if (sessionStorage.getItem('eg_reco_bubble')) return; } catch (e) { }
  const inicio = document.getElementById('screen-inicio');
  const bubble = document.getElementById('recoBubble');
  if (!bubble || !inicio || !inicio.classList.contains('active')) return;
  try { sessionStorage.setItem('eg_reco_bubble', '1'); } catch (e) { }
  bubble.style.display = 'block';
  requestAnimationFrame(() => bubble.classList.add('show'));
  clearTimeout(window._recoBubbleTO);
  window._recoBubbleTO = setTimeout(cerrarBurbujaReco, 10000);
}
function cerrarBurbujaReco(ev) {
  if (ev) ev.stopPropagation();
  const bubble = document.getElementById('recoBubble');
  if (!bubble) return;
  bubble.classList.remove('show');
  setTimeout(() => { bubble.style.display = 'none'; }, 250);
}
function abrirTestDesdeBurbuja() {
  cerrarBurbujaReco();
  openTest();
}
function closeTest() { document.getElementById('testModal').classList.remove('open'); document.body.style.overflow = ''; }
function closeTestOnBg(e) { if (e.target === document.getElementById('testModal')) closeTest(); }
function resetTest() {
  currentStep = 0; answers = []; selectedOption = null;
  document.getElementById('questionsSection').style.display = 'block';
  document.getElementById('resultSection').classList.remove('show');
  document.getElementById('resultLoading').style.display = 'block';
  document.getElementById('resultContent').style.display = 'none';
  renderQuestion();
}
function renderQuestion() {
  const q = questions[currentStep];
  document.getElementById('stepIndicator').textContent = `Pregunta ${currentStep + 1} de ${questions.length}`;
  document.getElementById('progressFill').style.width = `${(currentStep / questions.length) * 100}%`;
  document.getElementById('qText').textContent = q.text;
  document.getElementById('qSub').textContent = q.sub;
  selectedOption = null;
  document.getElementById('nextBtn').classList.remove('ready');
  document.getElementById('optionsGrid').innerHTML = q.options.map((o, i) => `
    <div class="opt-btn" data-idx="${i}">
      <span class="opt-icon">${o.icon}</span>
      <div><div class="opt-label">${o.label}</div><div class="opt-sub">${o.sub}</div></div>
    </div>`).join('');
  document.getElementById('optionsGrid').onclick = function (e) {
    const btn = e.target.closest('.opt-btn');
    if (!btn) return;
    document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedOption = parseInt(btn.dataset.idx);
    document.getElementById('nextBtn').classList.add('ready');
  };
}
function nextStep() {
  if (selectedOption === null) return;
  answers.push({ q: currentStep, a: selectedOption });
  if (currentStep < questions.length - 1) { currentStep++; renderQuestion(); }
  else showResult();
}
// Convierte "Desde $100.000+" / "Sin minimo" / "Consultar" a número (0 si no aplica).
function parseMinimo(txt) {
  const s = String(txt || '').toLowerCase();
  if (!s || s.includes('sin') || s.includes('consult') || s.includes('stock')) return 0;
  const soloNum = s.replace(/[^0-9]/g, '');
  return soloNum ? parseInt(soloNum, 10) : 0;
}

// Puntúa TODOS los proveedores según las 4 respuestas y devuelve los mejores.
// Si el comprador eligió un rubro, filtra por ese rubro; si eligió "no lo tengo
// claro" (rubro null) rankea sobre todo el padrón y sugerimos el mejor rubro.
function scoreProveedores(ans) {
  const rubroSel = questions[0].options[ans[0].a]?.value ?? null; // null = no sabe
  const loc = ans[1].a;        // 0 envío · 1 AMBA · 2 interior
  const techo = [50000, 200000, 500000, Infinity][ans[2].a];
  const prio = ans[3].a;       // 0 precio · 1 envío · 2 popularidad · 3 sin preferencia

  const base = (proveedoresDB || []).filter(p => p.whatsapp || p.id);
  // matchesCat contempla rubros múltiples (coma) y nombres legacy: un proveedor
  // en 2 rubros aparece en ambos, igual que en el buscador.
  const cand = rubroSel ? base.filter(p => matchesCat(p.rubro, rubroSel)) : base.slice();

  const evaluar = p => {
    const enviaPais = /pa[ií]s|nacional|todo el/i.test(p.envios || '');
    const esAMBA = /caba|buenos aires|gba/i.test(p.provincia || '');
    const minNum = parseMinimo(p.pedido_minimo);
    const reasons = [];
    let s = 0;

    // Ubicación / envíos
    if (loc === 0) { if (enviaPais) { s += 20; reasons.push('envía a todo el país'); } }
    else {
      const localMatch = (loc === 1 && esAMBA) || (loc === 2 && !esAMBA && p.provincia);
      if (localMatch) { s += 18; reasons.push('está en tu zona'); }
      if (enviaPais) { s += 12; if (!localMatch) reasons.push('envía a todo el país'); }
    }
    // Pedido mínimo vs presupuesto
    if (minNum === 0) { s += 8; }
    else if (minNum <= techo) { s += 14; reasons.push('pedido mínimo acorde a tu presupuesto'); }
    else { s -= 12; }
    // Confianza y popularidad (Pro suma en silencio; todos son verificados)
    if (p.pro) { s += 10; }
    s += Math.min(p.visitas || 0, 500) * 0.02;
    // Prioridad elegida en Q4 (0 precio · 1 envío · 2 popularidad · 3 sin preferencia)
    if (prio === 0 && (minNum === 0 || minNum <= techo)) s += 15;
    if (prio === 1 && enviaPais) s += 15;
    if (prio === 2) s += Math.min(p.visitas || 0, 500) * 0.03;

    return { p, s, reasons };
  };

  return cand.map(evaluar).sort((a, b) => b.s - a.s).slice(0, 3);
}

// Pinta las tarjetas de proveedor recomendadas dentro del modal del test.
function renderRecomendaciones(ranked, rubroSel) {
  const cont = document.getElementById('recoResults');
  const head = document.getElementById('reco-heading');
  if (!cont) return;

  if (!ranked.length) {
    head.innerHTML = '';
    cont.innerHTML = `<div style="text-align:center;padding:8px 4px 4px;color:#6B7A99;font-size:.9rem">
      No encontramos un proveedor que encaje justo con eso todavía.</div>
      <button onclick="closeTest();${rubroSel ? `filterCat('${rubroSel.replace(/'/g, "\\'")}')` : "goTo('buscar')"}" style="width:100%;background:#006039;color:white;border:none;border-radius:14px;padding:14px;font-family:'Inter',sans-serif;font-size:.95rem;font-weight:800;cursor:pointer;margin-top:6px">Ver todos los proveedores</button>`;
    return;
  }

  const rubroMostrado = rubroSel || (ranked[0].p.rubro || '').split(',')[0].trim() || 'proveedores';
  head.innerHTML = rubroSel
    ? `<div style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:800;color:#1A1A1A;margin-bottom:12px">Tu mejor match en ${escHtml(rubroMostrado)}</div>`
    : `<div style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:800;color:#1A1A1A;margin-bottom:4px">Te recomendamos empezar por ${escHtml(rubroMostrado)}</div>
       <div style="font-size:.8rem;color:#6B7A99;margin-bottom:12px">Es donde más y mejores proveedores hay para tu perfil.</div>`;

  cont.innerHTML = ranked.map(({ p, reasons }, i) => {
    const ini = p.inicial || (p.nombre || '').substring(0, 2).toUpperCase();
    const bg = _monoColor(p.id);
    const porque = reasons.length ? 'Te lo recomiendo porque ' + reasons.slice(0, 3).join(', ') + '.' : 'Buen match para lo que buscás.';
    const wa = normalizarWAArg(p.whatsapp);
    const waBtn = wa
      ? `<a href="https://wa.me/${wa}?text=${encodeURIComponent(mensajeWAProv(p))}" onclick="event.stopPropagation();registrarContactoWA('${p.id}')" target="_blank" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#25D366,#128C7E);color:white;border-radius:10px;padding:10px;font-family:'Inter',sans-serif;font-size:.8rem;font-weight:700;text-decoration:none">WhatsApp</a>`
      : '';
    return `<div style="background:white;border-radius:14px;border:1px solid #DCE8E2;padding:14px;position:relative">
      ${i === 0 ? `<div style="position:absolute;top:-8px;left:14px;background:#006039;color:white;font-size:.62rem;font-weight:800;padding:3px 9px;border-radius:8px;letter-spacing:.03em">★ TU MEJOR MATCH</div>` : ''}
      <div style="display:flex;align-items:center;gap:12px;margin-top:${i === 0 ? '6px' : '0'}">
        ${p.logo_url
        ? `<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${escHtml(imgThumb(p.logo_url, 200, 75))}" style="width:100%;height:100%;object-fit:cover;background:#F3F4F6" alt=""></div>`
        : `<div style="width:46px;height:46px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;color:white;font-family:'Inter',sans-serif;flex-shrink:0">${ini}</div>`}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-family:'Inter',sans-serif;font-size:.9rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.nombre)}</span>
            ${p.pro ? '<span style="font-size:.58rem;font-weight:800;background:linear-gradient(135deg,#064E3B,#022C22);color:#F0C775;border:1px solid rgba(233,185,73,.4);padding:2px 6px;border-radius:7px;letter-spacing:.04em">PRO</span>' : ''}
          </div>
          <div style="font-size:.72rem;color:#6B7A99;margin-top:2px">${escHtml(p.rubro)}${p.provincia ? ' · ' + escHtml(p.provincia) : ''}</div>
        </div>
      </div>
      <div style="font-size:.8rem;color:#334155;line-height:1.5;margin:10px 0 12px">${escHtml(porque)}</div>
      <div style="display:flex;gap:8px">
        <button onclick="closeTest();abrirDetalle('${p.id}')" style="flex:1;background:#EFF6F2;border:1.5px solid #DCE8E2;border-radius:10px;padding:10px;font-family:'Inter',sans-serif;font-size:.8rem;font-weight:700;color:#006039;cursor:pointer">Ver perfil</button>
        ${waBtn}
      </div>
    </div>`;
  }).join('');
}

async function showResult() {
  document.getElementById('progressFill').style.width = '100%';
  document.getElementById('questionsSection').style.display = 'none';
  document.getElementById('resultSection').classList.add('show');
  document.getElementById('resultLoading').style.display = 'block';
  document.getElementById('resultContent').style.display = 'none';

  // Pequeña pausa para que se perciba el "análisis" (no hay llamada de red).
  await new Promise(r => setTimeout(r, 650));

  const rubroSel = questions[0].options[answers[0].a]?.value ?? null;
  const ranked = scoreProveedores(answers);
  renderRecomendaciones(ranked, rubroSel);

  document.getElementById('resultLoading').style.display = 'none';
  document.getElementById('resultContent').style.display = 'block';
}

// ===== PRODUCTOS =====
let productosReales = [];
let homeProductosPage = 0;
const HOME_PAGE_SIZE = 20;
let _buscarListaFiltrada = [], _buscarOffset = 0, _buscarFiltroActual = '';
let provDetalleData = [], provDetalleOffset = 0, provDetalleEsPro = false, provDetalleLimite;
let provDetalleFiltro = '';   // texto del buscador dentro del catálogo del proveedor
const DETALLE_PAGE_SIZE = 20;
const catColors = {
  'Tecnología': '#065F46', 'Indumentaria': '#FF6B00', 'Hogar y Deco': '#00A651', 'Bazar': '#047857',
  'Alimentos': '#F59E0B', 'Belleza y Salud': '#E91E8C', 'Deportes': '#EF4444', 'Automotor': '#6B7280',
  'Construcción': '#92400E', 'Servicios': '#0369A1', 'Juguetería': '#D97706', 'Ferretería': '#78716C',
  'Iluminación': '#CA8A04', 'Muebles': '#047857', 'Textil y Telas': '#8B5CF6',
  'Librería y Papelería': '#059669', 'Marroquinería y Bolsos': '#B45309', 'Limpieza': '#0891B2',
  'Blanquería': '#6366F1', 'Mascotas': '#16A34A', 'Bebés y Niños': '#DB2777',
  'Electrónica': '#2563EB', 'Herramientas': '#57534E', 'Packaging': '#0F766E', 'Otro': '#9CA3AF',
  // legacy
  'Moda': '#FF6B00', 'Hogar': '#00A651', 'Salud': '#E91E8C', 'Textiles': '#8B5CF6', 'Otros': '#9CA3AF', 'Tecnologia': '#065F46',
};

function getEmojiCat(cat) { return ''; }
function getProdLista() { return productosReales; }

// Color determinístico por proveedor para el monograma cuando no hay logo:
// el mismo proveedor siempre obtiene el mismo color (se ve intencional, no random).
const _MONO_PALETTE = ['#065F46', '#0E7C5A', '#B45309', '#6D28D9', '#0F766E', '#9D174D', '#006039', '#3F6212'];
function _monoColor(seed) {
  const s = String(seed == null ? '' : seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return _MONO_PALETTE[h % _MONO_PALETTE.length];
}

// Normaliza la galería de un producto a un array de URLs válidas, con la foto
// principal (imagen_url) siempre primera y sin duplicados. Acepta jsonb (array
// ya parseado), string JSON, o null. Si no hay nada, devuelve [].
function _normImgs(imagenes, imagenUrl) {
  let arr = [];
  if (Array.isArray(imagenes)) arr = imagenes;
  else if (typeof imagenes === 'string') { try { const j = JSON.parse(imagenes); if (Array.isArray(j)) arr = j; } catch (e) { } }
  arr = arr.map(u => (typeof u === 'string' ? u.trim() : '')).filter(Boolean);
  if (imagenUrl) arr = [imagenUrl, ...arr.filter(u => u !== imagenUrl)];
  const seen = new Set(); const out = [];
  for (const u of arr) { if (!seen.has(u)) { seen.add(u); out.push(u); } }
  return out;
}

async function cargarProductosReales() {
  const grid = document.getElementById('home-prod-grid');
  if (grid) grid.innerHTML = Array(6).fill('<div class="skel" style="height:220px;border-radius:14px"></div>').join('');
  try {
    let data = [];

    // Camino rápido: endpoint cacheado en el CDN de Vercel (s-maxage=60). Evita
    // que CADA visita pegue 2 veces contra Supabase por ~1,71 MB de catálogo.
    // Devuelve las filas crudas, con la misma forma que el select de abajo, así
    // que el mapeo y el barajado que siguen no cambian en nada.
    try {
      const r = await fetch('/api/catalogo');
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) data = j;
      }
    } catch (e) { }

    // Fallback: si el endpoint falla, se lee directo de Supabase como siempre.
    // La bandera se calcula UNA vez a propósito: si se condicionara el for a
    // data.length===0, la primera página llenaría data y el bucle cortaría ahí,
    // truncando el catálogo de respaldo en 1.000 productos.
    const usoCache = data.length > 0;
    // Catálogo completo paginado. El filtrado/búsqueda de la pantalla Buscar es
    // client-side sobre productosReales; un límite fijo dejaba afuera en silencio
    // a las categorías más antiguas cuando el catálogo supera ese tope.
    const PAGE = 1000;
    for (let desde = 0; !usoCache && desde < 50000; desde += PAGE) {
      // Columnas explícitas en vez de '*': el catálogo entero viaja en CADA carga
      // de la app, así que cada columna de más se multiplica por todas las visitas.
      // Medido sobre 1000 filas: '*' devolvía 1,22 MB y esta lista 1,02 MB (-16%).
      // Las 8 columnas descartadas (foto_url, subcategoria, tn_product_id,
      // categoria_tn, ml_item_id, categoria_ml, created_at, visible) no las lee
      // el mapeo de abajo. created_at y visible siguen usándose para ordenar y
      // filtrar: PostgREST no exige que estén en el select para eso.
      const COLS = 'id,proveedor_id,nombre,precio,stock,categoria,categoria_principal,descripcion,imagen_url,imagenes';
      const { data: page, error } = await sb.from('productos').select(COLS + ', proveedores(id,nombre,rubro,provincia,plan,plan_hasta,whatsapp)').or('visible.eq.true,visible.is.null').order('created_at', { ascending: false }).range(desde, desde + PAGE - 1);
      if (error) break;
      if (page && page.length) data = data.concat(page);
      if (!page || page.length < PAGE) break;
    }
    if (data.length > 0) {
      const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D'];
      const mapped = data.map((p, i) => ({
        id: 'real_' + p.id, idReal: p.id, nombre: p.nombre, precio: p.precio || 0,
        pedido_minimo: p.stock ? 'Stock: ' + p.stock + ' unidades' : 'Consultar',
        cat: p.categoria_principal || p.categoria || 'General', emoji: getEmojiCat(p.categoria_principal || p.categoria), catPrincipal: p.categoria_principal || null, descripcion: p.descripcion || null,
        provId: String(p.proveedor_id),
        provNombre: p.proveedores?.nombre || 'Proveedor',
        provincia: p.proveedores?.provincia || '',
        provRubro: (p.proveedores?.rubro || '') + (p.proveedores?.provincia ? ' · ' + p.proveedores.provincia : ''),
        provColor: _monoColor(p.proveedor_id), imgUrl: p.imagen_url || '', imagenes: _normImgs(p.imagenes, p.imagen_url),
        whatsapp: p.proveedores?.whatsapp || '', esPro: p.proveedores?.plan === 'pro' && (!p.proveedores?.plan_hasta || new Date(p.proveedores.plan_hasta + 'T03:00:00Z') > new Date())
      }));
      // Round-robin interleave by provider so no single provider dominates the feed.
      // Pro providers rotate first; products within each provider are shuffled.
      const _shuffle = arr => { for (let _si = arr.length - 1; _si > 0; _si--) { const _sj = Math.floor(Math.random() * (_si + 1)); [arr[_si], arr[_sj]] = [arr[_sj], arr[_si]]; } return arr; };
      const _byProv = {};
      mapped.forEach(p => { if (!_byProv[p.provId]) _byProv[p.provId] = []; _byProv[p.provId].push(p); });
      const _proG = _shuffle(Object.values(_byProv).filter(g => g[0].esPro));
      const _freeG = _shuffle(Object.values(_byProv).filter(g => !g[0].esPro));
      const _allG = [..._proG, ..._freeG];
      _allG.forEach(g => _shuffle(g));
      const _mixed = [];
      const _maxLen = Math.max(..._allG.map(g => g.length), 0);
      for (let _ri = 0; _ri < _maxLen; _ri++) { _allG.forEach(g => { if (g[_ri]) _mixed.push(g[_ri]); }); }
      productosReales = _mixed;
    }
  } catch (e) { }
  homeProductosPage = 0;
  renderHomeGrid();
  renderProdBuscar();
  abrirDeepLinkProd();
}

// Abre el producto indicado por ?p=<id> una sola vez, ya cargado el catálogo.
// Acepta tanto el id interno ('real_<uuid>') como el id crudo de la base (<uuid>).
function abrirDeepLinkProd() {
  if (!_deepLinkProd) return;
  const wanted = String(_deepLinkProd);
  _deepLinkProd = null;
  const p = productosReales.find(x => String(x.id) === wanted || String(x.idReal) === wanted);
  if (!p) return;
  setTimeout(() => { try { abrirDetalleProd(p.id); } catch (e) { } }, 60);
}

function renderHomeGrid() {
  const grid = document.getElementById('home-prod-grid');
  const btn = document.getElementById('home-ver-mas-btn');
  if (!grid) return;
  const hasta = (homeProductosPage + 1) * HOME_PAGE_SIZE;
  const slice = productosReales.slice(0, hasta);
  if (!slice.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--gray);font-size:.88rem">Los primeros productos aparecerán pronto.</div>';
    if (btn) btn.style.display = 'none';
    return;
  }
  grid.innerHTML = slice.map(p => renderHomeProdCard(p)).join('');
  if (btn) btn.style.display = productosReales.length > hasta ? '' : 'none';
}

function cargarMasHomeProductos() {
  homeProductosPage++;
  renderHomeGrid();
}

function renderHomeProdCard(p) {
  const color = catColors[p.cat] || '#065F46';
  return `<div class="prod-inicio-card" onclick="abrirDetalleProd('${escHtml(p.id)}')">
    <div class="prod-img-wrap" style="position:relative">
      ${p.imgUrl ? `<img loading="lazy" src="${escHtml(imgThumb(p.imgUrl, 400, 70))}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
      <span class="prod-inicio-badge" style="position:absolute;top:7px;left:7px;background:${color}">${escHtml(p.cat)}</span>
    </div>
    <div class="prod-inicio-body">
      <div class="prod-inicio-name">${escHtml(p.nombre)}</div>
      <div class="prod-inicio-price">$${Number(p.precio).toLocaleString('es-AR')}</div>
      <div class="prod-inicio-prov"><div class="prod-inicio-prov-dot"></div>${escHtml(p.provNombre)}</div>
    </div>
  </div>`;
}

function renderProdBuscarCard(p) {
  return `<div onclick="abrirDetalleProd('${escHtml(p.id)}')" style="min-width:140px;max-width:140px;background:white;border-radius:12px;overflow:hidden;border:1px solid #eee;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.06);flex-shrink:0">
    <div class="prod-img-wrap">
      ${p.imgUrl ? `<img loading="lazy" src="${escHtml(imgThumb(p.imgUrl, 400, 70))}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
    </div>
    <div style="padding:8px 9px 10px">
      <div style="font-size:.72rem;font-weight:700;color:#111;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:2rem">${escHtml(p.nombre)}</div>
      <div style="font-size:.85rem;font-weight:900;color:#006039;margin-top:3px">$${Number(p.precio).toLocaleString('es-AR')}</div>
      <div style="font-size:.65rem;color:#999;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.provNombre || '')}</div>
    </div>
  </div>`;
}

function renderProdBuscar(filtro, query = '') {
  const el = document.getElementById('prodBuscarGrid');
  const summary = document.getElementById('buscarSummary');
  if (!el) return;
  let lista = getProdLista();
  const q = (query || '').toLowerCase().trim();
  if (filtro && filtro !== 'Todas') lista = lista.filter(p => {
    const cat = p.cat || ''; const catP = p.catPrincipal || cat;
    if (catP.toLowerCase() === filtro.toLowerCase()) return true;
    if (cat.toLowerCase() === filtro.toLowerCase()) return true;
    if (filtro === 'Textil y Telas') { const tt = ['textil', 'tela']; return tt.some(t => quitarAcentos(cat.toLowerCase()).includes(t)); }
    if (filtro === 'Blanquería') { const tt = ['sabana', 'frazada', 'blanqueria', 'acolchado', 'toalla', 'mantel']; return tt.some(t => quitarAcentos(cat.toLowerCase()).includes(t)); }
    if (filtro === 'Hogar y Deco') return cat.toLowerCase().includes('hogar') || cat.toLowerCase().includes('deco') || cat.toLowerCase().includes('cocina');
    if (filtro === 'Belleza y Salud') return cat.toLowerCase().includes('belleza') || cat.toLowerCase().includes('salud') || cat.toLowerCase().includes('cosmet') || cat.toLowerCase().includes('perfum');
    // Legacy mapping for old product categories
    const legacyNorm = RUBRO_LEGACY[cat] || cat;
    if (legacyNorm.toLowerCase() === filtro.toLowerCase()) return true;
    return false;
  });
  let busq = { lista, modo: '', termino: q };
  if (q) {
    busq = egEscaleraBusqueda(lista, q,
      (p, texto) => prodMatchesQuery(p, texto),
      (p, toks) => _contarTokens(_prodBlob(p), p.provincia, p.catPrincipal || p.cat, toks));
    lista = busq.lista;
  }
  egPintarAviso('buscar-aviso-prod', q ? egAvisoBusqueda(busq, q) : '');
  if (summary) summary.textContent = lista.length ? `${lista.length} resultado${lista.length === 1 ? '' : 's'} en productos` : 'Sin resultados en productos';
  // Loguear la búsqueda de productos (incluye las de 0 resultados = demanda a reclutar)
  if (q) { trackSearch(q, lista.length); egTrackRescate(q, busq); }
  if (!lista.length) {
    // Busqueda sin resultados = demanda que hoy se pierde. En vez de dejar la
    // pantalla muerta, ofrecemos publicar un pedido de cotizacion con el
    // termino ya cargado. El bloque lo arma js/cotizaciones.js; si ese archivo
    // no cargo, esto queda igual que antes.
    const rfq = (q && typeof cotizBloqueSinResultados === 'function')
      ? cotizBloqueSinResultados(q) : '';
    el.innerHTML = '<div style="padding:36px 20px 8px;text-align:center;color:#999;font-size:.88rem">No encontramos productos con esos filtros.</div>' + rfq;
    el.style.display = 'block';
    return;
  }

  // Si hay búsqueda por texto o categoría específica → grid 2 columnas paginado
  if (q || (filtro && filtro !== 'Todas')) {
    _buscarListaFiltrada = lista;
    _buscarOffset = 0;
    _buscarFiltroActual = filtro || '';
    _drawBuscarGrid(el);
    return;
  }

  // Sin filtro → carruseles por rubro
  el.style.display = 'block';
  const catEmojis = {}; // Icons come from RUBROS_ICONS; fallback to category name only
  const porRubro = {};
  const _provPerCat = {};
  lista.forEach(p => {
    const rubro = p.cat || 'Otro';
    if (!porRubro[rubro]) { porRubro[rubro] = []; _provPerCat[rubro] = {}; }
    const cnt = _provPerCat[rubro][p.provId] || 0;
    if (cnt < 4) { porRubro[rubro].push(p); _provPerCat[rubro][p.provId] = cnt + 1; }
  });
  el.innerHTML = Object.entries(porRubro).map(([rubro, prods]) => `
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-family:'Inter',sans-serif;font-size:.92rem;font-weight:800;color:#111;display:flex;align-items:center;gap:5px">${RUBROS_ICONS[rubro] || ''} ${rubro}</div>
        <span onclick="setChip(document.querySelector('.chip[onclick*=\\'${rubro}\\']')||document.querySelector('.chip'),'${rubro}')" style="font-size:.75rem;font-weight:700;color:#006039;cursor:pointer">Ver todos ></span>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;-webkit-overflow-scrolling:touch">
        ${prods.map(p => renderProdBuscarCard(p)).join('')}
      </div>
    </div>`).join('');
}

// ===== GUIA CARGA PRODUCTOS =====
function abrirGuiaCarga() {
  const overlay = document.getElementById('guia-overlay');
  const sheet = document.getElementById('guia-sheet');
  if (!overlay || !sheet) return;
  const esPro = esProvPro();
  [
    { id: 'guia-btn-excel', proLabel: 'Usar', freeLabel: 'Activar' },
    { id: 'guia-btn-tn',    proLabel: 'Ir',   freeLabel: 'Activar' },
    { id: 'guia-btn-ml',    proLabel: 'Ir',   freeLabel: 'Activar' },
  ].forEach(({ id, proLabel, freeLabel }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = esPro ? proLabel : freeLabel;
    btn.style.background = esPro ? '#006039' : '#F0F0F0';
    btn.style.color = esPro ? 'white' : '#555';
  });
  overlay.style.display = 'block';
  sheet.style.display = 'block';
  sheet.style.animation = 'guiaSlideUp .25s ease';
  document.body.style.overflow = 'hidden';
  haptic('light');
}
function cerrarGuiaCarga() {
  const overlay = document.getElementById('guia-overlay');
  const sheet = document.getElementById('guia-sheet');
  if (overlay) overlay.style.display = 'none';
  if (sheet) sheet.style.display = 'none';
  document.body.style.overflow = '';
}
function noMostrarGuiaCarga() {
  localStorage.setItem('eg_guia_prod_dismissed', '1');
  cerrarGuiaCarga();
  const fab = document.getElementById('guia-prod-fab');
  if (fab) fab.style.display = 'none';
  haptic('light');
}
function guiaUsarManual() {
  cerrarGuiaCarga();
  setTimeout(() => openAddProduct(), 220);
}
function guiaUsarMulti() {
  cerrarGuiaCarga();
  setTimeout(() => { openAddProduct(); setTimeout(() => switchAddTab('multi'), 160); }, 220);
}
function guiaActivarExcel() {
  cerrarGuiaCarga();
  setTimeout(() => {
    if (esProvPro()) { openAddProduct(); setTimeout(() => switchAddTab('excel'), 160); }
    else showModalPro('Importar por Excel');
  }, 220);
}
function guiaActivarTN() {
  cerrarGuiaCarga();
  setTimeout(() => {
    if (esProvPro()) { const el = document.getElementById('tn-section'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else showModalPro('Tienda Nube');
  }, 220);
}
function guiaActivarML() {
  cerrarGuiaCarga();
  setTimeout(() => {
    if (esProvPro()) { const el = document.getElementById('ml-section'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else showModalPro('Mercado Libre');
  }, 220);
}

function _drawBuscarGrid(el) {
  const lista = _buscarListaFiltrada;
  const PAGE = 20;
  const slice = lista.slice(0, _buscarOffset + PAGE);
  const hasMore = lista.length > slice.length;
  el.style.display = 'grid';
  el.innerHTML = slice.map(p => `
    <div class="prod-buscar-card" onclick="abrirDetalleProd('${escHtml(p.id)}')">
      <div class="prod-img-wrap">
        ${p.imgUrl ? `<img loading="lazy" src="${escHtml(imgThumb(p.imgUrl, 400, 70))}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
      </div>
      <div class="body">
        <div class="title">${escHtml(p.nombre)}</div>
        <div class="price">$${Number(p.precio).toLocaleString('es-AR')}</div>
        <div class="meta"><div class="prod-inicio-prov-dot"></div>${escHtml(p.provNombre)}</div>
      </div>
    </div>`).join('') +
    (hasMore ? `<div style="grid-column:1/-1;padding:4px 0 8px"><button onclick="buscarVerMas()" style="width:100%;background:#eff6f2;border:1.5px solid #DCE8E2;border-radius:14px;padding:14px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:800;color:#065F46;cursor:pointer">Ver ${lista.length - slice.length} productos más →</button></div>` : '');
}

function buscarVerMas() {
  _buscarOffset += 20;
  const el = document.getElementById('prodBuscarGrid');
  if (el) _drawBuscarGrid(el);
}

function switchBuscarTab(tab, el) {
  buscarTab = tab;
  const tabs = ['productos', 'proveedores', 'servicios'];
  const idx = Math.max(0, tabs.indexOf(tab));
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  const target = el || document.getElementById(`tab-${tab}`);
  if (target) target.classList.add('active');
  const tabsEl = document.getElementById('searchTabs');
  if (tabsEl) tabsEl.style.setProperty('--tab-i', idx);
  const pv = document.getElementById('buscar-productos-view');
  const rv = document.getElementById('buscar-proveedores-view');
  const xv = document.getElementById('buscar-servicios-view');
  const sv = document.getElementById('buscarSummary');
  const tip = document.getElementById('buscar-tip');
  const chips = document.getElementById('buscar-chips');
  if (pv) pv.style.display = tab === 'productos' ? 'block' : 'none';
  if (rv) rv.style.display = tab === 'proveedores' ? 'block' : 'none';
  if (xv) xv.style.display = tab === 'servicios' ? 'block' : 'none';
  if (sv) sv.style.display = tab === 'productos' ? 'block' : 'none';
  // Los rubros y el tip de margen son del catálogo mayorista: no aplican a Servicios.
  if (tip) tip.style.display = tab === 'servicios' ? 'none' : 'block';
  if (chips) chips.style.display = tab === 'servicios' ? 'none' : 'flex';
  if (tab === 'productos') renderProdBuscar(currentCat, document.getElementById('searchInput')?.value || '');
  else if (tab === 'servicios') {
    try { localStorage.setItem(SERV_CLAVE_VISTO, '1'); } catch (e) { /* modo privado */ }
    actualizarContadorServicios();
    renderServicios();
  }
  else filterProvs();
}
function heroSearch(text) {
  goTo('buscar');
  if (text && text.trim()) {
    const inp = document.getElementById('searchInput');
    if (inp) { inp.value = text.trim(); applySearchInput(); }
  }
}

function applySearchInput() {
  const val = document.getElementById('searchInput')?.value || '';
  showSearchDropdown(val);
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => {
    if (buscarTab === 'productos') renderProdBuscar(currentCat, val);
    else if (buscarTab === 'servicios') renderServicios();
    else filterProvs();
  }, 200);
}

function onSearchFocus() {
  const val = document.getElementById('searchInput')?.value || '';
  showSearchDropdown(val);
}

function onSearchKeydown(e) {
  if (e.key === 'Enter') {
    const val = (document.getElementById('searchInput')?.value || '').trim();
    if (val.length >= 2) guardarBusqReciente(val);
    hideSearchDropdown();
  } else if (e.key === 'Escape') {
    hideSearchDropdown();
  }
}

function showSearchDropdown(val) {
  const dd = document.getElementById('search-dropdown');
  if (!dd) return;
  const trimmed = val.trim();

  if (!trimmed) {
    const recientes = getBusqRecientes();
    if (!recientes.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px 8px">
        <span style="font-size:.72rem;font-weight:800;color:#6B7A99;text-transform:uppercase;letter-spacing:.06em">Búsquedas recientes</span>
        <button onclick="limpiarBusqRecientes()" style="font-size:.75rem;color:#6B7A99;background:none;border:none;cursor:pointer;padding:0">Limpiar</button>
      </div>` +
      recientes.map(r =>
        `<div onclick="seleccionarSugerencia(this.dataset.texto)" data-texto="${escHtml(r)}"
          style="padding:11px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-top:1px solid #EFF6F2;font-size:.85rem;color:#1A1A1A">
          <span style="color:#9CA3AF">🕐</span>${escHtml(r)}
        </div>`
      ).join('');
    return;
  }

  if (trimmed.length < 2) {
    dd.style.display = 'block';
    dd.innerHTML = '<div style="padding:12px 14px;font-size:.82rem;color:#6B7A99">Seguí escribiendo...</div>';
    return;
  }

  const qn = quitarAcentos(trimmed.toLowerCase());
  const sugs = proveedoresDB.filter(p =>
    p.estado === 'aprobado' && (
      quitarAcentos((p.nombre || '').toLowerCase()).includes(qn) ||
      quitarAcentos((p.rubro || '').toLowerCase()).includes(qn) ||
      quitarAcentos((p.provincia || '').toLowerCase()).includes(qn) ||
      quitarAcentos((p.descripcion || '').toLowerCase()).includes(qn)
    )
  ).slice(0, 5);

  if (!sugs.length) { dd.style.display = 'none'; return; }
  dd.style.display = 'block';
  dd.innerHTML = sugs.map(p =>
    `<div onclick="seleccionarProveedor('${p.id}')"
      style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-top:1px solid #EFF6F2">
      <div style="width:34px;height:34px;border-radius:9px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;color:#065F46;flex-shrink:0;font-family:'Inter',sans-serif">${escHtml(p.nombre.substring(0, 2).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.85rem;font-weight:700;color:#1A1A1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.nombre)}</div>
        <div style="font-size:.72rem;color:#6B7A99">${escHtml(p.rubro || '')}${p.provincia ? ' · ' + escHtml(p.provincia) : ''}</div>
      </div>
    </div>`
  ).join('');
}

function hideSearchDropdown() {
  const dd = document.getElementById('search-dropdown');
  if (dd) dd.style.display = 'none';
}

function seleccionarSugerencia(texto) {
  const inp = document.getElementById('searchInput');
  if (inp) inp.value = texto;
  hideSearchDropdown();
  if (texto.length >= 2) guardarBusqReciente(texto);
  const tabEl = document.getElementById('tab-proveedores');
  if (buscarTab !== 'proveedores' && tabEl) switchBuscarTab('proveedores', tabEl);
  else filterProvs();
}

function seleccionarProveedor(id) {
  hideSearchDropdown();
  const p = proveedoresDB.find(x => String(x.id) === String(id));
  if (p?.nombre) guardarBusqReciente(p.nombre);
  abrirDetalle(id);
}

function getBusqRecientes() {
  try { return JSON.parse(localStorage.getItem(BUSQ_RECIENTES_KEY) || '[]'); } catch { return []; }
}

function guardarBusqReciente(texto) {
  if (!texto || texto.trim().length < 2) return;
  const t = texto.trim();
  let r = getBusqRecientes().filter(x => x.toLowerCase() !== t.toLowerCase());
  r.unshift(t);
  if (r.length > MAX_BUSQ_RECIENTES) r = r.slice(0, MAX_BUSQ_RECIENTES);
  try { localStorage.setItem(BUSQ_RECIENTES_KEY, JSON.stringify(r)); } catch (e) { }
}

function limpiarBusqRecientes() {
  try { localStorage.removeItem(BUSQ_RECIENTES_KEY); } catch (e) { }
  hideSearchDropdown();
}

function abrirDetalleProd(id) {
  const p = getProdLista().find(x => String(x.id) === String(id));
  if (!p) { showToast('Producto no disponible'); return; }
  productoActual = p;
  const _boxIcon = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#F3F4F6"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1.2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;
  const _heartFilled = `<svg width="22" height="22" viewBox="0 0 24 24" fill="#EF4444" stroke="#EF4444" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  const _heartEmpty = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="1.9"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  const _shareIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#065F46" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
  const _imgs = (Array.isArray(p.imagenes) && p.imagenes.length) ? p.imagenes : (p.imgUrl ? [p.imgUrl] : []);
  document.getElementById('prod-det-emoji').innerHTML = `${_imgs.length ? `<img id="prod-det-main-img" src="${escHtml(_imgs[0])}" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display='none'">` : _boxIcon}
    <button class="prod-det-back" onclick="volverDetProd()">← Volver</button>
    <button onclick="event.stopPropagation();shareProducto();" aria-label="Compartir" style="position:absolute;top:14px;right:58px;background:rgba(255,255,255,.9);border:none;border-radius:10px;padding:7px 10px;cursor:pointer;display:flex;align-items:center;justify-content:center">${_shareIcon}</button>
    <button class="prod-det-fav" id="prod-det-fav-btn" onclick="event.stopPropagation();toggleFav(String(productoActual.provId));">${esFav(String(p.provId)) ? _heartFilled : _heartEmpty}</button>`;
  renderProdThumbs(_imgs);
  document.getElementById('prod-det-name').textContent = p.nombre;
  document.getElementById('prod-det-price').textContent = '$' + p.precio.toLocaleString('es-AR') + ' por unidad';
  document.getElementById('prod-det-min').textContent = p.pedido_minimo;
  document.getElementById('prod-det-cat').textContent = p.cat;
  const prov = (proveedoresDB).find(x => String(x.id) === String(p.provId));
  const pav = document.getElementById('prod-det-pav');
  if (pav) {
    if (prov && prov.logo_url) {
      pav.style.background = '#fff';
      pav.style.padding = '0';
      pav.style.overflow = 'hidden';
      pav.innerHTML = `<img src="${escHtml(prov.logo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:9px">`;
    } else {
      pav.style.background = p.provColor;
      pav.style.padding = '';
      pav.style.overflow = '';
      pav.textContent = p.provNombre.substring(0, 2).toUpperCase();
    }
  }
  document.getElementById('prod-det-pname').textContent = p.provNombre;
  document.getElementById('prod-det-psub').textContent = p.provRubro;
  const vc = document.getElementById('pdcalc-venta'), cc = document.getElementById('pdcalc-cant');
  if (vc) vc.value = ''; if (cc) cc.value = '';
  const rc = document.getElementById('pdcalc-result'); if (rc) { rc.style.display = 'none'; rc.textContent = ''; }
  const calcBody = document.getElementById('pdcalc-body'); if (calcBody) calcBody.style.display = 'none';
  const calcCaret = document.getElementById('pdcalc-caret'); if (calcCaret) calcCaret.innerHTML = '&#9662;';
  const waBtn = document.getElementById('prod-det-wa-btn');
  const chatBtn = document.getElementById('prod-det-chat-btn');
  const proConWA = !!(prov && prov.whatsapp);
  if (waBtn) {
    waBtn.style.cssText = 'width:100%;padding:15px;border-radius:14px;background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;font-family:\'Inter\',sans-serif;font-size:1rem;font-weight:800;cursor:pointer;align-items:center;justify-content:center;gap:10px;box-shadow:0 2px 12px rgba(18,140,126,.28);display:' + (proConWA ? 'flex' : 'none');
  }
  if (chatBtn) chatBtn.style.display = 'none';
  renderProdRelacionados(p);
  renderProdBreadcrumb(p);
  _setProdSEO(p);
  goTo('detalle-producto');
}

// ===== Deep-link / SEO / Compartir de producto =====
// Guarda los valores originales del <head> para poder restaurarlos al salir.
const _SEO_DEFAULTS = (() => {
  const get = sel => { const el = document.head.querySelector(sel); return el ? el.getAttribute('content') : null; };
  return {
    title: document.title,
    desc: get('meta[name="description"]'),
    ogTitle: get('meta[property="og:title"]'), ogDesc: get('meta[property="og:description"]'),
    ogUrl: get('meta[property="og:url"]'), ogImg: get('meta[property="og:image"]'),
    twTitle: get('meta[name="twitter:title"]'), twDesc: get('meta[name="twitter:description"]'), twImg: get('meta[name="twitter:image"]')
  };
})();
let _prodSEOactive = false;
function _setMeta(sel, val) { if (val == null) return; const el = document.head.querySelector(sel); if (el) el.setAttribute('content', val); }
function _prodUrl(p) { return location.origin + '/?p=' + encodeURIComponent(p.idReal || p.id); }
function _setProdSEO(p) {
  try {
    history.replaceState(null, '', '/?p=' + encodeURIComponent(p.idReal || p.id));
    const titulo = `${p.nombre} — ${p.provNombre} | EmprendeGO`;
    const desc = `${p.nombre} · $${Number(p.precio || 0).toLocaleString('es-AR')} — ${p.provNombre}. Contactá directo por WhatsApp en EmprendeGO.`;
    document.title = titulo;
    _setMeta('meta[name="description"]', desc);
    _setMeta('meta[property="og:title"]', titulo); _setMeta('meta[property="og:description"]', desc);
    _setMeta('meta[property="og:url"]', _prodUrl(p)); if (p.imgUrl) _setMeta('meta[property="og:image"]', p.imgUrl);
    _setMeta('meta[name="twitter:title"]', titulo); _setMeta('meta[name="twitter:description"]', desc);
    if (p.imgUrl) _setMeta('meta[name="twitter:image"]', p.imgUrl);
    _setProdLD(p);
    _prodSEOactive = true;
  } catch (e) { }
}
// Datos estructurados (schema.org/Product) para resultados enriquecidos en Google.
function _setProdLD(p) {
  try {
    let el = document.getElementById('ld-prod');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'ld-prod'; document.head.appendChild(el); }
    const imgs = (Array.isArray(p.imagenes) && p.imagenes.length) ? p.imagenes : (p.imgUrl ? [p.imgUrl] : undefined);
    const data = {
      '@context': 'https://schema.org', '@type': 'Product',
      name: p.nombre,
      image: imgs,
      description: p.descripcion || undefined,
      brand: { '@type': 'Brand', name: p.provNombre },
      offers: { '@type': 'Offer', price: Number(p.precio || 0), priceCurrency: 'ARS', availability: 'https://schema.org/InStock', url: _prodUrl(p) }
    };
    el.textContent = JSON.stringify(data);
  } catch (e) { }
}
function _resetProdSEO() {
  if (!_prodSEOactive) return;
  _prodSEOactive = false;
  try {
    document.title = _SEO_DEFAULTS.title;
    _setMeta('meta[name="description"]', _SEO_DEFAULTS.desc);
    _setMeta('meta[property="og:title"]', _SEO_DEFAULTS.ogTitle); _setMeta('meta[property="og:description"]', _SEO_DEFAULTS.ogDesc);
    _setMeta('meta[property="og:url"]', _SEO_DEFAULTS.ogUrl); _setMeta('meta[property="og:image"]', _SEO_DEFAULTS.ogImg);
    _setMeta('meta[name="twitter:title"]', _SEO_DEFAULTS.twTitle); _setMeta('meta[name="twitter:description"]', _SEO_DEFAULTS.twDesc);
    _setMeta('meta[name="twitter:image"]', _SEO_DEFAULTS.twImg);
    const ld = document.getElementById('ld-prod'); if (ld) ld.remove();
    if (location.search) history.replaceState(null, '', location.pathname);
  } catch (e) { }
}
// Galería: tira de miniaturas + swap de la imagen principal por índice (evita
// problemas de comillas en URLs). Si hay <2 imágenes, la tira queda oculta.
let _prodGalleryImgs = [];
function renderProdThumbs(imgs) {
  _prodGalleryImgs = Array.isArray(imgs) ? imgs : [];
  const cont = document.getElementById('prod-det-thumbs');
  if (!cont) return;
  if (_prodGalleryImgs.length < 2) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  cont.innerHTML = _prodGalleryImgs.slice(0, 8).map((u, i) =>
    `<img class="pd-thumb" data-i="${i}" src="${escHtml(u)}" onclick="setProdMainImgByIdx(${i}, this)" style="width:54px;height:54px;flex:0 0 auto;object-fit:cover;border-radius:9px;border:2px solid ${i === 0 ? '#065F46' : 'transparent'};cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.08)" onerror="this.style.display='none'">`
  ).join('');
  cont.style.display = 'flex';
}
function setProdMainImgByIdx(i, el) {
  const url = _prodGalleryImgs[i];
  if (!url) return;
  const main = document.getElementById('prod-det-main-img');
  if (main) { main.src = url; main.style.display = 'block'; }
  document.querySelectorAll('#prod-det-thumbs .pd-thumb').forEach(t => { t.style.borderColor = 'transparent'; });
  if (el) el.style.borderColor = '#065F46';
}
function renderProdBreadcrumb(p) {
  const el = document.getElementById('prod-det-breadcrumb');
  if (!el) return;
  el.innerHTML = `<span onclick="goTo('inicio')" style="color:#065F46;cursor:pointer;font-weight:600">Inicio</span>`
    + `<span style="color:#cbd5e1;margin:0 6px">›</span>`
    + `<span style="color:var(--gray)">${escHtml(p.cat || 'Productos')}</span>`
    + `<span style="color:#cbd5e1;margin:0 6px">›</span>`
    + `<span style="color:var(--navy);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;display:inline-block;vertical-align:bottom">${escHtml(p.nombre)}</span>`;
}
async function shareProducto() {
  if (!productoActual) return;
  const p = productoActual;
  const url = _prodUrl(p);
  try {
    if (navigator.share) { await navigator.share({ title: `${p.nombre} — ${p.provNombre}`, text: `${p.nombre} en EmprendeGO`, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); showToast('🔗 Link copiado'); }
  catch (e) { showToast('Copiá el link: ' + url); }
}
function renderProdRelacionados(p) {
  const cont = document.getElementById('prod-det-relacionados');
  if (!cont) return;
  const lista = getProdLista().filter(x => String(x.provId) === String(p.provId) && String(x.id) !== String(p.id));
  if (!lista.length) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  const items = lista.slice(0, 6);
  const _boxIcon = `<div style="height:90px;display:flex;align-items:center;justify-content:center;background:#F3F4F6"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;
  const cards = items.map(pp => {
    const imgHtml = pp.imgUrl
      ? `<img loading="lazy" src="${escHtml(imgThumb(pp.imgUrl, 400, 70))}" style="width:100%;height:90px;object-fit:cover;display:block;background:#F3F4F6" onerror="this.style.display='none'">`
      : _boxIcon;
    return `<div onclick="abrirDetalleProd('${escHtml(String(pp.id))}')" style="background:white;border-radius:12px;overflow:hidden;border:1px solid #eee;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.05)">
      ${imgHtml}
      <div style="padding:8px 9px 10px">
        <div style="font-size:.72rem;font-weight:700;color:#111;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:2rem">${escHtml(pp.nombre)}</div>
        <div style="font-size:.85rem;font-weight:900;color:#006039;margin-top:4px">$${Number(pp.precio || 0).toLocaleString('es-AR')}</div>
      </div>
    </div>`;
  }).join('');
  cont.innerHTML = `
    <div style="border-top:1px solid var(--border);margin-top:4px;padding-top:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px">
        <div style="font-family:'Inter',sans-serif;font-size:1rem;font-weight:800;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Más de ${escHtml(p.provNombre)}</div>
        <button onclick="irAProveedorDesdeProd()" style="background:none;border:none;padding:0;color:#065F46;font-family:'Inter',sans-serif;font-size:.8rem;font-weight:800;cursor:pointer;white-space:nowrap;flex-shrink:0">Ver toda la tienda →</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${cards}
      </div>
    </div>`;
  cont.style.display = 'block';
}
function togglePdCalc() {
  const body = document.getElementById('pdcalc-body');
  const caret = document.getElementById('pdcalc-caret');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (caret) caret.innerHTML = open ? '&#9662;' : '&#9652;';
  if (!open) { const v = document.getElementById('pdcalc-venta'); if (v) v.focus(); }
}
function volverDetProd() { goBack('inicio'); }
function irAProveedorDesdeProd() { if (productoActual) abrirDetalle(productoActual.provId); }
function detWAProd() { if (!productoActual) return; const prov = (proveedoresDB).find(x => String(x.id) === String(productoActual.provId)); if (prov && prov.whatsapp) { registrarContactoWA(productoActual.provId, prov); abrirWA(prov.whatsapp, mensajeWAProd(productoActual, prov)); } else showToast('WhatsApp no disponible'); }
function detChatProd() { if (productoActual) abrirChatDirecto(productoActual.provId); }
function calcProdDet() {
  const costo = productoActual ? productoActual.precio : 0;
  const venta = parseFloat(document.getElementById('pdcalc-venta').value);
  const cant = parseFloat(document.getElementById('pdcalc-cant').value);
  const resEl = document.getElementById('pdcalc-result');
  if (!resEl) return;
  if (!venta || !cant || cant <= 0 || venta <= 0) { resEl.style.display = 'none'; resEl.textContent = ''; return; }
  const inv = costo * cant, tot = venta * cant, gan = tot - inv;
  const mrg = inv > 0 ? Math.round((gan / inv) * 100) : 0;
  const cantTxt = cant === 1 ? '1 unidad' : (cant.toLocaleString('es-AR') + ' unidades');
  const ganColor = gan >= 0 ? 'var(--green)' : '#B91C1C';
  const ganTxt = (gan >= 0 ? '$' : '-$') + Math.abs(gan).toLocaleString('es-AR');
  resEl.innerHTML = 'Vendiendo ' + cantTxt + ' a $' + venta.toLocaleString('es-AR') + ' cada una te quedan <strong style="color:' + ganColor + '">' + ganTxt + '</strong> de ganancia <span style="color:var(--gray)">(margen ' + mrg + '%)</span>.';
  resEl.style.display = 'block';
}

// ===== CHAT REAL PROVEEDOR =====
let convActual = null; // { de_nombre, msgs }

async function cargarConversaciones() {
  if (!currentUser || !currentUser.proveedorId) return;
  const el = document.getElementById('conv-list-el');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-size:.85rem">Cargando...</div>';

  try {
    // Traer todos los mensajes de este proveedor agrupados por remitente
    const { data, error } = await sb
      .from('mensajes')
      .select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || !data.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--gray)"><div style="font-size:2rem;margin-bottom:10px">💬</div><p style="font-size:.85rem;line-height:1.6">Todavía no recibiste mensajes.<br>Cuando un emprendedor te escriba, aparece acá.</p></div>';
      return;
    }

    // Agrupar por de_nombre (conversaciones únicas)
    const convMap = {};
    data.forEach(m => {
      const key = m.de_nombre || 'Anónimo';
      if (!convMap[key]) convMap[key] = { nombre: key, msgs: [], noLeidos: 0, ultimo: m };
      convMap[key].msgs.push(m);
      if (!m.leido && m.de_tipo === 'usuario') convMap[key].noLeidos++;
    });

    const convs = Object.values(convMap);
    const totalNoLeidos = convs.reduce((s, c) => s + c.noLeidos, 0);

    // Actualizar badge del tab
    const badge = document.getElementById('msgs-badge');
    if (badge) badge.classList.toggle('show', totalNoLeidos > 0);

    el.innerHTML = convs.map((c, i) => {
      const ini = c.nombre.substring(0, 2).toUpperCase();
      const ultimo = c.ultimo;
      const preview = (ultimo.texto || '').replace(/\n/g, ' ').substring(0, 50) + (ultimo.texto && ultimo.texto.length > 50 ? '...' : '');
      const tiempo = timeAgo(new Date(ultimo.created_at));
      return `<div class="conv-item ${c.noLeidos > 0 ? 'unread' : ''}" onclick="abrirConvProveedor('${c.nombre.replace(/'/g, "\'")}')">
        <div class="conv-avatar">${ini}</div>
        <div class="conv-info">
          <div class="conv-name">${c.nombre}</div>
          <div class="conv-preview">${preview}</div>
        </div>
        <div class="conv-meta">
          <div class="conv-time">${tiempo}</div>
          ${c.noLeidos > 0 ? `<div class="conv-unread-badge">${c.noLeidos}</div>` : ''}
        </div>
      </div>`;
    }).join('');

  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-size:.85rem">Error cargando mensajes.</div>';
  }
}

async function abrirConvProveedor(nombre) {
  convActual = { nombre, msgs: [], usuarioEmail: null };
  document.getElementById('prov-chat-nombre').textContent = nombre;
  document.getElementById('prov-chat-sub').textContent = 'Emprendedor';
  const msgsEl = document.getElementById('prov-chat-msgs');
  msgsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:.82rem">Cargando...</div>';
  document.getElementById('provChatModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  try {
    // Traer mensajes del usuario en esta conversacion
    const { data: msgsUsuario } = await sb.from('mensajes').select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_nombre', nombre)
      .eq('de_tipo', 'usuario')
      .order('created_at', { ascending: true });

    // Guardar email del usuario para filtrar solo sus respuestas
    convActual.usuarioEmail = msgsUsuario?.[0]?.usuario_email || null;

    const { data: msgsProveedor } = await sb.from('mensajes').select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_tipo', 'proveedor')
      .eq('usuario_email', convActual.usuarioEmail)
      .order('created_at', { ascending: true });

    // Combinar y ordenar por fecha
    const todos = [...(msgsUsuario || []), ...(msgsProveedor || [])];
    todos.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    convActual.msgs = todos;

    // Marcar como leidos los del usuario
    await sb.from('mensajes').update({ leido: true })
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_nombre', nombre).eq('de_tipo', 'usuario');
    renderProvChat();
  } catch (e) {
    msgsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray)">Error cargando mensajes.</div>';
  }
}

function renderProvChat() {
  const el = document.getElementById('prov-chat-msgs');
  if (!el || !convActual) return;
  if (!convActual.msgs.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray);font-size:.85rem">No hay mensajes aún.</div>';
    return;
  }
  el.innerHTML = convActual.msgs.map(m => {
    const esProveedor = m.de_tipo === 'proveedor';
    const tipo = esProveedor ? 'sent' : 'recv';
    const hora = m.created_at ? timeAgo(new Date(m.created_at)) : 'Ahora';
    const nombre = !esProveedor ? `<div style="font-size:.68rem;font-weight:700;color:var(--blue);margin-bottom:3px">${escHtml(m.de_nombre || 'Emprendedor')}</div>` : '';
    return `<div style="display:flex;flex-direction:column;align-items:${esProveedor ? 'flex-end' : 'flex-start'}">
      ${nombre}
      <div class="chat-msg ${tipo}">${escHtml(m.texto || '').replace(/\n/g, '<br>')}<div class="chat-msg-time">${escHtml(hora)}</div></div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function provSendMsg() {
  const inp = document.getElementById('prov-chat-inp');
  const txt = inp.value.trim();
  if (!txt || !convActual || !currentUser) return;
  inp.value = '';

  const nuevoMsg = {
    proveedor_id: currentUser.proveedorId,
    de_tipo: 'proveedor',
    de_nombre: currentUser.name,
    usuario_email: convActual.usuarioEmail,
    texto: txt,
    leido: false
  };

  // Agregar al chat localmente
  convActual.msgs.push({ ...nuevoMsg, created_at: new Date().toISOString() });
  renderProvChat();

  // Guardar en Supabase
  try {
    await sb.from('mensajes').insert(nuevoMsg);
  } catch (e) { }
}

function closeProvChat() {
  document.getElementById('provChatModal').classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => cargarConversaciones(), 200);
}
function closeProvChatOnBg(e) {
  if (e.target === document.getElementById('provChatModal')) closeProvChat();
}

// ===== CARRITO =====
let carrito = []; // { producto, cantidad, provId, provNombre, provWA, provPro }
let carritoProvId = null; // Solo un proveedor por pedido

function agregarAlCarrito() {
  if (!productoActual) return;

  // Verificar que sea del mismo proveedor
  if (carritoProvId && carritoProvId !== String(productoActual.provId)) {
    showToast('Solo podés pedir a un proveedor a la vez. Vaciá el carrito primero.');
    return;
  }

  // Buscar proveedor real para obtener WA real
  const lista = proveedoresDB;
  const prov = lista.find(x => String(x.id) === String(productoActual.provId));

  const existente = carrito.find(i => i.producto.id === productoActual.id);
  if (existente) {
    existente.cantidad++;
  } else {
    carrito.push({
      producto: { ...productoActual },
      cantidad: 1,
      provId: String(productoActual.provId),
      provNombre: productoActual.provNombre,
      provWA: prov?.whatsapp || '',
      provPro: prov?.pro || false
    });
    carritoProvId = String(productoActual.provId);
  }

  actualizarCarritoFab();
  showToast('✓ Agregado al pedido');
}

function actualizarCarritoFab() {
  const fab = document.getElementById('carritoFab');
  const cnt = document.getElementById('carritoCount');
  const total = carrito.reduce((s, i) => s + i.cantidad, 0);
  fab.classList.toggle('show', carrito.length > 0);
  cnt.textContent = total;
}

function openCarrito() {
  renderCarrito();
  document.getElementById('carritoModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCarrito() {
  document.getElementById('carritoModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeCarritoOnBg(e) {
  if (e.target === document.getElementById('carritoModal')) closeCarrito();
}

function cambiarCantidad(idx, delta) {
  carrito[idx].cantidad += delta;
  if (carrito[idx].cantidad <= 0) carrito.splice(idx, 1);
  if (!carrito.length) carritoProvId = null;
  actualizarCarritoFab();
  renderCarrito();
}

function limpiarCarrito() {
  carrito = [];
  carritoProvId = null;
  actualizarCarritoFab();
  closeCarrito();
  showToast('Pedido vaciado');
}

function renderCarrito() {
  if (!carrito.length) { closeCarrito(); return; }

  const item0 = carrito[0];
  const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D'];

  // Info proveedor
  const avatarEl = document.getElementById('carrito-prov-avatar');
  const nameEl = document.getElementById('carrito-prov-name');
  if (avatarEl) {
    const prov = (proveedoresDB || []).find(x => String(x.id) === String(item0.provId));
    if (prov && prov.logo_url) {
      avatarEl.style.background = '#fff';
      avatarEl.style.overflow = 'hidden';
      avatarEl.innerHTML = `<img src="${escHtml(prov.logo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" alt="">`;
    } else {
      avatarEl.innerHTML = '';
      avatarEl.textContent = item0.provNombre.substring(0, 2).toUpperCase();
      avatarEl.style.background = _monoColor(item0.provId);
    }
  }
  if (nameEl) nameEl.textContent = item0.provNombre;

  // Items
  const itemsEl = document.getElementById('carrito-items');
  itemsEl.innerHTML = carrito.map((item, idx) => `
    <div class="carrito-item">
      <div style="width:42px;height:42px;border-radius:10px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
        ${item.producto.imgUrl ? `<img src="${item.producto.imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`}
      </div>
      <div class="carrito-item-info">
        <div class="carrito-item-name">${item.producto.nombre}</div>
        <div class="carrito-item-price">$${Number(item.producto.precio).toLocaleString('es-AR')} c/u · Total: $${Number(item.producto.precio * item.cantidad).toLocaleString('es-AR')}</div>
      </div>
      <div class="carrito-qty">
        <button class="qty-btn" onclick="cambiarCantidad(${idx},-1)">−</button>
        <span class="qty-num">${item.cantidad}</span>
        <button class="qty-btn" onclick="cambiarCantidad(${idx},1)">+</button>
      </div>
    </div>`).join('');

  // Totales
  const subtotal = carrito.reduce((s, i) => s + (i.producto.precio * i.cantidad), 0);
  const unidades = carrito.reduce((s, i) => s + i.cantidad, 0);
  document.getElementById('carrito-subtotal').textContent = '$' + subtotal.toLocaleString('es-AR');
  document.getElementById('carrito-unidades').textContent = unidades + ' unidades';
  document.getElementById('carrito-total').textContent = '$' + subtotal.toLocaleString('es-AR');

  // Botones según plan
  const actionsEl = document.getElementById('carrito-actions');
  const tieneWA = item0.provWA && item0.provWA.trim() !== '';

  if (tieneWA) {
    actionsEl.innerHTML = `<button class="carrito-wa-btn" onclick="enviarPedidoPorWA()"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.582 0 11.942-5.359 11.945-11.893a11.821 11.821 0 00-3.418-8.452z"/></svg> Enviar pedido por WhatsApp</button>`;
  } else {
    actionsEl.innerHTML = `<div class="pro-lock"><div class="pro-lock-text">Este proveedor todavía no tiene WhatsApp configurado. Probá con otro proveedor o volvé más tarde.</div></div>`;
  }
}

function generarMensajePedido() {
  const item0 = carrito[0];
  let msg = `Hola! Te hago un pedido desde EmprendeGo 🚀

`;
  carrito.forEach(item => {
    msg += `📦 ${item.producto.nombre} x${item.cantidad} = $${Number(item.producto.precio * item.cantidad).toLocaleString('es-AR')}
`;
  });
  const total = carrito.reduce((s, i) => s + (i.producto.precio * i.cantidad), 0);
  msg += `
💰 Total estimado: $${total.toLocaleString('es-AR')}
`;
  const comprador = getCompradorInfo();
  if (comprador) {
    msg += `
👤 ${comprador.nombre}`;
    if (comprador.whatsapp) msg += ` · 📱 ${comprador.whatsapp}`;
    msg += `
`;
  }
  msg += `
¿Podés confirmar disponibilidad y formas de pago? Gracias!`;
  return msg;
}

// Datos del comprador invitado (sin login), recordados entre pedidos.
let datosInvitado = null;
try { datosInvitado = JSON.parse(localStorage.getItem('eg_invitado') || 'null'); } catch (e) { }
let _pedidoPendiente = null; // función a ejecutar tras cargar datos del invitado

// Devuelve el nombre/email/whatsapp del comprador, o null si falta info.
function getCompradorInfo() {
  if (currentUser) {
    return { nombre: currentUser.name || currentUser.email || 'Comprador', email: currentUser.email || '', whatsapp: '' };
  }
  if (datosInvitado && datosInvitado.nombre && datosInvitado.whatsapp) {
    return { nombre: datosInvitado.nombre, email: '', whatsapp: datosInvitado.whatsapp };
  }
  return null;
}

// Si no tenemos datos del comprador, abre el modal de invitado y guarda la
// acción pendiente para reintentarla al confirmar. Devuelve true si ya hay datos.
function asegurarDatosComprador(accion) {
  if (getCompradorInfo()) return true;
  _pedidoPendiente = accion;
  openInvitadoModal();
  return false;
}

function openInvitadoModal() {
  document.getElementById('invitado-nombre-input').value = (datosInvitado && datosInvitado.nombre) || '';
  document.getElementById('invitado-wa-input').value = (datosInvitado && datosInvitado.whatsapp) || '';
  document.getElementById('invitadoModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeInvitadoModal() {
  document.getElementById('invitadoModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeInvitadoOnBg(e) { if (e.target === document.getElementById('invitadoModal')) closeInvitadoModal(); }

function confirmarDatosInvitado() {
  const nombre = document.getElementById('invitado-nombre-input').value.trim();
  const whatsapp = document.getElementById('invitado-wa-input').value.trim();
  if (!nombre) { showToast('Escribí tu nombre'); return; }
  if (!whatsapp || whatsapp.replace(/\D/g, '').length < 8) { showToast('Escribí un WhatsApp válido'); return; }
  datosInvitado = { nombre, whatsapp };
  try { localStorage.setItem('eg_invitado', JSON.stringify(datosInvitado)); } catch (e) { }
  closeInvitadoModal();
  const accion = _pedidoPendiente;
  _pedidoPendiente = null;
  if (typeof accion === 'function') accion();
}

async function guardarPedido() {
  try {
    const item0 = carrito[0];
    const comprador = getCompradorInfo() || { nombre: 'Anónimo', email: '', whatsapp: '' };
    const total = carrito.reduce((s, i) => s + (i.producto.precio * i.cantidad), 0);
    const items = JSON.stringify(carrito.map(i => ({
      nombre: i.producto.nombre,
      precio: i.producto.precio,
      cantidad: i.cantidad,
      subtotal: i.producto.precio * i.cantidad
    })));
    await sb.from('pedidos').insert({
      proveedor_id: String(item0.provId),
      comprador_nombre: comprador.nombre,
      comprador_email: comprador.email,
      comprador_whatsapp: comprador.whatsapp,
      items,
      total,
      estado: 'pendiente'
    });
  } catch (e) { }
}

function enviarPedidoPorWA() {
  const item0 = carrito[0];
  if (!item0.provWA) { showToast('Este proveedor no tiene WhatsApp configurado'); return; }
  if (!asegurarDatosComprador(enviarPedidoPorWA)) return;
  const num = normalizarWAArg(item0.provWA);
  const msg = generarMensajePedido();
  guardarPedido();
  registrarContactoWA(item0.provId);
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  closeCarrito();
}

function enviarPedidoPorChat() {
  const item0 = carrito[0];
  if (!asegurarDatosComprador(enviarPedidoPorChat)) return;
  guardarPedido();
  closeCarrito();
  abrirChatDirecto(item0.provId);
  setTimeout(() => {
    const inp = document.getElementById('chat-inp');
    if (inp) inp.value = generarMensajePedido();
  }, 400);
}

const ESTADOS_PEDIDO = ['pendiente', 'confirmado', 'pago recibido', 'en preparacion', 'enviado'];
let pedidosCache = [];
const ESTADO_COLOR = {
  pendiente: '#F59E0B', confirmado: '#16A34A', cancelado: '#ef4444',
  'pago recibido': '#065F46', 'en preparacion': '#047857', enviado: '#006039', archivado: '#999'
};
const ESTADO_LABEL = {
  pendiente: 'Pendiente', confirmado: 'Confirmado', cancelado: 'Cancelado',
  'pago recibido': 'Pago recibido', 'en preparacion': 'En preparación', enviado: 'Enviado', archivado: 'Archivado'
};
let pedidoActual = null;

async function cargarPedidosRecientes() {
  const el = document.getElementById('dash-pedidos-list');
  if (!el || !currentUser?.proveedorId) return;
  try {
    const { data } = await sb.from('pedidos')
      .select('*')
      .eq('proveedor_id', String(currentUser.proveedorId))
      .neq('estado', 'archivado')
      .order('created_at', { ascending: false })
      .limit(10);
    pedidosCache = data || [];
    if (!pedidosCache.length) {
      el.innerHTML = `<div style="background:white;border-radius:12px;padding:14px;border:1.5px solid #eee;display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:10px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:1.2rem">📦</div>
        <div><div style="font-size:.82rem;font-weight:700;color:#111">Todavía no recibiste pedidos</div>
        <div style="font-size:.72rem;color:#999">Los pedidos del carrito aparecen acá</div></div>
      </div>`;
      return;
    }
    el.innerHTML = pedidosCache.map((p, idx) => {
      const items = (() => { try { return JSON.parse(p.items); } catch (e) { return []; } })();
      const resumen = items.map(i => `${i.nombre} x${i.cantidad}`).join(', ');
      const fecha = new Date(p.created_at);
      const hace = Math.floor((Date.now() - fecha) / 60000);
      const tiempo = hace < 60 ? 'Hace ' + hace + ' min' : hace < 1440 ? 'Hace ' + Math.floor(hace / 60) + 'h' : fecha.toLocaleDateString('es-AR');
      const color = ESTADO_COLOR[p.estado] || '#999';
      const label = ESTADO_LABEL[p.estado] || p.estado;
      return `<div onclick="abrirDetallePedido(${idx})" style="background:white;border-radius:12px;padding:14px;border:1.5px solid #eee;cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:.82rem;font-weight:800;color:#111">${p.comprador_nombre || 'Comprador'}</div>
          <span style="font-size:.65rem;font-weight:800;background:${color}22;color:${color};padding:2px 8px;border-radius:20px">${label}</span>
        </div>
        <div style="font-size:.75rem;color:#555;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${resumen}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:.9rem;font-weight:900;color:#006039">$${Number(p.total).toLocaleString('es-AR')}</div>
          <div style="font-size:.68rem;color:#065F46;font-weight:700">${tiempo} · Ver detalle →</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:#999;font-size:.82rem">Error al cargar pedidos</div>';
  }
}

function abrirDetallePedido(idx) {
  const p = typeof idx === 'number' ? pedidosCache[idx] : idx;
  if (!p) return;
  pedidoActual = p;
  const items = (() => { try { return JSON.parse(p.items); } catch (e) { return []; } })();
  const fecha = new Date(p.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const color = ESTADO_COLOR[p.estado] || '#999';
  const label = ESTADO_LABEL[p.estado] || p.estado;

  document.getElementById('pedido-det-titulo').textContent = 'Pedido #' + String(p.id).slice(-4);

  // Progreso
  const pasos = ESTADOS_PEDIDO;
  const idxActual = pasos.indexOf(p.estado);
  document.getElementById('pedido-det-progreso').innerHTML = `
    <div style="display:flex;align-items:center;gap:0;margin:16px 0 8px">
      ${pasos.map((s, i) => {
    const done = i <= idxActual && p.estado !== 'cancelado';
    const lbl = ESTADO_LABEL[s] || s;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="width:22px;height:22px;border-radius:50%;background:${done ? '#006039' : '#eee'};display:flex;align-items:center;justify-content:center;font-size:.65rem;color:${done ? 'white' : '#999'};font-weight:800;position:relative;z-index:1">${done ? '✓' : (i + 1)}</div>
          <div style="font-size:.55rem;color:${done ? '#006039' : '#aaa'};font-weight:700;text-align:center;line-height:1.2">${lbl.replace('en preparacion', 'En prep.')}</div>
        </div>${i < pasos.length - 1 ? `<div style="height:2px;flex:1;background:${i < idxActual && p.estado !== 'cancelado' ? '#006039' : '#eee'};margin-bottom:14px;margin-top:10px"></div>` : ''}`;
  }).join('')}
    </div>
    ${p.estado === 'cancelado' ? '<div style="background:#fff0f0;color:#ef4444;border-radius:10px;padding:8px 12px;font-size:.78rem;font-weight:700;text-align:center">Pedido cancelado</div>' : ''}
  `;

  // Comprador
  document.getElementById('pedido-det-comprador').innerHTML = `
    <div style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Comprador</div>
    <div style="font-size:.88rem;font-weight:800;color:#111">${p.comprador_nombre || 'Anónimo'}</div>
    ${p.comprador_email ? `<div style="font-size:.75rem;color:#666;margin-top:2px">${p.comprador_email}</div>` : ''}
    ${p.comprador_whatsapp ? `<a href="https://wa.me/${normalizarWAArg(p.comprador_whatsapp)}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;font-size:.78rem;color:#16A34A;font-weight:800;margin-top:4px;text-decoration:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>${escHtml(p.comprador_whatsapp)}</a>` : ''}
    <div style="font-size:.72rem;color:#999;margin-top:4px">${fecha}</div>
  `;

  // Items
  document.getElementById('pedido-det-items').innerHTML = `
    <div style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Productos</div>
    ${items.map(i => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0">
      <div>
        <div style="font-size:.82rem;font-weight:700;color:#111">${i.nombre}</div>
        <div style="font-size:.72rem;color:#999">x${i.cantidad} · $${Number(i.precio).toLocaleString('es-AR')} c/u</div>
      </div>
      <div style="font-size:.88rem;font-weight:900;color:#006039">$${Number(i.subtotal).toLocaleString('es-AR')}</div>
    </div>`).join('')}
  `;

  // Total
  document.getElementById('pedido-det-total').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:.85rem;font-weight:700;color:#006039">Total del pedido</div>
      <div style="font-size:1.1rem;font-weight:900;color:#006039">$${Number(p.total).toLocaleString('es-AR')}</div>
    </div>
  `;

  // Acciones según estado
  renderAccionesPedido(p);
  document.getElementById('pedidoDetalleModal').classList.add('open');
}

function renderAccionesPedido(p) {
  const el = document.getElementById('pedido-det-acciones');
  if (!el) return;
  const siguiente = { pendiente: 'confirmado', confirmado: 'pago recibido', 'pago recibido': 'en preparacion', 'en preparacion': 'enviado' };
  const btnLabel = { confirmado: '✓ Confirmar pedido', 'pago recibido': '💳 Marcar pago recibido', 'en preparacion': '📦 En preparación', enviado: '🚀 Marcar como enviado' };
  const sigEstado = siguiente[p.estado];
  el.innerHTML = `
    ${sigEstado ? `<button onclick="avanzarEstadoPedido('${p.id}','${sigEstado}')" style="width:100%;background:#006039;color:white;border:none;border-radius:12px;padding:14px;font-family:'Inter',sans-serif;font-size:.88rem;font-weight:800;cursor:pointer">${btnLabel[sigEstado]}</button>` : ''}
    ${p.estado === 'pendiente' ? `<button onclick="avanzarEstadoPedido('${p.id}','cancelado')" style="width:100%;background:#fff0f0;color:#ef4444;border:none;border-radius:12px;padding:12px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer">✕ Cancelar pedido</button>` : ''}
    ${['enviado', 'cancelado'].includes(p.estado) ? `<button onclick="avanzarEstadoPedido('${p.id}','archivado')" style="width:100%;background:#f5f5f5;color:#666;border:none;border-radius:12px;padding:12px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer">🗂 Archivar pedido</button>` : ''}
    ${!['enviado', 'cancelado', 'archivado'].includes(p.estado) ? `<button onclick="avanzarEstadoPedido('${p.id}','archivado')" style="width:100%;background:#f5f5f5;color:#999;border:none;border-radius:12px;padding:10px;font-family:'Inter',sans-serif;font-size:.78rem;font-weight:600;cursor:pointer">Archivar</button>` : ''}
  `;
}

async function avanzarEstadoPedido(id, estado) {
  showToast('Actualizando...');
  try {
    const idVal = isNaN(Number(id)) ? id : Number(id);
    const { error } = await sb.from('pedidos').update({ estado }).eq('id', idVal);
    if (error) { showToast('Error: ' + error.message); return; }
    pedidoActual = { ...pedidoActual, estado };
    if (estado === 'archivado') { cerrarDetallePedido(); showToast('Pedido archivado'); }
    else { renderAccionesPedido(pedidoActual); abrirDetallePedido(pedidoActual); showToast('Estado actualizado ✓'); }
    cargarPedidosRecientes();
  } catch (e) { showToast('Error: ' + (e?.message || 'desconocido')); }
}

function cerrarDetallePedido() {
  document.getElementById('pedidoDetalleModal').classList.remove('open');
  pedidoActual = null;
}

async function verPedidosArchivados() {
  const el = document.getElementById('dash-pedidos-list');
  if (!el || !currentUser?.proveedorId) return;
  const { data } = await sb.from('pedidos')
    .select('*')
    .eq('proveedor_id', String(currentUser.proveedorId))
    .eq('estado', 'archivado')
    .order('created_at', { ascending: false });
  pedidosCache = data || [];
  if (!pedidosCache.length) { showToast('No tenés pedidos archivados'); return; }
  el.innerHTML = `<div style="font-size:.75rem;color:#999;font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between">
    <span>🗂 Pedidos archivados</span>
    <span onclick="cargarPedidosRecientes()" style="color:#006039;cursor:pointer">← Ver activos</span>
  </div>` + pedidosCache.map((p, idx) => {
    const items = (() => { try { return JSON.parse(p.items); } catch (e) { return []; } })();
    const resumen = items.map(i => `${i.nombre} x${i.cantidad}`).join(', ');
    const fecha = new Date(p.created_at).toLocaleDateString('es-AR');
    return `<div onclick="abrirDetallePedido(${idx})" style="background:#f8f8f8;border-radius:12px;padding:14px;border:1.5px solid #eee;cursor:pointer;opacity:.8">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:.82rem;font-weight:800;color:#555">${p.comprador_nombre || 'Comprador'}</div>
        <span style="font-size:.65rem;color:#999;font-weight:700">${fecha}</span>
      </div>
      <div style="font-size:.72rem;color:#999;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${resumen}</div>
      <div style="font-size:.88rem;font-weight:900;color:#999">$${Number(p.total).toLocaleString('es-AR')}</div>
    </div>`;
  }).join('');
}


// ===== UPLOAD AVATARES =====
async function subirAvatar(file, carpeta) {
  if (!file) return null;
  if (file.size > 3 * 1024 * 1024) { showToast('La imagen es muy grande. Máx 3MB'); return null; }
  // Logos/avatares: máx 200px de ancho, calidad 0.75.
  file = await comprimirImagen(file, 200, 0.75);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  // Nombre único para evitar conflictos
  const path = carpeta + '/' + Math.random().toString(36).substring(2) + '_' + Date.now() + '.' + ext;
  try {
    const { data, error } = await sb.storage.from('Avatares').upload(path, file);
    if (error) {
      console.error('Storage error:', error);
      showToast('Error al subir: ' + (error.message || 'intenta de nuevo'));
      return null;
    }
    const { data: urlData } = sb.storage.from('Avatares').getPublicUrl(path);
    return urlData.publicUrl;
  } catch (e) {
    showToast('Error al subir imagen');
    return null;
  }
}

async function subirAvatarUsuario(input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Subiendo foto...');
  const url = await subirAvatar(file, 'usuarios');
  if (!url) return;
  // Mostrar en la UI
  const img = document.getElementById('user-avatar-img');
  img.src = url;
  img.style.display = 'block';
  document.getElementById('user-avatar-placeholder').style.display = 'none';
  // Guardar en Supabase
  try {
    if (currentUser?.email) {
      await sb.from('usuarios').upsert({ email: currentUser.email, foto_url: url }, { onConflict: 'email' });
    }
  } catch (e) { }
  showToast('✓ Foto actualizada');
}

async function subirLogoProveedor(input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Subiendo logo...');
  const url = await subirAvatar(file, 'proveedores');
  if (!url) return;
  // Mostrar en la UI
  const img = document.getElementById('dash-avatar-img');
  if (img) { img.src = url; img.style.display = 'block'; }
  const initials = document.getElementById('dash-avatar-initials');
  if (initials) initials.style.display = 'none';
  // Guardar en Supabase y sincronizar estado local
  try {
    if (currentUser?.proveedorId) {
      await sb.from('proveedores').update({ logo_url: url }).eq('id', currentUser.proveedorId);
      if (currentUser.provData) currentUser.provData.logo_url = url;
      const prev = document.getElementById('edit-logo-preview'); if (prev) { prev.src = url; prev.style.display = 'block'; }
      const ph = document.getElementById('edit-logo-ph'); if (ph) ph.style.display = 'none';
      calcularCompletitudPerfil();
    }
  } catch (e) { }
  showToast('✓ Logo actualizado');
}

async function cargarAvatarUsuario() {
  if (!currentUser?.email) return;
  try {
    const { data } = await sb.from('usuarios').select('foto_url').eq('email', currentUser.email).single();
    if (data?.foto_url) {
      const img = document.getElementById('user-avatar-img');
      if (img) { img.src = data.foto_url; img.style.display = 'block'; }
      const ph = document.getElementById('user-avatar-placeholder');
      if (ph) ph.style.display = 'none';
    }
  } catch (e) { }
}

async function cargarLogoProveedor() {
  if (!currentUser?.proveedorId) return;
  try {
    const { data } = await sb.from('proveedores').select('logo_url').eq('id', currentUser.proveedorId).single();
    if (data?.logo_url) {
      const img = document.getElementById('dash-avatar-img');
      if (img) { img.src = data.logo_url; img.style.display = 'block'; }
      const initials = document.getElementById('dash-avatar-initials');
      if (initials) initials.style.display = 'none';
      if (currentUser.provData) currentUser.provData.logo_url = data.logo_url;
      const prev = document.getElementById('edit-logo-preview'); if (prev) { prev.src = data.logo_url; prev.style.display = 'block'; }
      const ph = document.getElementById('edit-logo-ph'); if (ph) ph.style.display = 'none';
      calcularCompletitudPerfil();
    }
  } catch (e) { }
}

async function guardarCambiosPerfil() {
  if (!currentUser?.proveedorId) return;
  const nombre = (document.getElementById('edit-nombre')?.value || '').trim();
  const desc = (document.getElementById('edit-desc')?.value || '').trim();
  const wa = normalizarWAArg((document.getElementById('edit-wa')?.value || '').trim());
  const ig = (document.getElementById('edit-instagram')?.value || '').trim();
  const rubro = getRubrosSeleccionados('edit-rubros-picker').join(', ') || (currentUser.provData?.rubro || '');
  if (!nombre) { showToast('El nombre no puede estar vacío'); return; }
  showToast('Guardando...');
  try {
    const { error } = await sb.from('proveedores').update({ nombre, descripcion: desc, whatsapp: wa, instagram: ig, rubro }).eq('id', currentUser.proveedorId);
    if (error) throw error;
    if (currentUser.provData) {
      currentUser.provData.nombre = nombre;
      currentUser.provData.descripcion = desc;
      currentUser.provData.whatsapp = wa;
      currentUser.provData.instagram = ig;
      currentUser.provData.rubro = rubro;
    }
    currentUser.name = nombre;
    updateTopbar();
    const dn = document.getElementById('dash-nombre'); if (dn) dn.textContent = nombre;
    calcularCompletitudPerfil();
    showToast('✓ Cambios guardados');
  } catch (e) { showToast('Error al guardar'); }
}

// ===== EXCEL IMPORT =====
let excelData = null;
let excelHeaders = [];
let excelColMap = {};
let excelCatMapping = {};

function descargarTemplateExcel() {
  if (typeof XLSX === 'undefined') { showToast('Cargando librería...'); return; }
  const ws = XLSX.utils.aoa_to_sheet([
    ['nombre', 'descripcion', 'precio', 'stock', 'categoria'],
    ['Remera básica algodón', 'Remera unisex 100% algodón, talles S al XL', '2500', '100', 'Moda'],
    ['Zapatillas deportivas', 'Talle 36 al 44, varios colores', '8500', '50', 'Moda'],
    ['Auriculares inalámbricos', 'Bluetooth 5.0, batería 20hs', '4200', '30', 'Tecnología'],
  ]);
  ws['!cols'] = [{ wch: 28 }, { wch: 35 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'template_productos_emprendego.xlsx');
  showToast('✓ Template descargado');
}

function leerExcelImport(input) {
  const file = input.files[0];
  if (!file) return;
  if (!esProvPro()) { input.value = ''; showModalPro('Carga por Excel'); return; }
  if (typeof XLSX === 'undefined') { showToast('Cargando librería...'); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      if (!jsonData.length) { showToast('El archivo está vacío'); return; }
      excelData = jsonData;
      excelHeaders = Object.keys(jsonData[0]);
      excelColMap = autoDetectCols(excelHeaders);
      excelCatMapping = {};
      document.getElementById('excel-result').style.display = 'none';
      renderExcelStep2();
    } catch (err) {
      showToast('Error al leer el archivo. Verificá que sea un Excel válido.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderExcelStep2() {
  document.getElementById('excel-step1').style.display = 'none';
  const wizard = document.getElementById('excel-wizard');
  wizard.style.display = 'block';

  const preview = excelData.slice(0, 3);
  const previewCols = Object.keys(preview[0] || {}).slice(0, 5);
  const previewHTML = preview.length ? `
    <div style="overflow-x:auto;border:1px solid #dfe8e3;border-radius:10px;margin:10px 0 14px">
      <table style="width:100%;border-collapse:collapse;font-size:.68rem">
        <thead><tr>${previewCols.map(h => `<th style="padding:6px 10px;background:#eff6f2;border-bottom:1px solid #dfe8e3;text-align:left;font-weight:800;color:#065F46;white-space:nowrap">${escHtml(String(h))}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(row => `<tr>${previewCols.map(h => `<td style="padding:6px 10px;border-bottom:1px solid #f4f7ff;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis">${escHtml(String(row[h] || ''))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>` : '';

  const detected = [];
  if (excelColMap.nombre) detected.push('Nombre → <strong>' + escHtml(excelColMap.nombre) + '</strong>');
  if (excelColMap.precio) detected.push('Precio → <strong>' + escHtml(excelColMap.precio) + '</strong>');

  const colOpts = (field, label, required) => {
    const cur = excelColMap[field] || '';
    return `<div class="form-group">
      <label>${label}${required ? ' *' : ' <span style="font-weight:400;color:#999">(opcional)</span>'}</label>
      <select style="width:100%;border:1.5px solid #dfe8e3;border-radius:10px;padding:9px 12px;font-family:\'DM Sans\',sans-serif;font-size:.85rem"
        onchange="excelColMap['${field}'] = this.value">
        <option value="">${required ? '— Seleccioná columna —' : '— No importar —'}</option>
        ${excelHeaders.map(h => `<option value="${escHtml(h)}" ${h === cur ? 'selected' : ''}>${escHtml(h)}</option>`).join('')}
      </select>
    </div>`;
  };

  wizard.innerHTML = `
    <div style="font-size:.82rem;font-weight:800;color:#006039;margin-bottom:6px">📄 ${excelData.length} filas detectadas</div>
    ${previewHTML}
    ${detected.length ? `<div style="background:#e8f5ee;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:.78rem;color:#006039">✓ Detectamos: ${detected.join(' · ')}</div>` : ''}
    <div style="font-size:.82rem;font-weight:700;color:#374151;margin-bottom:10px">Confirmá las columnas:</div>
    ${colOpts('nombre', 'Nombre del producto', true)}
    ${colOpts('precio', 'Precio', true)}
    ${colOpts('stock', 'Stock', false)}
    ${colOpts('descripcion', 'Descripción', false)}
    ${colOpts('categoria', 'Categoría del Excel', false)}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button onclick="excelBack(2)" style="flex:1;background:#eff6f2;color:#065F46;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer">← Volver</button>
      <button onclick="confirmarColumnasExcel()" style="flex:2;background:#006039;color:white;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:800;cursor:pointer">Continuar →</button>
    </div>`;
}

function confirmarColumnasExcel() {
  if (!excelColMap.nombre || !excelColMap.precio) { showToast('Seleccioná al menos Nombre y Precio'); return; }
  const wizard = document.getElementById('excel-wizard');
  const hasCatCol = !!excelColMap.categoria;
  const total = excelData.length;
  const catOpts = CAT_PRINCIPAL.map(c => `<option value="${c}">${c}</option>`).join('');

  let catContent;
  if (hasCatCol) {
    const uniqueCats = [...new Set(excelData.map(r => String(r[excelColMap.categoria] || '').trim()).filter(Boolean))];
    uniqueCats.forEach(rawCat => {
      const s = mapExcelCat(rawCat);
      if (s) excelCatMapping[rawCat] = s;
    });
    catContent = `
      <div style="font-size:.82rem;font-weight:700;color:#374151;margin-bottom:12px">Mapeá las categorías de tu Excel:</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${uniqueCats.map(rawCat => `
          <div style="display:flex;align-items:center;gap:10px;background:#f8fafc;border-radius:8px;padding:8px 10px">
            <span style="font-size:.8rem;flex:1;color:#374151;font-weight:600">${escHtml(rawCat)}</span>
            <span style="color:#9CA3AF;font-size:.9rem">→</span>
            <select onchange="excelCatMapping[${JSON.stringify(rawCat)}] = this.value"
              style="flex:1;border:1.5px solid #dfe8e3;border-radius:8px;padding:6px 8px;font-size:.78rem;max-width:140px">
              <option value="">Seleccioná...</option>
              ${CAT_PRINCIPAL.map(c => `<option value="${c}" ${(excelCatMapping[rawCat] || '') === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>`;
  } else {
    catContent = `
      <div style="font-size:.82rem;font-weight:700;color:#374151;margin-bottom:10px">¿A qué categoría pertenecen todos estos productos?</div>
      <select id="excel-cat-global" style="width:100%;border:1.5px solid #dfe8e3;border-radius:10px;padding:10px 12px;font-family:'DM Sans',sans-serif;font-size:.88rem">
        <option value="">Seleccioná una categoría...</option>
        ${catOpts}
      </select>`;
  }

  wizard.innerHTML = `
    ${catContent}
    <div style="background:#eff6f2;border-radius:10px;padding:10px 12px;margin-top:14px;font-size:.8rem;color:#374151">
      Listo para importar <strong>${total} producto${total === 1 ? '' : 's'}</strong>.
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button onclick="excelBack(3)" style="flex:1;background:#eff6f2;color:#065F46;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer">← Volver</button>
      <button id="excel-import-btn" onclick="importarDesdeExcel()" style="flex:2;background:#006039;color:white;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:800;cursor:pointer">
        <span id="excel-import-btn-text">Importar ${total} productos →</span>
      </button>
    </div>`;
}

function excelBack(fromStep) {
  const wizard = document.getElementById('excel-wizard');
  if (fromStep === 2) {
    wizard.style.display = 'none';
    document.getElementById('excel-step1').style.display = 'block';
  } else if (fromStep === 3) {
    renderExcelStep2();
  }
}

async function importarDesdeExcel() {
  if (!excelData || !excelData.length || !excelColMap.nombre || !excelColMap.precio) {
    showToast('Datos incompletos. Volvé y revisá las columnas.'); return;
  }
  const hasCatCol = !!excelColMap.categoria;
  let globalCat = null;
  if (!hasCatCol) {
    globalCat = document.getElementById('excel-cat-global')?.value;
    if (!globalCat) { showToast('Seleccioná una categoría para los productos'); return; }
  }
  const btn = document.getElementById('excel-import-btn');
  const btnText = document.getElementById('excel-import-btn-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Importando...';
  const prods = [];
  let errores = 0;
  excelData.forEach(row => {
    const nombre = String(row[excelColMap.nombre] || '').trim();
    const precioRaw = String(row[excelColMap.precio] || '').replace(/[^0-9.,]/g, '').replace(',', '.');
    const precio = parseFloat(precioRaw);
    if (!nombre || !precio || isNaN(precio)) { errores++; return; }
    let categoria_principal;
    if (hasCatCol) {
      const rawCat = String(row[excelColMap.categoria] || '').trim();
      categoria_principal = excelCatMapping[rawCat] || mapExcelCat(rawCat) || 'Otro';
    } else {
      categoria_principal = globalCat;
    }
    const desc = excelColMap.descripcion ? String(row[excelColMap.descripcion] || '').trim() || null : null;
    prods.push({
      nombre, precio,
      stock: excelColMap.stock ? (parseInt(row[excelColMap.stock]) || null) : null,
      descripcion: desc,
      categoria: categoria_principal,
      categoria_principal,
      visible: true,
      proveedor_id: currentUser?.proveedorId || null
    });
  });
  if (!prods.length) {
    showToast('No se encontraron productos válidos');
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Importar productos →';
    return;
  }
  try {
    const batchSize = 20;
    let imported = 0;
    for (let i = 0; i < prods.length; i += batchSize) {
      const batch = prods.slice(i, i + batchSize);
      const { data } = await sb.from('productos').insert(batch).select();
      if (data) data.forEach(p => productos.unshift(p));
      imported += batch.length;
      if (btnText) btnText.textContent = `Importando... ${imported}/${prods.length}`;
    }
    renderProdGrid();
    document.getElementById('excel-wizard').style.display = 'none';
    document.getElementById('excel-result').style.display = 'block';
    document.getElementById('excel-result-text').textContent = '✓ ' + prods.length + ' productos importados' + (errores > 0 ? ' (' + errores + ' filas ignoradas)' : '');
    showToast('✓ ' + prods.length + ' productos importados');
  } catch (e) {
    showToast('Error al importar. Intentá de nuevo.');
  }
  if (btn) btn.disabled = false;
  if (btnText) btnText.textContent = 'Importar productos →';
}

function resetExcelImport() {
  excelData = null; excelHeaders = []; excelColMap = {}; excelCatMapping = {};
  const fi = document.getElementById('excel-file-input');
  if (fi) fi.value = '';
  const wizard = document.getElementById('excel-wizard');
  if (wizard) wizard.style.display = 'none';
  const step1 = document.getElementById('excel-step1');
  if (step1) step1.style.display = 'block';
  const res = document.getElementById('excel-result');
  if (res) res.style.display = 'none';
}

// ===== MIS PRODUCTOS MODAL =====
let _misProdSort = 'nuevo';
function abrirMisProductos() {
  document.getElementById('misProductosModal').classList.add('open');
  const s = document.getElementById('mis-prod-search');
  if (s) s.value = '';
  ordenarMisProds('nuevo');
}

function buscarMisProds(query) {
  const q = (query || '').toLowerCase().trim();
  const filtrados = q ? productos.filter(p => (p.nombre || '').toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q) || (p.categoria_principal || '').toLowerCase().includes(q)) : productos;
  const el = document.getElementById('misProductosList');
  if (!el) return;
  if (!filtrados.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:#999;font-size:.85rem">Sin resultados para "' + query + '"</div>'; return; }
  el.innerHTML = filtrados.map(p => {
    const oculto = p.visible === false;
    const img = p.imagen_url
      ? `<img loading="lazy" src="${escHtml(imgThumb(p.imagen_url, 150, 70))}" style="width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0;background:#F3F4F6">`
      : `<div style="width:52px;height:52px;border-radius:10px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>`;
    return `<div style="background:${oculto ? '#fafafa' : 'white'};border-radius:12px;padding:12px;border:1px solid ${oculto ? '#fca5a5' : '#eee'};display:flex;align-items:center;gap:12px">
      ${img}
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.nombre)}${oculto ? '<span style="font-size:.6rem;font-weight:800;background:#ef4444;color:white;padding:1px 5px;border-radius:4px;margin-left:5px;vertical-align:middle">OCULTO</span>' : ''}</div>
        <div style="font-size:.9rem;font-weight:900;color:#006039;margin-top:2px">$${(p.precio || 0).toLocaleString('es-AR')}</div>
        <div style="font-size:.68rem;color:#999;margin-top:2px">${p.stock ? 'Stock: ' + escHtml(String(p.stock)) : 'Sin stock'} · ${escHtml(p.categoria || 'General')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <button onclick="editarProducto('${escHtml(String(p.id))}','${escHtml(p.nombre || '')}',${p.precio || 0},'${escHtml(String(p.stock || 0))}','${escHtml(p.categoria || p.cat || '')}','${escHtml(p.categoria_principal || '')}')" style="background:#f5f5f5;border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;color:#555;cursor:pointer">Editar</button>
        <button onclick="toggleVisibleProduct('${escHtml(String(p.id))}',${oculto})" style="background:${oculto ? '#e8f5e9' : '#f5f5f5'};border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;color:${oculto ? '#006039' : '#666'};cursor:pointer">${oculto ? 'Mostrar' : 'Ocultar'}</button>
        <button onclick="deleteProduct('${escHtml(String(p.id))}')" style="background:#fff0f0;border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;color:#ef4444;cursor:pointer">Eliminar</button>
        ${(esProvPro() && !oculto)
          ? `<button onclick="publicarProductoEnNovedades('${escHtml(String(p.id))}')" title="Publicarlo en el feed de Novedades" style="background:#FFF1E6;border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:800;color:#FF6B00;cursor:pointer">Novedad</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

function ordenarMisProds(tipo) {
  _misProdSort = tipo;
  ['az', 'za', 'nuevo', 'viejo'].forEach(t => {
    const btn = document.getElementById('sort-' + t);
    if (btn) btn.style.background = t === tipo ? '#006039' : 'white';
    if (btn) btn.style.color = t === tipo ? 'white' : '#111';
  });
  let sorted = [...productos];
  if (tipo === 'az') sorted.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  if (tipo === 'za') sorted.sort((a, b) => (b.nombre || '').localeCompare(a.nombre || ''));
  if (tipo === 'nuevo') sorted.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  if (tipo === 'viejo') sorted.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const el = document.getElementById('misProductosList');
  if (!el) return;
  if (!sorted.length) {
    el.innerHTML = `<div style="padding:20px 0">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:1.8rem;margin-bottom:6px">📦</div>
        <div style="font-family:'Inter',sans-serif;font-size:.88rem;font-weight:700;color:#333;margin-bottom:4px">Todavía no tenés productos</div>
        <div style="font-size:.78rem;color:#999">¿Cómo querés cargar tu catálogo?</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="openAddProduct()" style="background:#006039;color:white;border:none;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;width:100%">
          <div style="width:36px;height:36px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
          <div><div style="font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700">Agregar uno por uno</div><div style="font-size:.72rem;opacity:.75">Manual, con foto y precio</div></div>
        </button>
        <button onclick="openAddProduct();switchAddTab('excel')" style="background:white;color:#1a1a1a;border:1.5px solid #E8F2EE;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;width:100%">
          <div style="width:36px;height:36px;background:#E8F2EE;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#006039" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
          <div><div style="font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700">Importar desde Excel o Tienda Nube</div><div style="font-size:.72rem;color:#999">Subí tu lista y la importamos automáticamente</div></div>
        </button>
        <button onclick="openAddProduct();switchAddTab('ml')" style="background:white;color:#1a1a1a;border:1.5px solid #fff3b0;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;width:100%">
          <div style="width:36px;height:36px;background:#FFF9C4;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b58a00" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
          <div><div style="font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700">Importar desde MercadoLibre</div><div style="font-size:.72rem;color:#999">Pegá el link y traemos los datos</div></div>
        </button>
      </div>
    </div>`;
    return;
  }
  el.innerHTML = sorted.map(p => {
    const oculto = p.visible === false;
    const img = p.imagen_url
      ? `<img loading="lazy" src="${escHtml(imgThumb(p.imagen_url, 150, 70))}" style="width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0;background:#F3F4F6">`
      : `<div style="width:52px;height:52px;border-radius:10px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>`;
    return `<div style="background:${oculto ? '#fafafa' : 'white'};border-radius:12px;padding:12px;border:1px solid ${oculto ? '#fca5a5' : '#eee'};display:flex;align-items:center;gap:12px">
      ${img}
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.nombre)}${oculto ? '<span style="font-size:.6rem;font-weight:800;background:#ef4444;color:white;padding:1px 5px;border-radius:4px;margin-left:5px;vertical-align:middle">OCULTO</span>' : ''}</div>
        <div style="font-size:.9rem;font-weight:900;color:#006039;margin-top:2px">$${(p.precio || 0).toLocaleString('es-AR')}</div>
        <div style="font-size:.68rem;color:#999;margin-top:2px">${p.stock ? 'Stock: ' + escHtml(String(p.stock)) : 'Sin stock'} · ${escHtml(p.categoria || 'General')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <button onclick="editarProducto('${escHtml(String(p.id))}','${escHtml(p.nombre || '')}',${p.precio || 0},'${escHtml(String(p.stock || 0))}','${escHtml(p.categoria || p.cat || '')}','${escHtml(p.categoria_principal || '')}')" style="background:#f5f5f5;border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;color:#555;cursor:pointer">Editar</button>
        <button onclick="toggleVisibleProduct('${escHtml(String(p.id))}',${oculto})" style="background:${oculto ? '#e8f5e9' : '#f5f5f5'};border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;color:${oculto ? '#006039' : '#666'};cursor:pointer">${oculto ? 'Mostrar' : 'Ocultar'}</button>
        <button onclick="deleteProduct('${escHtml(String(p.id))}')" style="background:#fff0f0;border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:700;color:#ef4444;cursor:pointer">Eliminar</button>
        ${(esProvPro() && !oculto)
          ? `<button onclick="publicarProductoEnNovedades('${escHtml(String(p.id))}')" title="Publicarlo en el feed de Novedades" style="background:#FFF1E6;border:none;border-radius:6px;padding:5px 10px;font-size:.7rem;font-weight:800;color:#FF6B00;cursor:pointer">Novedad</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

// ===== HOME CAROUSELS =====
function renderProdCard(p) {
  return `<div onclick="abrirDetalleProd('${escHtml(p.id)}')" style="min-width:150px;max-width:150px;background:white;border-radius:12px;overflow:hidden;border:1px solid #eee;cursor:pointer;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div class="prod-img-wrap">
      ${p.imgUrl ? `<img loading="lazy" src="${escHtml(imgThumb(p.imgUrl, 400, 70))}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
    </div>
    <div style="padding:8px 10px">
      <div style="font-size:.78rem;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.nombre)}</div>
      <div style="font-size:.88rem;font-weight:900;color:#006039;margin-top:2px">$${(p.precio || 0).toLocaleString('es-AR')}</div>
      <div style="font-size:.68rem;color:#999;margin-top:3px">${escHtml(p.provNombre || '')}</div>
    </div>
  </div>`;
}

function toggleResenas(header) {
  const col = document.getElementById('resenas-collapsible');
  const icon = header.querySelector('.resenas-toggle-icon');
  if (!col) return;
  const open = col.style.display !== 'none';
  col.style.display = open ? 'none' : 'block';
  icon.textContent = open ? '▼ Ver reseñas' : '▲ Ocultar reseñas';
}

// ===== DETALLE PROVEEDOR CAROUSELS POR MARCA =====
function renderDetCarousels(prodsDetalle) {
  const container = document.getElementById('det-productos-carousels');
  if (!container) return;
  if (!prodsDetalle || !prodsDetalle.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#999;font-size:.85rem">Este proveedor no tiene productos publicados aún.</div>';
    return;
  }
  const visibles = prodsDetalle.slice(0, 6);
  const resto = prodsDetalle.length - visibles.length;
  const cards = visibles.map(p => {
    return `<div onclick="abrirDetalleProd('${p.id}')" style="background:white;border-radius:12px;overflow:hidden;border:1px solid #eee;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.06)">
      <div class="prod-img-wrap">
        ${p.imgUrl ? `<img loading="lazy" src="${escHtml(imgThumb(p.imgUrl, 400, 70))}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
      </div>
      <div style="padding:7px 8px 9px">
        <div style="font-size:.72rem;font-weight:700;color:#111;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(p.nombre)}</div>
        <div style="font-size:.8rem;font-weight:900;color:#006039;margin-top:3px">$${(p.precio || 0).toLocaleString('es-AR')}</div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:${resto > 0 ? '12px' : '0'}">
      ${cards}
    </div>
    ${resto > 0 ? `<button onclick="abrirTodosProductosProv()" style="width:100%;background:#eff6f2;border:1.5px solid #DCE8E2;border-radius:12px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:800;color:#065F46;cursor:pointer">Ver los ${resto} productos restantes →</button>` : ''}
  `;
}

function abrirTodosProductosProv() {
  const container = document.getElementById('det-productos-carousels');
  if (!container || !provActual) return;
  cargarProductosDetalle(provActual.id, true);
}



// ===== PROVEEDORES DESTACADOS =====
function renderProvDestacados() {
  const seccion = document.getElementById('seccion-prov-dest');
  const lista = document.getElementById('prov-dest-list');
  if (!seccion || !lista) return;
  const all = proveedoresDB;
  if (!all.length) return;
  const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857', '#15803D', '#C2410C'];
  const now = new Date();
  const provsPro = all.filter(p => p.pro);
  console.log('[home] proveedores pro encontrados:', provsPro.length, provsPro.map(p => p.nombre));
  const top = all
    .filter(p => {
      if (!p.pro) return false;
      if (!p.plan_hasta) return true; // Pro permanente sin vencimiento
      return new Date(p.plan_hasta + 'T03:00:00Z') > now;
    })
    .map(p => ({ ...p, avgR: getProvRating(String(p.id)).avg }))
    .sort((a, b) => (b.visitas || 0) - (a.visitas || 0))
    .slice(0, 6);
  lista.innerHTML = top.map((p, i) => {
    const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
    const bg = _monoColor(p.id);
    const avgR = p.avgR > 0 ? p.avgR.toFixed(1) : '—';
    return `<div onclick="abrirDetalle('${p.id}')" style="flex-shrink:0;width:130px;background:white;border-radius:14px;border:1px solid #DCE8E2;padding:14px 12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.05)">
      ${p.logo_url
        ? `<div style="width:48px;height:48px;border-radius:12px;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${escHtml(imgThumb(p.logo_url, 200, 75))}" style="width:100%;height:100%;object-fit:cover;background:#F3F4F6"></div>`
        : `<div style="width:48px;height:48px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.95rem;color:white;flex-shrink:0;font-family:'Inter',sans-serif">${escHtml(ini)}</div>`
      }
      <div style="font-family:'Inter',sans-serif;font-size:.78rem;font-weight:800;color:#1A1A1A;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;width:100%">${escHtml(p.nombre)}</div>
      <div style="font-size:.68rem;color:#6B7A99;margin-top:-4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">${escHtml(p.rubro || '')}</div>
      <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:center">
        ${p.pro ? '<span style="font-size:.58rem;font-weight:800;background:linear-gradient(135deg,#064E3B,#022C22);color:#F0C775;border:1px solid rgba(233,185,73,.4);padding:2px 6px;border-radius:20px;letter-spacing:.04em">PRO</span>' : ''}
        ${p.avgR > 0 ? `<span style="font-size:.68rem;font-weight:700;color:#F59E0B">${avgR} ★</span>` : ''}
      </div>
    </div>`;
  }).join('');
  seccion.style.display = 'block';
}

// ===== RECIÉN LLEGADOS =====
async function renderRecienLlegados() {
  const seccion = document.getElementById('seccion-recien-llegados');
  const lista = document.getElementById('recien-llegados-list');
  if (!seccion || !lista) return;
  try {
    const hace14dias = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await sb.from('proveedores')
      .select('id, nombre, rubro, provincia, plan, plan_hasta, logo_url, created_at')
      .eq('estado', 'aprobado')
      .gte('created_at', hace14dias)
      .order('created_at', { ascending: false })
      .limit(3);
    if (!data || !data.length) return;
    seccion.style.display = 'block';
    const bgs = ['#065F46', '#FF6B00', '#00A651', '#047857'];
    lista.innerHTML = data.map((p, i) => {
      const ini = p.nombre.substring(0, 2).toUpperCase();
      const bg = _monoColor(p.id);
      const dias = Math.floor((Date.now() - new Date(p.created_at)) / 86400000);
      const badge = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : 'Hace ' + dias + ' días';
      return `<div onclick="abrirDetalle('${p.id}')" style="background:white;border-radius:14px;border:1px solid #DCE8E2;padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer">
        ${p.logo_url
          ? `<div style="width:40px;height:40px;border-radius:10px;overflow:hidden;flex-shrink:0"><img loading="lazy" src="${escHtml(imgThumb(p.logo_url, 200, 75))}" style="width:100%;height:100%;object-fit:cover;background:#F3F4F6"></div>`
          : `<div style="width:40px;height:40px;border-radius:10px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.88rem;color:white;flex-shrink:0;font-family:'Inter',sans-serif">${escHtml(ini)}</div>`
        }
        <div style="flex:1;min-width:0">
          <div style="font-family:'Inter',sans-serif;font-size:.88rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.nombre)}</div>
          <div style="font-size:.73rem;color:#6B7A99;margin-top:1px">${escHtml(p.rubro || 'General')}${p.provincia ? ' · ' + escHtml(p.provincia) : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <span style="font-size:.62rem;font-weight:800;background:#DCFCE7;color:#16A34A;padding:2px 7px;border-radius:20px">${badge}</span>
          ${p.plan === 'pro' && (!p.plan_hasta || new Date(p.plan_hasta + 'T03:00:00Z') > new Date()) ? '<span style="font-size:.62rem;font-weight:800;background:linear-gradient(135deg,#064E3B,#022C22);color:#F0C775;border:1px solid rgba(233,185,73,.4);padding:2px 7px;border-radius:20px;letter-spacing:.04em">PRO</span>' : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) { }
}

// ===== HERO STATS =====
async function cargarHeroStats() {
  try {
    // Para el total real de productos usamos count exacto: un select normal
    // trae como mucho 1000 filas (tope de PostgREST) y mostraba "+1000" fijo.
    const [{ data: provs }, { count: prodsCount }] = await Promise.all([
      sb.from('proveedores').select('id, rubro').eq('estado', 'aprobado'),
      sb.from('productos').select('id', { count: 'exact', head: true })
    ]);
    const numProvs = provs?.length || 0;
    const numProds = prodsCount || 0;
    const rubros = new Set((provs || []).map(p => p.rubro).filter(Boolean));
    const numRubros = rubros.size;
    const e1 = document.getElementById('hero-stat-provs');
    const e2 = document.getElementById('hero-stat-prods');
    const e3 = document.getElementById('hero-stat-rubros');
    if (e1) { e1.classList.remove('stat-loading'); animarContador(e1, numProvs, '+'); }
    if (e2) { e2.classList.remove('stat-loading'); animarContador(e2, numProds, '+'); }
    if (e3) { e3.classList.remove('stat-loading'); animarContador(e3, numRubros, '+'); }
  } catch (e) {
    const e1 = document.getElementById('hero-stat-provs');
    const e2 = document.getElementById('hero-stat-prods');
    const e3 = document.getElementById('hero-stat-rubros');
    if (e1) { e1.classList.remove('stat-loading'); e1.textContent = '—'; }
    if (e2) { e2.classList.remove('stat-loading'); e2.textContent = '—'; }
    if (e3) { e3.classList.remove('stat-loading'); e3.textContent = '—'; }
  }
}

// ===== HERO: logos de proveedores rotando en los círculos =====
async function cargarHeroLogos() {
  const slots = [0, 1, 2].map(i => document.getElementById('hero-logo-' + i));
  if (slots.some(s => !s)) return;
  let pool = [];
  try {
    const { data } = await sb.from('proveedores')
      .select('logo_url')
      .eq('estado', 'aprobado')
      .not('logo_url', 'is', null)
      .neq('logo_url', '')
      .limit(48);
    pool = (data || []).map(p => p.logo_url).filter(Boolean);
  } catch (e) { return; }
  if (pool.length < 3) return;
  // barajar el pool para que no siempre arranque igual
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  function setLogo(slot, url) {
    slot.style.opacity = '0';
    setTimeout(() => {
      slot.innerHTML = `<img src="${escHtml(imgThumb(url, 96, 72))}" alt="" onerror="this.remove()" style="width:100%;height:100%;object-fit:cover;display:block;background:#fff">`;
      slot.style.opacity = '1';
    }, 200);
  }
  slots.forEach((s, i) => setLogo(s, pool[i]));
  // rota un círculo por vez para un efecto escalonado
  let idx = 3, turn = 0;
  setInterval(() => {
    setLogo(slots[turn % 3], pool[idx % pool.length]);
    idx++; turn++;
  }, 2200);
}

// ===== ONBOARDING =====
let obSlide = 0;
const OB_SLIDES = 3;

function initOnboarding() {
  try { if (localStorage.getItem('eg_onboarding_done')) return; } catch (e) { }
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderObDots();
}
function renderObDots() {
  const el = document.getElementById('ob-dots');
  if (!el) return;
  el.innerHTML = Array.from({ length: OB_SLIDES }).map((_, i) =>
    `<div style="width:${i === obSlide ? 20 : 8}px;height:8px;border-radius:4px;background:${i === obSlide ? '#006039' : '#E5E5E5'};transition:all .25s"></div>`
  ).join('');
}
function nextSlideOnboarding() {
  const slides = document.querySelectorAll('.ob-slide');
  if (obSlide < OB_SLIDES - 1) {
    slides[obSlide].style.display = 'none';
    obSlide++;
    slides[obSlide].style.display = 'block';
    renderObDots();
    if (obSlide === OB_SLIDES - 1) {
      document.getElementById('ob-next').textContent = '¡Empezar! 🚀';
      document.getElementById('ob-skip').style.display = 'none';
    }
  } else {
    cerrarOnboarding();
  }
}
function cerrarOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.style.display = 'none';
  try { localStorage.setItem('eg_onboarding_done', '1'); } catch (e) { }
}

// ===== COMPARTIR PROVEEDOR =====
function compartirProveedor() {
  if (!provActual) return;
  const texto = `¡Mirá este proveedor en EmprendeGO!\n\n*${provActual.nombre}*\n${provActual.rubro || ''}${provActual.provincia ? ' · ' + provActual.provincia : ''}\n\n${provActual.desc || ''}\n\n👉 emprendego.vercel.app`;
  if (navigator.share) {
    navigator.share({ title: provActual.nombre, text: texto, url: 'https://emprendego.vercel.app' }).catch(() => { });
  } else {
    try { navigator.clipboard.writeText(texto); showToast('¡Link copiado! Compartilo por WhatsApp 📋'); } catch (e) { showToast('Copiá este link: emprendego.vercel.app'); }
  }
}

// ===== COMPARTIR / VER MI PERFIL (dashboard proveedor) =====
function compartirMiPerfil() {
  const pd = currentUser && currentUser.provData;
  if (!pd || !pd.id) { showToast('Perfil no disponible'); return; }
  const url = location.origin + '/?prov=' + encodeURIComponent(pd.id);
  const texto = `¡Encontrá ${pd.nombre} en EmprendeGO!\n\n${pd.rubro || ''}${pd.provincia ? ' · ' + pd.provincia : ''}\n\n👉 ${url}`;
  if (navigator.share) {
    navigator.share({ title: pd.nombre, text: texto, url }).catch(() => { });
  } else {
    try { navigator.clipboard.writeText(url); showToast('¡Link copiado! Compartilo por WhatsApp 📋'); }
    catch (e) { showToast('Copiá tu link: ' + url); }
  }
}

function verMiPerfilPublico() {
  const pd = currentUser && currentUser.provData;
  if (!pd || !pd.id) { showToast('Perfil no disponible'); return; }
  abrirDetalle(pd.id);
}

// ===== LANDING PROVEEDORES =====
async function enviarContactoProv(btn) {
  const nombre = document.getElementById('lp-nombre').value.trim();
  const email = document.getElementById('lp-email').value.trim();
  const wa = document.getElementById('lp-wa').value.trim();
  const rubro = document.getElementById('lp-rubro').value;
  if (!nombre) { showToast('Ingresá el nombre de tu negocio'); return; }
  if (!email) { showToast('Ingresá tu email'); return; }
  const orig = btn.textContent;
  btn.textContent = 'Enviando...';
  btn.disabled = true;
  try {
    await sb.from('contactos_prov').insert({ nombre, email, whatsapp: wa || null, rubro: rubro || null });
  } catch (e) { }
  showToast('¡Recibimos tu consulta! Te contactamos pronto 👋');
  btn.textContent = '¡Enviado! ✓';
  setTimeout(() => goTo('registro'), 1500);
}

// ===== INIT =====
refreshFavBadge();
cargarProveedores().then(() => {
  initNotificaciones();
  renderMapaProvincias();
  renderMapaAllProvs();
  renderProvDestacados();
  const lpStat = document.getElementById('lp-stat-provs');
  if (lpStat) lpStat.textContent = (proveedoresDB.length > 0 ? proveedoresDB.length : 50) + '+';
  abrirDeepLinkProv();
});

// Abre la ficha del proveedor indicado por ?prov=<id> una sola vez, ya cargados los proveedores.
function abrirDeepLinkProv() {
  if (!_deepLinkProv) return;
  const wanted = String(_deepLinkProv);
  _deepLinkProv = null;
  setTimeout(() => { try { abrirDetalle(wanted); } catch (e) { } }, 60);
}

// ===== CARRUSEL TESTIMONIOS =====
(function initTestimonios() {
  const slides = document.querySelectorAll('.testim-slide');
  const dots = document.querySelectorAll('.testim-dot');
  if (!slides.length) return;
  let cur = 0;
  function goTo(n) {
    slides[cur].style.display = 'none';
    dots[cur].style.width = '8px';
    dots[cur].style.background = 'rgba(255,255,255,.3)';
    cur = n % slides.length;
    slides[cur].style.display = 'flex';
    slides[cur].style.opacity = '0';
    dots[cur].style.width = '20px';
    dots[cur].style.background = 'rgba(255,255,255,.8)';
    setTimeout(() => { slides[cur].style.transition = 'opacity .4s'; slides[cur].style.opacity = '1'; }, 10);
  }
  setInterval(() => goTo(cur + 1), 3500);
})();

initOnboarding();

// Skeletons inmediatos mientras cargan los datos
(function initSkeletons() {
  const pl = document.getElementById('provList');
  if (pl) pl.innerHTML = skelProv(4);
  const c1 = document.getElementById('prodInicioCarousel1');
  if (c1) c1.innerHTML = skelCarousel(5);
  const c2 = document.getElementById('prodInicioCarousel2');
  if (c2) c2.innerHTML = skelCarousel(5);
  const pd = document.getElementById('prov-dest-list');
  if (pd) { pd.innerHTML = skelProvHoriz(5); document.getElementById('seccion-prov-dest').style.display = 'block'; }
})();

renderQuestion();
// Detección de callback OAuth: PKCE usa ?code= en query, implicit usaba #access_token=
function _hasOAuthCallback() {
  const p = new URLSearchParams(window.location.search);
  return window.location.hash.includes('access_token=') || p.has('code') || p.has('error');
}
// iOS Safari bfcache fix: cuando Safari restaura la página desde caché después del
// redirect OAuth, el JS no se re-ejecuta y los tokens no se procesan.
window.addEventListener('pageshow', e => {
  if (e.persisted && _hasOAuthCallback()) {
    window.location.reload();
  }
});

// Captura síncrona del hash ANTES de cualquier código async.
// simulateGoogleLogin limpia el localStorage de Supabase antes de redirigir,
// así que detectSessionInUrl siempre procesa el #access_token= sin interferencia.
const _cbHash = window.location.hash;
const _cbSearch = window.location.search;

async function handleOAuthCallbackIfPresent() {
  const params = new URLSearchParams(_cbSearch);
  console.log('[auth] callback check — hash:', _cbHash.substring(0, 40), 'search:', _cbSearch);

  if (params.has('error')) {
    const msg = params.get('error_description') || params.get('error') || 'Error en autenticación';
    showToast(decodeURIComponent(msg.replace(/\+/g, ' ')));
    history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  if (_cbHash.includes('access_token=')) {
    const hp = new URLSearchParams(_cbHash.replace(/^#/, ''));
    const access_token = hp.get('access_token');
    const refresh_token = hp.get('refresh_token') || '';
    const tokenType = hp.get('type') || '';
    // Limpiamos URL antes de setSession para que el SDK no procese el hash
    // en paralelo via detectSessionInUrl (evita doble-procesamiento).
    history.replaceState({}, document.title, window.location.pathname);
    console.log('[auth] access_token en hash, type:', tokenType, 'llamando setSession...');
    if (access_token) {
      try {
        const { data, error } = await sb.auth.setSession({ access_token, refresh_token });
        console.log('[auth] setSession:', !!data?.session, error?.message);
        if (error && !data?.session) {
          console.warn('[auth] setSession falló, recargando...');
          window.location.reload();
        } else if (tokenType === 'recovery' && data?.session) {
          setTimeout(() => mostrarModalNuevaContrasena(), 0);
        }
      } catch (e) { console.warn('[auth] setSession exc:', e); }
    }
    return;
  }

  // Carga normal (no es callback OAuth) — verificar sesión persistida
  await checkSession();
}
handleOAuthCallbackIfPresent();
sb.auth.onAuthStateChange((event, session) => {
  console.log('[auth]', event, !!session, session?.user?.email);
  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
    // setTimeout(0): el callback debe ser síncrono y retornar de inmediato.
    // setSession() mantiene el lock interno de GoTrue MIENTRAS llama a los
    // suscriptores. Si hacemos await aquí, cualquier llamada a Supabase DB
    // (que internamente llama getSession() → intenta adquirir el mismo lock)
    // produce un deadlock garantizado. Con setTimeout salimos del stack del
    // lock y checkSession() corre después de que setSession() lo libera.
    setTimeout(() => checkSession(session), 0);
  }
});
cargarHeroStats();
cargarHeroLogos();
renderRecienLlegados();
cargarProductosReales();
setTimeout(() => { try { renderProdBuscar(currentCat, ''); } catch (e) { } }, 300);
// ===== PLAN PRO - FUNCIONES =====
async function iniciarPagoPro(btnEl) {
  if (!currentUser || !currentUser.proveedorId) {
    showToast('Primero tenés que estar logueado como proveedor');
    return;
  }
  if (esPromoActiva()) { await activarPlanProGratis(null); return; }
  const btn = btnEl || null;
  const txtOrig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }
  try {
    const res = await fetch('/api/crear-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, proveedorId: currentUser.proveedorId })
    });
    const data = await res.json();
    if (!res.ok || !data.init_point) {
      showToast('Error al iniciar el pago. Intentá de nuevo.');
      if (btn) { btn.disabled = false; btn.textContent = txtOrig; }
      return;
    }
    window.location.href = data.init_point;
  } catch (e) {
    showToast('Error al conectar con el servidor de pago.');
    if (btn) { btn.disabled = false; btn.textContent = txtOrig; }
  }
}


// ===== TIENDA NUBE =====
async function renderTiendaNubeSection() {
  const btnArea = document.getElementById('tn-btn-area');
  const statusLabel = document.getElementById('tn-status-label');
  if (!btnArea || !statusLabel) return;

  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;

  // Si no es Pro, mostrar botón bloqueado
  if (!esProvPro()) {
    const card = document.getElementById('tn-card');
    if (card) card.style.background = '#fff';
    statusLabel.textContent = 'Disponible en Plan Pro';
    statusLabel.style.color = '#8a948d';
    btnArea.innerHTML = `<button onclick="showModalPro('Tienda Nube')" style="width:100%;background:#f1f3f0;color:#6b756e;border:1px solid #e5e8e2;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Conectar Tienda Nube · Solo Pro</button>`;
    return;
  }

  // Query fresca para obtener estado actual de tn_store_id
  const { data } = await sb.from('proveedores').select('tn_store_id').eq('id', proveedorId).single();
  const tnStoreId = data?.tn_store_id;

  // Actualizar provData en memoria para que sincronizarTiendaNube lo tenga disponible
  if (currentUser.provData) currentUser.provData.tn_store_id = tnStoreId || null;

  const card = document.getElementById('tn-card');
  if (tnStoreId) {
    statusLabel.textContent = 'Conectada · Store #' + tnStoreId;
    statusLabel.style.color = '#0b6b45';
    if (card) card.style.background = '#fff';
    btnArea.innerHTML = `<button onclick="sincronizarTiendaNube(this)" style="width:100%;background:#0b6b45;color:#fff;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Sincronizar productos</button>`;
  } else {
    statusLabel.textContent = 'Importá tus productos con fotos automáticamente';
    statusLabel.style.color = '#5f6f66';
    if (card) card.style.background = '#fff';
    btnArea.innerHTML = `<button onclick="conectarTiendaNube(this)" style="width:100%;background:#0b6b45;color:#fff;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Conectar con Tienda Nube</button>`;
  }
}

function conectarTiendaNube(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  btn.disabled = true;
  btn.textContent = 'Redirigiendo...';
  window.location.href = '/api/tiendanube?action=auth&proveedor_id=' + encodeURIComponent(proveedorId);
}

async function sincronizarTiendaNube(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  btn.disabled = true;
  btn.textContent = '⏳ Sincronizando...';
  try {
    const res = await fetch('/api/tiendanube?action=sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor_id: proveedorId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ ${data.importados} productos importados de Tienda Nube`);
      cargarProductosProveedor();
      if (data.categorias_tn && data.categorias_tn.length > 0) {
        mostrarMapeoTN(data.categorias_tn);
      }
    } else {
      showToast(data.error || 'Error al sincronizar productos.');
    }
  } catch {
    showToast('Error de conexión. Intentá más tarde.');
  }
  btn.disabled = false;
  btn.textContent = '🔄 Sincronizar productos';
}

// Opciones del desplegable que usa el proveedor para mapear sus categorías de
// Tienda Nube y de Mercado Libre a rubros de EmprendeGO. Faltaban 'Lencería' y
// 'Calzado': sin ellas, un proveedor de lencería no podía elegir su propio
// rubro aunque quisiera, y todo su catálogo caía en Indumentaria.
const TN_CATEGORIAS_EG = ['Tecnología','Indumentaria','Calzado','Lencería','Hogar y Deco','Bazar','Alimentos','Belleza y Salud','Deportes','Automotor','Construcción','Servicios','Juguetería','Ferretería','Iluminación','Muebles','Textil y Telas','Librería y Papelería','Marroquinería y Bolsos','Limpieza','Blanquería','Mascotas','Bebés y Niños','Electrónica','Herramientas','Packaging','Otro'];

function mostrarMapeoTN(categorias_tn) {
  const list = document.getElementById('tn-mapeo-list');
  if (!list) return;
  const mapaActual = currentUser?.provData?.tn_categoria_map || {};
  list.innerHTML = categorias_tn.map(cat => {
    const opts = TN_CATEGORIAS_EG.map(c =>
      `<option value="${c}" ${(mapaActual[cat] || 'Otros') === c ? 'selected' : ''}>${c}</option>`
    ).join('');
    return `<div style="background:#F8FAF8;border-radius:10px;padding:12px 14px">
      <div style="font-size:.78rem;font-weight:700;color:#444;margin-bottom:6px">TN: <span style="color:#006039">${escHtml(cat)}</span></div>
      <select class="tn-mapeo-select" data-tn-cat="${escHtml(cat)}" style="width:100%;border:1.5px solid #D1FAE5;border-radius:8px;padding:8px 10px;font-size:.82rem;color:#111;background:white;appearance:none">${opts}</select>
    </div>`;
  }).join('');
  document.getElementById('tnMapeoModal').classList.add('open');
}

// Espejo de api/_rubros.js. Las dos copias tienen que decir lo mismo: si tocás
// una, tocá la otra. Ver ese archivo para el detalle de por qué cada palabra
// está o no está en la lista.
const LENCERIA_RE = /\b(colaless|corpi[ñn]o|soutien|bombacha|tanga|portaliga|lencer[íi]a|brasier|bralette|vedetina|culotte|cachetero|camis[óo]n|boxers?\b|slips?\b)/i;
const NO_LENCERIA_RE = /\b(beb[ée]|ni[ñn][oa]|nen[ae]|infantil|chupet[íi]n|splash|perfume|cable|collar|cervical)/i;
const NUCLEO_RE = /\b(conjunto|body)\b/i;
const SENAL_RE = /\bless\b|taza\s*(soft|doble)|sin\s*taza|puntilla|push\s*up|tri[áa]ngulo\s*soft|triangulo\s*soft|\baro\b|\barco\b|encaje|bralette/i;
const RUBROS_GENERICOS = ['Indumentaria', 'Otros', 'Otro'];

function esLenceria(nombre) {
  const n = nombre || '';
  if (NO_LENCERIA_RE.test(n)) return false;
  return LENCERIA_RE.test(n) || (NUCLEO_RE.test(n) && SENAL_RE.test(n));
}

// Al confirmar el mapeo, los updates de arriba pisan TODOS los productos de una
// categoría de origen con un mismo rubro. Eso deshace el afinado que hizo el
// sync, porque TN y ML devuelven una sola categoría para catálogos enteros.
// Este repaso vuelve a separar la lencería usando la misma regla del backend.
async function reafinarLenceria(proveedorId) {
  const genericos = [];
  // Paginado: la API de Supabase corta en 1000 filas sin avisar.
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('productos')
      .select('id,nombre')
      .eq('proveedor_id', proveedorId)
      .in('categoria_principal', RUBROS_GENERICOS)
      .range(desde, desde + 999);
    if (error || !data?.length) break;
    genericos.push(...data);
    if (data.length < 1000) break;
  }

  const ids = genericos.filter(p => esLenceria(p.nombre)).map(p => p.id);
  if (!ids.length) return 0;

  for (let i = 0; i < ids.length; i += 100) {
    await sb.from('productos')
      .update({ categoria_principal: 'Lencería' })
      .in('id', ids.slice(i, i + 100));
  }
  return ids.length;
}

async function confirmarMapeoTN(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const selects = document.querySelectorAll('.tn-mapeo-select');
  const map = {};
  selects.forEach(s => { map[s.dataset.tnCat] = s.value; });

  // Actualizar categoria_principal de cada grupo de productos por categoria_tn
  const updates = Object.entries(map).map(([tnCat, catPrincipal]) =>
    sb.from('productos').update({ categoria_principal: catPrincipal })
      .eq('proveedor_id', proveedorId).eq('categoria_tn', tnCat)
  );
  await Promise.all(updates);
  await reafinarLenceria(proveedorId);

  // Guardar mapa en proveedores para futuras sincronizaciones
  await sb.from('proveedores').update({ tn_categoria_map: map }).eq('id', proveedorId);
  if (currentUser.provData) currentUser.provData.tn_categoria_map = map;

  document.getElementById('tnMapeoModal').classList.remove('open');
  showToast('Categorías actualizadas');
  cargarProductosProveedor();
  btn.disabled = false;
  btn.textContent = 'Confirmar categorías';
}

// ===== MERCADO LIBRE (mismo patron que Tienda Nube) =====
async function renderMercadoLibreSection() {
  const btnArea = document.getElementById('ml-btn-area');
  const statusLabel = document.getElementById('ml-status-label');
  const card = document.getElementById('ml-card');
  if (!btnArea || !statusLabel || !card) return;

  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;

  const titulo = document.getElementById('ml-title');

  // Si no es Pro -> tarjeta gris bloqueada
  if (!esProvPro()) {
    card.style.background = '#fff';
    statusLabel.textContent = 'Disponible en Plan Pro';
    statusLabel.style.color = '#8a948d';
    if (titulo) titulo.style.color = '#16201b';
    btnArea.innerHTML = `<button onclick="showModalPro('Mercado Libre')" style="width:100%;background:#f1f3f0;color:#6b756e;border:1px solid #e5e8e2;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Conectar Mercado Libre · Solo Pro</button>`;
    return;
  }

  // Query fresca para obtener estado actual de ML
  const { data } = await sb.from('proveedores').select('ml_connected,ml_user_id,ml_nickname,ml_categoria_map').eq('id', proveedorId).single();
  const conectado = !!(data?.ml_connected && data?.ml_user_id);

  // Actualizar provData en memoria
  if (currentUser.provData) {
    currentUser.provData.ml_connected = data?.ml_connected || false;
    currentUser.provData.ml_user_id = data?.ml_user_id || null;
    currentUser.provData.ml_nickname = data?.ml_nickname || null;
    currentUser.provData.ml_categoria_map = data?.ml_categoria_map || null;
  }

  // Restaurar colores ML (por si venía del estado gris al volver a Pro)
  if (titulo) titulo.style.color = '#16201b';

  if (conectado) {
    card.style.background = '#fff';
    statusLabel.textContent = data.ml_nickname ? `Conectada · @${data.ml_nickname}` : 'Conectada';
    statusLabel.style.color = '#0b6b45';
    btnArea.innerHTML = `<button onclick="sincronizarMercadoLibre(this)" style="width:100%;background:#0b6b45;color:#fff;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Sincronizar productos</button>`;
  } else {
    card.style.background = '#fff';
    statusLabel.textContent = 'Importá tus publicaciones automáticamente';
    statusLabel.style.color = '#5f6f66';
    btnArea.innerHTML = `<button onclick="conectarMercadoLibre(this)" style="width:100%;background:#0b6b45;color:#fff;border:none;border-radius:10px;padding:11px;font-family:'Inter',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Conectar con Mercado Libre</button>`;
  }
}

function conectarMercadoLibre(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  btn.disabled = true;
  btn.textContent = 'Redirigiendo...';
  // El endpoint /api/ml detecta proveedor_id y redirige a auth.mercadolibre.com.ar
  window.location.href = '/api/ml?proveedor_id=' + encodeURIComponent(proveedorId);
}

async function sincronizarMercadoLibre(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  const labelOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '⏳ Sincronizando...';
  try {
    const res = await fetch('/api/ml?action=sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor_id: proveedorId })
    });
    const data = await res.json();
    if (res.ok) {
      const extra = data.ocultados > 0 ? ` · ${data.ocultados} ocultados (pausados en ML)` : '';
      showToast(`✅ ${data.importados} productos importados${extra}`);
      cargarProductosProveedor();
      if (data.categorias_ml && data.categorias_ml.length > 0) {
        mostrarMapeoML(data.categorias_ml);
      }
    } else {
      showToast(data.error || 'Error al sincronizar productos.');
      // 401 = token revocado o expirado: el backend ya marco ml_connected=false.
      // Re-renderizamos para que aparezca el boton "Conectar" otra vez.
      if (res.status === 401) renderMercadoLibreSection();
    }
  } catch {
    showToast('Error de conexión. Intentá más tarde.');
  }
  btn.disabled = false;
  btn.innerHTML = labelOriginal;
}

function mostrarMapeoML(categorias_ml) {
  const list = document.getElementById('ml-mapeo-list');
  if (!list) return;
  const mapaActual = currentUser?.provData?.ml_categoria_map || {};
  list.innerHTML = categorias_ml.map(cat => {
    const opts = TN_CATEGORIAS_EG.map(c =>
      `<option value="${c}" ${(mapaActual[cat] || 'Otros') === c ? 'selected' : ''}>${c}</option>`
    ).join('');
    return `<div style="background:#FFFBEA;border-radius:10px;padding:12px 14px">
      <div style="font-size:.78rem;font-weight:700;color:#444;margin-bottom:6px">ML: <span style="color:#E8A800">${escHtml(cat)}</span></div>
      <select class="ml-mapeo-select" data-ml-cat="${escHtml(cat)}" style="width:100%;border:1.5px solid #FDE68A;border-radius:8px;padding:8px 10px;font-size:.82rem;color:#111;background:white;appearance:none">${opts}</select>
    </div>`;
  }).join('');
  document.getElementById('mlMapeoModal').classList.add('open');
}

async function confirmarMapeoML(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const selects = document.querySelectorAll('.ml-mapeo-select');
  const map = {};
  selects.forEach(s => { map[s.dataset.mlCat] = s.value; });

  // Actualizar categoria_principal de cada grupo por categoria_ml
  const updates = Object.entries(map).map(([mlCat, catPrincipal]) =>
    sb.from('productos').update({ categoria_principal: catPrincipal })
      .eq('proveedor_id', proveedorId).eq('categoria_ml', mlCat)
  );
  await Promise.all(updates);
  await reafinarLenceria(proveedorId);

  // Persistir mapa para futuras sincronizaciones
  await sb.from('proveedores').update({ ml_categoria_map: map }).eq('id', proveedorId);
  if (currentUser.provData) currentUser.provData.ml_categoria_map = map;

  document.getElementById('mlMapeoModal').classList.remove('open');
  showToast('Categorías actualizadas');
  cargarProductosProveedor();
  btn.disabled = false;
  btn.textContent = 'Confirmar categorías';
}

// ===== EXPORTAR CONTACTOS CSV (Solo Pro) =====
async function exportarContactosCSV() {
  if (!esProvPro()) { showModalPro('Exportar contactos'); return; }
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  try {
    showToast('Generando CSV...');
    const { data, error } = await sb.from('mensajes')
      .select('de_nombre,de_email,created_at,texto')
      .eq('proveedor_id', proveedorId)
      .eq('de_tipo', 'usuario')
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || !data.length) { showToast('No tenés contactos para exportar'); return; }
    // Agrupar por usuario (por nombre)
    const mapa = {};
    data.forEach(m => {
      const key = m.de_email || m.de_nombre || 'Anónimo';
      if (!mapa[key]) {
        mapa[key] = { nombre: m.de_nombre || 'Anónimo', email: m.de_email || '', primera: m.created_at, ultima: m.created_at, ultimo_msg: m.texto };
      } else {
        if (m.created_at > mapa[key].ultima) { mapa[key].ultima = m.created_at; mapa[key].ultimo_msg = m.texto; }
      }
    });
    const filas = [['Nombre', 'Email', 'Primer mensaje', 'Último mensaje', 'Último texto']];
    Object.values(mapa).forEach(c => {
      filas.push([
        c.nombre,
        c.email,
        new Date(c.primera).toLocaleDateString('es-AR'),
        new Date(c.ultima).toLocaleDateString('es-AR'),
        (c.ultimo_msg || '').replace(/"/g, '""').substring(0, 100)
      ]);
    });
    const csv = filas.map(f => f.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contactos_emprendego.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('✓ CSV exportado con ' + Object.keys(mapa).length + ' contactos');
  } catch (e) { showToast('Error al exportar contactos'); }
}

function renderBannerProDashboard() {
  const container = document.getElementById('pro-dashboard-banner');
  if (!container) return;
  const pd = currentUser?.provData;
  if (!pd) { container.innerHTML = ''; return; }
  const planHasta = pd.plan_hasta ? new Date(pd.plan_hasta + 'T03:00:00Z') : null;
  const planActivo = pd.plan === 'pro' && planHasta && planHasta > new Date();

  if (planActivo) {
    const fechaStr = planHasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    container.innerHTML = '<div style="background:linear-gradient(135deg,#065F46,#059669);border-radius:14px;padding:18px;position:relative;overflow:hidden"><div style="position:absolute;right:-15px;top:-15px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.1)"></div><div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#A7F3D0;margin-bottom:6px">Plan Pro Activo</div><div style="font-family:\'Inter\',sans-serif;font-size:1rem;font-weight:900;color:white;margin-bottom:4px">Tu cuenta está potenciada</div><div style="font-size:.75rem;color:rgba(255,255,255,.75);line-height:1.5">Vence el ' + fechaStr + '</div></div>';
  } else if (esPromoActiva()) {
    container.innerHTML = '<div style="background:linear-gradient(135deg,#064E3B,#065F46);border-radius:14px;padding:18px;position:relative;overflow:hidden"><div style="position:absolute;right:-15px;top:-15px;width:80px;height:80px;border-radius:50%;background:rgba(74,222,128,.15)"></div><div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#4ade80;margin-bottom:6px">OFERTA LIMITADA</div><div style="font-family:\'Inter\',sans-serif;font-size:1rem;font-weight:900;color:white;margin-bottom:4px">Probá el Plan Pro GRATIS</div><div style="font-size:.75rem;color:rgba(255,255,255,.65);line-height:1.5;margin-bottom:14px">Sin tarjeta · Hasta el 31 de mayo · WhatsApp directo · Prioridad en búsquedas</div><button onclick="activarPlanProGratis(this)" style="background:#4ade80;color:#064E3B;font-family:\'Inter\',sans-serif;font-size:.8rem;font-weight:800;border-radius:8px;padding:10px 16px;border:none;cursor:pointer;width:100%">Activar Plan Pro GRATIS →</button></div>';
  } else {
    container.innerHTML = '<div onclick="goTo(\'planes\')" style="background:linear-gradient(135deg,#1A1A1A,#2D2D2D);border-radius:14px;padding:18px;position:relative;overflow:hidden;cursor:pointer"><div style="position:absolute;right:-15px;top:-15px;width:80px;height:80px;border-radius:50%;background:rgba(0,166,81,.15)"></div><div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#4ade80;margin-bottom:6px">Plan Pro</div><div style="font-family:\'Inter\',sans-serif;font-size:1rem;font-weight:900;color:white;margin-bottom:4px">Potenciá tu negocio</div><div style="font-size:.75rem;color:rgba(255,255,255,.55);line-height:1.5;margin-bottom:14px">WhatsApp directo · Prioridad en búsquedas · Estadísticas</div><button onclick="event.stopPropagation();iniciarPagoPro(this)" style="background:#006039;color:white;font-family:\'Inter\',sans-serif;font-size:.8rem;font-weight:800;border-radius:8px;padding:10px 16px;border:none;cursor:pointer">Activar Pro · $20.000/mes</button></div>';
  }
}

// ═══════════════════════════════════════════════════════════════
// NOVEDADES — feed de contenido
// ═══════════════════════════════════════════════════════════════

let novedadesDB = [];
let novFiltroActual = 'todo';
let novCargadas = false;
let novIO = null;
let novRielIO = null;

// Todo texto que viene de la base pasa por acá antes de entrar al DOM.
function nvEsc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function nvIniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
}

// "Semana del 13 de julio" pesa menos que "hace 12 días" cuando el feed va lento.
const NV_MESES = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function nvCuando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const horas = (Date.now() - d.getTime()) / 36e5;
  if (horas < 1)  return 'Recién';
  if (horas < 24) return `Hace ${Math.floor(horas)} h`;
  if (horas < 48) return 'Ayer';
  if (horas < 168) return `Hace ${Math.floor(horas / 24)} días`;
  return `${d.getDate()} de ${NV_MESES[d.getMonth()]}`;
}

function nvTextoSemana() {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  return `Semana del ${lunes.getDate()} de ${NV_MESES[lunes.getMonth()]}`;
}

// ── Carga ────────────────────────────────────────────────────────
async function cargarNovedades(forzar) {
  if (novCargadas && !forzar) return;
  const feed = document.getElementById('nv-feed');
  if (!feed) return;

  // Esqueleto con la forma real de la tarjeta, no un spinner suelto.
  feed.innerHTML = Array(3).fill(`
    <div class="nv-bandeja">
      <div class="nv-nucleo nv-hueso">
        <div class="nv-barra-hueso corta" style="width:40%;margin-bottom:14px"></div>
        <div class="nv-barra-hueso foto"></div>
        <div class="nv-barra-hueso"></div>
        <div class="nv-barra-hueso corta"></div>
      </div>
    </div>`).join('');

  try {
    const { data, error } = await sb
      .from('novedades')
      .select('id,tipo,titulo,bajada,cuerpo,imagen,sello,proveedor_id,rubro,minimo,descuento,fecha_evento,publicado_en,created_at')
      .eq('estado', 'publicado')
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;

    novedadesDB = data || [];

    // Traemos los datos del proveedor de cada novedad en una sola consulta.
    const ids = [...new Set(novedadesDB.map(n => n.proveedor_id).filter(Boolean))];
    if (ids.length) {
      const { data: provs } = await sb
        .from('proveedores')
        .select('id,nombre,provincia,plan,plan_hasta,logo_url')
        .in('id', ids);
      const mapa = Object.fromEntries((provs || []).map(p => [p.id, p]));
      novedadesDB.forEach(n => { n._prov = mapa[n.proveedor_id] || null; });
    }

    novCargadas = true;
    renderNovedades();
  } catch (e) {
    console.error('[novedades] carga:', e);
    feed.innerHTML = `
      <div class="nv-bandeja nv-vacio">
        <div class="nv-nucleo">
          <span class="marca">Sin conexión</span>
          <h3>No pudimos cargar las novedades</h3>
          <p>Revisá tu conexión y volvé a entrar.</p>
        </div>
      </div>`;
  }
}

// ── Pintado ──────────────────────────────────────────────────────
function renderNovedades() {
  const feed = document.getElementById('nv-feed');
  if (!feed) return;

  let lista;
  if (novFiltroActual === 'todo') {
    lista = novedadesDB;
  } else if (novFiltroActual === 'pro') {
    // "Proveedores Pro": solo novedades de proveedores con Pro VIGENTE.
    // Es un beneficio real del plan, no una etiqueta.
    lista = novedadesDB.filter(n => nvProvEsPro(n._prov));
  } else {
    lista = novedadesDB.filter(n => n.tipo === novFiltroActual);
  }

  if (!lista.length) {
    const vacio = novFiltroActual === 'pro'
      ? { marca: 'Sin novedades Pro',
          titulo: 'Ningún proveedor Pro publicó todavía',
          texto: 'Los proveedores con Plan Pro publican acá sus ingresos y ofertas. Volvé en unos días.' }
      : { marca: 'Sin novedades',
          titulo: 'Todavía no hay nada por acá',
          texto: 'Probá con otro filtro o volvé en unos días: el feed se mueve todas las semanas.' };
    feed.innerHTML = `
      <div class="nv-bandeja nv-vacio">
        <div class="nv-nucleo">
          <span class="marca">${vacio.marca}</span>
          <h3>${vacio.titulo}</h3>
          <p>${vacio.texto}</p>
        </div>
      </div>`;
    return;
  }

  const tarjetas = lista.map(nvTarjeta);

  // La caja de publicar también va en el medio: así se entera de que existe
  // sin tener que scrollear hasta el final. Es una celda más de la grilla,
  // no cruza a lo ancho (si cruzara dejaría un hueco en escritorio).
  if (lista.length >= 4) {
    tarjetas.splice(3, 0,
      '<section class="nv-publicar nv-publicar-medio nv-sube">' +
      '<div class="nv-nucleo" id="nv-publicar-nucleo-medio"></div></section>');
  }

  feed.innerHTML = tarjetas.join('');
  nvActualizarPublicar();
  nvObservarEntrada();
}

function nvTarjeta(n) {
  if (n.tipo === 'nota' || n.tipo === 'resumen') return nvTarjetaNota(n);
  if (n.tipo === 'feria') return nvTarjetaFeria(n);
  return nvTarjetaProveedor(n);
}

// Pro VIGENTE. No alcanza con plan==='pro': hay planes vencidos en la base.
function nvProvEsPro(prov) {
  if (!prov || prov.plan !== 'pro') return false;
  if (!prov.plan_hasta) return true;
  return new Date(prov.plan_hasta + 'T03:00:00Z') > new Date();
}

function nvTarjetaProveedor(n) {
  const prov = n._prov;
  const nombre = prov ? prov.nombre : 'EmprendeGO';
  const esPro = nvProvEsPro(prov);

  const meta = [nvCuando(n.publicado_en || n.created_at), prov && prov.provincia]
    .filter(Boolean).join(' · ');

  const sello = n.sello
    ? `<span class="nv-sello ${n.sello === 'liquida' ? 'liquida' : ''}">${
         n.sello === 'liquida' ? 'LIQUIDA' : 'NUEVO INGRESO'}</span>`
    : '';

  const foto = n.imagen
    ? `<div class="nv-foto"><img src="${nvEsc(n.imagen)}" alt="${nvEsc(n.titulo)}" loading="lazy">${sello}</div>`
    : '';

  const datos = [];
  if (n.minimo)    datos.push(`<span class="nv-dato">Mínimo <b>${nvEsc(n.minimo)}</b></span>`);
  if (n.rubro)     datos.push(`<span class="nv-dato">${nvEsc(String(n.rubro).split(',')[0].trim())}</span>`);
  if (n.descuento) datos.push(`<span class="nv-dato rebaja"><b>−${n.descuento} %</b></span>`);

  const acciones = n.proveedor_id ? `
    <div class="nv-acciones">
      <button class="nv-cta" onclick="nvVerProveedor('${nvEsc(n.proveedor_id)}')">
        Ver catálogo
        <span class="nv-redondel" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>
      </button>
    </div>` : '';

  // El logo real si lo tiene; las iniciales solo como respaldo.
  // onerror: si la URL está rota, cae a las iniciales en vez de mostrar
  // el ícono de imagen quebrada.
  const avatar = prov && prov.logo_url
    ? `<span class="nv-sigla nv-sigla-logo" aria-hidden="true">
         <img src="${nvEsc(imgThumb(prov.logo_url, 120, 75))}" alt=""
              loading="lazy"
              onerror="this.parentNode.classList.remove('nv-sigla-logo');this.parentNode.textContent='${nvEsc(nvIniciales(nombre))}'">
       </span>`
    : `<span class="nv-sigla" aria-hidden="true">${nvEsc(nvIniciales(nombre))}</span>`;

  return `
    <article class="nv-bandeja nv-sube">
      <div class="nv-nucleo">
        <div class="nv-quien">
          ${avatar}
          <span class="nv-quien-txt">
            <b>${nvEsc(nombre)}</b>
            <span>${nvEsc(meta)}</span>
          </span>
          ${esPro ? '<span class="nv-pro">PRO</span>' : ''}
        </div>
        ${foto}
        <div class="nv-cuerpo">
          <h2>${nvEsc(n.titulo)}</h2>
          ${n.bajada ? `<p>${nvEsc(n.bajada)}</p>` : ''}
        </div>
        ${datos.length ? `<div class="nv-datos">${datos.join('')}</div>` : ''}
        ${acciones}
      </div>
    </article>`;
}

// El cuerpo se procesa LÍNEA por línea: una línea "## " es un subtítulo y
// termina ahí. Si se partiera por bloques, el subtítulo se tragaría el
// párrafo que viene abajo cuando no hay renglón en blanco de por medio.
function nvCuerpoHTML(texto) {
  const out = [];
  let parrafo = [];

  const cerrarParrafo = () => {
    if (parrafo.length) {
      out.push(`<p>${nvEsc(parrafo.join(' '))}</p>`);
      parrafo = [];
    }
  };

  String(texto).split(/\r?\n/).forEach(linea => {
    const t = linea.trim();
    if (!t) { cerrarParrafo(); return; }
    if (t.startsWith('## ')) {
      cerrarParrafo();
      out.push(`<h3>${nvEsc(t.slice(3).trim())}</h3>`);
      return;
    }
    parrafo.push(t);
  });
  cerrarParrafo();

  return out.join('');
}

// Minutos de lectura: 200 palabras por minuto, redondeado hacia arriba.
function nvMinutos(texto) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(palabras / 200));
}

function nvTarjetaNota(n) {
  const rotulo = n.tipo === 'resumen' ? 'La semana' : 'Guía';
  const flecha = '<span class="nv-redondel" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>';

  // La guía se despliega en el mismo lugar: no hace falta otra pantalla
  // ni perder el lugar en el feed.
  const tieneCuerpo = n.tipo === 'nota' && n.cuerpo;
  const cuerpo = tieneCuerpo
    ? `<div class="nv-texto" id="nv-texto-${n.id}">
         <div class="nv-texto-in">${nvCuerpoHTML(n.cuerpo)}</div>
       </div>`
    : '';

  let accion = '';
  if (n.tipo === 'resumen') {
    accion = `<button class="nv-leer" onclick="goTo('buscar')">Buscar ${flecha}</button>`;
  } else if (tieneCuerpo) {
    accion = `<button class="nv-leer" id="nv-leer-${n.id}" aria-expanded="false"
                aria-controls="nv-texto-${n.id}" onclick="nvToggleNota('${n.id}')">
                <span>Leer</span> ${flecha}
              </button>`;
  }

  const meta = n.tipo === 'nota' && n.cuerpo
    ? `Por el equipo · ${nvMinutos(n.cuerpo)} min`
    : `Por el equipo · ${nvCuando(n.publicado_en || n.created_at)}`;

  return `
    <article class="nv-bandeja nv-nota nv-sube" id="nv-art-${n.id}">
      <div class="nv-nucleo">
        <p class="nv-rotulo">${rotulo}</p>
        <h2>${nvEsc(n.titulo)}</h2>
        ${n.bajada ? `<p>${nvEsc(n.bajada)}</p>` : ''}
        ${cuerpo}
        <div class="nv-firma">
          <span>${nvEsc(meta)}</span>
          ${accion}
        </div>
      </div>
    </article>`;
}

function nvToggleNota(id) {
  haptic('light');
  const art = document.getElementById('nv-art-' + id);
  const btn = document.getElementById('nv-leer-' + id);
  if (!art || !btn) return;
  const abierta = art.classList.toggle('abierta');
  btn.setAttribute('aria-expanded', abierta ? 'true' : 'false');
  btn.querySelector('span').textContent = abierta ? 'Cerrar' : 'Leer';
  if (abierta) trackEvent('novedad_guia_abierta', { id });
}

function nvTarjetaFeria(n) {
  const f = n.fecha_evento ? new Date(n.fecha_evento + 'T03:00:00Z') : null;
  const dia = f ? f.getDate() : '—';
  const mes = f ? NV_MESES[f.getMonth()].slice(0, 3) : '';
  return `
    <article class="nv-bandeja nv-agenda nv-sube">
      <div class="nv-nucleo">
        <div class="nv-fecha" aria-hidden="true">
          <span class="dia">${dia}</span>
          <span class="mes">${nvEsc(mes)}</span>
        </div>
        <div class="nv-lado">
          <p class="nv-rotulo">Feria</p>
          <h2>${nvEsc(n.titulo)}</h2>
          ${n.bajada ? `<p>${nvEsc(n.bajada)}</p>` : ''}
        </div>
      </div>
    </article>`;
}

function nvVerProveedor(id) {
  trackEvent('novedad_click', { proveedor_id: id });
  abrirDetalle(id);
}

function filtrarNovedades(tipo, btn) {
  haptic('light');
  novFiltroActual = tipo;
  document.querySelectorAll('#screen-novedades .nv-filtro')
    .forEach(b => b.setAttribute('aria-pressed', 'false'));
  if (btn) btn.setAttribute('aria-pressed', 'true');
  renderNovedades();
}

// ── Entrada al viewport + riel pegajoso ──────────────────────────
function nvObservarEntrada() {
  if (novIO) novIO.disconnect();
  novIO = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('dentro'); novIO.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

  document.querySelectorAll('#screen-novedades .nv-sube').forEach((el, i) => {
    el.style.transitionDelay = (i % 4) * 70 + 'ms';
    novIO.observe(el);
  });
}

// El riel invierte a vidrio claro al despegarse del hero: blanco sobre claro no se lee.
function nvInitRiel() {
  if (novRielIO) return;
  const riel = document.getElementById('nv-riel');
  const cent = document.getElementById('nv-centinela');
  if (!riel || !cent) return;
  novRielIO = new IntersectionObserver(e => {
    riel.classList.toggle('pegado', !e[0].isIntersecting);
  }, { rootMargin: '-13px 0px 0px 0px', threshold: 0 });
  novRielIO.observe(cent);
}

// ═══════════════════════════════════════════════════════════════
// PLANES
// ═══════════════════════════════════════════════════════════════
function renderPlanes() {
  // El titular usa el número real de proveedores: si lo hardcodeamos,
  // queda desactualizado y le miente al proveedor.
  const total = document.getElementById('pl-total');
  if (total && Array.isArray(proveedoresDB) && proveedoresDB.length) {
    total.textContent = proveedoresDB.length;
  }

  const ctaPro = document.getElementById('pl-cta-pro');
  const ctaFree = document.getElementById('pl-cta-free');
  if (!ctaPro || !ctaFree) return;

  const esProveedor = currentUser?.type === 'proveedor';

  if (esProvPro()) {
    ctaPro.textContent = 'Tu plan actual';
    ctaPro.classList.add('pl-cta--actual');
    ctaPro.disabled = true;
    ctaFree.textContent = 'Plan Gratis';
    ctaFree.classList.add('pl-cta--actual');
    ctaFree.disabled = true;
    return;
  }

  ctaPro.textContent = 'Activar Plan Pro';
  ctaPro.classList.remove('pl-cta--actual');
  ctaPro.disabled = false;

  if (esProveedor) {
    // Ya es proveedor: el gratis es su plan actual, no un botón de alta.
    ctaFree.textContent = 'Tu plan actual';
    ctaFree.classList.add('pl-cta--actual');
    ctaFree.disabled = true;
  } else {
    ctaFree.textContent = 'Empezar gratis';
    ctaFree.classList.remove('pl-cta--actual');
    ctaFree.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// TUS NOVEDADES — el proveedor ve las suyas y las puede bajar.
// Si se le acabó el stock, tiene que poder sacar la oferta solo,
// sin esperar al admin.
// ═══════════════════════════════════════════════════════════════
const NV_ESTADO_CHIP = {
  pendiente: { txt: 'En revisión', clase: 'espera' },
  publicado: { txt: 'Publicada', clase: 'viva' },
  rechazado: { txt: 'No salió', clase: 'no' }
};

// Tope de novedades vivas por proveedor. Sin esto un solo Pro llena el feed
// con su catálogo y el resto desaparece. Las rechazadas no ocupan cupo, y
// borrar una libera lugar en el acto.
const NV_MAX_ACTIVAS = 2;
const NV_ESTADOS_VIVOS = ['pendiente', 'publicado'];

async function nvCuposUsados(provId) {
  const { count, error } = await sb
    .from('novedades')
    .select('id', { count: 'exact', head: true })
    .eq('proveedor_id', provId)
    .eq('origen', 'manual')
    .in('estado', NV_ESTADOS_VIVOS);

  // Si la consulta falla no bloqueamos al proveedor: el trigger de la base
  // corta igual, y es preferible un error al insertar que un "no podés"
  // fantasma por un problema de red.
  return error ? null : (count ?? 0);
}

// Pinta el cupo en las cajas de publicar: cuántas le quedan, y si no le queda
// ninguna el botón deja de invitar y explica qué hacer.
// Lo guardamos porque renderNovedades() repinta esas cajas de cero: sin esto
// el cupo se borraría cada vez que se refresca el feed.
let nvCupoUsado = null;

function nvPintarCupo(usados) {
  if (usados != null) nvCupoUsado = usados;
  else usados = nvCupoUsado;
  if (!esProvPro() || usados == null) return;

  const btns = document.querySelectorAll('#nv-publicar-nucleo .nv-cta, #nv-publicar-nucleo-medio .nv-cta');
  const notas = document.querySelectorAll('#nv-publicar-nucleo .nv-pro-nota, #nv-publicar-nucleo-medio .nv-pro-nota');

  const lleno = usados >= NV_MAX_ACTIVAS;
  notas.forEach(n => {
    n.textContent = lleno
      ? `Usaste las ${NV_MAX_ACTIVAS} — borrá una de abajo para publicar otra`
      : `Te queda${NV_MAX_ACTIVAS - usados === 1 ? '' : 'n'} ${NV_MAX_ACTIVAS - usados} de ${NV_MAX_ACTIVAS}`;
  });
  btns.forEach(b => {
    b.classList.toggle('nv-cta-lleno', lleno);
    b.setAttribute('aria-disabled', lleno ? 'true' : 'false');
  });
}

async function cargarMisNovedades() {
  const caja = document.getElementById('nv-mias');
  if (!caja) return;

  // Al ocultar hay que vaciar: si no, quedan las tarjetas viejas en el DOM
  // y reaparecen como fantasmas la próxima vez que se muestre la sección.
  const ocultar = () => { caja.style.display = 'none'; caja.innerHTML = ''; };

  const provId = currentUser?.provData?.id;
  if (!provId || !esProvPro()) { ocultar(); return; }

  const { data, error } = await sb
    .from('novedades')
    .select('id,titulo,estado,imagen,created_at')
    .eq('proveedor_id', provId)
    .eq('origen', 'manual')          // las autogeneradas no son "suyas"
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) { ocultar(); return; }

  const vivas = (data || []).filter(n => NV_ESTADOS_VIVOS.includes(n.estado)).length;
  nvPintarCupo(vivas);

  if (!data.length) { ocultar(); return; }

  caja.style.display = 'block';
  caja.innerHTML = `
    <p class="nv-mias-titulo">Tus novedades <span class="nv-mias-cupo">${vivas} de ${NV_MAX_ACTIVAS}</span></p>
    <div class="nv-mias-lista">
      ${data.map(n => {
        const chip = NV_ESTADO_CHIP[n.estado] || NV_ESTADO_CHIP.pendiente;
        const foto = n.imagen
          ? `<img src="${nvEsc(imgThumb(n.imagen, 100, 70))}" alt="" loading="lazy">`
          : '<span class="nv-mia-sinfoto"></span>';
        return `
          <div class="nv-mia">
            ${foto}
            <div class="nv-mia-txt">
              <strong>${nvEsc(n.titulo)}</strong>
              <span class="nv-chip ${chip.clase}">${chip.txt}</span>
            </div>
            <button class="nv-mia-borrar" onclick="borrarNovedad('${nvEsc(String(n.id))}')"
                    aria-label="Borrar esta novedad">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>`;
      }).join('')}
    </div>`;
}

async function borrarNovedad(id) {
  if (!confirm('¿Borrar esta novedad? Sale del feed y no se puede recuperar.')) return;

  const provId = currentUser?.provData?.id;
  if (!provId) return;

  // El .eq extra es cinturón y tiradores: la RLS ya lo impide del lado del
  // servidor, pero así el borrado es explícito y no depende sólo de eso.
  const { error } = await sb.from('novedades')
    .delete()
    .eq('id', id)
    .eq('proveedor_id', provId);

  if (error) { showToast('No pudimos borrarla. Probá de nuevo.'); return; }

  haptic('medium');
  showToast('Novedad borrada');
  trackEvent('novedad_borrada', { id });

  novedadesDB = novedadesDB.filter(n => String(n.id) !== String(id));
  renderNovedades();
  cargarMisNovedades();
}

// ── Badge "Nuevo" ────────────────────────────────────────────────
// Se muestra hasta que la persona entra una vez. Si quedara para siempre
// dejaría de llamar la atención y pasaría a ser ruido.
const NV_CLAVE_VISTO = 'eg_novedades_visto';

function nvPintarBadge() {
  const visto = localStorage.getItem(NV_CLAVE_VISTO) === '1';
  ['badge-nuevo-drawer', 'badge-nuevo-sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visto ? 'none' : 'inline-block';
  });
}

function nvMarcarVisto() {
  try { localStorage.setItem(NV_CLAVE_VISTO, '1'); } catch (e) {}
  nvPintarBadge();
}

document.addEventListener('DOMContentLoaded', nvPintarBadge);

// ── Publicar (sólo Pro) ──────────────────────────────────────────
// La caja de publicar la ve TODO el mundo. Al Pro le abre el formulario;
// al resto le muestra qué se está perdiendo y lo lleva a Planes.
function nvActualizarPublicar() {
  const cajas = ['nv-publicar-nucleo', 'nv-publicar-nucleo-medio']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!cajas.length) return;

  const flechaMas = '<span class="nv-redondel" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>';
  const flechaVa = '<span class="nv-redondel" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>';

  if (esProvPro()) {
    const html = `
      <p class="nv-rotulo">Plan Pro</p>
      <h3>Contá qué entró esta semana</h3>
      <p>Tu novedad sale en este feed y la ve todo el que busca tu rubro.</p>
      <button class="nv-cta" onclick="abrirFormNovedad()">Publicar una novedad ${flechaMas}</button>
      <p class="nv-pro-nota">Hasta ${NV_MAX_ACTIVAS} novedades activas</p>`;
    cajas.forEach(box => { box.classList.remove('bloqueada'); box.innerHTML = html; });
    nvPintarCupo(null);   // reponemos el cupo que ya sabíamos, si lo sabíamos
    return;
  }

  // Proveedor sin Pro (o vencido) vs. comprador / visitante: cambia el texto,
  // no el destino. Los dos terminan en Planes.
  const esProveedor = currentUser?.type === 'proveedor';
  const titulo = esProveedor
    ? '¿Querés que te vean acá?'
    : 'Acá publican los proveedores';
  const bajada = esProveedor
    ? 'Contá cuándo entra mercadería o liquidás stock, y aparecés en este feed frente a los que buscan tu rubro.'
    : '¿Vendés al por mayor? Con el Plan Pro publicás tus ingresos y liquidaciones en este feed.';

  const html = `
    <p class="nv-rotulo">
      <svg class="nv-candado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Solo Plan Pro
    </p>
    <h3>${titulo}</h3>
    <p>${bajada}</p>
    <button class="nv-cta nv-cta-pro" onclick="haptic('light');goTo('planes')">Ver el Plan Pro ${flechaVa}</button>
    <p class="nv-pro-nota">Hasta ${NV_MAX_ACTIVAS} novedades activas a la vez</p>`;
  cajas.forEach(box => { box.classList.add('bloqueada'); box.innerHTML = html; });
}

// Desde "Mis productos": cerramos ese modal antes de abrir el de novedad.
// Si no, quedan los dos modales encimados.
function publicarProductoEnNovedades(id) {
  document.getElementById('misProductosModal')?.classList.remove('open');
  abrirFormNovedad(id);
}

// El producto del catálogo elegido para esta novedad (si eligió alguno).
let nvProductoElegido = null;

async function abrirFormNovedad(productoId) {
  if (!esProvPro()) { showToast('Publicar novedades es parte del Plan Pro'); return goTo('planes'); }

  // Cortamos acá antes de que llene el formulario y suba una foto para nada.
  const provId = currentUser?.provData?.id;
  const usados = provId ? await nvCuposUsados(provId) : null;
  if (usados != null) {
    nvPintarCupo(usados);
    if (usados >= NV_MAX_ACTIVAS) {
      showToast(`Podés tener ${NV_MAX_ACTIVAS} novedades a la vez. Borrá una para publicar otra.`);
      document.getElementById('nv-mias')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }

  haptic('light');
  document.getElementById('nv-modal-bg')?.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (productoId) {
    // Vino desde "Mis productos": lo precargamos.
    elegirProducto(String(productoId), true);
  } else {
    document.getElementById('nv-f-titulo')?.focus();
  }
}

function cerrarFormNovedad() {
  document.getElementById('nv-modal-bg')?.classList.remove('open');
  document.body.style.overflow = '';
  cerrarSelectorProducto();
}

// ── Traer un producto del catálogo ───────────────────────────────
async function abrirSelectorProducto() {
  const caja = document.getElementById('nv-selector');
  const lista = document.getElementById('nv-selector-lista');
  if (!caja || !lista) return;
  haptic('light');
  caja.style.display = 'block';
  lista.innerHTML = '<p class="nv-selector-vacio">Buscando tus productos…</p>';

  const provId = currentUser?.provData?.id;
  if (!provId) { lista.innerHTML = '<p class="nv-selector-vacio">No encontramos tu perfil de proveedor.</p>'; return; }

  const { data, error } = await sb
    .from('productos')
    .select('id,nombre,precio,imagen_url,imagenes,visible')
    .eq('proveedor_id', provId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    lista.innerHTML = '<p class="nv-selector-vacio">No pudimos traer tu catálogo. Probá de nuevo.</p>';
    return;
  }

  const prods = (data || []).filter(p => p.visible !== false);
  if (!prods.length) {
    lista.innerHTML = '<p class="nv-selector-vacio">Todavía no tenés productos cargados. Cargá uno desde tu perfil y después volvé.</p>';
    return;
  }

  lista.innerHTML = prods.map(p => {
    const foto = nvFotoProducto(p);
    const img = foto
      ? `<img src="${nvEsc(imgThumb(foto, 120, 70))}" alt="" loading="lazy">`
      : '<span class="nv-selector-sinfoto"></span>';
    return `
      <button type="button" class="nv-selector-item" onclick="elegirProducto('${nvEsc(String(p.id))}')">
        ${img}
        <span>
          <strong>${nvEsc(p.nombre)}</strong>
          <small>${p.precio ? '$' + Number(p.precio).toLocaleString('es-AR') : 'Sin precio'}</small>
        </span>
      </button>`;
  }).join('');
}

function cerrarSelectorProducto() {
  const caja = document.getElementById('nv-selector');
  if (caja) caja.style.display = 'none';
}

// El producto puede tener la foto en imagen_url o en el array imagenes.
function nvFotoProducto(p) {
  if (p.imagen_url && /^https?:\/\//.test(p.imagen_url)) return p.imagen_url;
  if (Array.isArray(p.imagenes) && typeof p.imagenes[0] === 'string' &&
      /^https?:\/\//.test(p.imagenes[0])) return p.imagenes[0];
  return null;
}

async function elegirProducto(id, silencioso) {
  const provId = currentUser?.provData?.id;
  if (!provId) return;

  const { data, error } = await sb
    .from('productos')
    .select('id,nombre,precio,imagen_url,imagenes')
    .eq('id', id)
    .eq('proveedor_id', provId)   // sólo un producto propio
    .maybeSingle();

  if (error || !data) { showToast('No encontramos ese producto'); return; }

  nvProductoElegido = { id: data.id, nombre: data.nombre, foto: nvFotoProducto(data) };

  // Sugerimos un título, pero lo puede reescribir.
  const inpTitulo = document.getElementById('nv-f-titulo');
  if (inpTitulo && !inpTitulo.value.trim()) {
    inpTitulo.value = `Entró ${data.nombre}`.slice(0, 120);
    document.getElementById('nv-cont-titulo').textContent = `${inpTitulo.value.length}/120`;
  }

  // Mostramos el producto elegido y limpiamos la foto subida a mano:
  // si eligió del catálogo, la foto sale del producto.
  const caja = document.getElementById('nv-elegido');
  const img = document.getElementById('nv-elegido-img');
  const nom = document.getElementById('nv-elegido-nombre');
  if (caja && nom) {
    nom.textContent = data.nombre;
    if (img) {
      if (nvProductoElegido.foto) { img.src = imgThumb(nvProductoElegido.foto, 120, 70); img.style.display = 'block'; }
      else img.style.display = 'none';
    }
    caja.style.display = 'flex';
  }
  nvArchivo = null;
  const inpFile = document.getElementById('nv-f-imagen');
  if (inpFile) inpFile.value = '';
  const prev = document.getElementById('nv-preview');
  if (prev) prev.style.display = 'none';

  cerrarSelectorProducto();
  if (!silencioso) haptic('light');
}

function quitarProductoElegido() {
  nvProductoElegido = null;
  const caja = document.getElementById('nv-elegido');
  if (caja) caja.style.display = 'none';
}

let nvArchivo = null;
function previewNovedadImg(input) {
  const f = input.files && input.files[0];
  const cont = document.getElementById('nv-preview');
  const img = document.getElementById('nv-preview-img');
  if (!f) { nvArchivo = null; if (cont) cont.style.display = 'none'; return; }
  if (!f.type.startsWith('image/')) {
    showToast('Elegí una imagen'); input.value = ''; return;
  }
  if (f.size > 8 * 1024 * 1024) {
    showToast('La foto no puede pesar más de 8 MB'); input.value = ''; return;
  }
  nvArchivo = f;
  if (img && cont) { img.src = URL.createObjectURL(f); cont.style.display = 'block'; }
}

async function enviarNovedad() {
  const btn = document.getElementById('nv-f-enviar');
  const titulo = document.getElementById('nv-f-titulo').value.trim();
  const bajada = document.getElementById('nv-f-bajada').value.trim();
  const sello = document.getElementById('nv-f-sello').value;
  const minimo = document.getElementById('nv-f-minimo').value.trim();
  const descRaw = document.getElementById('nv-f-descuento').value;

  if (titulo.length < 3) { showToast('Contanos qué pasó, en pocas palabras'); return; }
  if (titulo.length > 120) { showToast('El título es muy largo'); return; }

  let descuento = null;
  if (descRaw !== '') {
    descuento = parseInt(descRaw, 10);
    if (isNaN(descuento) || descuento < 1 || descuento > 90) {
      showToast('El descuento tiene que estar entre 1 y 90'); return;
    }
  }

  const provId = currentUser?.provData?.id;
  if (!provId) { showToast('No encontramos tu perfil de proveedor'); return; }

  btn.disabled = true;
  const textoOriginal = btn.childNodes[0].nodeValue;
  btn.childNodes[0].nodeValue = 'Enviando… ';

  try {
    // Recontamos recién ahora: entre que abrió el formulario y apretó enviar
    // pudo haber publicado desde otra pestaña.
    const usados = await nvCuposUsados(provId);
    if (usados != null && usados >= NV_MAX_ACTIVAS) {
      nvPintarCupo(usados);
      showToast(`Ya tenés ${NV_MAX_ACTIVAS} novedades activas. Borrá una para publicar otra.`);
      cerrarFormNovedad();
      cargarMisNovedades();
      return;
    }

    let urlImagen = null;
    if (nvArchivo) {
      urlImagen = await subirFotoStorage(nvArchivo, provId);
    } else if (nvProductoElegido?.foto) {
      // Vino del catálogo: reusamos la foto del producto, no subimos nada.
      urlImagen = nvProductoElegido.foto;
    }

    // estado/origen los fija la RLS igual; los mandamos explícitos para que
    // el insert falle ruidosamente si alguien manipuló el cliente.
    const { error } = await sb.from('novedades').insert({
      tipo: 'drop',
      estado: 'pendiente',
      origen: 'manual',
      titulo,
      bajada: bajada || null,
      imagen: urlImagen,
      sello,
      minimo: minimo || null,
      descuento,
      proveedor_id: provId,
      producto_id: nvProductoElegido?.id || null,
      rubro: currentUser?.provData?.rubro || null,
      autor_email: currentUser?.email || null
    });
    if (error) throw error;

    trackEvent('novedad_enviada', { proveedor_id: provId });
    cerrarFormNovedad();
    showToast('Enviada. La revisamos y sale hoy mismo.');

    document.getElementById('nv-f-titulo').value = '';
    document.getElementById('nv-f-bajada').value = '';
    document.getElementById('nv-f-minimo').value = '';
    document.getElementById('nv-f-descuento').value = '';
    document.getElementById('nv-f-imagen').value = '';
    document.getElementById('nv-preview').style.display = 'none';
    nvArchivo = null;
    quitarProductoElegido();
    document.getElementById('nv-cont-titulo').textContent = '0/120';
    document.getElementById('nv-cont-bajada').textContent = '0/280';
    cargarMisNovedades();
  } catch (e) {
    console.error('[novedades] enviar:', e);
    const msg = e?.message || '';
    showToast(
      msg.includes('EG_NOVEDADES_MAX')  ? `Ya tenés ${NV_MAX_ACTIVAS} novedades activas. Borrá una para publicar otra.` :
      msg.includes('row-level security') ? 'Publicar novedades es parte del Plan Pro' :
      'No pudimos enviarla. Probá de nuevo.');
  } finally {
    btn.disabled = false;
    btn.childNodes[0].nodeValue = textoOriginal;
  }
}

// Contadores de caracteres + cierre con Escape
document.addEventListener('DOMContentLoaded', () => {
  const t = document.getElementById('nv-f-titulo');
  const b = document.getElementById('nv-f-bajada');
  t?.addEventListener('input', () => {
    document.getElementById('nv-cont-titulo').textContent = `${t.value.length}/120`;
  });
  b?.addEventListener('input', () => {
    document.getElementById('nv-cont-bajada').textContent = `${b.value.length}/280`;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('nv-modal-bg')?.classList.contains('open')) {
      cerrarFormNovedad();
    }
  });
});

/* ═══════════════════════════════════════════════════════
   Mockup 3D del hero de "Para Proveedores"
   El teléfono acompaña al mouse. Solo corre en escritorio
   con puntero fino; en celular no se ejecuta nada.
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('lpPhone3D');
  if (!box) return;
  if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  const phone  = box.querySelector('.lp-phone');
  const layers = box.querySelectorAll('[data-depth]');
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

  function frame() {
    // lerp: el teléfono persigue al mouse en vez de saltar
    cx += (tx - cx) * 0.075;
    cy += (ty - cy) * 0.075;

    phone.style.transform = `rotateY(${-9 + cx * 11}deg) rotateX(${4 - cy * 8}deg)`;
    layers.forEach(l => {
      const d = parseFloat(l.dataset.depth) || 1;
      l.style.transform = `translate3d(${cx * d * 14}px, ${cy * d * 11}px, 0)`;
    });

    // cortamos el loop cuando ya llegó: no dejamos un rAF girando de fondo
    raf = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001)
      ? requestAnimationFrame(frame)
      : null;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  box.addEventListener('mousemove', e => {
    const r = box.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width  - 0.5) * 2;
    ty = ((e.clientY - r.top)  / r.height - 0.5) * 2;
    kick();
  });
  box.addEventListener('mouseleave', () => { tx = 0; ty = 0; kick(); });
});
