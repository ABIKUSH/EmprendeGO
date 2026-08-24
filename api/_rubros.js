// Afinado de rubro por nombre de producto.
//
// Por qué existe: las categorías que devuelven Tienda Nube y Mercado Libre son
// mucho más gruesas que el catálogo de EmprendeGO. Un proveedor de lencería
// puede tener sus 104 productos bajo una única categoría "Ropa y accesorios",
// así que el mapeo categoría-origen → rubro-EG no tiene forma de separar la
// lencería de la ropa común: la señal está en el nombre del producto, no en la
// categoría. Esto corre después del mapeo y afina ese resultado.
//
// IMPORTANTE: la misma lógica está replicada en js/app.js (LENCERIA_PALABRAS /
// afinarRubroCliente) para el momento en que el proveedor confirma el mapeo
// desde el panel. Si tocás las listas de acá, tocá también las de allá, o una
// re-confirmación del mapeo pisa lo que este archivo acomodó.

// Palabras inequívocas de ropa interior. La lista está calibrada contra el
// catálogo real, no inventada: quedaron AFUERA a propósito 'media' (matcheaba
// "caja mediana" y "frazada 2 plazas y media"), 'body' ("Body Splash Victoria
// Secret" es perfumería), 'faja' ("Faja Collar Cervical Magnética" es
// ortopedia), 'corset' ("Remera Corset") y 'baby doll' ("Chupetín Baby Doll").
// Todas daban falsos positivos sobre productos ya cargados.
const LENCERIA = /\b(colaless|corpi[ñn]o|soutien|bombacha|tanga|portaliga|lencer[íi]a|brasier|bralette|vedetina|culotte|cachetero|camis[óo]n|boxers?\b|slips?\b)/i;

// Red de seguridad: aunque aparezca una palabra fuerte, estos contextos no son
// lencería. La ropa interior infantil pertenece a Bebés y Niños.
//
// Sin \b de cierre a propósito: el \b de JavaScript es ASCII, así que "bebé\b"
// NO matchea (la "é" no cuenta como carácter de palabra y no hay transición).
// Con el \b sólo al principio, "bebé" y "bebés" caen igual, y que además
// atrape derivados como "perfumería" no molesta: son todas exclusiones.
const NO_LENCERIA = /\b(beb[ée]|ni[ñn][oa]|nen[ae]|infantil|chupet[íi]n|splash|perfume|cable|collar|cervical)/i;

// Segunda regla, para lo que la primera no ve. Muchos conjuntos de lencería no
// nombran la prenda: se llaman "Conjunto Taza Soft Y Less" o "Conjunto Triangulo
// Sin Aro". Ni "conjunto" ni "body" alcanzan solos ("conjunto deportivo",
// "conjunto de sábanas", "body de bebé"), así que se exige que aparezcan JUNTO a
// una señal propia de corsetería.
const NUCLEO = /\b(conjunto|body)\b/i;
// 'less' va con \b de los dos lados a propósito: así cae "Y Less" pero no
// "Wireless" ni "Cordless". 'aro' en singular, para no comerse "aros" de
// bijouterie. 'taza' nunca sola: sola es un artículo de bazar.
const SENAL = /\bless\b|taza\s*(soft|doble)|sin\s*taza|puntilla|push\s*up|tri[áa]ngulo\s*soft|triangulo\s*soft|\baro\b|\barco\b|encaje|bralette/i;

// Solo se afina cuando el rubro que trae el mapeo es genérico. Si el proveedor
// mapeó a un rubro específico (Blanquería, Deportes, Marroquinería...), esa
// decisión manda y no se toca.
const BASE_AFINABLE = new Set(['Indumentaria', 'Otros', 'Otro', '']);

/**
 * @param {string} nombre     Nombre del producto tal como llega de TN/ML.
 * @param {string} rubroBase  Rubro que resolvió el mapeo de categorías.
 * @returns {string} El rubro afinado, o el mismo rubroBase si no aplica.
 */
export function afinarRubro(nombre, rubroBase) {
  const base = rubroBase || '';
  if (!BASE_AFINABLE.has(base)) return base;
  const n = String(nombre || '');
  if (NO_LENCERIA.test(n)) return base;
  if (LENCERIA.test(n)) return 'Lencería';
  if (NUCLEO.test(n) && SENAL.test(n)) return 'Lencería';
  return base;
}


