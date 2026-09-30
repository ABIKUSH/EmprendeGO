// Pruebas del contrato compra → publicación de /api/catalogo?ficha=
// Sin red y sin base, como el resto de test/. Se corre con: node test/contrato-catalogo.test.js
//
// Lo que se protege acá no es el formato por el formato: son las cuatro cosas
// que Codex marcó y que, si se rompen en silencio, hacen que del otro lado
// alguien publique con el precio del proveedor o crea que tiene stock que no tiene.

import assert from 'node:assert/strict';
import { faltantesParaPublicar, describirImagen, armarFicha } from '../api/catalogo.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ok  ' + nombre); };

console.log('\nCONTRATO COMPRA → PUBLICACIÓN\n');

console.log('faltantesParaPublicar');

t('los cuatro faltantes de fondo aparecen SIEMPRE, aunque el producto esté completo', () => {
  const f = faltantesParaPublicar({
    ml_atributos: [{ id: 'BRAND', value_name: 'Torito' }],
    categoria_ml: 'Sábanas',
    imagenes: ['https://x/y.jpg']
  });
  for (const clave of ['medidas_paquete', 'precio_venta', 'variantes', 'autorizacion_imagenes']) {
    assert.ok(f.includes(clave), `falta declarar ${clave}`);
  }
});

t('un producto sin atributos declara que le faltan', () => {
  assert.ok(faltantesParaPublicar({ categoria_ml: 'Sábanas', imagenes: ['u'] }).includes('atributos'));
});

t('un producto sin categoría de Mercado Libre lo declara', () => {
  assert.ok(faltantesParaPublicar({ ml_atributos: [{ id: 'BRAND' }], imagenes: ['u'] }).includes('categoria_ml'));
});

t('un producto sin fotos lo declara', () => {
  assert.ok(faltantesParaPublicar({ ml_atributos: [{ id: 'BRAND' }], categoria_ml: 'x' }).includes('imagenes'));
});

t('no explota con un producto vacío ni con null', () => {
  assert.ok(Array.isArray(faltantesParaPublicar({})));
  assert.ok(Array.isArray(faltantesParaPublicar(null)));
});

console.log('\ndescribirImagen');

t('una foto en el CDN de Mercado Libre se marca como tal', () => {
  const i = describirImagen('https://http2.mlstatic.com/D_1-MLA123_102024-O.jpg');
  assert.equal(i.origen, 'mercadolibre');
});

t('una foto propia se marca como de EmprendeGO', () => {
  const i = describirImagen('https://seubtijmyoahnyspvidq.supabase.co/storage/v1/object/public/productos/a.jpg');
  assert.equal(i.origen, 'emprendego');
});

t('la autorización NUNCA se da por concedida', () => {
  for (const u of [
    'https://http2.mlstatic.com/a-O.jpg',
    'https://seubtijmyoahnyspvidq.supabase.co/x.jpg',
    'https://otro.com/z.png'
  ]) {
    assert.equal(describirImagen(u).autorizacion, 'no_declarada');
  }
});

t('una url rota no rompe: queda como origen desconocido', () => {
  assert.equal(describirImagen('no-es-una-url').origen, 'desconocido');
});

t('un elemento sin url se descarta', () => {
  assert.equal(describirImagen(null), null);
  assert.equal(describirImagen({}), null);
});

console.log('\narmarFicha');

const crudo = {
  id: 'a1', proveedor_id: 'p1', nombre: 'Juego de sábanas', descripcion: 'desc',
  precio: '18400', stock: 24, categoria_principal: 'Blanquería', subcategoria: 'Sábanas',
  categoria_ml: 'Sábanas', ml_item_id: 'MLA123',
  ml_atributos: [{ id: 'BRAND', value_name: 'Torito' }],
  imagenes: ['https://http2.mlstatic.com/a-O.jpg'],
  created_at: '2026-01-01T00:00:00Z',
  proveedores: { id: 'p1', nombre: 'Torito home', rubro: 'Blanquería', provincia: 'CABA' }
};

t('el precio se llama precio_proveedor y lleva moneda explícita', () => {
  const f = armarFicha(crudo);
  assert.equal(f.precio_proveedor.valor, 18400);
  assert.equal(f.precio_proveedor.moneda, 'ARS');
  assert.equal(f.precio, undefined, 'no debe existir un campo "precio" suelto que se confunda con el de venta');
});

t('el stock se llama stock_proveedor y no stock a secas', () => {
  const f = armarFicha(crudo);
  assert.equal(f.stock_proveedor, 24);
  assert.equal(f.stock, undefined, 'no debe existir un campo "stock" suelto');
});

t('la categoría de Mercado Libre viaja como nombre y el código va en null', () => {
  const f = armarFicha(crudo);
  assert.equal(f.categorias.mercadolibre_nombre, 'Sábanas');
  assert.equal(f.categorias.mercadolibre_id, null, 'el código MLA no lo tenemos: no se inventa');
});

t('actualizado_at va en null y NO se rellena con created_at', () => {
  const f = armarFicha(crudo);
  assert.equal(f.actualizado_at, null);
  assert.equal(f.creado_at, '2026-01-01T00:00:00Z');
});

t('unidad y presentación viajan declaradas en null, no ausentes', () => {
  const f = armarFicha(crudo);
  assert.ok('unidad' in f && 'presentacion' in f);
  assert.equal(f.unidad, null);
  assert.equal(f.presentacion, null);
});

t('cae a imagen_url cuando no hay arreglo de imágenes', () => {
  const f = armarFicha({ ...crudo, imagenes: null, imagen_url: 'https://http2.mlstatic.com/z-O.jpg' });
  assert.equal(f.imagenes.length, 1);
  assert.equal(f.imagenes[0].origen, 'mercadolibre');
});

t('un producto sin proveedor cargado no rompe la ficha', () => {
  const f = armarFicha({ ...crudo, proveedores: null });
  assert.equal(f.proveedor.id, 'p1');
});

t('la ficha siempre trae la lista de faltantes', () => {
  assert.ok(armarFicha(crudo).faltantes_para_publicar.includes('medidas_paquete'));
});

console.log(`\n${ok} comprobaciones, todas en verde.\n`);
