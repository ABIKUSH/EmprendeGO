// ===== NORMALIZACIÓN Y CORRECCIÓN DE BÚSQUEDAS =====
//
// Por qué existe este archivo: sobre 690 búsquedas de un fin de semana, 318 (46%)
// devolvían CERO resultados. Una parte de esas no era falta de proveedores sino que
// el buscador no matcheaba: "basar" daba cero mientras "bazar" andaba bien, y lo
// mismo con "clulares", "notbook", "aple", "jordam", "auriculres", "camisetass",
// "camisetas." (con punto al final) o "accesorios " (con espacio).
//
// Regla de oro del diseño: TODO esto es una escalera de rescate que corre SOLO
// cuando la búsqueda literal ya devolvió cero. Nunca reemplaza ni ensucia un
// resultado que hoy funciona. Es la lección de cuando "ropa" empezó a traer
// "Europa" y "planchas": ampliar el match a lo bruto rompe más de lo que arregla.
//
// La corrección apunta siempre contra el vocabulario REAL del catálogo (nombres de
// producto, rubros, proveedores, provincias). Si una palabra no existe en nuestros
// datos, no se corrige hacia ella: corregir "vapes" a "vape" no sirve de nada si
// no hay un solo proveedor de vapes, y ahí el cero es información honesta.

// Minúsculas, sin acentos, sin puntuación y con los espacios colapsados.
// El strip de puntuación es lo que rescata "camisetas." y "computadora ".
function egNorm(s) {
  return (s == null ? '' : String(s))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Palabras que no aportan nada al match y que además hacen fallar el modo "todos
// los tokens": nadie carga un producto llamado "remeras por mayor argentina".
const EG_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'a', 'al', 'en', 'con', 'para', 'por', 'que',
  'mayor', 'mayorista', 'mayoristas', 'proveedor', 'proveedores',
  'venta', 'vender', 'comprar', 'busco', 'quiero', 'necesito',
  'argentina', 'barato', 'baratos', 'barata', 'baratas', 'precio', 'precios',
]);

// Frases que se reemplazan ANTES de tokenizar (el error abarca más de una palabra).
const EG_FRASES = [
  [/\bbla\s+queria\b/g, 'blanqueria'],
  [/\bair\s+pods\b/g, 'auriculares'],
  [/\bplay\s+swich\b/g, 'playstation'],
  [/\bpaly\s+station\b/g, 'playstation'],
  [/\bdiamond\s+p\b/g, 'diamond painting'],
  [/\bcapital\s+federal\b/g, 'caba'],
];

// Variante escrita por el usuario → término canónico que sí puede existir en el
// catálogo. Salió de mirar los términos reales que dieron cero, no de inventar.
// Todo va normalizado (minúscula, sin acentos).
const EG_SINONIMOS = {
  // Errores de tipeo observados
  'basar': 'bazar', 'bazzar': 'bazar',
  'clulares': 'celulares', 'celu': 'celular', 'celus': 'celulares',
  'notbook': 'notebook', 'notbok': 'notebook', 'laptop': 'notebook',
  'aple': 'apple',
  'jordam': 'jordan',
  'maquillajd': 'maquillaje', 'maquillakj': 'maquillaje',
  'auriculres': 'auriculares', 'aurifu': 'auriculares', 'auris': 'auriculares',
  'audifono': 'auriculares', 'audifonos': 'auriculares', 'airpods': 'auriculares',
  'camisetass': 'camisetas',
  'bermuas': 'bermudas',
  'busso': 'buzos', 'bustos': 'buzos', 'busos': 'buzos', 'buso': 'buzo',
  'cordova': 'cordoba',
  'frasada': 'frazada', 'frasadas': 'frazadas',
  'nececer': 'neceser', 'nececeres': 'neceser',
  'jostick': 'joystick',
  'swich': 'switch',
  'compreso': 'compresor',
  'carlitera': 'sandwichera', 'carliteras': 'sandwicheras',
  'remerones': 'remeras',
  'diamon': 'diamond',
  'biyuteri': 'bijouterie', 'bijou': 'bijouterie', 'bijout': 'bijouterie',
  'bijuteria': 'bijouterie', 'bisuteria': 'bijouterie',
  'tecnologico': 'tecnologia', 'tecnologicos': 'tecnologia',
  'zapas': 'zapatillas',
  'bici': 'bicicleta', 'bicis': 'bicicletas',
  // Sinónimos reales del rubro (no son errores, es que se dice de las dos formas)
  'canguro': 'buzo', 'canguros': 'buzos',
  'vaper': 'vape', 'vapers': 'vapes', 'vaporizador': 'vape', 'vaporizadores': 'vapes',
  'telefono': 'celular', 'telefonos': 'celulares',
  'heladera': 'refrigerador',
  'anteojos': 'lentes', 'gafas': 'lentes',
  'pendrive': 'usb',
  'malla': 'mallas', 'traje de baño': 'mallas',
};

