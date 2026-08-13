# Prompt para sesión nueva — unificar Tienda Nube (12 → 9 funciones)

Preparado el 2026-08-13 al cerrar la auditoría de abuso/costos de Supabase.
Copiar el bloque de abajo y pegarlo en una sesión nueva de Claude Code.

---

Sos el ingeniero a cargo de un cambio de infraestructura en EmprendeGO. El
objetivo es **liberar lugares de funciones en Vercel**, de 12 a 9, unificando
los cuatro archivos de Tienda Nube en un solo router.

## Contexto verificado (no lo re-investigues, ya está comprobado)

El plan Hobby de Vercel permite **exactamente 12 funciones** en `/api`. Está
confirmado empíricamente el 2026-08-13: se pusheó una rama descartable con una
13ª función y el build falló con *"No more than 12 Serverless Functions can be
added to a Deployment on the Hobby plan. Create a team (Pro plan) to deploy
more."* La documentación pública de Vercel NO menciona este tope, así que no
sirve para desmentirlo. Hoy el proyecto usa 12 de 12 y por eso no se puede
agregar ningún endpoint nuevo.

Los cuatro archivos a unificar, todos con `export default` (ESM):

| archivo | método | qué hace |
|---|---|---|
| `api/tiendanube-auth.js` | GET | lee `req.query.proveedor_id`, redirige 302 a tiendanube.com |
| `api/tiendanube-callback.js` | GET | lee `req.query.code` y `req.query.state`, canjea el token |
| `api/tiendanube-sync.js` | POST | lee `req.body.proveedor_id`, importa productos |
| `api/tn-privacy.js` | cualquiera | 3 líneas, devuelve 200 "OK" |

Cuenta final: **12 − 4 + 1 = 9 funciones**, quedan 3 lugares libres.

## Quién llama a cada ruta — esto define el riesgo

**Rutas que controla el propio frontend** (se pueden renombrar sin problema):
- `js/app.js:6431` → `window.location.href = '/api/tiendanube-auth?proveedor_id=' + ...`
- `js/app.js:6440` → `fetch('/api/tiendanube-sync', { method: 'POST', ... })`

**Ruta con dirección registrada afuera — NO se puede cambiar:**
- `api/tiendanube-auth.js:11` arma `redirect_uri` como la constante
  `'https://emprendego.com.ar/api/tiendanube-callback'`, y esa misma URL está
  cargada en la configuración de la app en el panel de Tienda Nube. Si la ruta
  pública deja de responder, **se rompe la conexión de tiendas para todos los
  proveedores Pro**.

`api/tn-privacy.js` probablemente también esté registrada en el panel de Tienda
Nube como URL de privacidad/borrado de datos. **Preguntale al usuario si esa URL
está cargada allá antes de decidir si necesita rewrite o no.**

## Diseño pedido

Crear `api/tiendanube.js` que ramifique por `req.query.action` en
`auth | callback | sync | privacy`, moviendo el cuerpo de cada archivo tal cual
(no reescribas la lógica de negocio, es código que ya funciona en producción).

Después:
1. Borrar los 4 archivos viejos.
2. Actualizar las **dos** llamadas del frontend a `/api/tiendanube?action=auth`
   y `/api/tiendanube?action=sync`. Son rutas propias: no necesitan rewrite.
3. Agregar en `vercel.json` **un solo rewrite crítico**, para no cambiar la URL
   externa:
   `{ "source": "/api/tiendanube-callback", "destination": "/api/tiendanube?action=callback" }`
   (más el de `tn-privacy` si el usuario confirma que está registrada).
   Los rewrites NO cuentan como funciones.
4. `vercel.json` ya tiene hoy un rewrite no-op de
   `/api/tiendanube-callback` a sí mismo. Reemplazalo, no lo dupliques.
5. `api/_ratelimit.js` empieza con guion bajo, no cuenta como función y no se
   toca. `tiendanube-sync.js` lo importa: mantené ese import en el router.

## El riesgo técnico principal, y cómo despejarlo

Tienda Nube llama al callback con `?code=...&state=...`. El rewrite le agrega
`?action=callback`. **Hay que comprobar que Vercel fusiona los query params y no
los pisa**, porque si `code` y `state` se pierden, la conexión de tiendas se
rompe en silencio.

No lo asumas ni lo deduzcas de la documentación: **verificalo**.

Procedimiento seguro, ya probado en este proyecto:
1. Trabajá en una rama, nunca en `main`. Vercel solo despliega `main` a
   producción; cualquier otra rama genera un preview aislado con su propia URL.
2. Pusheá la rama y pedile al usuario la URL del preview.
3. Pegale con curl al preview simulando el callback:
   `curl -sI "<URL-PREVIEW>/api/tiendanube-callback?code=test123&state=abc"`
   Agregá temporalmente un log o una respuesta de diagnóstico que muestre qué
   recibió el handler en `req.query`. Tienen que llegar `code`, `state` **y**
   `action`.
4. Si los query params se pisan, cambiá de enfoque: detectá la acción por el
   path en vez de por query param. **No sigas adelante hasta que esto esté
   verificado.**
5. Recién con eso verde, mergeá a `main`.

## Reglas de trabajo

- Hacé `git commit` de todo lo pendiente ANTES de empezar.
- Rama nueva. Nunca probar sobre `main`.
- No reescribas la lógica de negocio de los handlers: es código en producción.
  Mové los cuerpos tal cual, cambiando solo el ruteo.
- Mostrale al usuario el `vercel.json` final antes de pushear.
- El rollback es revertir el commit del merge. Dejalo escrito antes de mergear.
- Cuando esté en producción, **pedile al usuario que conecte o resincronice una
  tienda de Tienda Nube real**. El flujo completo de OAuth no se puede probar
  con curl: la parte del canje de token necesita un `code` de verdad. Ese es el
  único paso que no podés verificar solo.
- Afecta a los proveedores del Plan Pro, que son pocos pero son los que pagan.
  Si algo queda dudoso, preguntá antes de asumir.

## Para qué sirve esto después

Los 3 lugares liberados habilitan el paso siguiente: un endpoint de catálogo con
caché de CDN. Hoy el catálogo entero (1.971 productos, ~1,02 MB) sale de
Supabase **en cada visita**. Con un caché de 60 segundos, Supabase recibiría una
consulta por minuto en vez de una por visita, y la app cargaría más rápido.
Ese es el objetivo final; esta unificación es solo el paso que lo destraba.
