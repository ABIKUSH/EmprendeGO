-- =====================================================================
-- AVISO POR MAIL AL COMPRADOR CUANDO LE COTIZAN.
-- Fecha: 2026-08-12
--
-- Ya aplicado. Es UNA sola columna: el enfriamiento entre mails, espejo
-- del que ya tiene proveedores.last_notified_at.
--
-- NO lleva el ritual de GRANT que pide CLAUDE.md porque esta columna no
-- la lee ni la escribe el frontend: solo la toca api/notificar-mensaje
-- con el service-role, que se saltea grants y RLS. Darle permiso a
-- authenticated seria abrirla sin necesidad.
--
-- La baja de estos mails NO va aca: se reusa public.email_optouts, que
-- guarda por email (sobrevive a borrar y recrear la cuenta) y ya la usa
-- el "Cancelar suscripcion" de los anuncios.
-- =====================================================================

alter table public.usuarios
  add column if not exists last_notified_at timestamptz;

comment on column public.usuarios.last_notified_at is
  'Enfriamiento de mails al comprador. Solo la escribe/lee el service-role desde api/notificar-mensaje; a proposito NO se le da grant a anon ni authenticated.';

notify pgrst, 'reload schema';

-- Comprobacion
select column_name, data_type
  from information_schema.columns
 where table_schema='public' and table_name='usuarios' and column_name='last_notified_at';

-- Para deshacer:
--   alter table public.usuarios drop column if exists last_notified_at;
--   notify pgrst, 'reload schema';
-- El endpoint degrada solo: sin la columna, no aplica enfriamiento pero
-- sigue respetando la baja y el freno de "cotizacion reciente".