// Plural → singular con las reglas del castellano. Devuelve null si no aplica.
// Sirve para que "cargadores" encuentre "cargador" y "camisetas" encuentre "camiseta".
function egSingular(w) {
  if (!w || w.length < 5) return null;
  if (/ces$/.test(w)) return w.slice(0, -3) + 'z';      // lapices  → lapiz
  if (/[aeiou]les$/.test(w)) return w.slice(0, -2);      // celulares → celular
  if (/[^aeiou]es$/.test(w)) return w.slice(0, -2);      // cargadores → cargador
  if (/[aeiou]s$/.test(w)) return w.slice(0, -1);        // camisetas → camiseta
  return null;
}

// Singular → plural. El catálogo puede tener la palabra en cualquiera de las dos.
function egPlural(w) {
  if (!w || w.length < 4) return null;
  if (/z$/.test(w)) return w.slice(0, -1) + 'ces';
  if (/[aeiou]$/.test(w)) return w + 's';
  return w + 'es';
}

// Levenshtein con corte temprano: apenas la fila entera supera el máximo tolerado
// se abandona. Sin ese corte, comparar cada palabra contra un vocabulario de miles
// de términos en cada tecla se nota en el celular.
function egDistancia(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let mejor = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const costo = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + costo);
      if (cur[j] < mejor) mejor = cur[j];
    }
    if (mejor > max) return max + 1;
    prev = cur;
  }
  return prev[lb];
}

// Cuánto error se le perdona a una palabra según su largo. Palabras cortas no se
// corrigen nunca: entre "pay", "play" y "pan" hay una letra y significan cosas
// distintas, y una corrección equivocada es peor que no encontrar nada.
function egTolerancia(w) {
  if (w.length < 5) return 0;
  if (w.length < 9) return 1;
  return 2;
}

// ===== PALABRAS QUE NUNCA SE CORRIGEN =====
// Son términos legítimos del rubro aunque hoy no haya un solo proveedor cargado.
// Sin esta lista pasaban cosas absurdas: "chaco" (una provincia entera sin oferta)
// se convertía en "chico" y "motos" en "modos", porque el corrector buscaba el
// vecino más parecido dentro del catálogo. Un cero honesto es información — nos
// dice a quién hay que salir a reclutar. Un cero disfrazado de otra cosa es un bug
// y además ensucia el dato de demanda.
const EG_PROVINCIAS = [
  'caba', 'buenos', 'aires', 'catamarca', 'chaco', 'chubut', 'cordoba', 'corrientes',
  'entre', 'rios', 'formosa', 'jujuy', 'pampa', 'rioja', 'mendoza', 'misiones',
  'neuquen', 'negro', 'salta', 'juan', 'luis', 'cruz', 'santa', 'fe', 'santiago',
  'estero', 'tierra', 'fuego', 'tucuman', 'rosario', 'plata', 'once', 'flores',
  'avellaneda', 'quilmes', 'ezeiza', 'garin', 'berazategui',
];

