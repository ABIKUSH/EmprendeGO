# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EmprendeGO is a B2B wholesale marketplace PWA (Progressive Web App) for Argentina, connecting entrepreneurs/buyers with wholesale providers. It is a **vanilla SPA** (no framework) deployed on Vercel with Supabase as the backend.

## Architecture

### No Build Step

There is no `package.json`, no bundler, and no compilation. The frontend is plain HTML/CSS/JS served as static files by Vercel. The `/api/` directory contains Node.js serverless functions handled by Vercel's runtime.

To develop locally: open `index.html` directly in a browser, or use any static file server (e.g., `npx serve .` or VS Code Live Server). API routes require Vercel CLI:

```bash
npx vercel dev   # runs static site + serverless functions locally
```

### File Layout

- [index.html](index.html) — entire user-facing SPA (screens, modals, bottom nav)
- [admin.html](admin.html) — separate admin panel (provider approval, metrics)
- [css/styles.css](css/styles.css) — all styles
- [js/app.js](js/app.js) — all application logic (~3,200 lines)
- [api/crear-pago.js](api/crear-pago.js) — Mercado Pago checkout preference creation
- [api/ml.js](api/ml.js) — multi-purpose router: ML product proxy (`?id=`) + ML OAuth flow (start, callback) + ML sync (`?action=sync`)
- [api/tiendanube.js](api/tiendanube.js) — multi-purpose router: Tienda Nube OAuth (`?action=auth`, `?action=callback`) + product import (`?action=sync`) + privacy/data-deletion URL (`?action=privacy`). Plan Pro only.
- [api/webhook-mp.js](api/webhook-mp.js) — Mercado Pago webhook handler (updates provider plan)

⚠️ **Vercel Hobby plan limits API functions to 12.** When adding new logic, prefer extending an existing handler (branching by query/method) over creating a new `api/*.js` file. ML and TN integrations both live in their own routers for this reason.

**Verificado el 2026-08-13**, no asumido: se pusheó una rama descartable con una 13ª función y el build falló con *"No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan. Create a team (Pro plan) to deploy more."* El proyecto está en Hobby. Los 4 archivos de Tienda Nube se unificaron en `api/tiendanube.js` el 2026-08-13, así que hoy usa **9 de 12** (quedan 3 lugares libres). Ojo: la doc pública de Vercel (`/docs/plans/hobby` y `/docs/functions/limitations`) **no** menciona este tope, así que no sirve para desmentirlo — el error del build es la única fuente fiable. Para probarlo de nuevo, hacerlo siempre en una rama: Vercel solo despliega `main` a producción y las demás ramas generan un preview aislado.

### Screen-Based Navigation

The SPA renders all screens as `<div class="screen" id="screen-{name}">` elements in `index.html`. Navigation is handled by `goTo(screenName)` in `app.js`, which hides all screens and shows the target one.

Main screens: `inicio`, `buscar`, `favoritos`, `mapa`, `detalle`, `chat`, `detalle-producto`, `registro`, `planes`, `perfil`, `terminos`.

### State Management

- **Supabase** — primary data source (PostgreSQL + real-time)
- **Global variables** in `app.js` — `currentUser`, `proveedoresDB[]`, `chatMsgs[]`, `provActual`, `productoActual`
- **localStorage** — persisted client state:
  - `eg_favs` — favorites (JSON array of provider IDs)
  - `eg_historial` — search history
  - `eg_notif_leidas` — read notification IDs

### Supabase Database Schema

Tables: `proveedores`, `productos`, `mensajes`, `resenas`, `usuarios`, `pedidos`, `busquedas`.

Key `proveedores` columns: `id`, `nombre`, `email`, `rubro`, `provincia`, `plan` (`free`|`pro`), `estado` (`pendiente`|`aprobado`|`rechazado`), `whatsapp`, `visitas`, `plan_desde`, `plan_hasta`.

Integration columns on `proveedores`:
- **Tienda Nube**: `tn_store_id`, `tn_access_token`, `tn_categoria_map` (jsonb mapping TN-category → EG-rubro)
- **Mercado Libre**: `ml_user_id`, `ml_nickname`, `ml_access_token`, `ml_refresh_token`, `ml_token_expires_at`, `ml_connected` (bool), `ml_categoria_map` (jsonb)

