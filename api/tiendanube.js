// Router unificado de Tienda Nube.
//
// Reemplaza a los cuatro archivos anteriores (tiendanube-auth.js,
// tiendanube-callback.js, tiendanube-sync.js y tn-privacy.js) para liberar
// lugares en el cupo de 12 funciones serverless del plan Hobby de Vercel.
//
// La lógica de negocio de cada handler está movida TAL CUAL: acá solo cambia
// el ruteo. Se ramifica por ?action=auth|callback|sync|privacy.
//
// URLs externas: /api/tiendanube-callback y /api/tn-privacy están registradas
// en el panel de Tienda Nube y NO pueden cambiar. Siguen respondiendo gracias
// a los rewrites de vercel.json, que apuntan acá con el action correspondiente.

import { applyRateLimit, esUUID } from './_ratelimit.js';
import { afinarRubro } from './_rubros.js';
import {
  duenoDeProveedor, crearState, consumirState, idTiendaValido,
  cabeceraCookie, cabeceraCookieBorrada, leerCookie, iguales
} from './_sesion.js';

export default async function handler(req, res) {
  const q = req.query || {};

  // Red de seguridad: si el rewrite no propagara ?action, deducimos la acción
  // por la forma de la request. Verificado el 2026-08-13 en un preview: Vercel
  // SÍ fusiona los query params (llegan code, state y action juntos), así que
  // hoy esta rama no se usa. Queda como resguardo por si ese comportamiento
  // cambiara, para no romper la conexión de tiendas de los proveedores Pro.
  let action = q.action;
  if (!action) {
    if (q.code && q.state) action = 'callback';
    else if (q.proveedor_id) action = 'auth';
  }

  switch (action) {
    case 'oauth_url': return handlerOAuthUrl(req, res);
    case 'auth':      return handlerAuth(req, res);
    case 'callback':  return handlerCallback(req, res);
    case 'sync':      return handlerSync(req, res);
    case 'privacy':   return handlerPrivacy(req, res);
    default:
      return res.status(400).json({ error: 'action inválida' });
  }
}

