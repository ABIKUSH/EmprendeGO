-- ============================================================
-- 2026-08-13 — Hardening de Storage (Paso 1 de 3)
-- ============================================================
-- CONTEXTO
-- Auditoria de abuso/costos. Se comprobo desde curl, con la clave
-- publishable (publica por diseno), que un tercero SIN AUTENTICARSE puede
-- subir archivos arbitrarios a los buckets 'productos' y 'Avatares':
--
--   POST /storage/v1/object/productos/x.bin  -> 200 OK
--
-- Se subio un archivo de 6 MB de prueba sin login y sin tope. Los buckets
-- estaban con file_size_limit = NULL y allowed_mime_types = NULL, es decir
-- sin limite de tamano y aceptando cualquier tipo de archivo.
--
-- Vector de costo: Storage es escritura permanente. El rol anon puede subir
-- pero NO borrar, asi que la limpieza es manual. En plan Pro esto se factura
-- como excedente de storage.
--
-- ESTE PASO (defensa en profundidad, NO cierra el agujero por si solo):
-- pone tope de tamano y lista blanca de tipos. El cierre real es el Paso 2
-- (exigir authenticated en la policy de INSERT de storage.objects), que
-- requiere ver antes las policies existentes.
--
-- POR QUE ESTOS VALORES
-- js/app.js comprimirImagen() reduce a JPEG (productos 800px q0.7,
-- avatares 200px q0.75) => salida tipica muy por debajo de 1 MB. PERO
-- devuelve el archivo ORIGINAL sin tocar cuando:
--   - es image/gif o image/svg+xml (canvas los arruinaria)
--   - el comprimido pesaria mas que el original y no hubo redimension
--   - salta una excepcion (catch -> return file)
-- Por eso la lista blanca incluye los rasters comunes, no solo jpeg.
-- subirAvatar() ya rechaza en cliente > 3 MB: se replica ese tope en el
-- servidor para que coincidan y no aparezca un error distinto al del cliente.
--
-- SVG queda FUERA a proposito: los buckets son publicos y un SVG puede
-- llevar <script> embebido (XSS almacenado servido desde el dominio de
-- Supabase). Ningun flujo de la app sube SVG.
-- ============================================================

-- Tope 3 MB, alineado con el chequeo de cliente de subirAvatar().
-- Los buckets se actualizan por id (ojo: el bucket de avatares tiene
-- id='Avatares' con A mayuscula y name='avatares' en minuscula).

update storage.buckets
set file_size_limit  = 3145728,  -- 3 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id in ('productos','Avatares');

-- Verificacion
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('productos','Avatares');