Integration columns on `productos`:
- **TN**: `tn_product_id`, `categoria_tn` — unique index `(proveedor_id, tn_product_id)` for upsert dedup
- **ML**: `ml_item_id`, `categoria_ml` — unique index `(proveedor_id, ml_item_id)` for upsert dedup
- `categoria_principal` — mapped EG-rubro (filled from `*_categoria_map`)
- `visible` (bool) — paused/closed ML items are set to `false` automatically on sync

⚠️ **When adding new columns to existing tables**, `ALTER TABLE ADD COLUMN` does NOT inherit column-level grants. Always include:
```sql
GRANT SELECT (new_col) ON public.table_name TO anon, authenticated;
GRANT UPDATE (new_col) ON public.table_name TO authenticated;
NOTIFY pgrst, 'reload schema';
```
A 403 from PostgREST when the frontend reads a column → missing column-level GRANT.

### External Services

| Service | Purpose | Config |
|---|---|---|
| Supabase | Database + auth | URL/key hardcoded in `app.js` (public key — safe) |
| Google Sign-In | User authentication | `gsi/client` library |
| Mercado Pago | Pro plan payments (20,000 ARS/month) | `MP_ACCESS_TOKEN` env var (Vercel secret) |
| MercadoLibre API | Product proxy + OAuth + per-provider sync (Pro only) | `ML_APP_ID`, `ML_APP_SECRET`, `ML_REDIRECT_URI` env vars |
| Tienda Nube API | Per-provider OAuth + product sync (Pro only) | `TN_APP_ID`, `TN_CLIENT_SECRET` env vars |
| Supabase Storage | Product images | bucket `productos` |

### Serverless API Routes

- `POST /api/crear-pago` — creates Mercado Pago checkout, params: `{email, proveedorId}`
- `POST /api/webhook-mp` — payment webhook; sets `plan='pro'` + 30-day expiry on approved payment
- **`api/ml.js` (multi-purpose router)**:
  - `GET  /api/ml?id={MLA_ID}` — public proxy for a single ML product (used when a provider pastes a ML link to import one item).
  - `GET  /api/ml?proveedor_id={uuid}` — starts OAuth flow, redirects to `auth.mercadolibre.com.ar` with `state=proveedor_id`.
  - `GET  /api/ml?code={code}&state={proveedor_id}` — OAuth callback (the redirect URI configured in ML Developers must be `https://emprendego.com.ar/api/ml`). Exchanges `code` for `access_token`+`refresh_token`, fetches nickname, saves to `proveedores`, redirects to `/?ml=ok` or `/?ml=error&reason=X`.
  - `POST /api/ml?action=sync` body `{proveedor_id}` — validates Plan Pro in backend, refreshes token if expiring within 5 min, lists all active items from ML, multi-gets details in batches of 20, maps categories, upserts into `productos` keyed on `(proveedor_id, ml_item_id)`. Returns `{importados, total, ocultados, categorias_ml}`. Items no longer active in ML are marked `visible=false`. If refresh fails with 400/401, `ml_connected` is set to `false` and the UI prompts reconnection.
- **`api/tiendanube.js` (multi-purpose router)** — mismo flujo conceptual que ML, ramificando por `?action=`:
  - `GET  /api/tiendanube?action=auth&proveedor_id={uuid}` — redirige 302 a `tiendanube.com/apps/{APP_ID}/authorize` con `state=proveedor_id`.
  - `GET  /api/tiendanube?action=callback&code=...&state=...` — canjea el `code` por `access_token`, guarda `tn_store_id`/`tn_access_token`, redirige a `/?tn=ok|error`.
  - `POST /api/tiendanube?action=sync` body `{proveedor_id}` — importa el catálogo, upsert sobre `(proveedor_id, tn_product_id)`.
  - `ANY  /api/tiendanube?action=privacy` — responde 200 `OK` (URL de privacidad / borrado de datos exigida por TN).

⚠️ **Las URLs viejas `/api/tiendanube-callback` y `/api/tn-privacy` están registradas en el panel de Tienda Nube y NO se pueden cambiar.** Siguen funcionando por dos rewrites en `vercel.json` que apuntan al router con el `action` correspondiente. Si tocás esos rewrites, se rompe la conexión de tiendas de todos los proveedores Pro.

