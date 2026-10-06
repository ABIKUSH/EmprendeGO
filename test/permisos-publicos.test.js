/* =====================================================================
   QUE PUEDE LEER UN DESCONOCIDO  (2026-10-06)

   Correr:   node test/permisos-publicos.test.js
   ⚠️ ESTA PRUEBA SI USA RED, Y ES LA UNICA DEL REPO QUE LO HACE. Es a
   proposito: lo que se mide no es lo que el codigo dice, es lo que la base
   realmente contesta en produccion. Un permiso mal puesto no deja rastro en
   ningun archivo.

   POR QUE EXISTE
   El 2026-10-06 se descubrio que `proveedores.ml_access_token`,
   `ml_refresh_token`, `ml_token_expires_at` y `tn_access_token` se podian
   leer con la clave publica, sin sesion. Eran 4 tokens de Mercado Libre, 4
   de renovacion y 7 de Tienda Nube: con eso se opera la cuenta del
   proveedor. No fue un fallo de RLS -las policies estaban bien-, fue un
   GRANT por columna que quedo abierto para `anon` cuando se endurecio el rol
   `authenticated` y no el otro.

   Nada en el codigo lo mostraba. No habia error, no habia pantalla rota, no
   habia nada que leer. Por eso la unica defensa posible es preguntarle a la
   base, desde afuera, como lo haria cualquiera.

   LAS CLAVES DE ACA SON PUBLICAS Y TIENEN QUE SERLO: son las mismas que van
   en el HTML de las dos aplicaciones. No hay ningun secreto en este archivo.
   Eso es justamente lo que lo hace una prueba honesta: usa lo que tiene a
   mano cualquier visitante.

   COMO LEERLA SI FALLA
   - "LEGIBLE" en una credencial  -> hay que revocar YA y rotar ese token.
   - "LEGIBLE" en datos personales -> revisar grants y policies de esa tabla.
   - "CERRADO" en el catalogo      -> se paso de rosca un hardening y la
                                      pagina publica esta rota.
   ===================================================================== */
'use strict';

const MARKETPLACE = {
  nombre: 'Marketplace',
  base: 'https://seubtijmyoahnyspvidq.supabase.co/rest/v1',
  key: 'sb_publishable_Zt5ujgTHG5WKrhyMx4nYSg_g6pxYyBA'
};
const NEGOCIOS = {
  nombre: 'Negocios',
  base: 'https://slzuftbsufamrrgszndh.supabase.co/rest/v1',
  key: 'sb_publishable_I49jp2RGZTM_4GPaTNsbMw_QxQiXxM9'
};

// Credenciales: si alguna vez vuelven a ser legibles, es una emergencia.
const CREDENCIALES = [
  [MARKETPLACE, 'proveedores', 'ml_access_token'],
  [MARKETPLACE, 'proveedores', 'ml_refresh_token'],
  [MARKETPLACE, 'proveedores', 'ml_token_expires_at'],
  [MARKETPLACE, 'proveedores', 'tn_access_token']
];

// Datos internos que tampoco tienen por que ser publicos.
const INTERNOS = [
  [MARKETPLACE, 'proveedores', 'whatsapp'],
  [MARKETPLACE, 'proveedores', 'last_wa_at'],
  [MARKETPLACE, 'proveedores', 'ultimo_payment_id'],
  [MARKETPLACE, 'proveedores', 'notif_email']
];

// Tablas enteras que un desconocido no puede ver. Se mide en FILAS, no en
// permisos: lo que importa es si contesta datos, no como los niega.
const SIN_FILAS = [
  [MARKETPLACE, 'usuarios'], [MARKETPLACE, 'pedidos'], [MARKETPLACE, 'mensajes'],
  [MARKETPLACE, 'admins'], [MARKETPLACE, 'webhook_logs'], [MARKETPLACE, 'consultas'],
  [MARKETPLACE, 'historial'], [MARKETPLACE, 'busquedas'], [MARKETPLACE, 'configuracion'],
  [MARKETPLACE, 'email_logs'], [MARKETPLACE, 'email_optouts'], [MARKETPLACE, 'avisos_wa'],
  [MARKETPLACE, 'informes_wa'], [MARKETPLACE, 'intentos_catalogo'],
  [MARKETPLACE, 'notificaciones_proveedores'], [MARKETPLACE, 'informe_snapshots'],
  // Negocios entero: ahi adentro esta la plata de cada comercio.
  [NEGOCIOS, 'organizations'], [NEGOCIOS, 'profiles'], [NEGOCIOS, 'providers'],
  [NEGOCIOS, 'products'], [NEGOCIOS, 'sales'], [NEGOCIOS, 'purchases'],
  [NEGOCIOS, 'customers'], [NEGOCIOS, 'transactions'], [NEGOCIOS, 'stock_summary'],
  [NEGOCIOS, 'sales_summary'], [NEGOCIOS, 'customer_balances'], [NEGOCIOS, 'mi_negocio'],
  [NEGOCIOS, 'product_variants'], [NEGOCIOS, 'channel_connections'],
  [NEGOCIOS, 'channel_listings'], [NEGOCIOS, 'customer_account_movements']
];

