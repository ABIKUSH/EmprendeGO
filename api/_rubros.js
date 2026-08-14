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
