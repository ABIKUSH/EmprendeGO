/* =====================================================================
   PRUEBAS DE LOS TOPES DE COSTO

   Correr:   node test/costos-bots.test.js
   Sale 0 si pasa todo, 1 si falla algo. Sin dependencias ni red ni base,
   igual que el resto de test/ (no hay package.json en este repo a proposito).

   POR QUE EXISTE ESTE ARCHIVO
   El 2026-09-30 se audito el proyecto contra picos de factura por trafico de
   bots. La conclusion fue que el riesgo de plata ya estaba tapado por el
   spend cap de Supabase, pero que ese tope no cobra de mas: RESTRINGE EL
   PROYECTO. O sea que lo que antes hubiera sido una factura sorpresa ahora es
   EmprendeGO en modo solo lectura, y encima los dos proyectos (marketplace y
   Negocios) comparten la misma cuota de la misma organizacion.

   Esto convierte al consumo en un problema de que la app siga en pie, no de
   cuanto sale. Estas pruebas cuidan los tres topes que se pusieron, porque
   son faciles de borrar sin querer y no fallan a la vista: si alguien los
   saca, todo sigue funcionando igual hasta el dia que se acaba la cuota.

   COMO ESTAN ESCRITAS
   Leen el codigo fuente y verifican que los topes sigan escritos. No simulan
   una carga: lo que se rompe no es la logica, es que el tope desaparezca.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
const unsub = fs.readFileSync(path.join(RAIZ, 'api', 'unsub.js'), 'utf8');

let ok = 0, fallas = 0;
function comprobar(nombre, condicion) {
  if (condicion) { ok++; console.log('  ok   ' + nombre); }
  else { fallas++; console.log('  FALLA ' + nombre); }
}

console.log('\n1) Las fotos se cachean un ano\n');

// Sin esto Supabase manda max-age=3600 y cada nodo del CDN vuelve a pedirle
// el archivo al origen cada hora. Ese viaje es egress, y el egress es lo que
// ya mordio una vez.
comprobar('existe la constante', /const CACHE_FOTOS = '31536000';/.test(app));
comprobar('la usa el bucket productos',
  /storage\.from\('productos'\)\.upload\(path, file, \{ cacheControl: CACHE_FOTOS \}\)/.test(app));
comprobar('la usa el bucket Avatares',
  /storage\.from\('Avatares'\)\.upload\(path, file, \{ cacheControl: CACHE_FOTOS \}\)/.test(app));

// ⚠️ El ano es seguro SOLO porque el nombre de archivo es irrepetible. Si
// alguien vuelve a nombres estables o a upsert, el navegador se quedaria un
// ano con la foto vieja.
comprobar('los nombres de archivo siguen siendo unicos',
  (app.match(/Math\.random\(\)\.toString\(36\)\.substring\(2\)[^\n]*Date\.now\(\)/g) || []).length >= 2);
comprobar('ninguna subida de fotos usa upsert',
  !/storage\.from\('(productos|Avatares)'\)\.upload\([^)]*upsert/.test(app));

console.log('\n2) El reloj del chat tiene los tres topes\n');

comprobar('pregunta barato: pide solo el id del ultimo mensaje',
  /\.select\('id'\)[\s\S]{0,220}\.order\('created_at', \{ ascending: false \}\)[\s\S]{0,40}\.limit\(1\)/.test(app));
comprobar('recien trae la conversacion si ese id es nuevo',
  /if \(!ultimo \|\| ultimo === idDelUltimoQueTenemos\(\)\) \{ programar\(\); return; \}/.test(app));
comprobar('se duerme con la pestana oculta',
  /if \(typeof document !== 'undefined' && document\.hidden\) \{ programar\(\); return; \}/.test(app));
comprobar('y se despierta al volver',
  /addEventListener\('visibilitychange'/.test(app) && /chatDespertar\(\)/.test(app));
comprobar('cuenta las fallas seguidas', /fallas\+\+;/.test(app));
comprobar('la espera crece con cada falla',
  /Math\.min\(CHAT_ESPERA_MS \* Math\.pow\(2, fallas\), CHAT_ESPERA_MAX_MS\)/.test(app));
comprobar('y se rinde en vez de insistir para siempre',
  /if \(fallas >= CHAT_FALLAS_MAX\)/.test(app));

// El error ya no se descarta en silencio: era lo que dejaba el reloj pidiendo
// cada 8 segundos contra un Supabase caido o devolviendo 429.
comprobar('el error del reloj ya no se come sin mirar', !/\} catch \(e\) \{ \}\r?\n  \}, 8000\);/.test(app));
comprobar('no quedo ningun setInterval de 8 segundos', !/\}, 8000\);/.test(app));

console.log('\n3) Las listas que crecian para siempre\n');

comprobar('mis conversaciones tienen tope',
  /\.eq\('usuario_email', currentUser\.email\)\r?\n\s+\.order\('created_at', \{ ascending: false \}\)\r?\n\s+\.limit\(500\)/.test(app));
comprobar('la bandeja del proveedor tiene tope',
  /\.eq\('proveedor_id', currentUser\.proveedorId\)\r?\n\s+\.order\('created_at', \{ ascending: false \}\)\r?\n\s+\.limit\(500\)/.test(app));
comprobar('los pedidos archivados tienen tope',
  /\.eq\('estado', 'archivado'\)\r?\n\s+\.order\('created_at', \{ ascending: false \}\)\r?\n\s+\.limit\(200\)/.test(app));

// ⚠️ EL CATALOGO NO LLEVA TOPE Y ESO ES A PROPOSITO. Ver
// project_buscador_client_side: el buscador filtra en el cliente sobre todo
// el catalogo, asi que un limite fijo le esconde productos al que busca.
comprobar('el catalogo del proveedor sigue SIN limite fijo',
  /from\('productos'\)\.select\('\*'\)\.eq\('proveedor_id', currentUser\.proveedorId\)\.order\('created_at', \{ ascending: false \}\);/.test(app));

console.log('\n4) El ultimo endpoint publico que escribia sin tope\n');

comprobar('unsub importa el limitador', /import \{ applyRateLimit, esUUID \} from '\.\/_ratelimit\.js';/.test(unsub));
comprobar('y lo aplica antes de las dos ramas',
  unsub.indexOf("bucket: 'unsub'") > 0 &&
  unsub.indexOf("bucket: 'unsub'") < unsub.indexOf('if (req.query?.u)'));

console.log('\n' + '='.repeat(60));
if (fallas) { console.log(`${fallas} FALLAS sobre ${ok + fallas} comprobaciones`); process.exit(1); }
console.log(`${ok} comprobaciones, todas en verde`);
