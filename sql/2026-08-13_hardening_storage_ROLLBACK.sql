-- ============================================================
-- ROLLBACK de 2026-08-13_hardening_storage.sql (Paso 1)
-- ============================================================
-- Estado ORIGINAL capturado del dashboard el 2026-08-13 antes del cambio:
--
--   id         | name      | public | file_size_limit | allowed_mime_types
--   -----------+-----------+--------+-----------------+-------------------
--   productos  | productos | true   | NULL            | NULL
--   Avatares   | avatares  | true   | NULL            | NULL
--
-- Correr esto SOLO si despues del cambio fallan subidas legitimas de fotos.
-- Devuelve los buckets a "sin limite de tamano y cualquier tipo de archivo",
-- que es justamente la condicion insegura: usarlo como medida temporal
-- mientras se ajustan los valores, no como estado final.
-- ============================================================

update storage.buckets
set file_size_limit  = NULL,
    allowed_mime_types = NULL
where id in ('productos','Avatares');

-- Verificacion: debe volver a mostrar NULL en ambas columnas
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('productos','Avatares');