// ⚠️ EL CONTROL AL REVES. Sin esto, "revocar todo" pasaria la prueba con
// honores y dejaria la pagina publica sin catalogo.
const DEBEN_SEGUIR_ABIERTAS = [
  [MARKETPLACE, 'productos'],
  [MARKETPLACE, 'novedades']
];

let ok = 0, fallas = 0;
function comprobar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  ok    ' + nombre); }
  else { fallas++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}

async function pedir(proyecto, recurso, select = '*') {
  const url = `${proyecto.base}/${recurso}?select=${encodeURIComponent(select)}&limit=1`;
  const r = await fetch(url, {
    headers: {
      apikey: proyecto.key,
      Authorization: `Bearer ${proyecto.key}`,
      Prefer: 'count=exact',
      Range: '0-0'
    }
  });
  const cuerpo = await r.text();
  let filas = null;
  const rango = r.headers.get('content-range');
  if (rango && rango.includes('/')) {
    const n = parseInt(rango.split('/')[1], 10);
    if (Number.isFinite(n)) filas = n;
  }
  return { status: r.status, filas, cuerpo };
}

(async () => {
  try {
    await fetch(MARKETPLACE.base, { method: 'HEAD' });
  } catch (e) {
    console.error('\nNo hay red. Esta prueba mide produccion, asi que sin red no');
    console.error('prueba nada y no se puede dar por buena.\n');
    process.exit(1);
  }

  console.log('\n1) CREDENCIALES — ninguna puede leerse sin sesion\n');
  for (const [proyecto, tabla, columna] of CREDENCIALES) {
    const r = await pedir(proyecto, tabla, `id,${columna}`);
    comprobar(`${proyecto.nombre}.${tabla}.${columna} esta cerrada`,
      r.status === 401 || r.status === 403,
      `devolvio ${r.status}; si es 200 el token es LEGIBLE y hay que rotarlo`);
  }

  console.log('\n2) DATOS INTERNOS Y DE CONTACTO\n');
  for (const [proyecto, tabla, columna] of INTERNOS) {
    const r = await pedir(proyecto, tabla, `id,${columna}`);
    comprobar(`${proyecto.nombre}.${tabla}.${columna} esta cerrada`,
      r.status === 401 || r.status === 403, `devolvio ${r.status}`);
  }

  console.log('\n3) TABLAS QUE UN DESCONOCIDO NO PUEDE VER\n');
  for (const [proyecto, tabla] of SIN_FILAS) {
    const r = await pedir(proyecto, tabla);
    const cerrada = r.status === 401 || r.status === 403 || r.filas === 0;
    comprobar(`${proyecto.nombre}.${tabla} no entrega filas`,
      cerrada, `status ${r.status}, filas ${r.filas}`);
  }

  console.log('\n4) CONTROL AL REVES — lo publico tiene que seguir publico\n');
  for (const [proyecto, tabla] of DEBEN_SEGUIR_ABIERTAS) {
    const r = await pedir(proyecto, tabla);
    // 206 y no 200: se pide con Range, asi que PostgREST contesta "contenido
    // parcial". Las dos cuentan como abierta.
    comprobar(`${proyecto.nombre}.${tabla} sigue abierta`,
      (r.status === 200 || r.status === 206) && (r.filas === null || r.filas > 0),
      `status ${r.status}, filas ${r.filas} — la pagina publica podria estar rota`);
  }

  console.log('\n' + '='.repeat(60));
  if (fallas) {
    console.log(`${fallas} FALLAS sobre ${ok + fallas} comprobaciones`);
    console.log('Si lo que fallo es una credencial: revocar y ROTAR el token, no alcanza con revocar.');
    process.exit(1);
  }
  console.log(`${ok} comprobaciones, todas en verde`);
})();
