-- =====================================================================
-- REINTENTO DE AVISOS QUE FALLARON POR CULPA NUESTRA
-- Fecha: 2026-09-02
--
-- QUE PASO (medido, no supuesto)
--   El 2026-09-01 Meta rechazo 18 avisos con "Business eligibility payment
--   issue": la cuenta de WhatsApp quedo sin metodo de pago valido. Los tres
--   pedidos afectados siguen ABIERTOS y con CERO cotizaciones:
--
--     400ec447  cargadores tipo C/Lightning  Tecnologia   Jujuy    7 de 8 fallaron
--     8bb0827a  Tarjetas NFC                 Tecnologia   Cordoba  8 de 8 fallaron
--     b43e2a94  remeras de hombre por mayor  Indumentaria CABA     3 de 8 fallaron
--
--   Antes ya habia pasado lo mismo por otro motivo nuestro: 43 avisos del
--   24 y 25 de agosto murieron con "(#133010) Account not registered",
--   porque el numero todavia no estaba dado de alta.
--
-- POR QUE NO SE PODIAN REENVIAR
--   avisos_wa_unico es un indice unico TOTAL sobre (solicitud_id,
--   proveedor_id): cubre tambien las filas en 'fallo'. Eso es deliberado y
--   sigue estando bien para el caso que lo motivo —un numero que nos rebota
--   no se reintenta, porque insistirle a un numero que rebota es justo lo
--   que baja la calificacion de calidad— pero mete en la misma bolsa dos
--   cosas distintas:
--
--     fallo DEL DESTINATARIO  -> no reintentar nunca. La regla original.
--     fallo NUESTRO           -> el proveedor nunca fue el problema. Hoy
--                                quedaba castigado de por vida por un
--                                problema de facturacion que ya se resolvio.
--
-- QUE HACE ESTA MIGRACION
--   Agrega avisos_wa.reintentado y vuelve PARCIAL el indice unico, para que
--   una fila marcada como reintentada libere su lugar y se pueda mandar de
--   nuevo. La fila vieja NO se borra: queda el telefono, el error y la fecha.
--
-- POR QUE UNA COLUMNA Y NO UN ESTADO NUEVO
--   admin_wa_embudo() cuenta con `filter (where estado = 'fallo')` en siete
--   lugares. Un estado nuevo haria desaparecer del tablero los fallos
--   reintentados y el embudo mentiria sobre lo que paso ese dia. Con una
--   columna aparte el estado no se toca y el tablero sigue contando igual.
--
-- QUIEN MARCA reintentado
--   Solo el service-role, desde api/notificar-mensaje?action=wa_pedido con
--   sesion de admin y rubro forzado, y SOLO sobre los errores de la lista
--   blanca de esFalloNuestro(). El reintento no es automatico a proposito:
--   lo dispara una persona que sabe que el problema de fondo se arreglo.
--
-- ORDEN CORRECTO: correr este SQL PRIMERO, pushear el codigo DESPUES.
-- Si el codigo llega antes, el PATCH de reintentado devuelve 400 y el
-- reenvio se comporta como hoy (no reintenta nada). No rompe el envio normal.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- CHEQUEO PREVIO. Si algo no esta como se espera, aborta todo.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.avisos_wa') is null then
    raise exception 'ABORTA: no existe public.avisos_wa; correr antes sql/2026-08-24_aviso_wa_pedidos.sql';
  end if;

  if not exists (select 1 from pg_indexes
                  where schemaname='public' and indexname='avisos_wa_unico') then
    raise exception 'ABORTA: no existe el indice avisos_wa_unico; revisar a mano antes de seguir';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) LA MARCA DE REINTENTO
-- ---------------------------------------------------------------------
-- Sin grants a proposito, igual que last_wa_at: el navegador no lee ni
-- escribe avisos_wa (adentro hay telefonos). Solo la toca el service-role.
alter table public.avisos_wa
  add column if not exists reintentado boolean not null default false;

comment on column public.avisos_wa.reintentado is
  'true = este intento se dio por perdido por una falla NUESTRA (facturacion, numero no registrado) y se habilito a mandar de nuevo. La fila se conserva como registro; el envio nuevo entra como una fila aparte. Nunca se marca por un rechazo del destinatario.';


-- ---------------------------------------------------------------------
-- 2) EL INDICE UNICO, AHORA PARCIAL
-- ---------------------------------------------------------------------
-- Sigue cubriendo 'reservado', 'enviado' y 'fallo' exactamente como antes:
-- lo unico que sale de la exclusividad son las filas ya dadas por perdidas.
-- El anti-duplicado contra dos llamadas simultaneas queda intacto, porque
-- una fila recien reservada tiene reintentado = false.
drop index if exists public.avisos_wa_unico;

create unique index if not exists avisos_wa_unico
  on public.avisos_wa (solicitud_id, proveedor_id)
  where reintentado = false;

-- Para buscar rapido los fallos de un pedido a la hora de reintentarlo.
create index if not exists avisos_wa_reintento_idx
  on public.avisos_wa (solicitud_id)
  where estado = 'fallo' and reintentado = false;

commit;


-- =====================================================================
-- COMPROBACION. El indice tiene que aparecer con su WHERE.
-- =====================================================================
select 'columna reintentado' as que,
       coalesce((select data_type from information_schema.columns
                  where table_schema='public' and table_name='avisos_wa'
                    and column_name='reintentado'), 'FALTA') as resultado
union all
select 'indice unico parcial',
       coalesce((select indexdef from pg_indexes
                  where schemaname='public' and indexname='avisos_wa_unico'), 'FALTA')
union all
select 'fallos nuestros pendientes de reintento',
       (select count(*)::text from public.avisos_wa
         where estado='fallo' and reintentado=false
           and (error ilike '%payment%' or error ilike '%133010%'));


-- =====================================================================
-- PARA DESHACER (pegar en el editor de SQL, no corre solo):
--
--   begin;
--   drop index if exists public.avisos_wa_reintento_idx;
--   drop index if exists public.avisos_wa_unico;
--   -- OJO: si ya hay filas reintentadas, existen pares (solicitud, proveedor)
--   -- repetidos y el indice TOTAL no se puede recrear sin borrarlas antes:
--   --   delete from public.avisos_wa where reintentado = true;
--   create unique index avisos_wa_unico
--     on public.avisos_wa (solicitud_id, proveedor_id);
--   alter table public.avisos_wa drop column if exists reintentado;
--   commit;
-- =====================================================================
