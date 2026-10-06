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

⚠️ **Y AL REVÉS: NUNCA OTORGAR UNA COLUMNA NUEVA A `anon` "POR LAS DUDAS".** El 2026-10-06 se encontró que `proveedores.ml_access_token`, `ml_refresh_token`, `ml_token_expires_at` y `tn_access_token` se leían con la clave publishable, sin sesión: 4 tokens de Mercado Libre, 4 de refresh y 7 de Tienda Nube, con los que se opera la cuenta del proveedor. **No fue un fallo de RLS** — las policies estaban bien, `prov_select_public` limita a `estado='aprobado'`. Fue un GRANT por columna que quedó abierto para `anon` cuando se endureció `authenticated` y no el otro rol.

Reglas que salen de ahí:

1. **Un token, un secreto o un dato de contacto no se otorga NUNCA a `anon`.** Esos campos los usan `api/ml.js` y `api/tiendanube.js` con la service-role, que no pasa por estos grants.
2. **RLS no te salva de un GRANT de más.** RLS filtra FILAS; el grant decide COLUMNAS. Si una fila es visible (un proveedor aprobado lo es), toda columna otorgada viaja con ella.
3. **Al endurecer un rol, endurecer los dos.** El diff útil es: `select` de las columnas que tiene `anon` y no tiene `authenticated`. Si aparece algo, casi siempre está mal.
4. **`REVOKE` cierra la puerta pero no desarma lo que ya se llevaron.** Después de revocar una credencial hay que ROTARLA en la plataforma de origen (desconectar y reconectar la cuenta).

**La prueba que lo vigila es `node test/permisos-publicos.test.js`.** Es la única del repo que usa red, a propósito: le pregunta a producción con la clave pública qué contesta, porque un permiso mal puesto no deja rastro en ningún archivo. Cubre los dos proyectos (marketplace y Negocios) y trae un control al revés — `productos` y `novedades` **tienen** que seguir abiertas — para que "revocar todo" no pase la prueba dejando la página sin catálogo. Correrla después de cualquier migración que toque grants, policies o columnas nuevas.

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
| Pruebas | `node test/aviso-wa.test.js` (55 comprobaciones, sin red ni base) |
| Tablero | `admin.html` → **Embudo de avisos**, alimentado por `admin_wa_embudo()` (`sql/2026-08-27_tablero_avisos_wa.sql`) |

⚠️ **`avisos_wa` NO se lee nunca desde el navegador.** Tiene teléfonos adentro y va con RLS sin policies ni grants. El panel entra por `admin_wa_embudo()`, que es SECURITY DEFINER detrás de `admin_cotiz_guard()` y devuelve **solo agregados**: ni un teléfono, ni un `wa_message_id`, ni un id de fila. Si hace falta un dato nuevo en el tablero, se agrega adentro de esa función — no se abre la tabla.

