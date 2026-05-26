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
const RUBROS_LISTA = ['Tecnología','Indumentaria','Hogar y Deco','Bazar','Alimentos','Belleza y Salud','Deportes','Automotor','Construcción','Servicios','Juguetería','Ferretería','Iluminación','Muebles','Textil y Telas','Lencería','Librería y Papelería','Marroquinería y Bolsos','Limpieza','Blanquería','Mascotas','Bebés y Niños','Electrónica','Herramientas','Packaging','Otro'];
const RUBROS_ICONS = {
  'Tecnología':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  'Indumentaria':`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.86H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.86l.58-3.57a2 2 0 0 0-1.34-2.23z"/></svg>`,
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
  'calzado': ['Indumentaria'], 'mochilas': ['Marroquinería y Bolsos'], 'marroquineria': ['Marroquinería y Bolsos'], 'textil': ['Textil y Telas'],
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

const CAT_PRINCIPAL = ['Tecnología','Indumentaria','Hogar y Deco','Bazar','Alimentos','Belleza y Salud','Deportes','Automotor','Construcción','Servicios','Juguetería','Ferretería','Iluminación','Muebles','Textil y Telas','Librería y Papelería','Marroquinería y Bolsos','Limpieza','Blanquería','Mascotas','Bebés y Niños','Electrónica','Herramientas','Packaging','Otro'];

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
  if (p.provincia && quitarAcentos(p.provincia.toLowerCase()).includes(qn)) return true;
  if (p.descripcion && quitarAcentos(p.descripcion.toLowerCase()).includes(qn)) return true;
  for (const [sub, rubros] of Object.entries(SUBCATEGORIA_MAP)) {
    if (sub.includes(qn) || qn.includes(sub.split(' ')[0])) {
      if (rubros.some(r => matchesCat(p.rubro, r))) return true;
    }
  }
  return false;
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
  'Accesorios de celular': 'Tecnología', 'Carteras y mochilas': 'Marroquinería y Bolsos', 'Calzado': 'Indumentaria',
  'Telas e insumos textiles': 'Textil y Telas', 'Juguetes y juegos': 'Juguetería', 'Librería y papelería': 'Librería y Papelería',
  'Alimentos y bebidas': 'Alimentos', 'Tecnologia': 'Tecnología',
  // Current rubros map to themselves
  'Tecnología': 'Tecnología', 'Indumentaria': 'Indumentaria', 'Hogar y Deco': 'Hogar y Deco',
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
    el.textContent = (prefix || '') + current;
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
  const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];
  el.innerHTML = favs.map((p, i) => {
    const pid = String(p.id);
    const bg = bgs[i % bgs.length];
    const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
    const avgR = getProvRating(pid).avg.toFixed(1);
    return `<div data-id="${pid}" style="background:white;border-radius:16px;border:1px solid #E2E8F8;margin-bottom:12px;overflow:hidden;cursor:pointer">
      <div style="display:flex;align-items:center;gap:11px;padding:12px 14px 8px">
        ${p.logo_url
        ? `<div style="width:44px;height:44px;border-radius:11px;overflow:hidden;flex-shrink:0"><img src="${p.logo_url}" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div style="width:44px;height:44px;border-radius:11px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;flex-shrink:0;font-family:'Sora',sans-serif">${ini}</div>`
      }
        <div style="flex:1;min-width:0">
          <div style="font-family:'Sora',sans-serif;font-size:.93rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
          <div style="font-size:.75rem;color:#6B7A99;margin-top:2px">${p.rubro || ''}${p.provincia ? ' · ' + p.provincia : ''}</div>
        </div>
        <div style="font-size:.76rem;font-weight:700;color:#F59E0B;flex-shrink:0">${avgR} ★</div>
      </div>
      <div style="padding:0 14px 13px">
        <p style="font-size:.79rem;color:#6B7A99;line-height:1.45;margin-bottom:9px">${p.desc || ''}</p>
        <div style="display:flex;gap:7px">
          <button data-favid="${pid}" style="background:#FFF0F5;color:#F43F8E;border:none;border-radius:9px;padding:7px 12px;font-size:.76rem;font-weight:700;cursor:pointer">❤️ Quitar</button>
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
  renderProvs(proveedoresDB);
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
      .select('*')
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
      listEl.innerHTML = '<p style="font-size:.82rem;color:var(--gray);text-align:center;padding:8px 0">Sé el primero en dejar una reseña ✍️</p>';
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
  resenaRatingActual = 0;
  document.getElementById('resena-prov-name').textContent = provActual.nombre;
  document.getElementById('resena-autor-input').value = currentUser ? currentUser.name : '';
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
  const labels = ['', 'Muy malo 😕', 'Malo 😐', 'Regular 🙂', 'Bueno 😊', 'Excelente 🤩'];
  document.getElementById('resena-rating-label').textContent = labels[val] || '';
  document.querySelectorAll('#resenaStars .star').forEach(s => {
    s.classList.toggle('filled', parseInt(s.dataset.val) <= val);
  });
}

async function submitResena() {
  if (!resenaRatingActual) { showToast('Por favor calificá primero'); return; }
  const autor = document.getElementById('resena-autor-input').value.trim() || 'Anónimo';
  const texto = document.getElementById('resena-texto-input').value.trim();
  if (!texto) { showToast('Escribí tu experiencia'); return; }

  const pid = String(provActual.id);
  // Usamos los nombres de columna reales de tu tabla Supabase
  const nuevaResena = {
    proveedor_id: pid,
    usuario_nombre: autor,
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
    showToast('Reseña publicada. ¡Gracias!');
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
      .select('id, nombre, rubro, created_at')
      .eq('estado', 'aprobado')
      .gte('created_at', hace30dias)
      .order('created_at', { ascending: false })
      .limit(8);

    notificaciones = [];

    (nuevos || []).forEach(p => {
      const dias = Math.floor((Date.now() - new Date(p.created_at)) / 86400000);
      const tiempo = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : 'Hace ' + dias + ' días';
      notificaciones.push({
        id: 'prov-' + p.id,
        tipo: 'new', icon: '🆕',
        titulo: 'Nuevo: ' + p.nombre,
        texto: (p.rubro || 'Proveedor') + ' verificado se sumó a EmprendeGo.',
        tiempo,
        provId: String(p.id)
      });
    });

    if (!notificaciones.length) {
      notificaciones.push({ id: 'n-empty', tipo: 'tip', icon: '🔔', titulo: 'Sin novedades', texto: 'Cuando haya nuevos proveedores te avisamos acá.', tiempo: '' });
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
      <div class="notif-icon ${n.tipo}">${n.icon}</div>
      <div class="notif-text"><strong>${escHtml(n.titulo)}</strong><span>${escHtml(n.texto)}</span></div>
      <div class="notif-time">${n.tiempo}</div>
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
  const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED'];
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
      <div class="comp-header-ini" style="background:${bgs[i]}">${ini}</div>
      <div class="comp-header-name">${p.nombre}</div>
      ${p.pro ? '<span style="font-size:.62rem;font-weight:800;background:#0D1B3E;color:#F59E0B;padding:2px 7px;border-radius:10px;letter-spacing:.04em">PRO</span>' : ''}
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
      tbody += `<td>${val}</td>`;
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
        <button onclick="closeComparador();abrirDetalle('${p.id}')" style="background:var(--blue-light);color:var(--blue);border:none;border-radius:12px;padding:12px;font-family:'Sora',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer">
          Ver perfil de ${p.nombre} →
        </button>`).join('')}
      <button onclick="comparadorList=[];updateComparadorFab();closeComparador();showToast('Comparador limpiado')" style="background:#fee2e2;color:#ef4444;border:none;border-radius:12px;padding:10px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;margin-top:4px">
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
  const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];
  const bg = bgs[i % bgs.length];
  const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
  const { avg, count } = getProvRating(p.id);
  const pid = String(p.id);
  const faved = esFav(pid);
  const heartFill = faved ? '#EF4444' : 'none';
  const heartStroke = faved ? '#EF4444' : '#CBD5E1';
  const actionBtn = (p.pro && p.whatsapp)
    ? `<a href="https://wa.me/${(p.whatsapp || '').replace(/\D/g, '')}" onclick="event.stopPropagation()" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:6px;background:#25D366;color:white;border-radius:10px;padding:9px;font-family:'Sora',sans-serif;font-size:.78rem;font-weight:700;text-decoration:none;margin-top:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>WhatsApp</a>`
    : `<button onclick="event.stopPropagation();abrirDetalle('${pid}')" style="width:100%;background:#F5F7FF;border:1.5px solid #E2E8F8;border-radius:10px;padding:9px;font-family:'Sora',sans-serif;font-size:.78rem;font-weight:700;color:#1847C8;cursor:pointer;margin-top:8px">Ver perfil</button>`;
  return `<div data-id="${pid}" style="background:white;border-radius:14px;border:1px solid #E2E8F8;padding:14px;cursor:pointer">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:48px;height:48px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;font-family:'Sora',sans-serif;flex-shrink:0">${ini}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-family:'Sora',sans-serif;font-size:.88rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.nombre)}</span>
          ${p.pro ? '<span style="font-size:.6rem;font-weight:800;background:#0D1B3E;color:#F59E0B;padding:2px 7px;border-radius:8px;flex-shrink:0;letter-spacing:.04em">PRO</span>' : ''}
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
    <div style="background:white;border-radius:16px;border:1px solid #E2E8F8;margin-bottom:4px;padding:14px">
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
    <div style="flex-shrink:0;width:130px;background:white;border-radius:14px;border:1px solid #E2E8F8;padding:14px 12px;display:flex;flex-direction:column;align-items:center;gap:9px">
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
      `<button onclick="filterCat('${r}')" style="display:flex;align-items:center;gap:4px;background:white;border:1.5px solid #E2E8F8;border-radius:20px;padding:6px 14px;font-size:.78rem;font-weight:700;color:#1847C8;cursor:pointer;white-space:nowrap">${RUBROS_ICONS[r] || ''} ${escHtml(r)}</button>`
    ).join('');
    el.innerHTML = `<div class="prov-list-empty" style="text-align:center;padding:40px 24px">
      <div style="font-size:3rem;margin-bottom:14px">🔍</div>
      <div style="font-family:'Sora',sans-serif;font-size:.95rem;font-weight:800;color:#1A1A1A;margin-bottom:16px">${msg}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:20px">${cats}</div>
      <button onclick="currentCat='Todas';document.getElementById('searchInput').value='';filterProvs()" style="background:#006039;color:white;border:none;border-radius:12px;padding:13px 24px;font-family:'Sora',sans-serif;font-size:.88rem;font-weight:800;cursor:pointer">Ver todos los proveedores</button>
    </div>`;
    return;
  }
  const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];
  el.innerHTML = list.map((p, i) => {
    const pid = String(p.id);
    const fav = esFav(pid);
    const bg = bgs[i % bgs.length];
    const ini = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
    const { avg, count } = getProvRating(pid);
    const enComp = comparadorList.some(x => String(x.id) === pid);
    return `<div data-id="${pid}" style="background:white;border-radius:16px;border:1px solid #E2E8F8;margin-bottom:4px;overflow:hidden;cursor:pointer">
      <div style="display:flex;align-items:center;gap:11px;padding:12px 14px 8px">
        ${p.logo_url
        ? `<div style="width:44px;height:44px;border-radius:11px;overflow:hidden;flex-shrink:0"><img src="${escHtml(p.logo_url)}" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div style="width:44px;height:44px;border-radius:11px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;flex-shrink:0;font-family:'Sora',sans-serif">${escHtml(ini)}</div>`
      }
        <div style="flex:1;min-width:0">
          <div style="font-family:'Sora',sans-serif;font-size:.93rem;font-weight:800;word-break:break-word;line-height:1.2">${escHtml(p.nombre)}</div>
          <div style="font-size:.75rem;color:#6B7A99;margin-top:2px">${escHtml(p.rubro || 'General')}${p.provincia ? ' · ' + escHtml(p.provincia) : ''}</div>
        </div>
        ${count > 0 ? `<div style="font-size:.75rem;font-weight:700;color:#F59E0B;flex-shrink:0">${avg.toFixed(1)} ★</div>` : ''}
      </div>
      <div style="padding:0 14px 13px">
        <p style="font-size:.79rem;color:#6B7A99;line-height:1.45;margin-bottom:9px">${escHtml(p.desc || '')}</p>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
          ${p.pro ? '<span style="font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:20px;background:#0D1B3E;color:#F59E0B;letter-spacing:.04em">PRO</span>' : ''}
          <span style="font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:20px;background:#E6F7EE;color:#00A651">✓ Verificado</span>
        </div>
        <div class="prov-card-actions">
          ${p.pro
        ? `<button data-wa="${escHtml(p.whatsapp || '')}" data-nombre="${escHtml(p.nombre || '')}" data-rubro="${escHtml(p.rubro || '')}" style="background:#25d366;color:white;border:none;border-radius:9px;padding:7px 14px;font-size:.76rem;font-weight:700;cursor:pointer">💬 WhatsApp</button>`
        : `<button data-chatid="${pid}" style="background:#EEF2FF;color:#1847C8;border:none;border-radius:9px;padding:7px 14px;font-size:.76rem;font-weight:700;cursor:pointer">💬 Chat</button>`}
          <button data-favid="${pid}" style="background:#f4f7ff;border:none;border-radius:9px;padding:7px 10px;cursor:pointer;font-size:.95rem;flex-shrink:0">${fav ? '❤️' : '♡'}</button>
          <button data-compid="${pid}" class="comparar-btn ${enComp ? 'added' : ''}" style="padding:7px 10px;font-size:.72rem">${enComp ? '✓' : '⚖'}</button>
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
    if (wb) { e.stopPropagation(); abrirWA(wb.dataset.wa, mensajeWAProv({ nombre: wb.dataset.nombre, rubro: wb.dataset.rubro })); return; }
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