// Léxico mayorista: sale de los términos que la gente realmente busca. Sirve para
// las dos puntas — no se corrigen, y a la vez son destino válido de corrección
// ("camisetass" → "camisetas" aunque todavía no tengamos camisetas cargadas).
const EG_LEXICO = [
  'camiseta', 'camisetas', 'remera', 'remeras', 'buzo', 'buzos', 'campera', 'camperas',
  'jean', 'jeans', 'pantalon', 'pantalones', 'bermuda', 'bermudas', 'short', 'shorts',
  'vestido', 'vestidos', 'camisa', 'camisas', 'conjunto', 'conjuntos', 'media', 'medias',
  'lenceria', 'bombacha', 'bombachas', 'faja', 'fajas', 'corseteria', 'streetwear',
  'zapatilla', 'zapatillas', 'botin', 'botines', 'calzado', 'nike', 'adidas', 'jordan',
  'vans', 'crocs', 'topper', 'puma', 'reebok',
  'auricular', 'auriculares', 'parlante', 'parlantes', 'amplificador', 'cargador',
  'cargadores', 'celular', 'celulares', 'notebook', 'teclado', 'joystick', 'consola',
  'consolas', 'iphone', 'samsung', 'apple', 'redmi', 'motorola', 'usb', 'funda', 'fundas',
  'impresora', 'domotica', 'tecnologia', 'electronica',
  'perfume', 'perfumes', 'arabe', 'arabes', 'maquillaje', 'maquillajes', 'crema', 'cremas',
  'pestañas', 'tinte', 'tintes', 'peluqueria', 'neceser', 'cosmetica',
  'bazar', 'blanqueria', 'frazada', 'frazadas', 'toallon', 'toallones', 'percha', 'perchas',
  'tender', 'reposera', 'colchon', 'almohada', 'vela', 'velas', 'cocina', 'cocinas',
  'horno', 'hornos', 'plancha', 'planchas', 'sandwichera', 'electrodomestico',
  'electrodomesticos', 'aspiradora', 'aspiradoras', 'parrilla', 'termo', 'termos',
  'mate', 'mates', 'vajilla',
  'griferia', 'pintura', 'pinturas', 'rodillo', 'rodillos', 'herramienta', 'herramientas',
  'electricidad', 'carpinteria', 'cemento', 'pinturera', 'pintureria', 'ferreteria',
  'bicicleta', 'bicicletas', 'cubierta', 'cubiertas', 'inflador', 'infladores',
  'moto', 'motos', 'repuesto', 'repuestos', 'triciclo', 'triciclos', 'automotor',
  'cartera', 'carteras', 'cinturon', 'cinturones', 'bijouterie', 'joyeria', 'reloj',
  'relojes', 'marroquineria', 'talabarteria', 'mochila', 'mochilas',
  'almacen', 'despensa', 'kiosco', 'fiambre', 'fiambres', 'huevo', 'huevos', 'forrajeria',
  'cotillon', 'pirotines', 'rotiseria', 'gastronomico',
  'vape', 'vapes', 'sublimacion', 'sublimar', 'pañalera', 'mascota', 'mascotas',
  'juguete', 'juguetes', 'packaging', 'iluminacion', 'mueble', 'muebles', 'limpieza',
];

// ===== VOCABULARIO REAL =====
// Mapa palabra → cuántas veces aparece. La frecuencia importa: sin ella, una palabra
// suelta perdida en la descripción de un solo proveedor puede convertirse en destino
// de corrección y arruinar una búsqueda buena (así "motos" terminaba en "modos").
let _egVocab = null;              // Map palabra → frecuencia
let _egPorLargo = null;           // Map largo → array de palabras (acota el fuzzy)
let _egVocabHuella = '';
let _egCacheCorreccion = new Map();

// Una palabra de la descripción de un proveedor no alcanza para ser destino de
// corrección; tiene que aparecer varias veces o estar en el léxico del rubro.
const EG_MIN_FRECUENCIA = 3;

function egSumarPalabras(mapa, texto, peso) {
  const n = egNorm(texto);
  if (!n) return;
  for (const w of n.split(' ')) {
    if (w.length >= 4 && !EG_STOPWORDS.has(w)) mapa.set(w, (mapa.get(w) || 0) + peso);
  }
}

function egVocabulario() {
  const prods = (typeof getProdLista === 'function' ? getProdLista() : []) || [];
  const provs = (typeof proveedoresDB !== 'undefined' ? proveedoresDB : []) || [];
  const huella = prods.length + ':' + provs.length;
  if (_egVocab && huella === _egVocabHuella) return _egVocab;

  const mapa = new Map();
  for (const p of provs) {
    egSumarPalabras(mapa, p.nombre, 1);
    egSumarPalabras(mapa, p.rubro, 1);
    egSumarPalabras(mapa, p.provincia, 1);
    egSumarPalabras(mapa, p.descripcion, 1);
  }
  for (const p of prods) {
    egSumarPalabras(mapa, p.nombre, 1);
    egSumarPalabras(mapa, p.cat, 1);
    egSumarPalabras(mapa, p.catPrincipal, 1);
  }
  // Términos del dominio: entran con peso alto para que valgan como destino de
  // corrección aunque el catálogo todavía no tenga nada de ese rubro.
  const fuertes = [].concat(
    EG_PROVINCIAS, EG_LEXICO,
    typeof CAT_PRINCIPAL !== 'undefined' ? CAT_PRINCIPAL : [],
    typeof SUBCATEGORIA_MAP !== 'undefined' ? Object.keys(SUBCATEGORIA_MAP) : [],
    Object.values(EG_SINONIMOS)
  );
  fuertes.forEach(t => egSumarPalabras(mapa, t, EG_MIN_FRECUENCIA));

  const porLargo = new Map();
  for (const [w, n] of mapa) {
    if (n < EG_MIN_FRECUENCIA) continue;   // solo lo frecuente es destino de corrección
    if (!porLargo.has(w.length)) porLargo.set(w.length, []);
    porLargo.get(w.length).push(w);
  }

  _egVocab = mapa;
  _egPorLargo = porLargo;
  _egVocabHuella = huella;
  _egCacheCorreccion = new Map();
  return mapa;
}