// =====================================================================
// EQUIVALENCIA DE RUBROS PARA EL SERVIDOR
// =====================================================================
//
// Copia de RUBRO_LEGACY / matchesCat() de js/app.js. Existe porque el aviso
// por WhatsApp arma la lista de destinatarios en el backend y tiene que
// coincidir EXACTAMENTE con lo que el comprador ve en pantalla: la de
// cotizaciones.js le dice "X proveedores de este rubro lo pueden ver"
// usando matchesCat(), asi que si el fan-out usara otra regla el numero
// prometido y los que reciben el mensaje serian dos conjuntos distintos.
//
// IMPORTANTE: si se agrega un rubro en js/app.js, va tambien aca. Un rubro
// que falte en este mapa no rompe nada, pero deja a esos proveedores sin
// recibir el aviso (matchean por nombre exacto y nada mas).
//
// Archivo con prefijo "_": Vercel no lo cuenta como funcion serverless.

const RUBRO_LEGACY = {
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
  'Papelería y Librería': 'Librería y Papelería', 'Regalería': 'Bazar',
  'Perfumeria': 'Perfumería', 'Bijouterie': 'Bijouterie y Accesorios',
  'Accesorios': 'Bijouterie y Accesorios', 'Joyas': 'Bijouterie y Accesorios',
  'Tecnología': 'Tecnología', 'Indumentaria': 'Indumentaria', 'Calzado': 'Calzado', 'Hogar y Deco': 'Hogar y Deco',
  'Lencería': 'Lencería', 'Perfumería': 'Perfumería', 'Bijouterie y Accesorios': 'Bijouterie y Accesorios',
  'Bazar': 'Bazar', 'Alimentos': 'Alimentos', 'Belleza y Salud': 'Belleza y Salud',
  'Deportes': 'Deportes', 'Automotor': 'Automotor', 'Construcción': 'Construcción',
  'Servicios': 'Servicios', 'Juguetería': 'Juguetería', 'Ferretería': 'Ferretería',
  'Iluminación': 'Iluminación', 'Muebles': 'Muebles', 'Textil y Telas': 'Textil y Telas',
  'Librería y Papelería': 'Librería y Papelería', 'Marroquinería y Bolsos': 'Marroquinería y Bolsos',
  'Limpieza': 'Limpieza', 'Blanquería': 'Blanquería', 'Mascotas': 'Mascotas',
  'Bebés y Niños': 'Bebés y Niños', 'Electrónica': 'Electrónica', 'Herramientas': 'Herramientas',
  'Packaging': 'Packaging', 'Otro': 'Otro',
};

/**
 * ¿El rubro `cat` esta dentro de la lista `rubroStr` de un proveedor?
 *
 * OJO con una diferencia deliberada respecto de app.js: alla, un proveedor
 * SIN rubro cargado devuelve true (sirve para el filtro "Todas" del
 * directorio). Aca devuelve false. Mandarle un WhatsApp a alguien porque no
 * sabemos que vende es exactamente como se quema un numero.
 *
 * @param {string} rubroStr  proveedores.rubro, lista separada por comas.
 * @param {string} cat       El rubro del pedido.
 */
export function rubroCoincide(rubroStr, cat) {
  if (!rubroStr || !cat) return false;
  const rubros = String(rubroStr).split(',').map(r => r.trim()).filter(Boolean);
  const catNorm = RUBRO_LEGACY[cat] || cat;
  return rubros.some(r => {
    if (r === cat) return true;
    const rNorm = RUBRO_LEGACY[r] || r;
    return rNorm === cat || rNorm === catNorm;
  });
}

// Rubros que no identifican nada y por lo tanto no se avisan solos.
// Un pedido que cae aca lo revisa una persona y lo reenvia a mano con el
// rubro correcto (ver ?action=wa_pedido con rubro forzado por un admin).
const RUBROS_CIEGOS = new Set(['Otro', 'Otros', '']);

export function rubroEsCiego(cat) {
  const c = String(cat || '').trim();
  return RUBROS_CIEGOS.has(c) || RUBROS_CIEGOS.has(RUBRO_LEGACY[c] || c);
}
