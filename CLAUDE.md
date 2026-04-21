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
- [api/ml.js](api/ml.js) — proxy to MercadoLibre API for product import
- [api/webhook-mp.js](api/webhook-mp.js) — Mercado Pago webhook handler (updates provider plan)

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

### External Services

| Service | Purpose | Config |
|---|---|---|
| Supabase | Database + auth | URL/key hardcoded in `app.js` (public key — safe) |
| Google Sign-In | User authentication | `gsi/client` library |
| Mercado Pago | Pro plan payments (20,000 ARS/month) | `MP_ACCESS_TOKEN` env var (Vercel secret) |
| MercadoLibre API | Product import proxy | via `/api/ml.js` |
| Supabase Storage | Product images | bucket `productos` |

### Serverless API Routes

- `POST /api/crear-pago` — creates Mercado Pago checkout, params: `{email, proveedorId}`
- `GET /api/ml?id={MLA_ID}` — fetches MercadoLibre item details
- `POST /api/webhook-mp` — payment webhook; sets `plan='pro'` + 30-day expiry on approved payment

### PWA

`manifest.json` + `sw.js` (service worker). The SW currently just clears caches on activate.

## Key Patterns in app.js

- All Supabase calls use the v2 SDK: `.from('table').select/insert/update/delete`
- Real-time chat: `.channel().on('postgres_changes', ...).subscribe()`
- Auth flow: Google Sign-In → `supabase.from('usuarios').upsert()`
- MercadoLibre import: calls `/api/ml?id=` then inserts into `productos` table
- Approval flow: admin sets `estado='aprobado'` on `proveedores` row
