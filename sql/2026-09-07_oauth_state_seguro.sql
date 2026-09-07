-- ===========================================================================
-- OAuth: state aleatorio de un solo uso  (2026-09-07)
-- ===========================================================================
--
-- QUÉ ARREGLA
--
-- Hasta hoy, el flujo de conexión de Mercado Libre (api/ml.js) y de Tienda Nube
-- (api/tiendanube.js) mandaba el `proveedor_id` como parámetro `state` de OAuth,
-- sin pedir sesión al iniciar ni comprobar pertenencia al volver. El callback le
-- creía a la URL y escribía las credenciales en la fila que esa URL dijera.
--
-- Eso habilitaba dos ataques:
--
--   1) ROBO DE CREDENCIALES DE UN TERCERO. El atacante arma el link con SU propio
--      proveedor_id y se lo hace abrir a un vendedor real de Mercado Libre. La
--      víctima autoriza con su cuenta y su access_token + refresh_token quedan
--      guardados en la fila del atacante. Como el scope pedido incluye
--      offline_access, ese acceso se renueva solo por tiempo indefinido.
--
--   2) ENVENENAMIENTO DE CATÁLOGO. Al revés: el atacante toma el proveedor_id de
--      una víctima y autoriza con su propia cuenta. La fila de la víctima queda
--      con las credenciales del atacante y la siguiente sincronización le mete
--      productos ajenos en el perfil.
--
-- ⚠️ El proveedor_id NO es un secreto: api/catalogo.js lo devuelve en cada fila
-- del catálogo público, sin autenticación. Los UUID de los 157 proveedores están
-- a la vista, así que el segundo ataque no requiere adivinar nada.
--
-- Lo encontró Codex el 2026-09-07 revisando api/ml.js.
--
-- CÓMO QUEDA
--
-- El `state` pasa a ser un valor aleatorio opaco de 32 bytes, guardado acá junto
-- con el proveedor al que pertenece y el email de quien inició el flujo. El inicio
-- exige sesión y que esa sesión sea dueña del proveedor. El callback consume el
-- state de forma atómica y además compara contra una cookie HttpOnly que se dejó
-- en el navegador que empezó — eso último es lo único que frena el ataque 1.
--
-- ===========================================================================

create table if not exists public.oauth_estados (
  state        text primary key,
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  -- 'ml' | 'tn'. Un state de Mercado Libre no sirve para cerrar un flujo de
  -- Tienda Nube: el consumo filtra por esta columna.
  proveedor    text not null check (proveedor in ('ml', 'tn')),
  -- Email de la sesión que inició el flujo. Queda para poder auditar después
  -- quién pidió cada vinculación.
  email        text not null,
  creado_at    timestamptz not null default now(),
  usado_at     timestamptz
);

-- El consumo filtra por creado_at para descartar los vencidos.
create index if not exists oauth_estados_creado_idx
  on public.oauth_estados (creado_at desc);

-- ⚠️ RLS ACTIVADA, CERO POLICIES Y CERO GRANTS, igual que avisos_wa e informes_wa.
-- Adentro hay emails y el state es, mientras vive, una credencial de un solo uso:
-- esta tabla NO se lee nunca desde el navegador. Solo la ve el service-role.
alter table public.oauth_estados enable row level security;

revoke all on public.oauth_estados from anon, authenticated;

comment on table public.oauth_estados is
  'States de OAuth de un solo uso para ML y TN. Solo service-role. Ver sql/2026-09-07_oauth_state_seguro.sql';

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Crecimiento y limpieza
-- ---------------------------------------------------------------------------
-- Se escribe una fila por cada intento de conexión. Con 4 proveedores Pro
-- vigentes eso es del orden de decenas de filas por año: no hace falta un cron
-- para limpiarla. Si alguna vez molesta, esto la deja al día sin romper nada,
-- porque un state de más de 15 minutos ya no sirve para nada:
--
--   delete from public.oauth_estados where creado_at < now() - interval '7 days';

-- ---------------------------------------------------------------------------
-- Para deshacer
-- ---------------------------------------------------------------------------
-- ⚠️ Volver atrás esta migración SIN volver atrás el código deja el flujo de
-- conexión roto: api/ml.js y api/tiendanube.js necesitan esta tabla para crear y
-- consumir el state. Se revierten juntos o no se revierte ninguno.
--
--   drop table if exists public.oauth_estados;
--   notify pgrst, 'reload schema';