// ---------------------------------------------------------------------------
// action=oauth_url — reemplaza a action=auth (2026-09-07)
// ---------------------------------------------------------------------------
// Devuelve la URL de autorización en vez de redirigir. El cambio existe para
// poder exigir la sesión: una navegación directa no puede llevar el header
// Authorization. Ver sql/2026-09-07_oauth_state_seguro.sql.
async function handlerOAuthUrl(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });
  if (!applyRateLimit(req, res, { bucket: 'tn-oauth', limit: 10, windowMs: 60000 })) return;

  const { proveedor_id: proveedorId } = req.body || {};
  if (!esUUID(proveedorId)) return res.status(400).json({ error: 'proveedor_id inválido' });

  const appId = process.env.TN_APP_ID;
  if (!appId) return res.status(500).json({ error: 'TN_APP_ID no configurado' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Credenciales Supabase no configuradas' });
  }

  const email = await duenoDeProveedor(req, supabaseUrl, supabaseKey, proveedorId);
  if (!email) {
    return res.status(403).json({ error: 'Iniciá sesión con la cuenta del proveedor para conectar Tienda Nube.' });
  }

  const state = await crearState(supabaseUrl, supabaseKey, {
    proveedorId, proveedor: 'tn', email
  });
  if (!state) return res.status(500).json({ error: 'No se pudo iniciar la conexión. Probá de nuevo.' });

  // ⚠️ Esta URL está registrada en el panel de Tienda Nube. NO cambiar.
  const callbackUrl = 'https://emprendego.com.ar/api/tiendanube-callback';

  const authUrl =
    `https://www.tiendanube.com/apps/${appId}/authorize` +
    `?scope=read_products` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&state=${encodeURIComponent(state)}`;

  res.setHeader('Set-Cookie', cabeceraCookie('tn', state, req.headers.host));
  console.log('[tn-auth] state creado para proveedor', proveedorId);
  return res.status(200).json({ url: authUrl });
}

// ---------------------------------------------------------------------------
// action=auth  (antes api/tiendanube-auth.js)
// ---------------------------------------------------------------------------
// Ruta retirada el 2026-09-07. Redirigía directo a Tienda Nube poniendo el
// proveedor_id como state, sin sesión y sin comprobar de quién era ese proveedor
// — el mismo agujero que tenía Mercado Libre, y acá ni siquiera se validaba que
// fuera un UUID. La reemplaza action=oauth_url.
function handlerAuth(req, res) {
  return res.status(410).json({
    error: 'Esta forma de conectar ya no está disponible. Actualizá la página e intentá de nuevo.'
  });
}

// ---------------------------------------------------------------------------
// action=callback  (antes api/tiendanube-callback.js)
// ---------------------------------------------------------------------------
async function handlerCallback(req, res) {
  console.log('[tn-callback] request recibida | host:', req.headers.host);

  const { code, state } = req.query;

  // ⚠️ Ni el code ni el state se escriben enteros: los dos son credenciales.
  console.log('[tn-callback] params:', { code: code ? '***' : null, state: state ? '***' : null });

  if (!code || !state) {
    return res.status(400).send('Parámetros inválidos');
  }

  const appId = process.env.TN_APP_ID;
  const clientSecret = process.env.TN_CLIENT_SECRET;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ⚠️ Acá había un console.log con los primeros 20 caracteres de la
  // SERVICE_ROLE_KEY. Era un log de diagnóstico que quedó: escribía parte de la
  // clave más poderosa del proyecto en los registros de Vercel. Se informa si
  // está configurada, nunca su contenido.
  console.log('[tn-callback] config:', {
    supabase: !!supabaseUrl, service_key: !!supabaseKey, tn_app: !!appId
  });

  if (!appId || !clientSecret) {
    return res.status(500).send('Credenciales TN no configuradas');
  }
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).send('Credenciales Supabase no configuradas');
  }

  // ⚠️ ESTE BLOQUE ES EL ARREGLO. Mismo par de controles que en api/ml.js:
  // la cookie ata el flujo al navegador que lo empezó (es lo único que frena el
  // ataque de "abrime este link"), y el consumo atómico del state dice a qué
  // proveedor pertenece. El proveedor_id ya no sale de la URL: sale de la base.
  // Ver sql/2026-09-07_oauth_state_seguro.sql.
  res.setHeader('Set-Cookie', cabeceraCookieBorrada('tn', req.headers.host));

  const cookieState = leerCookie(req, 'tn');
  if (!iguales(cookieState, String(state))) {
    console.error('[tn-callback] rechazado: el state no coincide con la cookie del navegador');
    return res.redirect(302, 'https://emprendego.com.ar/?tn=error&reason=state');
  }

  const fila = await consumirState(supabaseUrl, supabaseKey, String(state), 'tn');
  if (!fila) {
    console.error('[tn-callback] rechazado: state inexistente, vencido o ya usado');
    return res.redirect(302, 'https://emprendego.com.ar/?tn=error&reason=state');
  }

  const proveedorId = fila.proveedor_id;

  // Intercambiar code por access_token
  const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code
    })
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('[tn-callback] error token TN:', tokenRes.status, err);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // ⚠️ Se valida user_id ANTES de convertirlo a texto. Decía
  // `String(tokenData.user_id)` arriba de todo: si Tienda Nube contestaba sin
  // user_id, eso daba la cadena "undefined", que es no vacía y por lo tanto
  // pasaba el `if (!storeId)` de abajo como si fuera válida. El proveedor
  // quedaba guardado con tn_store_id = "undefined" y toda sincronización
  // posterior fallaba sin que nada explicara por qué.
  if (!accessToken || !idTiendaValido(tokenData.user_id)) {
    // ⚠️ Acá había un JSON.stringify(tokenData). Aunque falte el user_id, esa
    // respuesta puede traer un access_token válido, y quedaba escrito en los
    // logs de Vercel. Se informa QUÉ faltó, nunca los valores.
    console.error('[tn-callback] respuesta TN incompleta, faltan:',
      [!accessToken && 'access_token', tokenData.user_id == null && 'user_id'].filter(Boolean).join(', '));
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  const storeId = String(tokenData.user_id);
  console.log('[tn-callback] token TN ok — store_id:', storeId);

  // Verificar que el registro existe antes de hacer PATCH
  const getUrl = `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}&select=id`;

  const getRes = await fetch(getUrl, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const text = await getRes.text();

  if (!getRes.ok || text === '[]') {
    console.error('[tn-callback] proveedor no encontrado. status:', getRes.status);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  // ⚠️ return=minimal, NO return=representation.
  //
  // Decía `representation`, que hace que PostgREST devuelva la fila entera de
  // `proveedores` actualizada, y esa respuesta se escribía completa en el log
  // (`'| body:', patchBody`). No filtraba solo el token de Tienda Nube: se
  // llevaba puesta la fila entera — tn_access_token, ml_access_token,
  // ml_refresh_token, el WhatsApp y el email del proveedor — a los logs de
  // Vercel, en cada conexión.
  //
  // No hace falta ver la fila: acá solo interesa si el UPDATE salió bien.
  const patchUrl = `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedorId}`;

  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ tn_store_id: storeId, tn_access_token: accessToken })
  });

  if (!patchRes.ok) {
    // Sin cuerpo: con return=minimal ya no trae la fila, pero aunque un error
    // de PostgREST no la traiga, tampoco se registra por las dudas.
    console.error('[tn-callback] error guardando la conexión. status:', patchRes.status);
    return res.redirect('https://emprendego.com.ar/?tn=error');
  }

  console.log(`[tn-callback] proveedor ${proveedorId} conectado exitosamente — store_id=${storeId}`);
  return res.redirect('https://emprendego.com.ar/?tn=ok');
}

// ---------------------------------------------------------------------------
// action=sync  (antes api/tiendanube-sync.js)
// ---------------------------------------------------------------------------
async function handlerSync(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  // Sync es pesado: limitar ráfagas por IP.
  if (!applyRateLimit(req, res, { bucket: 'tn-sync', limit: 10, windowMs: 60000 })) return;

  const { proveedor_id } = req.body || {};
  if (!esUUID(proveedor_id)) return res.status(400).json({ error: 'proveedor_id inválido' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Credenciales Supabase no configuradas' });
  }

  // Antes esto aceptaba cualquier proveedor_id: alcanzaba con conocer el UUID
  // —que es público, viaja en /api/catalogo— para disparar la importación de la
  // tienda de un proveedor ajeno.
  if (!(await duenoDeProveedor(req, supabaseUrl, supabaseKey, proveedor_id))) {
    return res.status(403).json({ error: 'Iniciá sesión con la cuenta del proveedor para sincronizar.' });
  }

  // Leer datos del proveedor incluyendo mapa de categorías previo
  const getRes = await fetch(
    `${supabaseUrl}/rest/v1/proveedores?id=eq.${proveedor_id}&select=tn_store_id,tn_access_token,tn_categoria_map`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    }
  );

  const rows = await getRes.json();
  const prov = rows?.[0];

  if (!prov?.tn_store_id || !prov?.tn_access_token) {
    return res.status(400).json({ error: 'Tienda Nube no conectada para este proveedor' });
  }

  const { tn_store_id, tn_access_token, tn_categoria_map } = prov;
  const categoriaMap = tn_categoria_map || {};

  // Obtener productos de Tienda Nube
  const tnRes = await fetch(
    `https://api.tiendanube.com/v1/${tn_store_id}/products?per_page=200`,
    {
      headers: {
        'Authentication': `bearer ${tn_access_token}`,
        'User-Agent': 'EmprendeGO (emprendego.soporte@gmail.com)'
      }
    }
  );

  if (!tnRes.ok) {
    const err = await tnRes.text();
    console.error('[tn-sync] error TN API:', tnRes.status, err);
    return res.status(502).json({ error: 'Error al obtener productos de Tienda Nube' });
  }

  const products = await tnRes.json();

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(200).json({ importados: 0, categorias_tn: [] });
  }

  let importados = 0;
  const categoriasSet = new Set();

  for (const product of products) {
    const nombre = product.name?.es || product.name || 'Sin nombre';
    const variant = product.variants?.[0];
    const precio = variant?.price ? parseFloat(variant.price) : 0;
    const stock = variant?.stock ?? null;
    const imagenesArr = (product.images || []).map(im => im?.src).filter(Boolean).slice(0, 8);
    const imagen_url = imagenesArr[0] || null;
    const imagenes = imagenesArr.length ? imagenesArr : null;
    const tn_product_id = String(product.id);

    // Extraer categoría de TN
    const catRaw = product.categories?.[0];
    let categoria_tn = null;
    if (catRaw) {
      categoria_tn = typeof catRaw.name === 'object'
        ? (catRaw.name.es || catRaw.name.en || Object.values(catRaw.name)[0] || null)
        : (catRaw.name || null);
    }
    if (categoria_tn) categoriasSet.add(categoria_tn);

    // Aplicar mapa existente; si no hay mapeo previo, default 'Otros'
    const rubroMapeado = categoria_tn && categoriaMap[categoria_tn]
      ? categoriaMap[categoria_tn]
      : 'Otros';
    // TN suele traer todo el catálogo bajo una sola categoría ("Ropa y
    // accesorios"), así que el mapeo no alcanza para separar la lencería de la
    // ropa común. Se afina por nombre de producto.
    const categoria_principal = afinarRubro(nombre, rubroMapeado);

    // on_conflict explícito: sin él, PostgREST resuelve merge-duplicates contra
    // la primary key (id), que es un gen_random_uuid() nuevo en cada request.
    // Nunca colisiona por id, así que intenta un INSERT limpio y choca con el
    // índice productos_proveedor_tn_unique → toda re-sincronización devolvía
    // 0 importados en silencio. Mismo patrón que api/ml.js.
    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/productos?on_conflict=proveedor_id,tn_product_id`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          proveedor_id,
          tn_product_id,
          nombre,
          precio,
          stock,
          imagen_url,
          imagenes,
          categoria_tn,
          categoria_principal
          // 'visible' se omite a propósito: con el upsert arreglado, mandarlo
          // pisaría en cada re-sincronización los productos que el proveedor
          // ocultó a mano. Los productos nuevos entran visibles igual, porque
          // la columna productos.visible tiene DEFAULT true.
        })
      }
    );

    if (upsertRes.ok || upsertRes.status === 201) {
      importados++;
    } else {
      const errText = await upsertRes.text();
      console.warn('[tn-sync] error upsert producto:', upsertRes.status, errText);
    }
  }

  const categorias_tn = [...categoriasSet];
  console.log(`[tn-sync] proveedor=${proveedor_id} store=${tn_store_id} importados=${importados}/${products.length} categorias=${categorias_tn.join(',')}`);
  return res.status(200).json({ importados, total: products.length, categorias_tn });
}

// ---------------------------------------------------------------------------
// action=privacy  (antes api/tn-privacy.js)
// ---------------------------------------------------------------------------
function handlerPrivacy(req, res) {
  return res.status(200).send('OK');
}
