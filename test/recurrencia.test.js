/* =====================================================================
   PRUEBAS DE LA MEDICION DE RECURRENCIA  (2026-10-05)

   Correr:   node test/recurrencia.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias ni red ni base,
   igual que el resto de test/ (no hay package.json en este repo a proposito).

   POR QUE EXISTE ESTE ARCHIVO
   Esto mide si el comprador vuelve, y tiene dos formas de romperse que NO se
   ven a la vista:

   1) Si alguien saca el `visitante` del insert, o cambia el nombre de la
      clave del localStorage, la columna se llena de nulos y la tasa de
      regreso baja sola. No hay error, no hay pantalla rota: simplemente el
      numero empieza a mentir hacia abajo.

   2) Si el codigo se despliega ANTES de la migracion, PostgREST rechaza el
      insert por columna desconocida y se deja de registrar TODA busqueda --
      no solo el visitante -- porque el insert va con .then(()=>{},()=>{}) y
      el error se descarta. Eso ya paso en este proyecto con otras cosas y es
      el motivo del aviso escrito en el codigo; la prueba exige que el aviso
      siga ahi.

   COMO ESTAN ESCRITAS
   Leen el codigo fuente y verifican que las piezas sigan en su lugar. No
   simulan un navegador: lo que se rompe no es la logica, es que una pieza
   desaparezca.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
const admin = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(RAIZ, 'sql', '2026-10-05_recurrencia_visitante.sql'), 'utf8');
const privacidad = fs.readFileSync(path.join(RAIZ, 'privacidad.html'), 'utf8');

let ok = 0, fallas = 0;
function comprobar(nombre, condicion) {
  if (condicion) { ok++; console.log('  ok   ' + nombre); }
  else { fallas++; console.log('  FALLA ' + nombre); }
}

console.log('\n1) El id de visitante sale del navegador y viaja con la busqueda\n');

comprobar('existe la clave del localStorage', /const EG_VISITANTE_KEY = 'eg_visitante';/.test(app));
comprobar('existe idVisitante()', /function idVisitante\(\) \{/.test(app));

// ⚠️ ESTO ES LO QUE HACE QUE LA MEDICION EXISTA. Sin el campo en el insert,
// la columna queda en nulo para siempre y la tasa de regreso da cero sin que
// nada falle.
comprobar('la busqueda se registra CON el visitante',
  /\.from\('busquedas'\)\.insert\(\{ termino: q, resultados: resultCount, visitante: idVisitante\(\) \}\)/.test(app));

// El tope de la base son 64 caracteres (busquedas_visitante_corto). Si el
// cliente manda algo mas largo, el insert falla y se pierde la busqueda
// entera, no solo el id.
comprobar('idVisitante respeta el tope de 64 de la base', /v\.length <= 64/.test(app));

// En modo privado localStorage tira excepcion. Tiene que devolver null y
// dejar que la busqueda se registre igual.
comprobar('idVisitante no explota si no hay localStorage',
  /catch \(e\) \{ return null; \}/.test(app));

// ⚠️ EL ORDEN DE DESPLIEGUE ES PARTE DEL DISENO, NO UN DETALLE.
comprobar('el aviso de que la migracion va primero sigue escrito',
  /LA MIGRACION VA ANTES QUE ESTE CODIGO/.test(app));

console.log('\n2) La migracion es aditiva y no toca lo que ya funciona\n');

comprobar('agrega la columna sin pisar nada',
  /add column if not exists visitante text;/.test(sql));
comprobar('le pone tope de largo', /char_length\(visitante\) <= 64/.test(sql));
comprobar('el indice es parcial', /where visitante is not null;/.test(sql));

// La tabla `busquedas` tiene UNA policy de INSERT y UNA de SELECT, y el
// hardening del 2026-08-13 se gano borrando una tercera que anulaba el limite
// de 120 caracteres del termino. Si esta migracion tocara policies, podria
// deshacerlo sin que se note.
comprobar('NO toca ninguna policy', !/create policy|drop policy|alter policy/i.test(sql));
comprobar('NO revoca ni otorga permisos sobre la tabla',
  !/(grant|revoke)[\s\S]{0,40}on (table )?public\.busquedas/i.test(sql));

comprobar('la funcion existe y es security definer',
  /create or replace function public\.admin_recurrencia\(\)/.test(sql) && /security definer/.test(sql));

// Mismo porton que el embudo de WhatsApp. Sin esto, cualquier usuario con
// sesion leeria la recurrencia.
comprobar('la funcion pasa por el porton de admin',
  /perform public\.admin_cotiz_guard\(\);/.test(sql));
comprobar('la funcion no queda abierta a anon',
  /revoke all on function public\.admin_recurrencia\(\) from public, anon;/.test(sql));
comprobar('y se le da execute solo a authenticated',
  /grant execute on function public\.admin_recurrencia\(\) to authenticated;/.test(sql));

// Sin el NOTIFY, PostgREST sigue con el esquema viejo en cache y el insert
// con la columna nueva falla hasta que algo lo recargue.
comprobar('recarga el esquema de PostgREST', /notify pgrst, 'reload schema';/.test(sql));
comprobar('trae el "para deshacer"', /PARA DESHACER/.test(sql));

console.log('\n3) Los dos criterios que hacen que el numero no mienta\n');

// ⚠️ LOS DIAS SE CUENTAN EN HORA ARGENTINA. En UTC una busqueda de las 22:30
// cae al dia siguiente, y un visitante de una sola sesion nocturna
// aparentaria haber vuelto. Es el error mas facil de introducir aca.
comprobar('los dias se cuentan en hora argentina',
  /at time zone 'America\/Argentina\/Buenos_Aires'\)::date/.test(sql));

// Las filas historicas de nombres de proveedor tienen `resultados` nulo y no
// son busquedas del buscador. Si entraran, contarian como visita.
comprobar('solo cuenta busquedas reales (resultados no nulo)',
  /and resultados is not null/.test(sql));

// Mediana y no promedio: un visitante que reaparece a los dos meses corre el
// promedio y hace creer que la gente vuelve mas tarde de lo que vuelve.
comprobar('el tiempo hasta volver va por mediana, no promedio',
  /percentile_cont\(0\.5\)/.test(sql) && !/avg\(extract/.test(sql));

// EL CRUCE es el motivo por el que se construyo todo esto.
comprobar('se compara contra el resultado de la PRIMERA busqueda',
  /resultados_primera/.test(sql) && /\(array_agg\(resultados order by created_at\)\)\[1\]/.test(sql));
comprobar('y el cruce sale partido en con/sin resultados',
  /'sin_resultados'/.test(sql) && /'con_resultados'/.test(sql));

console.log('\n4) El panel lo muestra, y avisa cuando todavia no significa nada\n');

comprobar('el panel llama a la RPC', /sb\.rpc\('admin_recurrencia'\)/.test(admin));
comprobar('existe la tarjeta', /id="recurrencia-card"/.test(admin));
comprobar('se carga al entrar a Busquedas',
  /if\(name==='busquedas'\)\{ cargarBusquedas\(\); cargarRecurrencia\(\); \}/.test(admin));

// ⚠️ EL AVISO DE COBERTURA NO ES DECORACION. La medicion arranca en cero el
// dia del deploy y no se puede rellenar hacia atras: una tasa calculada sobre
// veinte visitantes se lee igual que una calculada sobre mil.
comprobar('avisa mientras haya menos de 100 visitantes', /visitantes < 100/.test(admin));
comprobar('y dice desde cuando se mide', /Midiendo desde el/.test(admin));

// Si la migracion no se corrio, el error de PostgREST es incomprensible. El
// panel tiene que decir que falta correr el archivo.
comprobar('si falta la funcion, el panel dice cual archivo correr',
  /sql\/2026-10-05_recurrencia_visitante\.sql/.test(admin));

console.log('\n5) Esta declarado en la politica de privacidad\n');

// Es un identificador guardado en el navegador de una persona. Que no sea
// dato personal no lo exime de estar declarado, y el antecedente del proyecto
// es el Pixel de Meta sin declarar (ver project_cookies_y_datos_personales).
comprobar('la politica nombra el identificador de visitante',
  /Identificador de visitante \(medici[oó]n propia\)/.test(privacidad));
comprobar('dice que no tiene datos de la persona',
  /sin relaci[oó]n con su nombre, su email ni su dispositivo/.test(privacidad));
comprobar('las letras de la seccion 3 no se repiten',
  ['a','b','c','d','e'].every(l => (privacidad.match(new RegExp('<strong>' + l + '\\. ', 'g')) || []).length === 1));

console.log('\n' + '='.repeat(60));
if (fallas) { console.log(`${fallas} FALLAS sobre ${ok + fallas} comprobaciones`); process.exit(1); }
console.log(`${ok} comprobaciones, todas en verde`);