function filterProvs() {
  const q = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const prov = document.getElementById('fil-prov')?.value || '';
  const plan = document.getElementById('fil-plan')?.value || '';
  const orden = document.getElementById('fil-orden')?.value || '';
  const rubroFil = document.getElementById('fil-rubro')?.value || '';
  const lista = proveedoresDB;
  let result = lista.filter(p => {
    const mc = matchesCat(p.rubro, currentCat);
    const mq = matchesQuery(p, q);
    const mp = !prov || quitarAcentos(p.provincia || '') === quitarAcentos(prov);
    const mpl = !plan || (plan === 'pro' ? p.pro === true : p.pro !== true);
    const mrb = !rubroFil || matchesCat(p.rubro, rubroFil);
    return mc && mq && mp && mpl && mrb;
  });
  if (orden === 'rating') {
    result = result.slice().sort((a, b) => getProvRating(String(b.id)).avg - getProvRating(String(a.id)).avg);
  } else if (orden === 'minimo') {
    const num = s => parseInt((s || '').replace(/[^0-9]/g, '')) || 999999;
    result = result.slice().sort((a, b) => num(a.pedido_minimo) - num(b.pedido_minimo));
  } else if (orden === 'nuevo') {
    result = result.slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }
  renderProvs(result);
}

function setChip(el, cat) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentCat = cat;
  if (buscarTab === 'productos') renderProdBuscar(currentCat, document.getElementById('searchInput')?.value || '');
  else filterProvs();
}

function filterCat(cat) {
  goTo('buscar');
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

function abrirWA(num, msg) {
  haptic('success');
  const n = (num || '').replace(/[^0-9]/g, '');
  if (!n) { showToast('WhatsApp no disponible'); return; }
  const texto = msg || '¡Hola! Te encontré en EmprendeGO y me gustaría consultar sobre tus productos.';
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(texto), '_blank');
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
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">Este proveedor todavia no cargo productos.</div>';
      return;
    }
    const bgsColores = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];
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
          provColor: bgsColores[i % bgsColores.length], imgUrl: p.imagen_url || '',
          whatsapp: provActual?.whatsapp || '', esPro: provDetalleEsPro
        });
      }
    });
    provDetalleData = data;
    await renderDetalleProductos(proveedorId);
  } catch (e) {
    const el2 = document.getElementById('det-productos-carousels');
    if (el2) el2.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">No se pudieron cargar los productos.</div>';
  }
}