### Aviso de Cotizaciones por WhatsApp (MVP, 2026-08-24)

Cuando un comprador publica un pedido, se le avisa por WhatsApp a los proveedores de ese rubro con un link directo al pedido. **Es lo que faltaba para que el circuito de Cotizaciones cierre**: al 21-08 había 9 pedidos publicados y **2 cotizaciones en toda la historia**, porque el proveedor no se enteraba nunca.

Hipótesis única que se está midiendo: *¿el proveedor cotiza más rápido si se entera por WhatsApp que si tiene que entrar por su cuenta?*

**Piezas:**

| Pieza | Dónde |
|---|---|
| Envío | `api/notificar-mensaje.js` → `?action=wa_pedido` (rama nueva; no entra otro archivo en `api/`) |
| Equivalencia de rubros | `api/_rubros.js` → `rubroCoincide()` / `rubroEsCiego()` (copia de `matchesCat`/`RUBRO_LEGACY` de app.js) |
| Disparo | `js/cotizaciones.js` → `avisarProveedores()`, se llama al final de `publicarPedido()` sin await |
| Llegada del link | `js/cotizaciones.js` → `irAlPedido()`; `window.abrirCotizaciones(pedidoId)` acepta un id |
| Baja del proveedor | `proveedores.notif_wa` + `cotizBajaWa()`; se pinta en el feed y en la pantalla de rubros |
| Migración | `sql/2026-08-24_aviso_wa_pedidos.sql` |
| Pruebas | `node test/aviso-wa.test.js` (32 comprobaciones, sin red ni base) |

