# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
- **`api/tiendanube.js` (multi-purpose router)** — mismo flujo conceptual que ML, ramificando por `?action=auth|callback|sync|privacy`. Las URLs viejas `/api/tiendanube-callback` y `/api/tn-privacy` están registradas en el panel de Tienda Nube y siguen funcionando vía rewrites en `vercel.json`: no se pueden cambiar.

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