async function renderDetalleProductos(proveedorId) {
  const el = document.getElementById('det-productos-carousels');
  if (!el) return;
  const data = provDetalleData;
  const bgsColores = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];
  const slice = data.slice(0, (provDetalleOffset + 1) * DETALLE_PAGE_SIZE);
  const resto = data.length - slice.length;
  el.style.cssText = '';
  const cards = slice.map((p, i) => {
    const prodId = 'real_' + p.id;
    const emoji = getEmojiCat(p.categoria_principal || p.categoria);
    const imgHtml = p.imagen_url
      ? `<img src="${escHtml(p.imagen_url)}" style="width:100%;height:90px;object-fit:cover;display:block" onerror="this.style.display='none'">`
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
  if (!provDetalleEsPro && data.length === provDetalleLimite) {
    const { count: totalReal } = await sb.from('productos').select('*', { count: 'exact', head: true }).eq('proveedor_id', proveedorId);
    if (totalReal && totalReal > provDetalleLimite) {
      notaLimite = `<div style="text-align:center;padding:10px;font-size:.75rem;color:var(--gray);background:#f8fafc;border-radius:10px;margin-top:8px">Mostrando 30 de ${totalReal} productos. Este proveedor tiene más en su catálogo completo.</div>`;
    }
  }
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:${(resto > 0 || notaLimite) ? '12px' : '0'}">
      ${cards}
    </div>
    ${resto > 0 ? `<button onclick="provDetalleOffset++;renderDetalleProductos('${proveedorId}')" style="width:100%;background:#f5f7ff;border:1.5px solid #E2E8F8;border-radius:12px;padding:12px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:800;color:#1847C8;cursor:pointer">Ver ${Math.min(resto, DETALLE_PAGE_SIZE)} producto${Math.min(resto, DETALLE_PAGE_SIZE) > 1 ? 's' : ''} más →</button>` : ''}
    ${notaLimite}
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

  const detLogoEl = document.getElementById('det-logo');
  const detIni = (p.inicial || p.nombre.substring(0, 2)).toUpperCase();
  if (p.logo_url) {
    detLogoEl.innerHTML = `<img src="${escHtml(p.logo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    detLogoEl.textContent = detIni;
  }
  document.getElementById('det-nombre').textContent = p.nombre;
  const rubrosArr = (p.rubro || 'General').split(',').map(r => r.trim()).filter(Boolean);
  const rubrosHtml = rubrosArr.map(r =>
    `<span style="display:inline-block;background:#f0f4ff;color:#1847C8;border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700;margin:2px 2px">${escHtml(r)}</span>`
  ).join('');
  document.getElementById('det-rubro').innerHTML = rubrosHtml + (p.provincia ? `<span style="display:inline-block;color:var(--gray);font-size:.72rem;margin:2px 4px">· ${escHtml(p.provincia)}</span>` : '');
  document.getElementById('det-desc').textContent = p.desc || p.descripcion || 'Sin descripcion.';
  document.getElementById('det-minimo').textContent = p.pedido_minimo || 'Sin minimo';
  document.getElementById('det-envios').textContent = p.envios || 'Consultar';
  document.getElementById('det-provincia').textContent = p.provincia || '-';
  document.getElementById('det-instagram').textContent = p.instagram || '-';
  document.getElementById('det-pro-badge').style.display = p.pro ? 'inline-flex' : 'none';
  document.getElementById('det-fav-btn').textContent = esFav(p.id) ? '❤️' : '♡';
  document.getElementById('det-wa-btn').style.display = (p.pro && p.whatsapp) ? 'flex' : 'none';

  // Reseñas solo para plan Pro
  const resenasSection = document.getElementById('det-resenas-section');
  if (resenasSection) resenasSection.style.display = p.pro ? 'block' : 'none';

  // Reset calc
  ['calc-costo', 'calc-venta', 'calc-cantidad'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  const cr = document.getElementById('calc-result');
  if (cr) cr.style.display = 'none';

  // Rating (async — carga desde Supabase, solo Pro)
  if (p.pro) renderRatingSummary(p.id);

  // Comp button
  updateDetCompBtn();

  try { sb.from('busquedas').insert({ termino: p.nombre }); } catch (e) { }
  const _vk = `eg_visit_${p.id}`, _vt = parseInt(localStorage.getItem(_vk) || '0');
  if (Date.now() - _vt > 86400000) {
    localStorage.setItem(_vk, Date.now());
    sb.rpc('increment_visitas', { proveedor_id: p.id }).then(() => {});
  }
  cargarProductosDetalle(p.id);
  goTo('detalle');
}

function volverDetalle() { goBack('buscar'); }
function detWA() { if (provActual && provActual.whatsapp) abrirWA(provActual.whatsapp, mensajeWAProv(provActual)); else showToast('WhatsApp no disponible'); }
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
      .or(`usuario_email.eq.${currentUser.email},de_tipo.eq.proveedor`)
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
        .or(`usuario_email.eq.${currentUser.email},de_tipo.eq.proveedor`)
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
    // Limpia code_verifiers huérfanos (no llamamos signOut: es lento e innecesario,
    // el nuevo login va a sobreescribir la sesión de todas formas).
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') && k.includes('-auth-token-code-verifier')) localStorage.removeItem(k);
      });
    } catch (e) { }
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
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
  hideAuthError();
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
}

function traducirErrorAuth(error) {
  const msg = (error && error.message ? error.message : String(error || '')).toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
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
      result = await sb.auth.signUp({ email, password });
    }
    if (result.error) {
      showAuthError(traducirErrorAuth(result.error));
      btn.disabled = false; btn.textContent = txtOrig;
      return;
    }
    // Si "Confirm email" está activo en Supabase, signUp devuelve user pero sin session.
    if (authMode === 'signup' && !result.data?.session) {
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

async function checkSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      const user = session.user;
      const name = user.user_metadata?.full_name || user.email.split('@')[0];
      const email = user.email;
      const picture = user.user_metadata?.avatar_url || '';
      // Guardar/actualizar usuario en la tabla usuarios (error no bloquea login)
      try { await sb.from('usuarios').upsert({ email: email.toLowerCase().trim(), nombre: name, foto_url: picture }, { onConflict: 'email' }); } catch (e) { console.warn('[checkSession] upsert usuarios:', e); }
      const { data: provList } = await sb.from('proveedores').select('id,nombre,plan,plan_desde,plan_hasta,rubro,provincia,descripcion,whatsapp,instagram,pedido_minimo,envios,estado,email,logo_url,tn_store_id,ml_connected,ml_user_id,ml_nickname,ml_categoria_map').eq('email', email.toLowerCase().trim());
      const prov = provList && provList.length > 0 ? provList[0] : null;
      if (prov && prov.estado === 'aprobado') {
        if (prov.plan === 'pro' && prov.plan_hasta) {
          const hasta = new Date(prov.plan_hasta + 'T03:00:00Z');
          if (hasta < new Date()) {
            await sb.from('proveedores').update({ plan: 'gratis', plan_desde: null }).eq('id', prov.id);
            prov.plan = 'gratis'; prov.plan_desde = null;
            // plan_hasta se deja en DB para que verificarExpiracionPlan lo detecte en sesiones futuras
          }
        }
        handleLogin({ name: prov.nombre || name, email, picture, type: 'proveedor', proveedorId: prov.id, provData: prov });
        verificarExpiracionPlan(prov);
      } else {
        handleLogin({ name, email, picture, type: 'user' });
      }
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
  banner.innerHTML = `<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:14px;padding:14px 16px;margin:12px 16px 0">
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
  banner.innerHTML = `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:14px;padding:14px 16px;margin:12px 16px 0">
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
      if (pd2.plan === 'pro' && planHasta && planHasta > new Date()) {
        badge.textContent = '⭐ PRO · hasta ' + planHasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
        badge.style.display = 'inline-flex';
        const diasRestantes = Math.ceil((planHasta - new Date()) / 86400000);
        if (diasRestantes <= 7) mostrarAvisoPlanProximo(planHasta);
      } else {
        badge.style.display = 'none';
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
    <div style="font-family:'Sora',sans-serif;font-size:1.1rem;font-weight:900;color:#1A1A1A;margin-bottom:8px">${escHtml(f)} es exclusivo del Plan Pro</div>
    <div style="font-size:.85rem;color:#777;line-height:1.5;margin-bottom:24px">Desbloqueá todas las funciones avanzadas para hacer crecer tu negocio mayorista.</div>
    <button onclick="document.getElementById('modal-pro-upgrade').remove();goTo('planes')" style="width:100%;background:#006039;color:white;border:none;border-radius:14px;padding:16px;font-family:'Sora',sans-serif;font-size:.95rem;font-weight:800;cursor:pointer;margin-bottom:10px">Activar Plan Pro →</button>
    <button onclick="document.getElementById('modal-pro-upgrade').remove()" style="width:100%;background:#f5f5f5;color:#555;border:none;border-radius:14px;padding:14px;font-family:'Sora',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer">Ahora no</button>
  </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ===== STATS DASHBOARD =====
async function cargarStatsDashboard() {
  if (!currentUser || !currentUser.proveedorId) return;
  const esPro = esProvPro();
  try {
    const { data: prov } = await sb.from('proveedores').select('visitas').eq('id', currentUser.proveedorId).single();
    if (prov) {
      const el = document.getElementById('stat-visitas');
      if (el) {
        if (esPro) {
          el.textContent = prov.visitas || 0;
          el.style.filter = '';
        } else {
          el.textContent = '??';
          el.style.cssText += ';filter:blur(6px);user-select:none';
        }
      }
    }
    const { data: msgs } = await sb.from('mensajes').select('id,leido').eq('proveedor_id', currentUser.proveedorId).eq('de_tipo', 'usuario');
    const totalMsgs = msgs ? msgs.length : 0;
    const elMsgs = document.getElementById('dash-msgs-count');
    if (elMsgs) elMsgs.textContent = totalMsgs;
    const elLeads = document.getElementById('stat-leads');
    if (elLeads) {
      if (esPro) {
        elLeads.textContent = totalMsgs;
        elLeads.style.filter = '';
      } else {
        elLeads.textContent = '??';
        elLeads.style.cssText += ';filter:blur(6px);user-select:none';
      }
    }
    const noLeidos = msgs ? msgs.filter(m => !m.leido).length : 0;
    const elNew = document.getElementById('dash-msgs-new');
    if (elNew && noLeidos > 0) { elNew.style.display = 'inline'; elNew.textContent = noLeidos + ' New'; }
    // Mostrar candado sobre stats si plan gratis
    const statsGrid = document.getElementById('dash-stats-grid');
    if (statsGrid && !esPro) {
      if (!statsGrid.querySelector('.stats-lock-overlay')) {
        const lockDiv = document.createElement('div');
        lockDiv.className = 'stats-lock-overlay';
        lockDiv.onclick = () => showModalPro('Las estadísticas');
        lockDiv.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;gap:6px;font-size:.75rem;font-weight:700;color:rgba(255,255,255,.85)';
        lockDiv.innerHTML = '<span style="font-size:1.1rem">🔒</span> Solo Plan Pro';
        statsGrid.style.position = 'relative';
        statsGrid.appendChild(lockDiv);
      }
    } else if (statsGrid) {
      const lock = statsGrid.querySelector('.stats-lock-overlay');
      if (lock) lock.remove();
    }
  } catch (e) { }
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
    const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E', '#C2410C'];
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
      const bg = bgs[Number(p.id || i) % bgs.length];
      return `<div class="hist-item" onclick="abrirDetalle('${p.id}')">
          ${p.logo_url
          ? `<div class="hist-logo" style="background:none;padding:0;overflow:hidden"><img src="${p.logo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:9px"></div>`
          : `<div class="hist-logo" style="background:${bg}">${ini}</div>`
        }
          <div class="hist-info"><strong>${p.nombre}</strong><span>${p.rubro || ''}${p.pro ? ' · PRO' : ''}</span></div>
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

    // Paso 3: traer TODOS los mensajes de esas conversaciones
    const { data: todosLosMsgs } = await sb.from('mensajes')
      .select('proveedor_id, texto, created_at, de_tipo, leido')
      .in('proveedor_id', provIds)
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

    const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];
    el.innerHTML = convs.map((c, i) => {
      const ini = escHtml(c.provNombre.substring(0, 2).toUpperCase());
      const preview = escHtml((c.ultimoMsg || '').split(String.fromCharCode(10)).join(' ').substring(0, 45) + ((c.ultimoMsg || '').length > 45 ? '...' : ''));
      const badgeId = `conv-badge-${c.provId}`;
      return `<div class="hist-item" onclick="leerConvUsuario(this,'${escHtml(String(c.provId))}')" style="position:relative">` +
        `<div class="hist-logo" style="background:${bgs[i % bgs.length]};color:white">${ini}</div>` +
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
      ? `<img src="${escHtml(p.imagen_url)}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;${oculto ? 'opacity:.45' : ''}">`
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
  try { await sb.from('productos').delete().eq('id', id); } catch (e) { }
  productos = productos.filter(p => String(p.id) !== String(id));
  renderProdGrid();
  const modal = document.getElementById('misProductosModal');
  if (modal && modal.classList.contains('open')) ordenarMisProds(_misProdSort);
  showToast('Producto eliminado');
}
async function toggleVisibleProduct(id, estaOculto) {
  const nuevoVisible = estaOculto;
  try {
    await sb.from('productos').update({ visible: nuevoVisible }).eq('id', id);
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

async function subirFotoStorage(file, provId) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${provId}/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('productos').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = sb.storage.from('productos').getPublicUrl(path);
  return urlData.publicUrl;
}

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

    const foto = data.thumbnail || data.pictures?.[0]?.url || '';

    mlProductoImportado = {
      nombre: data.title,
      precio: data.price || 0,
      foto,
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
    imagen_url: mlProductoImportado.foto,
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
    prods.push({ nombre, precio, stock, categoria: cat, proveedor_id: currentUser?.proveedorId || null });
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
  const name = document.getElementById('new-prod-name').value.trim();
  const price = document.getElementById('new-prod-price').value;
  const stock = document.getElementById('new-prod-stock').value;
  const catPrincipal = document.getElementById('new-prod-cat-principal')?.value || 'Otro';
  const catSub = document.getElementById('new-prod-cat-sub')?.value || '';
  const desc = document.getElementById('new-prod-desc')?.value?.trim() || null;
  if (!name || !price) { showToast('Completá nombre y precio'); return; }

  const btn = document.getElementById('add-btn-text');
  if (btn) btn.textContent = 'Guardando...';

  let imgUrl = null;
  // Subir foto si eligió una
  if (fotoFile && currentUser?.proveedorId) {
    try {
      imgUrl = await subirFotoStorage(fotoFile, currentUser.proveedorId);
    } catch (e) {
      showToast('No se pudo subir la foto, se guardó sin imagen');
    }
  }

  const newProd = {
    nombre: name, precio: parseFloat(price),
    stock: stock ? parseInt(stock) : null,
    descripcion: desc,
    categoria: catSub || catPrincipal,
    categoria_principal: catPrincipal,
    subcategoria: catSub || null,
    imagen_url: imgUrl,
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
  let imgUrl = null;
  if (editFotoFile && currentUser?.proveedorId) {
    try { imgUrl = await subirFotoStorage(editFotoFile, currentUser.proveedorId); } catch (e) { }
  }
  try {
    await sb.from('productos').update({
      nombre: name, precio: parseFloat(price), stock: stock ? parseInt(stock) : null,
      categoria: catSub || catPrincipal,
      categoria_principal: catPrincipal,
      subcategoria: catSub || null,
      imagen_url: imgUrl || undefined
    }).eq('id', id);
    const idx = productos.findIndex(p => String(p.id) === String(id));
    if (idx >= 0) productos[idx] = { ...productos[idx], nombre: name, precio: parseFloat(price), stock: stock ? parseInt(stock) : null, categoria: catSub || catPrincipal, categoria_principal: catPrincipal };
    renderProdGrid(); closeEditProduct(); showToast('Producto actualizado!');
  } catch (e) { showToast('Error al guardar'); }
}

// ===== NAV =====
function goTo(s) {
  haptic('light');
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
  if (s === 'mapa') { renderMapaProvincias(); renderMapaAllProvs(); }
  if (s === 'mensajes') cargarMensajesUsuario();
  const fab = document.getElementById('soporte-fab');
  if (fab) fab.style.display = s === 'perfil' ? 'flex' : 'none';
  window.scrollTo(0, 0);
  setTimeout(checkReveal, 100);
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
    const n = document.querySelector('#reg-step1 input[type="text"]')?.value?.trim();
    const e = document.querySelector('#reg-step1 input[type="email"]')?.value?.trim();
    const w = document.querySelector('#reg-step1 input[type="tel"]')?.value?.trim();
    const p = document.querySelector('#reg-step1 select')?.value;
    if (!n) { showToast('Ingresa tu nombre'); return; } if (!e) { showToast('Ingresa tu email'); return; } if (!w) { showToast('Ingresa tu WhatsApp'); return; } if (!p) { showToast('Selecciona tu provincia'); return; }
  }
  if (step === 2) { renderRubrosPicker('reg-rubros-picker'); }
  if (step === 3) {
    const r = document.querySelectorAll('#reg-step2 input[type="text"]')[0]?.value?.trim();
    const c = document.querySelectorAll('#reg-step2 input[type="text"]')[1]?.value?.trim();
    const ru = getRubrosSeleccionados('reg-rubros-picker');
    const d = document.querySelector('#reg-step2 textarea')?.value?.trim();
    if (!r) { showToast('Ingresa la razon social'); return; } if (!c) { showToast('Ingresa el CUIT'); return; } if (!ru.length) { showToast('Seleccioná al menos un rubro'); return; } if (!d) { showToast('Ingresa una descripcion'); return; }
  }
  ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3', 'reg-success'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  const map = { 0: 'reg-intro', 1: 'reg-step1', 2: 'reg-step2', 3: 'reg-step3' };
  const e = document.getElementById(map[step] || 'reg-intro');
  if (e) e.style.display = 'block';
  window.scrollTo(0, 0);
}
async function showRegSuccess() {
  const envios = document.querySelectorAll('#reg-step3 select')[0]?.value;
  const minimo = document.querySelectorAll('#reg-step3 select')[1]?.value;
  if (!envios) { showToast('Selecciona si haces envios'); return; } if (!minimo) { showToast('Selecciona el pedido minimo'); return; }
  const btn = document.querySelector('#reg-step3 .submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  const email = (document.querySelector('#reg-step1 input[type="email"]')?.value || '').toLowerCase().trim();
  const datos = {
    nombre: document.querySelectorAll('#reg-step2 input[type="text"]')[0]?.value || '',
    cuit: document.querySelectorAll('#reg-step2 input[type="text"]')[1]?.value || '',
    email,
    whatsapp: document.querySelector('#reg-step1 input[type="tel"]')?.value || '',
    rubro: getRubrosSeleccionados('reg-rubros-picker').join(', '),
    provincia: document.querySelector('#reg-step1 select')?.value || '',
    descripcion: document.querySelector('#reg-step2 textarea')?.value || '',
    envios, pedido_minimo: minimo
  };

  try {
    // Verificar si ya existe por email
    const { data: existente } = await sb.from('proveedores').select('id,estado').eq('email', email).maybeSingle();
    if (existente) {
      if (existente.estado === 'pendiente') {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
        showToast('Tu solicitud ya está siendo revisada. Te avisamos en 24-48hs por WhatsApp.');
        return;
      }
      if (existente.estado === 'aprobado') {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
        showToast('¡Ya tenés cuenta aprobada! Iniciá sesión para acceder a tu dashboard.');
        return;
      }
      if (existente.estado === 'rechazado' || existente.estado === 'suspendido') {
        if (btn) btn.textContent = 'Enviando...';
        const { error } = await sb.from('proveedores').update({ ...datos, estado: 'pendiente', plan: 'gratis' }).eq('id', existente.id);
        if (error) throw error;
        ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        document.getElementById('reg-success').style.display = 'block';
        window.scrollTo(0, 0);
        return;
      }
    }

    // Verificar si ya existe por CUIT (otro email)
    if (datos.cuit) {
      const { data: existenteCuit } = await sb.from('proveedores').select('id,estado,email').eq('cuit', datos.cuit).maybeSingle();
      if (existenteCuit && existenteCuit.email !== email) {
        if (existenteCuit.estado === 'aprobado' || existenteCuit.estado === 'pendiente') {
          if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
          showToast('Ya existe una cuenta con ese CUIT. Iniciá sesión con el email registrado.');
          return;
        }
        if (existenteCuit.estado === 'suspendido' || existenteCuit.estado === 'rechazado') {
          if (btn) btn.textContent = 'Enviando...';
          const { error } = await sb.from('proveedores').update({ ...datos, email, estado: 'pendiente', plan: 'gratis' }).eq('id', existenteCuit.id);
          if (error) throw error;
          ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
          document.getElementById('reg-success').style.display = 'block';
          window.scrollTo(0, 0);
          return;
        }
      }
    }

    // No existe: insertar nuevo
    if (btn) btn.textContent = 'Enviando...';
    const { error } = await sb.from('proveedores').insert({ ...datos, plan: 'gratis', estado: 'pendiente' });
    if (error) throw error;
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud ✓'; }
    showToast('Error al enviar: ' + (e.message || 'intentá de nuevo'));
    return;
  }

  ['reg-intro', 'reg-step1', 'reg-step2', 'reg-step3'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  document.getElementById('reg-success').style.display = 'block';
  window.scrollTo(0, 0);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ===== AI TEST =====
const questions = [
  {
    text: "En que parte de Argentina estás?", sub: "Tu localidad nos ayuda a sugerirte rubros con demanda real.", options: [
      { icon: "🏙", label: "Buenos Aires / GBA", sub: "Gran Buenos Aires o CABA" },
      { icon: "🏔", label: "Córdoba o Rosario", sub: "Grandes ciudades del interior" },
      { icon: "🏘", label: "Ciudad mediana", sub: "Entre 50.000 y 500.000 hab." },
      { icon: "🏡", label: "Localidad pequeña", sub: "Menos de 50.000 hab." }
    ]
  },
  {
    text: "Con cuánto capital inicial contás?", sub: "Recomendamos rubros alcanzables con lo que tenés hoy.", options: [
      { icon: "💵", label: "Menos de $50.000", sub: "Empezar muy chico" },
      { icon: "💰", label: "$50.000 a $200.000", sub: "Capital moderado" },
      { icon: "💼", label: "$200.000 a $500.000", sub: "Buena base" },
      { icon: "🎯", label: "Más de $500.000", sub: "Puedo invertir fuerte" }
    ]
  },
  {
    text: "Por qué canal vas a vender?", sub: "El canal define qué tipo de producto funciona mejor.", options: [
      { icon: "📱", label: "Instagram / TikTok", sub: "Redes sociales" },
      { icon: "🛒", label: "MercadoLibre / Tiendanube", sub: "Marketplaces online" },
      { icon: "🏪", label: "Local o feria física", sub: "Venta presencial" },
      { icon: "👥", label: "WhatsApp / conocidos", sub: "Círculo cercano" }
    ]
  },
  {
    text: "Cuánta experiencia tenés vendiendo?", sub: "Ajustamos la recomendacion a tu nivel.", options: [
      { icon: "🌱", label: "Ninguna, primera vez", sub: "Empezando desde cero" },
      { icon: "📦", label: "Vendí algo alguna vez", sub: "Experiencia puntual" },
      { icon: "📈", label: "Ya vendo regularmente", sub: "Tengo proceso armado" },
      { icon: "🚀", label: "Vendedor/a experimentado/a", sub: "Busco escalar" }
    ]
  }
];
let currentStep = 0, answers = [], selectedOption = null;
function openTest() { resetTest(); document.getElementById('testModal').classList.add('open'); document.body.style.overflow = 'hidden'; }
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
async function showResult() {
  document.getElementById('progressFill').style.width = '100%';
  document.getElementById('questionsSection').style.display = 'none';
  document.getElementById('resultSection').classList.add('show');
  document.getElementById('resultLoading').style.display = 'block';
  document.getElementById('resultContent').style.display = 'none';
  const locs = ['Buenos Aires / GBA', 'Córdoba o Rosario', 'Ciudad mediana', 'Localidad pequeña'];
  const caps = ['menos de $50.000', 'entre $50.000 y $200.000', 'entre $200.000 y $500.000', 'más de $500.000'];
  const cans = ['Instagram/TikTok', 'MercadoLibre/Tiendanube', 'local o feria física', 'círculo cercano/WhatsApp'];
  const exps = ['ninguna experiencia', 'algo de experiencia', 'vende regularmente', 'vendedor experimentado'];
  const prompt = `Sos un asesor de negocios mayoristas en Argentina. Perfil: Localidad: ${locs[answers[0].a]}, Capital: ${caps[answers[1].a]}, Canal: ${cans[answers[2].a]}, Experiencia: ${exps[answers[3].a]}. Recomienda el MEJOR rubro mayorista. Responde SOLO JSON sin backticks: {"rubro":"Indumentaria|Tecnología|Bazar|Hogar y Deco|Alimentos|Belleza y Salud|Deportes|Muebles|Textil y Telas|Marroquinería y Bolsos|Packaging|Mascotas","titulo":"nombre atractivo max 4 palabras","porque":"2-3 oraciones español argentino coloquial","tips":["tip1","tip2","tip3"]}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }) });
    const data = await res.json();
    const parsed = JSON.parse(data.content.map(i => i.text || '').join('').replace(/```json|```/g, '').trim());
    currentResult = parsed.rubro;
    document.getElementById('resultRubro').textContent = parsed.titulo;
    document.getElementById('resultWhy').textContent = parsed.porque;
    document.getElementById('resultChips').innerHTML = parsed.tips.map(t => `<span class="result-chip">💡 ${t}</span>`).join('');
  } catch (e) {
    const fallbacks = [
      { rubro: 'Indumentaria', titulo: 'Moda y Accesorios', porque: 'La indumentaria es uno de los rubros más accesibles para empezar al por mayor.', tips: ['Empezá con accesorios baratos', 'Usá Instagram para mostrar looks', 'Buscá proveedores en La Salada'] },
      { rubro: 'Bazar', titulo: 'Bazar del Hogar', porque: 'El bazar tiene alta rotación. Con poco capital armás un catálogo variado.', tips: ['Armá combos de regalo', 'Vendé en ferias locales', 'Artículos de cocina se venden solos'] },
      { rubro: 'Tecnología', titulo: 'Accesorios Tech', porque: 'Los accesorios tech tienen márgenes muy buenos en MercadoLibre.', tips: ['Fundas y cargadores son lo más vendido', 'Comprá en cantidad', 'MercadoLibre es el mejor canal'] },
    ];
    const r = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    currentResult = r.rubro;
    document.getElementById('resultRubro').textContent = r.titulo;
    document.getElementById('resultWhy').textContent = r.porque;
    document.getElementById('resultChips').innerHTML = r.tips.map(t => `<span class="result-chip">💡 ${t}</span>`).join('');
  }
  document.getElementById('resultLoading').style.display = 'none';
  document.getElementById('resultContent').style.display = 'block';
}

// ===== PRODUCTOS =====
let productosReales = [];
let homeProductosPage = 0;
const HOME_PAGE_SIZE = 20;
let _buscarListaFiltrada = [], _buscarOffset = 0, _buscarFiltroActual = '';
let provDetalleData = [], provDetalleOffset = 0, provDetalleEsPro = false, provDetalleLimite;
const DETALLE_PAGE_SIZE = 20;
const catColors = {
  'Tecnología': '#1847C8', 'Indumentaria': '#FF6B00', 'Hogar y Deco': '#00A651', 'Bazar': '#7C3AED',
  'Alimentos': '#F59E0B', 'Belleza y Salud': '#E91E8C', 'Deportes': '#EF4444', 'Automotor': '#6B7280',
  'Construcción': '#92400E', 'Servicios': '#0369A1', 'Juguetería': '#D97706', 'Ferretería': '#78716C',
  'Iluminación': '#CA8A04', 'Muebles': '#7C3AED', 'Textil y Telas': '#8B5CF6',
  'Librería y Papelería': '#059669', 'Marroquinería y Bolsos': '#B45309', 'Limpieza': '#0891B2',
  'Blanquería': '#6366F1', 'Mascotas': '#16A34A', 'Bebés y Niños': '#DB2777',
  'Electrónica': '#2563EB', 'Herramientas': '#57534E', 'Packaging': '#0F766E', 'Otro': '#9CA3AF',
  // legacy
  'Moda': '#FF6B00', 'Hogar': '#00A651', 'Salud': '#E91E8C', 'Textiles': '#8B5CF6', 'Otros': '#9CA3AF', 'Tecnologia': '#1847C8',
};

function getEmojiCat(cat) { return ''; }
function getProdLista() { return productosReales; }

async function cargarProductosReales() {
  const grid = document.getElementById('home-prod-grid');
  if (grid) grid.innerHTML = Array(6).fill('<div class="skel" style="height:220px;border-radius:14px"></div>').join('');
  try {
    const { data, error } = await sb.from('productos').select('*, proveedores(id,nombre,rubro,provincia,plan,plan_hasta,whatsapp)').eq('visible', true).order('created_at', { ascending: false }).limit(500);
    if (!error && data && data.length > 0) {
      const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];
      const mapped = data.map((p, i) => ({
        id: 'real_' + p.id, idReal: p.id, nombre: p.nombre, precio: p.precio || 0,
        pedido_minimo: p.stock ? 'Stock: ' + p.stock + ' unidades' : 'Consultar',
        cat: p.categoria_principal || p.categoria || 'General', emoji: getEmojiCat(p.categoria_principal || p.categoria), catPrincipal: p.categoria_principal || null, descripcion: p.descripcion || null,
        provId: String(p.proveedor_id),
        provNombre: p.proveedores?.nombre || 'Proveedor',
        provRubro: (p.proveedores?.rubro || '') + (p.proveedores?.provincia ? ' · ' + p.proveedores.provincia : ''),
        provColor: bgs[i % bgs.length], imgUrl: p.imagen_url || '',
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
  const color = catColors[p.cat] || '#1847C8';
  return `<div class="prod-inicio-card" onclick="abrirDetalleProd('${escHtml(p.id)}')">
    <div class="prod-img-wrap" style="position:relative">
      ${p.imgUrl ? `<img src="${escHtml(p.imgUrl)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
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
      ${p.imgUrl ? `<img src="${escHtml(p.imgUrl)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
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
  if (q) lista = lista.filter(p => (p.nombre || '').toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q) || (p.provNombre || '').toLowerCase().includes(q));
  if (summary) summary.textContent = lista.length ? `${lista.length} resultado${lista.length === 1 ? '' : 's'} en productos` : 'Sin resultados en productos';
  if (!lista.length) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#999;font-size:.88rem">🔎 No encontramos productos con esos filtros.</div>';
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
        <div style="font-family:'Sora',sans-serif;font-size:.92rem;font-weight:800;color:#111;display:flex;align-items:center;gap:5px">${RUBROS_ICONS[rubro] || ''} ${rubro}</div>
        <span onclick="setChip(document.querySelector('.chip[onclick*=\\'${rubro}\\']')||document.querySelector('.chip'),'${rubro}')" style="font-size:.75rem;font-weight:700;color:#006039;cursor:pointer">Ver todos ></span>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;-webkit-overflow-scrolling:touch">
        ${prods.map(p => renderProdBuscarCard(p)).join('')}
      </div>
    </div>`).join('');
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
        ${p.imgUrl ? `<img src="${escHtml(p.imgUrl)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
      </div>
      <div class="body">
        <div class="title">${escHtml(p.nombre)}</div>
        <div class="price">$${Number(p.precio).toLocaleString('es-AR')}</div>
        <div class="meta"><div class="prod-inicio-prov-dot"></div>${escHtml(p.provNombre)}</div>
      </div>
    </div>`).join('') +
    (hasMore ? `<div style="grid-column:1/-1;padding:4px 0 8px"><button onclick="buscarVerMas()" style="width:100%;background:#f5f7ff;border:1.5px solid #E2E8F8;border-radius:14px;padding:14px;font-family:'Sora',sans-serif;font-size:.85rem;font-weight:800;color:#1847C8;cursor:pointer">Ver ${lista.length - slice.length} productos más →</button></div>` : '');
}

function buscarVerMas() {
  _buscarOffset += 20;
  const el = document.getElementById('prodBuscarGrid');
  if (el) _drawBuscarGrid(el);
}

function switchBuscarTab(tab, el) {
  buscarTab = tab;
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const pv = document.getElementById('buscar-productos-view');
  const rv = document.getElementById('buscar-proveedores-view');
  const sv = document.getElementById('buscarSummary');
  if (tab === 'productos') {
    if (pv) pv.style.display = 'block'; if (rv) rv.style.display = 'none'; if (sv) sv.style.display = 'block';
    renderProdBuscar(currentCat, document.getElementById('searchInput')?.value || '');
  } else {
    if (pv) pv.style.display = 'none'; if (rv) rv.style.display = 'block'; if (sv) sv.style.display = 'none';
    filterProvs();
  }
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
          style="padding:11px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-top:1px solid #F0F4FF;font-size:.85rem;color:#1A1A1A">
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
      style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-top:1px solid #F0F4FF">
      <div style="width:34px;height:34px;border-radius:9px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;color:#1847C8;flex-shrink:0;font-family:'Sora',sans-serif">${escHtml(p.nombre.substring(0, 2).toUpperCase())}</div>
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
  const _heartEmpty = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  document.getElementById('prod-det-emoji').innerHTML = `${p.imgUrl ? `<img src="${p.imgUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : _boxIcon}
    <button class="prod-det-back" onclick="volverDetProd()">← Volver</button>
    <button class="prod-det-fav" id="prod-det-fav-btn" onclick="event.stopPropagation();toggleFav(String(productoActual.provId));">${esFav(String(p.provId)) ? _heartFilled : _heartEmpty}</button>`;
  document.getElementById('prod-det-name').textContent = p.nombre;
  document.getElementById('prod-det-price').textContent = '$' + p.precio.toLocaleString('es-AR') + ' por unidad';
  document.getElementById('prod-det-min').textContent = p.pedido_minimo;
  document.getElementById('prod-det-cat').textContent = p.cat;
  const prov = (proveedoresDB).find(x => String(x.id) === String(p.provId));
  const pav = document.getElementById('prod-det-pav');
  if (pav) {
    if (prov && prov.logo_url) {
      pav.style.background = 'none';
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
  const proConWA = !!(prov && prov.pro && prov.whatsapp);
  if (waBtn) {
    waBtn.style.cssText = 'width:100%;padding:15px;border-radius:14px;background:#006039;color:white;border:none;font-family:\'Sora\',sans-serif;font-size:1rem;font-weight:800;cursor:pointer;align-items:center;justify-content:center;gap:10px;box-shadow:0 2px 12px rgba(0,96,57,.18);display:' + (proConWA ? 'flex' : 'none');
  }
  if (chatBtn) chatBtn.style.display = proConWA ? 'none' : 'flex';
  goTo('detalle-producto');
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
function detWAProd() { if (!productoActual) return; const prov = (proveedoresDB).find(x => String(x.id) === String(productoActual.provId)); if (prov && prov.whatsapp) abrirWA(prov.whatsapp, mensajeWAProd(productoActual, prov)); else showToast('WhatsApp no disponible'); }
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
    // Traer TODOS los mensajes de esta conversacion (usuario + proveedor)
    const { data: msgsUsuario } = await sb.from('mensajes').select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_nombre', nombre)
      .eq('de_tipo', 'usuario')
      .order('created_at', { ascending: true });

    const { data: msgsProveedor } = await sb.from('mensajes').select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_tipo', 'proveedor')
      .order('created_at', { ascending: true });

    // Guardar email del usuario para taguear las respuestas del proveedor
    convActual.usuarioEmail = msgsUsuario?.[0]?.usuario_email || null;

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
  const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E'];

  // Info proveedor
  const avatarEl = document.getElementById('carrito-prov-avatar');
  const nameEl = document.getElementById('carrito-prov-name');
  if (avatarEl) { avatarEl.textContent = item0.provNombre.substring(0, 2).toUpperCase(); avatarEl.style.background = bgs[0]; }
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
  const esPro = item0.provPro;
  const tieneWA = item0.provWA && item0.provWA.trim() !== '';

  if (esPro && tieneWA) {
    actionsEl.innerHTML = `<button class="carrito-wa-btn" onclick="enviarPedidoPorWA()">📲 Enviar pedido por WhatsApp</button>`;
  } else if (!esPro) {
    actionsEl.innerHTML = `
      <button class="carrito-chat-btn" onclick="enviarPedidoPorChat()">💬 Enviar pedido por chat</button>
      <div class="pro-lock">
        <div class="pro-lock-text">🔒 El proveedor necesita el <strong>Plan PRO</strong> para recibir pedidos por WhatsApp directo.</div>
        <button class="pro-lock-btn" onclick="closeCarrito();goTo('planes')">Ver Plan PRO →</button>
      </div>`;
  } else {
    // Es PRO pero no tiene WA cargado
    actionsEl.innerHTML = `<button class="carrito-chat-btn" onclick="enviarPedidoPorChat()">💬 Enviar pedido por chat</button>`;
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
  msg += `
¿Podés confirmar disponibilidad y formas de pago? Gracias!`;
  return msg;
}

async function guardarPedido() {
  try {
    const item0 = carrito[0];
    const total = carrito.reduce((s, i) => s + (i.producto.precio * i.cantidad), 0);
    const items = JSON.stringify(carrito.map(i => ({
      nombre: i.producto.nombre,
      precio: i.producto.precio,
      cantidad: i.cantidad,
      subtotal: i.producto.precio * i.cantidad
    })));
    await sb.from('pedidos').insert({
      proveedor_id: String(item0.provId),
      comprador_nombre: currentUser?.name || 'Anónimo',
      comprador_email: currentUser?.email || '',
      items,
      total,
      estado: 'pendiente'
    });
  } catch (e) { }
}

function enviarPedidoPorWA() {
  const item0 = carrito[0];
  if (!item0.provWA) { showToast('Este proveedor no tiene WhatsApp configurado'); return; }
  const num = item0.provWA.replace(/[^0-9]/g, '');
  const msg = generarMensajePedido();
  guardarPedido();
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  closeCarrito();
}

function enviarPedidoPorChat() {
  const item0 = carrito[0];
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
  'pago recibido': '#1847C8', 'en preparacion': '#7C3AED', enviado: '#006039', archivado: '#999'
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
          <div style="font-size:.68rem;color:#1847C8;font-weight:700">${tiempo} · Ver detalle →</div>
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
    ${sigEstado ? `<button onclick="avanzarEstadoPedido('${p.id}','${sigEstado}')" style="width:100%;background:#006039;color:white;border:none;border-radius:12px;padding:14px;font-family:'Sora',sans-serif;font-size:.88rem;font-weight:800;cursor:pointer">${btnLabel[sigEstado]}</button>` : ''}
    ${p.estado === 'pendiente' ? `<button onclick="avanzarEstadoPedido('${p.id}','cancelado')" style="width:100%;background:#fff0f0;color:#ef4444;border:none;border-radius:12px;padding:12px;font-family:'Sora',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer">✕ Cancelar pedido</button>` : ''}
    ${['enviado', 'cancelado'].includes(p.estado) ? `<button onclick="avanzarEstadoPedido('${p.id}','archivado')" style="width:100%;background:#f5f5f5;color:#666;border:none;border-radius:12px;padding:12px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer">🗂 Archivar pedido</button>` : ''}
    ${!['enviado', 'cancelado', 'archivado'].includes(p.estado) ? `<button onclick="avanzarEstadoPedido('${p.id}','archivado')" style="width:100%;background:#f5f5f5;color:#999;border:none;border-radius:12px;padding:10px;font-family:'Sora',sans-serif;font-size:.78rem;font-weight:600;cursor:pointer">Archivar</button>` : ''}
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
  const wa = (document.getElementById('edit-wa')?.value || '').trim();
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
    <div style="overflow-x:auto;border:1px solid #e0e7ff;border-radius:10px;margin:10px 0 14px">
      <table style="width:100%;border-collapse:collapse;font-size:.68rem">
        <thead><tr>${previewCols.map(h => `<th style="padding:6px 10px;background:#f0f4ff;border-bottom:1px solid #e0e7ff;text-align:left;font-weight:800;color:#1847C8;white-space:nowrap">${escHtml(String(h))}</th>`).join('')}</tr></thead>
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
      <select style="width:100%;border:1.5px solid #e0e7ff;border-radius:10px;padding:9px 12px;font-family:\'DM Sans\',sans-serif;font-size:.85rem"
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
      <button onclick="excelBack(2)" style="flex:1;background:#f0f4ff;color:#1847C8;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer">← Volver</button>
      <button onclick="confirmarColumnasExcel()" style="flex:2;background:#006039;color:white;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.85rem;font-weight:800;cursor:pointer">Continuar →</button>
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
              style="flex:1;border:1.5px solid #e0e7ff;border-radius:8px;padding:6px 8px;font-size:.78rem;max-width:140px">
              <option value="">Seleccioná...</option>
              ${CAT_PRINCIPAL.map(c => `<option value="${c}" ${(excelCatMapping[rawCat] || '') === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>`;
  } else {
    catContent = `
      <div style="font-size:.82rem;font-weight:700;color:#374151;margin-bottom:10px">¿A qué categoría pertenecen todos estos productos?</div>
      <select id="excel-cat-global" style="width:100%;border:1.5px solid #e0e7ff;border-radius:10px;padding:10px 12px;font-family:'DM Sans',sans-serif;font-size:.88rem">
        <option value="">Seleccioná una categoría...</option>
        ${catOpts}
      </select>`;
  }

  wizard.innerHTML = `
    ${catContent}
    <div style="background:#f0f4ff;border-radius:10px;padding:10px 12px;margin-top:14px;font-size:.8rem;color:#374151">
      Listo para importar <strong>${total} producto${total === 1 ? '' : 's'}</strong>.
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button onclick="excelBack(3)" style="flex:1;background:#f0f4ff;color:#1847C8;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer">← Volver</button>
      <button id="excel-import-btn" onclick="importarDesdeExcel()" style="flex:2;background:#006039;color:white;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.85rem;font-weight:800;cursor:pointer">
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
      ? `<img src="${escHtml(p.imagen_url)}" style="width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0">`
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
        <div style="font-family:'Sora',sans-serif;font-size:.88rem;font-weight:700;color:#333;margin-bottom:4px">Todavía no tenés productos</div>
        <div style="font-size:.78rem;color:#999">¿Cómo querés cargar tu catálogo?</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="openAddProduct()" style="background:#006039;color:white;border:none;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;width:100%">
          <div style="width:36px;height:36px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
          <div><div style="font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700">Agregar uno por uno</div><div style="font-size:.72rem;opacity:.75">Manual, con foto y precio</div></div>
        </button>
        <button onclick="openAddProduct();switchAddTab('excel')" style="background:white;color:#1a1a1a;border:1.5px solid #E8F2EE;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;width:100%">
          <div style="width:36px;height:36px;background:#E8F2EE;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#006039" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
          <div><div style="font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700">Importar desde Excel o Tienda Nube</div><div style="font-size:.72rem;color:#999">Subí tu lista y la importamos automáticamente</div></div>
        </button>
        <button onclick="openAddProduct();switchAddTab('ml')" style="background:white;color:#1a1a1a;border:1.5px solid #fff3b0;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;width:100%">
          <div style="width:36px;height:36px;background:#FFF9C4;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b58a00" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
          <div><div style="font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700">Importar desde MercadoLibre</div><div style="font-size:.72rem;color:#999">Pegá el link y traemos los datos</div></div>
        </button>
      </div>
    </div>`;
    return;
  }
  el.innerHTML = sorted.map(p => {
    const oculto = p.visible === false;
    const img = p.imagen_url
      ? `<img src="${escHtml(p.imagen_url)}" style="width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0">`
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
      </div>
    </div>`;
  }).join('');
}

// ===== HOME CAROUSELS =====
function renderProdCard(p) {
  return `<div onclick="abrirDetalleProd('${escHtml(p.id)}')" style="min-width:150px;max-width:150px;background:white;border-radius:12px;overflow:hidden;border:1px solid #eee;cursor:pointer;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div class="prod-img-wrap">
      ${p.imgUrl ? `<img src="${escHtml(p.imgUrl)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
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
        ${p.imgUrl ? `<img src="${escHtml(p.imgUrl)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div class=prod-img-ph></div>'">` : '<div class="prod-img-ph"></div>'}
      </div>
      <div style="padding:7px 8px 9px">
        <div style="font-size:.72rem;font-weight:700;color:#111;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${p.nombre}</div>
        <div style="font-size:.8rem;font-weight:900;color:#006039;margin-top:3px">$${(p.precio || 0).toLocaleString('es-AR')}</div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:${resto > 0 ? '12px' : '0'}">
      ${cards}
    </div>
    ${resto > 0 ? `<button onclick="abrirTodosProductosProv()" style="width:100%;background:#f5f7ff;border:1.5px solid #E2E8F8;border-radius:12px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:800;color:#1847C8;cursor:pointer">Ver los ${resto} productos restantes →</button>` : ''}
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
  const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED', '#0D1B3E', '#C2410C'];
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
    const bg = bgs[i % bgs.length];
    const avgR = p.avgR > 0 ? p.avgR.toFixed(1) : '—';
    return `<div onclick="abrirDetalle('${p.id}')" style="flex-shrink:0;width:130px;background:white;border-radius:14px;border:1px solid #E2E8F8;padding:14px 12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.05)">
      ${p.logo_url
        ? `<div style="width:48px;height:48px;border-radius:12px;overflow:hidden;flex-shrink:0"><img src="${escHtml(p.logo_url)}" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div style="width:48px;height:48px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.95rem;color:white;flex-shrink:0;font-family:'Sora',sans-serif">${escHtml(ini)}</div>`
      }
      <div style="font-family:'Sora',sans-serif;font-size:.78rem;font-weight:800;color:#1A1A1A;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;width:100%">${escHtml(p.nombre)}</div>
      <div style="font-size:.68rem;color:#6B7A99;margin-top:-4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">${escHtml(p.rubro || '')}</div>
      <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:center">
        ${p.pro ? '<span style="font-size:.58rem;font-weight:800;background:#0D1B3E;color:#F59E0B;padding:2px 6px;border-radius:20px;letter-spacing:.04em">PRO</span>' : ''}
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
    const bgs = ['#1847C8', '#FF6B00', '#00A651', '#7C3AED'];
    lista.innerHTML = data.map((p, i) => {
      const ini = p.nombre.substring(0, 2).toUpperCase();
      const bg = bgs[i % bgs.length];
      const dias = Math.floor((Date.now() - new Date(p.created_at)) / 86400000);
      const badge = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : 'Hace ' + dias + ' días';
      return `<div onclick="abrirDetalle('${p.id}')" style="background:white;border-radius:14px;border:1px solid #E2E8F8;padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer">
        ${p.logo_url
          ? `<div style="width:40px;height:40px;border-radius:10px;overflow:hidden;flex-shrink:0"><img src="${p.logo_url}" style="width:100%;height:100%;object-fit:cover"></div>`
          : `<div style="width:40px;height:40px;border-radius:10px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.88rem;color:white;flex-shrink:0;font-family:'Sora',sans-serif">${ini}</div>`
        }
        <div style="flex:1;min-width:0">
          <div style="font-family:'Sora',sans-serif;font-size:.88rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
          <div style="font-size:.73rem;color:#6B7A99;margin-top:1px">${p.rubro || 'General'}${p.provincia ? ' · ' + p.provincia : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <span style="font-size:.62rem;font-weight:800;background:#DCFCE7;color:#16A34A;padding:2px 7px;border-radius:20px">${badge}</span>
          ${p.plan === 'pro' && (!p.plan_hasta || new Date(p.plan_hasta + 'T03:00:00Z') > new Date()) ? '<span style="font-size:.62rem;font-weight:800;background:#0D1B3E;color:#F59E0B;padding:2px 7px;border-radius:20px;letter-spacing:.04em">PRO</span>' : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) { }
}

// ===== HERO STATS =====
async function cargarHeroStats() {
  try {
    const [{ data: provs }, { data: prods }] = await Promise.all([
      sb.from('proveedores').select('id, rubro').eq('estado', 'aprobado'),
      sb.from('productos').select('id')
    ]);
    const numProvs = provs?.length || 0;
    const numProds = prods?.length || 0;
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
});

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
  return window.location.hash.includes('access_token=') ||
         p.has('code') || p.has('error');
}
// iOS Safari bfcache fix: cuando Safari restaura la página desde caché después del
// redirect OAuth, el JS no se re-ejecuta y los tokens no se procesan.
window.addEventListener('pageshow', e => {
  if (e.persisted && _hasOAuthCallback()) {
    window.location.reload();
  }
});

// Implicit flow: el SDK procesa el #access_token= automáticamente via detectSessionInUrl.
// Aquí solo manejamos el caso de error OAuth (cuando Supabase redirige con ?error=)
// y el arranque normal de la app (sin callback).
async function handleOAuthCallbackIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const hasError = params.has('error');

  if (hasError) {
    const msg = params.get('error_description') || params.get('error') || 'Error en autenticación';
    showToast(decodeURIComponent(msg.replace(/\+/g, ' ')));
    history.replaceState({}, document.title, window.location.pathname);
  }

  await checkSession();
}
handleOAuthCallbackIfPresent();
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // Siempre re-chequear en un nuevo login (no bloquear con !currentUser)
    await checkSession();
  } else if ((event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session && !currentUser) {
    await checkSession();
  }
});
cargarHeroStats();
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
    if (card) card.style.background = 'linear-gradient(135deg,#374151,#4B5563)';
    statusLabel.textContent = 'Disponible en Plan Pro';
    btnArea.innerHTML = `<button onclick="showModalPro('Tienda Nube')" style="width:100%;background:rgba(255,255,255,.15);color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">🔒 Conectar Tienda Nube · Solo Pro</button>`;
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
    statusLabel.style.color = 'rgba(255,255,255,.8)';
    if (card) card.style.background = 'linear-gradient(135deg,#065F46,#059669)';
    btnArea.innerHTML = `<button onclick="sincronizarTiendaNube(this)" style="width:100%;background:white;color:#059669;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Sincronizar productos</button>`;
  } else {
    statusLabel.textContent = 'Importá tus productos con fotos automáticamente';
    statusLabel.style.color = 'rgba(255,255,255,.8)';
    if (card) card.style.background = 'linear-gradient(135deg,#1E40AF,#1B74E4)';
    btnArea.innerHTML = `<button onclick="conectarTiendaNube(this)" style="width:100%;background:white;color:#1B74E4;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B74E4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Conectar con Tienda Nube</button>`;
  }
}

function conectarTiendaNube(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  btn.disabled = true;
  btn.textContent = 'Redirigiendo...';
  window.location.href = '/api/tiendanube-auth?proveedor_id=' + encodeURIComponent(proveedorId);
}

async function sincronizarTiendaNube(btn) {
  const proveedorId = currentUser?.proveedorId;
  if (!proveedorId) return;
  btn.disabled = true;
  btn.textContent = '⏳ Sincronizando...';
  try {
    const res = await fetch('/api/tiendanube-sync', {
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

const TN_CATEGORIAS_EG = ['Tecnología','Indumentaria','Hogar y Deco','Bazar','Alimentos','Belleza y Salud','Deportes','Automotor','Construcción','Servicios','Juguetería','Ferretería','Iluminación','Muebles','Textil y Telas','Librería y Papelería','Marroquinería y Bolsos','Limpieza','Blanquería','Mascotas','Bebés y Niños','Electrónica','Herramientas','Packaging','Otro'];

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
    card.style.background = 'linear-gradient(135deg,#374151,#4B5563)';
    statusLabel.textContent = 'Disponible en Plan Pro';
    statusLabel.style.color = 'rgba(255,255,255,.75)';
    if (titulo) titulo.style.color = 'white';
    btnArea.innerHTML = `<button onclick="showModalPro('Mercado Libre')" style="width:100%;background:rgba(255,255,255,.15);color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">🔒 Conectar Mercado Libre · Solo Pro</button>`;
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
  if (titulo) titulo.style.color = '#1a1a1a';

  if (conectado) {
    card.style.background = 'linear-gradient(135deg,#F5C200,#E8A800)';
    statusLabel.textContent = data.ml_nickname ? `Conectada · @${data.ml_nickname}` : 'Conectada';
    statusLabel.style.color = 'rgba(0,0,0,.7)';
    btnArea.innerHTML = `<button onclick="sincronizarMercadoLibre(this)" style="width:100%;background:#1a1a1a;color:#FFE600;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFE600" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Sincronizar productos</button>`;
  } else {
    card.style.background = 'linear-gradient(135deg,#FFE600,#F5C200)';
    statusLabel.textContent = 'Importá tus publicaciones automáticamente';
    statusLabel.style.color = 'rgba(0,0,0,.6)';
    btnArea.innerHTML = `<button onclick="conectarMercadoLibre(this)" style="width:100%;background:#1a1a1a;color:#FFE600;border:none;border-radius:10px;padding:11px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFE600" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Conectar con Mercado Libre</button>`;
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
    container.innerHTML = '<div style="background:linear-gradient(135deg,#065F46,#059669);border-radius:14px;padding:18px;position:relative;overflow:hidden"><div style="position:absolute;right:-15px;top:-15px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.1)"></div><div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#A7F3D0;margin-bottom:6px">⭐ Plan Pro Activo</div><div style="font-family:\'Sora\',sans-serif;font-size:1rem;font-weight:900;color:white;margin-bottom:4px">Tu cuenta está potenciada</div><div style="font-size:.75rem;color:rgba(255,255,255,.75);line-height:1.5">Vence el ' + fechaStr + '</div></div>';
  } else if (esPromoActiva()) {
    container.innerHTML = '<div style="background:linear-gradient(135deg,#064E3B,#065F46);border-radius:14px;padding:18px;position:relative;overflow:hidden"><div style="position:absolute;right:-15px;top:-15px;width:80px;height:80px;border-radius:50%;background:rgba(74,222,128,.15)"></div><div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#4ade80;margin-bottom:6px">⭐ OFERTA LIMITADA</div><div style="font-family:\'Sora\',sans-serif;font-size:1rem;font-weight:900;color:white;margin-bottom:4px">Probá el Plan Pro GRATIS</div><div style="font-size:.75rem;color:rgba(255,255,255,.65);line-height:1.5;margin-bottom:14px">Sin tarjeta · Hasta el 31 de mayo · WhatsApp directo · Prioridad en búsquedas</div><button onclick="activarPlanProGratis(this)" style="background:#4ade80;color:#064E3B;font-family:\'Sora\',sans-serif;font-size:.8rem;font-weight:800;border-radius:8px;padding:10px 16px;border:none;cursor:pointer;width:100%">Activar Plan Pro GRATIS →</button></div>';
  } else {
    container.innerHTML = '<div onclick="goTo(\'planes\')" style="background:linear-gradient(135deg,#1A1A1A,#2D2D2D);border-radius:14px;padding:18px;position:relative;overflow:hidden;cursor:pointer"><div style="position:absolute;right:-15px;top:-15px;width:80px;height:80px;border-radius:50%;background:rgba(0,166,81,.15)"></div><div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#4ade80;margin-bottom:6px">⭐ Plan Pro</div><div style="font-family:\'Sora\',sans-serif;font-size:1rem;font-weight:900;color:white;margin-bottom:4px">Potenciá tu negocio</div><div style="font-size:.75rem;color:rgba(255,255,255,.55);line-height:1.5;margin-bottom:14px">WhatsApp directo · Prioridad en búsquedas · Estadísticas</div><button onclick="event.stopPropagation();iniciarPagoPro(this)" style="background:#006039;color:white;font-family:\'Sora\',sans-serif;font-size:.8rem;font-weight:800;border-radius:8px;padding:10px 16px;border:none;cursor:pointer">Activar Pro · $20.000/mes</button></div>';
  }
}
