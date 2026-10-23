// El catálogo de respaldo de js/app.js tiene que pedir lo mismo que /api/catalogo.
// Sin red y sin base, como el resto de test/. Se corre con: node test/catalogo-respaldo.test.js
//
// Por qué existe: el respaldo (lo que corre si /api/catalogo falla) pedía
// `proveedores.whatsapp`, que desde el muro de contacto no está otorgada a anon.
// Supabase rechazaba la consulta entera y la app quedaba con cero productos.
// No se notaba porque el respaldo casi nunca corre. Se encontró el 2026-10-23.

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const RAIZ = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
const api = fs.readFileSync(path.join(RAIZ, 'api', 'catalogo.js'), 'utf8');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ok  ' + nombre); };

const respaldo = app.match(/const COLS = '([^']+)';\s*\r?\n\s*const \{ data: page, error \} = await sb\.from\('productos'\)\.select\(COLS \+ ', (proveedores\([^)]*\))'\)/);
const principal = api.match(/const COLS = '([^']+)' \+\s*\r?\n\s*'([^']+)';/);

console.log('\nCATÁLOGO DE RESPALDO\n');

t('se encuentran las dos consultas', () => {
  assert.ok(respaldo, 'no encontré la consulta de respaldo en js/app.js');
  assert.ok(principal, 'no encontré COLS en api/catalogo.js');
});

t('el respaldo no pide el WhatsApp del proveedor', () => {
  assert.doesNotMatch(respaldo[2], /whatsapp/);
});

t('el respaldo pide exactamente las mismas columnas que /api/catalogo', () => {
  assert.equal(respaldo[1] + ',' + respaldo[2], principal[1] + principal[2]);
});

console.log(`\n${ok} comprobaciones, todas en verde`);