⚠️ **ARRANCA APAGADO Y ESO ES A PROPÓSITO.** Sin `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID` en Vercel, el endpoint devuelve `{skipped:'wa_apagado'}` y no manda nada. El interruptor son las variables de entorno, no un deploy. Variables: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` (default `pedido_nuevo_rubro`), `WHATSAPP_LANG` (default `es_AR`) y **`WHATSAPP_TEST_TO`**, que mientras tenga un número manda TODO a ese número en vez de al proveedor real. Es la red de seguridad de las pruebas.

**Decisiones tomadas contra los datos reales, no por intuición:**
- **El rubro filtra; la zona NO.** 93 de 150 proveedores están en CABA y 35 en Buenos Aires: si la provincia filtrara, un comprador de Córdoba se quedaría sin destinatarios. La provincia **ordena** (los de la misma van primero) y después corta el tope de destinatarios.
- **Un pedido en rubro `Otro` no dispara nada.** Son ~4 de cada 10 (8 de los 19 publicados). Los revisa el founder a mano y se reenvían con `?action=wa_pedido` + `{rubro}` **con sesión de admin**; sin token válido el rubro forzado se ignora. Ese es el único caso en que se acepta un pedido de más de 15 minutos.
- **`WA_LIMITE_DESTINATARIOS = 20`** — arrancó en 8 (arranque prudente, no el número correcto) y **se subió a 20 el 2026-09-08 contra el embudo medido**: 364 reservados, 322 aceptados por Meta, 293 entregados, 232 leídos, sin una sola restricción del número. Los 42 fallos fueron todos de configuración nuestra y están fechados (ver abajo). El techo sigue siendo 25 y esa distancia es a propósito: con 20, Indumentaria (35 aprobados) todavía deja gente afuera y el ranking por desempeño sigue teniendo algo que ordenar. `test/aviso-wa.test.js` lleva el número escrito para que moverlo obligue a mirar por qué.
- **`WA_MUDO_FONDO = 5` / `WA_MUDO_CORTE = 12`** — el ranking por desempeño, medido el 2026-09-08. De los 232 avisos que el proveedor abrió, solo 14 terminaron en cotización (4%). El motivo aparece al mirar quién los recibe: proveedores anotados en 5 a 7 rubros a la vez ("Todo Tienda" figura en siete) califican para casi cualquier pedido y se llevan los lugares siempre. EMA IMPORTADORA y Librería Integral MAYA recibieron **13 avisos cada uno y no cotizaron nunca**. Con 5 avisos sin cotizar el proveedor va al **fondo** de la cola (señal blanda: si en su rubro no hay nadie más, igual se le manda); con 12 queda **afuera** (12 mensajes leídos sin una sola respuesta ya no es ruido, y seguir escribiéndole arriesga que reporte el número). El dato lo arma `cargarDesempeno()` sobre toda la historia de `avisos_wa` + `cotizaciones`; ⚠️ **si esa lectura falla devuelve un Map vacío y el reparto queda exactamente como antes** — nadie se queda sin aviso por un problema de medición.
- **`WA_HORA_DESDE = 9` / `WA_HORA_HASTA = 21`** — fuera de esa franja (hora argentina, UTC-3 fijo) el aviso **no sale**. Medido el 2026-09-08: había tandas saliendo 23:38 y 23:45 y pedidos publicados 04:42, con el local del mayorista cerrado. ⚠️ **El corte NO reserva filas en `avisos_wa`, y de eso depende todo el mecanismo**: la cola de la mañana encuentra los pendientes justamente porque son los pedidos recientes sin ninguna fila. Si alguien reserva antes de ese corte, la cola queda vacía y los avisos nocturnos se pierden en silencio.
- **`WA_MAX_POR_DIA = 4`** por proveedor, ventana móvil, contado sobre `avisos_wa` (no sobre `last_wa_at`, que guarda un solo instante y solo sirve para ordenar el reparto). ⚠️ **Estuvo en 1 y estaba mal:** se calculó sobre un volumen inventado. El real, medido sobre los 19 pedidos reales, es 1,58 pedidos/día con 42% en rubro ciego → ~1,2 avisos/día repartidos entre 17 rubros. Con el tope en 1 se tiraba el segundo pedido del día de cada rubro, o sea se perdían ventas, sin proteger de nada. **Actualización 2026-08-27: la demanda subió a 2,71 pedidos/día** (19 en los últimos 7 días, 22 acumulados) → ~420 mensajes/mes ≈ USD 5 a tarifa *utility*. El tope de 4 sigue holgado; volver a mirarlo si supera los 5 pedidos/día.
- **Costo real, no estimado:** ~1,2 pedidos con aviso por día × ~17 destinatarios promedio ≈ **600 mensajes/mes ≈ USD 7** a la tarifa *utility* de Argentina. El costo nunca es la restricción; la restricción es la salud del número.

⚠️ **En un pedido de proveedor (tipo B) la cantidad NUNCA lleva un número.** Decía "Cantidad: 2 productos" y el proveedor entendía que le querían comprar dos prendas: descartaba el pedido por chico justo en los casos más grandes (alguien que quiere surtirse de dos líneas enteras). Ahora la línea dice "Busca proveedor para: X, Y" y la cantidad "a convenir". La cantidad no se puede dejar vacía porque la plantilla tiene `Cantidad: ` fijo y un parámetro vacío hace fallar el envío entero.

⚠️ **No se tocó ninguna policy.** En particular `sol_select`, que deja que cualquier usuario con sesión vea todos los pedidos abiertos y sobre la que está construido el feed con "Ver todos". El alcance por rubro vive en el **servidor**, que arma la lista con el service-role: el proveedor nunca elige a quién se le manda y el link no le da ningún permiso que no tuviera. `avisos_wa` va con RLS activada y **cero policies y cero grants** (adentro hay teléfonos): solo la ve el service-role.

⚠️ **El anti-duplicado es el índice único `(solicitud_id, proveedor_id)` de `avisos_wa`, y la fila se RESERVA antes de mandar.** Mismo patrón que `email_logs`. Si se invierte el orden, dos llamadas simultáneas mandan dos WhatsApp iguales.

⚠️ **Los parámetros de una plantilla no pueden tener saltos de línea, tabs ni 4 espacios seguidos**: Meta rechaza el envío entero con un `131008`. Todo lo que escribe el comprador pasa por `limpiarParam()`. Y **el cuerpo de una plantilla no puede terminar en variable**, por eso el texto cierra con una línea fija después del link.

**Webhook de entrada** (`?action=wa_webhook`, vía el rewrite `/api/wa-webhook`; migración `sql/2026-08-26_avisos_wa_webhook.sql`). Hace dos cosas:
- **Anota el embudo** en `avisos_wa.entregado_at` / `leido_at` / `respondio_at`. Sin esto solo sabemos que un aviso *salió*: si el proveedor no cotiza, no se puede distinguir "lo leyó y no le sirvió" (problema del mensaje) de "nunca le llegó" (problema del canal). La hipótesis del MVP no se responde sin esa distinción.
- **Contesta al que responde.** Un número de la Cloud API no tiene app donde leer nada, así que el proveedor que contesta le escribe al vacío. Se le devuelve el link del pedido por el que se le escribió, una vez por teléfono por día.

⚠️ **Va antes del chequeo `req.method !== 'POST'`**: Meta valida la URL con un GET (`hub.challenge`) y solo después manda eventos por POST. Variables: `WHATSAPP_VERIFY_TOKEN` (sin ella la verificación se rechaza y el webhook no se puede ni configurar). **A Meta se le contesta 200 antes de procesar nada**: si el endpoint tarda o falla, reintenta el mismo evento y termina desactivando el webhook.

⚠️ **La firma `X-Hub-Signature-256` NO se valida, y es una decisión, no un olvido.** Meta firma el cuerpo *crudo*, que en Vercel ya viene parseado; recuperarlo exige apagar el parseo, que es una opción de archivo y rompería las otras tres ramas. El daño se acotó en su lugar: los acuses solo actualizan filas que ya existen (se busca por el `wa_message_id` que devolvió Meta), y la respuesta automática sale solo a teléfonos que están en `avisos_wa` de los últimos 7 días, una vez por día. El peor caso de un evento falsificado es un mensaje de más a un proveedor al que ya le habíamos escrito.

**Fases futuras, marcadas en el código donde engancharían, sin implementar:** estructuración del pedido con IA (armado de params) y muro medido (`WA_RETARDO_FREE_MIN`, hoy en cero para no tener que reescribir el reparto). El ranking por desempeño ya **no** está en esta lista: se implementó el 2026-09-08.

#### La cola de la mañana (2026-09-08)

Los pedidos publicados fuera de la franja horaria no pierden el aviso: quedan esperando y los suelta `?action=wa_pendientes`, colgado del cron diario de `recordatorio-planes` (`0 12 * * *` = **9:00 en Argentina**, exactamente `WA_HORA_DESDE`). No se agregó un tercer cron a `vercel.json` por el mismo motivo que el resumen semanal: el plan Hobby limita cuántos hay y la doc pública no dice el tope.

| Pieza | Dónde |
|---|---|
| La cola | `api/notificar-mensaje.js` → `handlerWaPendientes()` (rama nueva; sigue sin entrar otro archivo en `api/`) |
| Disparo | `api/recordatorio-planes.js` → `dispararPendientes()`, todos los días |
| El corte | `enHorarioComercial()` / `horaArgentina()`, exportadas solo para poder probarlas |

⚠️ **No hay columna de estado ni tabla de cola: `avisos_wa` ya es la fuente de verdad.** Un pendiente es un pedido abierto y reciente sin ninguna fila. El precio es que un pedido sin destinatarios (rubro sin proveedores) tampoco escribe filas y se ve igual que un pendiente; por eso `WA_PENDIENTE_HORAS = 13` es corto: se lo reintenta una sola mañana y después sale de la ventana solo. Agrandar esa ventana lo haría reintentar todas las mañanas para siempre.

⚠️ **La cola no manda nada por su cuenta:** por cada pendiente llama a `?action=wa_pedido`, que es donde viven el tope diario, el anti-duplicado, el ranking y el registro. El `Bearer` del cron es lo único que le habilita saltear la ventana de 15 minutos y el corte horario — **no** fuerza rubro ni libera fallos, que siguen siendo exclusivos de una sesión de admin.

**Pendiente:** el acuse de recibo sigue diciendo "lo pueden ver" y no "se les avisó", a propósito, porque el envío está apagado y además nunca sale para los pedidos en `Otro`. Cambiarlo recién cuando las dos cosas estén resueltas.

#### Reenvío de avisos que fallaron por culpa nuestra (2026-09-02)

El 2026-09-01 Meta rechazó 18 avisos con **`Business eligibility payment issue`** (la cuenta se quedó sin método de pago). Tres pedidos quedaron abiertos y con cero cotizaciones porque los proveedores nunca se enteraron. Antes había pasado lo mismo con 43 avisos del 24 y 25 de agosto por `(#133010) Account not registered`, cuando el número todavía no estaba dado de alta.

⚠️ **Un `fallo` en `avisos_wa` no se reintenta solo, y eso sigue estando bien.** Insistirle a un número que nos rebota es exactamente lo que baja la calificación de calidad. Lo que estaba mal era meter en la misma bolsa el rechazo **del destinatario** (no reintentar nunca) y la falla **nuestra** (el mensaje no salió de casa; el proveedor no tuvo nada que ver). La distinción la hace `esFalloNuestro()` con una **lista blanca** de motivos: un error que no reconocemos se trata como del destinatario. Equivocarse para el lado de no mandar cuesta un aviso; para el otro cuesta el número.

| Pieza | Dónde |
|---|---|
| Qué se reintenta | `api/notificar-mensaje.js` → `esFalloNuestro()` + `WA_FALLOS_NUESTROS` |
| Liberación | `liberarFallosNuestros()`, sólo cuando `porAdmin` es true |
| Disparo | `admin.html` → botón **Reenviar aviso** en la tabla de Cotizaciones |
| Migración | `sql/2026-09-02_reintento_avisos_wa.sql` (aplicada el 2026-09-02) |

⚠️ **`avisos_wa_unico` ahora es PARCIAL (`where reintentado = false`).** La columna `reintentado` marca un intento dado por perdido y le libera el lugar; la fila vieja NO se borra (queda el teléfono, el error y la fecha) y el envío nuevo entra como una fila aparte. Por eso puede haber más de una fila por `(solicitud_id, proveedor_id)`: si alguna vez hay que volver al índice total, primero hay que borrar las reintentadas (está escrito en el "para deshacer" de la migración).

⚠️ **No se agregó un estado nuevo a `avisos_wa`, y es a propósito.** `admin_wa_embudo()` cuenta con `filter (where estado = 'fallo')` en siete lugares: un estado nuevo haría desaparecer del tablero los fallos reintentados y el embudo mentiría sobre lo que pasó ese día. Por eso la marca va en una columna aparte y `estado` no se toca.

⚠️ **El reintento NO es automático.** Lo dispara una persona desde el panel, porque el que sabe que la facturación ya se arregló es el founder, no el código. Reintentar solo contra una cuenta que sigue rota sería quemar el número de a 8 mensajes por pedido. El botón usa la puerta que ya existía (`?action=wa_pedido` con sesión de admin y rubro forzado), que es también lo único que saltea la ventana de 15 minutos.

Los que ya recibieron el aviso se saltean solos contra el índice único, y los que fallaron nunca llegaron a escribir `last_wa_at`, así que el orden de `elegirDestinatarios()` los pone **primeros** en el reenvío sin necesidad de tocar nada.

### Resumen semanal al proveedor (2026-09-01)

Todos los lunes, a cada proveedor con movimiento: **cuántos compradores le pidieron el contacto esa semana**. Nada más — no vende Pro, no pide nada.

**Por qué existe, medido el 2026-09-01 sobre la base real:** en 30 días se entregaron **2.680 contactos a 152 proveedores** y hubo **1.380 intentos de ver un catálogo** en 132 perfiles. De los 157 aprobados, **4 pagan**. "Todo Tienda" recibió 140 contactos ese mes, está en plan gratis, tiene el catálogo vacío y no tiene forma de enterarse. Y por el otro lado: **13 proveedores tuvieron Pro alguna vez y quedan 4 vigentes** — los 9 que se fueron pagaron, nunca vieron un número y no renovaron. El producto ya entrega valor; lo entrega invisible. Esto es el recibo.

| Pieza | Dónde |
|---|---|
| Envío | `api/notificar-mensaje.js` → `?action=wa_informe` (rama nueva; sigue sin entrar otro archivo en `api/`) |
| Disparo | `api/recordatorio-planes.js` → `dispararInformeSemanal()`, los lunes |
| Baja del proveedor | `proveedores.notif_informe` + `renderBajaInforme()`/`toggleBajaInforme()` en `js/app.js`, pintado en `#dash-baja-informe` del panel |
| Deep-link | `?ir=perfil` (con catálogo) y `?ir=cargar` (sin catálogo) |
| Migración | `sql/2026-09-01_informe_semanal_wa.sql` (aplicada el 2026-09-01) |
| Pruebas | `node test/informe-wa.test.js` (25 comprobaciones, sin red ni base) |

⚠️ **EL INTERRUPTOR ES `WHATSAPP_TEMPLATE_INFORME`, Y NO TIENE VALOR POR DEFECTO.** Sin esa variable devuelve `{skipped:'sin_plantilla'}` y no manda nada. Ojo con el motivo: el aviso de *pedidos* ya está prendido, o sea que `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID` existen y el corte `wa_apagado` **no** frena esta rama. Si hubiera un nombre por defecto, el primer lunes después del deploy el cron saldría a mandar contra una plantilla que Meta no aprobó: los ~54 envíos fallarían, quedarían escritos en `informes_wa`, y el índice único `(proveedor_id, semana)` impide reintentarlos — se pierde el primer lunes entero. La variable se define en Vercel **el día que Meta apruebe la plantilla**, con el nombre exacto aprobado.

⚠️ **La plantilla todavía no está aprobada (al 2026-09-02).** Meta rechazó la primera versión pidiendo categoría *marketing*; el texto exacto que se reenvió como *utility* está en el comentario de `INF_TEMPLATE`, que es la única copia fuera de Meta. `WHATSAPP_TEST_TO` sigue desviando todo a un número.

⚠️ **NUNCA mandar un número flojo.** `INF_MINIMO_CONTACTOS = 3`: el que no llega no recibe nada. Un "esta semana lo contactaron 0 personas" es un mensaje **pago** que argumenta en contra de EmprendeGO. Por el mismo motivo el mensaje **no compara contra la semana anterior**: la mitad de las semanas el número baja. Con el piso en 3, al 2026-09-01 entran **54 de los 157 aprobados**.

⚠️ **`notif_wa === false` apaga también el resumen**, aunque `notif_informe` siga en `true`. El que apagó los avisos de pedidos dijo "no me mandes WhatsApp", no "no me mandes esa categoría".

⚠️ **La paginación de `contarPorProveedor()` no es opcional.** PostgREST corta en 1000 filas y no avisa (ver `project_supabase_1000_filas`): hoy van ~620 consultas semanales y subiendo, y sin paginar una parte de los proveedores empezaría a recibir números más chicos que los reales, en silencio.

⚠️ **No se agregó un tercer cron.** `vercel.json` ya tiene dos y el plan Hobby limita la cantidad sin que la doc pública diga cuál es el tope (mismo caso que el límite de 12 funciones). El resumen se cuelga del cron diario de `recordatorio-planes`, que chequea si es lunes en hora argentina. Si algún día hay más cupo, la entrada de `vercel.json` está escrita en el comentario de `dispararInformeSemanal()`.

⚠️ **`informes_wa` no se lee nunca desde el navegador** (tiene teléfonos): RLS activada, cero policies, cero grants. El anti-duplicado es el índice único `(proveedor_id, semana)` y **la fila se RESERVA antes de mandar**, igual que `avisos_wa` y `email_logs`.

⚠️ **`enviarInforme()` NO toca `proveedores.last_wa_at`.** Esa columna ordena el reparto del aviso de *pedidos*; si el resumen la pisara, todos quedarían con la misma fecha cada lunes y el reparto se volvería arbitrario.

### Topes de consumo (2026-09-30)

Auditoría contra picos de factura por tráfico de bots. La conclusión cambió el
problema de lugar y conviene tenerla escrita, porque de ella salen los umbrales:

⚠️ **EL SPEND CAP DE SUPABASE NO COBRA DE MÁS: RESTRINGE EL PROYECTO.** Está
activo (verificado el 2026-09-30), así que una avalancha ya no puede producir
una factura sorpresa — puede producir **EmprendeGO en modo solo lectura**. Y
los dos proyectos, el marketplace y `emprendego-negocios`, **cuelgan de la
misma organización y comparten la misma cuota**: lo que quema uno se lo saca al
otro. El consumo dejó de ser un problema de plata y pasó a ser uno de que la
app siga en pie. Vercel está en Hobby, que tampoco cobra excedentes.

⚠️ **EL RIESGO REAL NO ERAN LOS ENDPOINTS, ERAN LAS IMÁGENES.** Los dos buckets
(`productos` y `Avatares`) se sirven por URL pública y cualquiera los descarga
sin límite. Eso no se puede cerrar sin romper el catálogo público, así que lo
que se hizo fue abaratar cada descarga.

| Tope | Dónde | Número |
|---|---|---|
| Caché de fotos | `js/app.js` → `CACHE_FOTOS` | 31536000 (un año) |
| Reloj del chat | `js/app.js` → `iniciarChatPolling()` | 8s, ×2 por falla, corta a la 5ª |
| Mis conversaciones / bandeja | `js/app.js` | `.limit(500)` |
| Pedidos archivados | `js/app.js` → `verPedidosArchivados()` | `.limit(200)` |
| Baja de correos | `api/unsub.js` | 20/min por IP |
| Pruebas | `node test/costos-bots.test.js` | 20 comprobaciones, sin red ni base |

⚠️ **EL AÑO DE CACHÉ ES SEGURO SÓLO PORQUE EL NOMBRE DE ARCHIVO ES
IRREPETIBLE** (token aleatorio + `Date.now()`, ver los `path` de
`subirFotoStorage()` y `subirAvatar()`). Una foto nunca se sobrescribe: cambiar
la imagen de un producto sube un archivo con otro nombre. **Si alguien vuelve a
nombres estables o a `upsert`, este número se vuelve peligroso** — el navegador
seguiría mostrando la foto vieja un año — y hay que bajarlo. La prueba lo
vigila.

⚠️ **EL RELOJ DEL CHAT AHORA PREGUNTA BARATO.** Traía la conversación entera
con todas las columnas cada 8 segundos, sólo para comparar si había algo nuevo.
Ahora pide **una** fila (el id del último mensaje) y recién si ese id no lo
conocemos hace la consulta completa. Se duerme con la pestaña oculta
(`visibilitychange` despierta a `chatDespertar`) y **se rinde tras 5 fallas
seguidas** duplicando la espera: el `catch (e) { }` anterior se comía el error y
seguía pidiendo cada 8 segundos contra un Supabase caído o devolviendo 429, que
es exactamente lo que empeora las dos cosas. Es `setTimeout` encadenado y no
`setInterval` justamente porque la espera cambia.

⚠️ **EL CATÁLOGO NO LLEVA TOPE Y ESO ES A PROPÓSITO.** Ver
`project_buscador_client_side`: el buscador filtra en el cliente sobre todo el
catálogo, así que un límite fijo le esconde productos al que busca. Las dos
consultas de `productos` (`js/app.js`, catálogo público de un proveedor y panel
propio) quedaron sin `.limit()` deliberadamente y hay una prueba que lo exige.

⚠️ **`USAR_TRANSFORM_IMG` SIGUE EN `false`** (`js/app.js`). La función que
reescribe la URL para pedirle a Supabase la imagen ya achicada está escrita y
apagada. No se prendió porque **las transformaciones se facturan aparte por
imagen de origen**: puede convenir o no según cuántas imágenes distintas haya, y
prenderla sin medir sería cambiar un costo por otro.

**Lo que NO se tocó, y por qué:** `webhook-mp.js` no lleva rate limit porque
valida la firma HMAC con `timingSafeEqual` antes de hacer cualquier llamada
externa; `keepalive.js` y `recordatorio-planes.js` exigen el Bearer del cron;
`reactivar-pro.js` exige `x-admin-secret`. El único que escribía en Supabase sin
ningún tope era `unsub.js`, y ahora no.

**Del lado de EmprendeGO Negocios** el único gasto sin techo es el proveedor de
los modelos (ZEUS y la generación visual), que cobra por llamada. Se le puso un
freno de ráfaga por usuario en `lib/freno.mjs`. No es un cupo diario: frena un
bucle, no a una persona que usa mucho el producto.

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
- Deep-links por query string: `?pago=`, `?tn=`, `?ml=`, `?p=` (producto), `?prov=` (proveedor), `?ir=planes`, `?ir=cotizaciones`, **`?ir=cotizaciones&pedido=<uuid>`** (aviso de pedido por WhatsApp), `?ir=cargar` y `?ir=perfil` (los dos destinos del resumen semanal). Si agregás uno nuevo, fijate que no choque con estos.

⚠️ **Los parámetros se leen UNA sola vez, en la constante `params` del tope del handler de `DOMContentLoaded`. Nunca leas `window.location.search` más abajo de esa línea: viene vacío.** La primera sentencia del handler es `history.pushState(null, '', window.location.pathname)` (arreglo del botón atrás de Android, `f8015f2`), y `pathname` es la ruta **sin** query string, así que ese pushState borra los parámetros de la URL. Estuvo roto en silencio del 2026-05-12 al 2026-08-25 y dejó mudos los avisos de TN/ML/MP y el deep-link del mail de anuncio; los síntomas son carteles que no aparecen, no errores, por eso nadie lo notó. `?p=` y `?prov=` se salvaron porque se leen fuera del handler.

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