⚠️ **ARRANCA APAGADO Y ESO ES A PROPÓSITO.** Sin `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID` en Vercel, el endpoint devuelve `{skipped:'wa_apagado'}` y no manda nada. El interruptor son las variables de entorno, no un deploy. Variables: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` (default `pedido_nuevo_rubro`), `WHATSAPP_LANG` (default `es_AR`) y **`WHATSAPP_TEST_TO`**, que mientras tenga un número manda TODO a ese número en vez de al proveedor real. Es la red de seguridad de las pruebas.

**Decisiones tomadas contra los datos reales, no por intuición:**
- **El rubro filtra; la zona NO.** 93 de 150 proveedores están en CABA y 35 en Buenos Aires: si la provincia filtrara, un comprador de Córdoba se quedaría sin destinatarios. La provincia **ordena** (los de la misma van primero) y después corta el tope de 25.
- **Un pedido en rubro `Otro` no dispara nada.** Son ~4 de cada 10 (7 de los 16 publicados). Los revisa el founder a mano y se reenvían con `?action=wa_pedido` + `{rubro}` **con sesión de admin**; sin token válido el rubro forzado se ignora. Ese es el único caso en que se acepta un pedido de más de 15 minutos.
- **Máximo 1 WhatsApp por proveedor cada 24 h** (`proveedores.last_wa_at`). Es el parámetro más importante del archivo: con 5 pedidos diarios, un proveedor de Indumentaria recibiría 3 mensajes por día y bloquearía el número. Ya pasó una vez con el número personal.
- Simulacro contra los 16 pedidos reales: **151 mensajes en total, USD 1,81** a USD 0,012 el mensaje (tarifa *utility* de Argentina).

⚠️ **No se tocó ninguna policy.** En particular `sol_select`, que deja que cualquier usuario con sesión vea todos los pedidos abiertos y sobre la que está construido el feed con "Ver todos". El alcance por rubro vive en el **servidor**, que arma la lista con el service-role: el proveedor nunca elige a quién se le manda y el link no le da ningún permiso que no tuviera. `avisos_wa` va con RLS activada y **cero policies y cero grants** (adentro hay teléfonos): solo la ve el service-role.

⚠️ **El anti-duplicado es el índice único `(solicitud_id, proveedor_id)` de `avisos_wa`, y la fila se RESERVA antes de mandar.** Mismo patrón que `email_logs`. Si se invierte el orden, dos llamadas simultáneas mandan dos WhatsApp iguales.

⚠️ **Los parámetros de una plantilla no pueden tener saltos de línea, tabs ni 4 espacios seguidos**: Meta rechaza el envío entero con un `131008`. Todo lo que escribe el comprador pasa por `limpiarParam()`. Y **el cuerpo de una plantilla no puede terminar en variable**, por eso el texto cierra con una línea fija después del link.

**Fases futuras, marcadas en el código donde engancharían, sin implementar:** estructuración del pedido con IA (armado de params), ranking por desempeño (el `.sort()` de `elegirDestinatarios`), muro medido (`WA_RETARDO_FREE_MIN`, hoy en cero para no tener que reescribir el reparto) y respuestas por botones (necesita un webhook de entrada).

**Pendiente:** el acuse de recibo sigue diciendo "lo pueden ver" y no "se les avisó", a propósito, porque el envío está apagado y además nunca sale para los pedidos en `Otro`. Cambiarlo recién cuando las dos cosas estén resueltas.

### PWA

`manifest.json` + `sw.js` (service worker). The SW currently just clears caches on activate.

## Key Patterns in app.js

- All Supabase calls use the v2 SDK: `.from('table').select/insert/update/delete`
- Real-time chat: `.channel().on('postgres_changes', ...).subscribe()`
- Auth flow: Google Sign-In → `supabase.from('usuarios').upsert()`. Initial `proveedores` SELECT in `checkSession()` (line ~1638) lists every column the dashboard needs — when adding new columns the frontend reads, append them here.
- MercadoLibre single-product import: provider pastes a link, frontend calls `/api/ml?id={MLA_ID}` and inserts result into `productos`.
- TN / ML full catalog import: `renderTiendaNubeSection()` / `renderMercadoLibreSection()` paint the dashboard tile in 3 states (not-Pro → gray locked, Pro+disconnected → brand color "Connect", Pro+connected → "Sync"). After sync the category-mapping modal opens if new categories arrived.
- Pro gate: `esProvPro()` reads `currentUser.provData.plan === 'pro'` and checks `plan_hasta` expiry. The backend re-validates Plan Pro before any sync — never trust the UI gate alone.
- Approval flow: admin sets `estado='aprobado'` on `proveedores` row
- Deep-links por query string (todos se leen ANTES del `history.replaceState` que limpia la barra): `?pago=`, `?tn=`, `?ml=`, `?p=` (producto), `?prov=` (proveedor), `?ir=planes`, `?ir=cotizaciones` y **`?ir=cotizaciones&pedido=<uuid>`**, que es el que manda el aviso por WhatsApp. Si agregás uno nuevo, fijate que no choque con estos.

## Analytics y Campañas

### Google Analytics (GA4)
- Service Account: `emprendego-492422-29430d611f88.json` (en la raíz del proyecto)
- Property ID: 533955583 (variable GA4_PROPERTY_ID en .env)
- API: Google Analytics Data API (habilitada en el proyecto GCP emprendego-492422)
- Usar la librería `googleapis` o llamadas REST para consultar métricas
- Métricas clave: sesiones, usuarios, páginas vistas, tasa de rebote, fuentes de tráfico, eventos clave (clics WhatsApp, perfiles vistos, búsquedas, registros)

### Meta Ads (Facebook/Instagram)
- Access Token: variable META_ACCESS_TOKEN en .env
- Ad Account ID: act_3584672951745350 (variable META_AD_ACCOUNT_ID en .env) — cuenta "Abraham Jafif"
- También existe act_2549832435467413 (cuenta "EmprendeGo Ads" del Business Manager, sin campañas aún)
- API: Meta Marketing API v25.0
- Endpoint base: https://graph.facebook.com/v25.0/
- Métricas clave: impresiones, alcance, clics, CTR, CPC, CPM, gasto, resultados por campaña

### Cómo responder consultas de analytics
Cuando me pregunten "cómo vienen las campañas", "cómo viene el tráfico", "cómo viene la página", "cómo viene todo", "dame un reporte" o similar:
1. Leer las credenciales del .env y el JSON de service account
2. Consultar GA4 para tráfico, usuarios, fuentes, conversiones de los últimos 30 días
3. Consultar Meta Ads para rendimiento de campañas pagas de los últimos 30 días
4. Cruzar datos: ¿el tráfico de Meta se refleja en GA4? ¿Cuál es el costo real por visita?
5. Dar un resumen ejecutivo en una tabla clara con los números clave y tendencias
6. Siempre comparar con el período anterior para ver si mejora o empeora
7. Cerrar con 2-3 recomendaciones accionables