// Corrige UNA palabra. Orden: sinónimo explícito → ya existe en los datos →
// plural/singular → vecino más cercano. Devuelve la original si no hay nada mejor;
// nunca inventa.
function egCorregirPalabra(w, vocab) {
  if (EG_SINONIMOS[w]) return EG_SINONIMOS[w];
  if (vocab.has(w)) return w;                       // existe en el catálogo: se respeta

  const sing = egSingular(w);
  if (sing && vocab.has(sing)) return sing;
  if (sing && EG_SINONIMOS[sing]) return EG_SINONIMOS[sing];
  const plur = egPlural(w);
  if (plur && vocab.has(plur)) return plur;

  const max = egTolerancia(w);
  if (!max) return w;
  // Solo se comparan candidatos de largo compatible: con distancia máxima 1 o 2, una
  // palabra de otro largo no puede estar más cerca. Recorrer el vocabulario entero en
  // cada tecla se sentía en el celular.
  let mejor = null, mejorD = max + 1;
  for (let len = w.length - max; len <= w.length + max; len++) {
    for (const cand of (_egPorLargo.get(len) || [])) {
      const d = egDistancia(w, cand, max);
      if (d < mejorD) { mejorD = d; mejor = cand; if (d === 1) break; }
    }
    if (mejorD === 1) break;
  }
  return mejor || w;
}

// Corrige la búsqueda completa. Devuelve el texto corregido y si hubo cambio real,
// para poder avisarle a la persona qué fue lo que terminamos buscando.
function egCorregirBusqueda(q) {
  let n = egNorm(q);
  if (!n) return { texto: '', cambio: false };
  // El vocabulario se pide ANTES de mirar el caché: si entraron datos nuevos,
  // egVocabulario() vacía el caché y hay que recalcular con el catálogo de ahora.
  const vocab = egVocabulario();
  const cacheado = _egCacheCorreccion.get(n);
  if (cacheado) return cacheado;

  for (const [re, rep] of EG_FRASES) n = n.replace(re, rep);
  const salida = n.split(' ').map(w => (EG_STOPWORDS.has(w) ? w : egCorregirPalabra(w, vocab)));
  const texto = salida.join(' ').replace(/\s+/g, ' ').trim();
  const res = { texto, cambio: texto !== egNorm(q) };
  _egCacheCorreccion.set(egNorm(q), res);
  return res;
}

// Pasa la búsqueda a singular. Hace falta como paso aparte de la corrección: el
// match literal es por substring, así que "cargador" ya encuentra "cargadores", pero
// al revés no — "cocinas" no encuentra "cocina". Y no se puede resolver corrigiendo,
// porque "cocinas" es una palabra perfectamente válida que no hay que tocar.
function egSingularBusqueda(texto) {
  const vocab = egVocabulario();
  let cambio = false;
  const salida = texto.split(' ').map(w => {
    if (EG_STOPWORDS.has(w)) return w;
    const s = egSingular(w);
    if (s && vocab.has(s)) { cambio = true; return s; }
    return w;
  });
  return cambio ? salida.join(' ') : '';
}

// Tokens con los que vale la pena buscar: sin stopwords, sin fragmentos de 1-2
// letras y ya corregidos. Es lo que alimenta el rescate por palabras sueltas
// cuando la frase entera no matchea ("indumentaria femenina y masculina").
function egTokensBusqueda(q) {
  const { texto } = egCorregirBusqueda(q);
  const vistos = new Set();
  const out = [];
  for (const w of texto.split(' ')) {
    if (w.length < 3 || EG_STOPWORDS.has(w) || vistos.has(w)) continue;
    vistos.add(w);
    out.push(w);
  }
  return out;
}