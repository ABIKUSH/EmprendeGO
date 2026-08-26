-- =====================================================================
-- WEBHOOK DE WHATSAPP: ACUSES DE ENTREGA Y RESPUESTAS
-- Fecha: 2026-08-26
--
-- QUE AGREGA: tres marcas de tiempo en public.avisos_wa.
--
-- POR QUE IMPORTA MAS DE LO QUE PARECE
--   Hoy sabemos que un mensaje SALIO, y nada mas. Si el proveedor no cotiza
--   no podemos distinguir dos cosas MUY distintas:
--     a) lo leyo y el aviso no le sirvio  -> el problema es el mensaje
--     b) nunca le llego, o no lo abrio    -> el problema es el canal
--   Sin esa distincion, la hipotesis del MVP ("¿cotiza mas rapido si se
--   entera por WhatsApp?") no se puede responder: solo se puede mirar el
--   resultado final y adivinar por que.
--
--   Con estas tres columnas se puede armar el embudo real:
--     enviados -> entregados -> leidos -> respondieron -> cotizaron
--
-- NO LLEVA EL RITUAL DE GRANT de CLAUDE.md: avisos_wa no tiene grants ni
-- policies a proposito (adentro hay telefonos) y solo la toca el
-- service-role, que se saltea todo eso. Ver el SQL del 2026-08-24.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.avisos_wa') is null then
    raise exception 'ABORTA: falta correr sql/2026-08-24_aviso_wa_pedidos.sql primero';
  end if;
end $$;

alter table public.avisos_wa
  add column if not exists entregado_at  timestamptz,
  add column if not exists leido_at      timestamptz,
  add column if not exists respondio_at  timestamptz;

comment on column public.avisos_wa.entregado_at is
  'Cuando WhatsApp confirmo que el mensaje llego al telefono. Lo escribe el webhook (?action=wa_webhook). NULL = salio pero no hay confirmacion: numero apagado, sin señal, o el proveedor no tiene WhatsApp en ese numero.';

comment on column public.avisos_wa.leido_at is
  'Cuando el proveedor ABRIO el mensaje. Ojo: llega solo si tiene activadas las confirmaciones de lectura (el doble tilde azul). Un NULL no prueba que no lo leyo.';

comment on column public.avisos_wa.respondio_at is
  'Cuando el proveedor contesto por WhatsApp en vez de tocar el link. Es la señal de que el mensaje se entiende como una conversacion y no como un aviso: si son muchos, el texto de la plantilla esta pidiendo una respuesta que no queremos.';

-- El webhook busca por el id que devolvio Meta al enviar. Sin este indice
-- cada acuse recorreria la tabla entera.
create index if not exists avisos_wa_msgid_idx
  on public.avisos_wa (wa_message_id) where wa_message_id is not null;

-- Y para encontrar el ultimo aviso de un telefono cuando alguien responde.
create index if not exists avisos_wa_tel_idx
  on public.avisos_wa (telefono, created_at desc);

commit;


-- =====================================================================
-- COMPROBACION
-- =====================================================================
select 'columnas nuevas (tienen que ser 3)' as que,
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='avisos_wa'
           and column_name in ('entregado_at','leido_at','respondio_at')) as resultado
union all
select 'indice por wa_message_id', coalesce((select indexname from pg_indexes
         where schemaname='public' and indexname='avisos_wa_msgid_idx'), 'FALTA')
union all
select 'indice por telefono', coalesce((select indexname from pg_indexes
         where schemaname='public' and indexname='avisos_wa_tel_idx'), 'FALTA');


-- =====================================================================
-- EL EMBUDO, para mirar cuando haya datos:
--
--   select count(*) filter (where estado='enviado')      as enviados,
--          count(*) filter (where entregado_at is not null) as entregados,
--          count(*) filter (where leido_at is not null)     as leidos,
--          count(*) filter (where respondio_at is not null) as respondieron
--     from public.avisos_wa;
--
-- PARA DESHACER:
--   alter table public.avisos_wa
--     drop column if exists entregado_at,
--     drop column if exists leido_at,
--     drop column if exists respondio_at;
--   drop index if exists public.avisos_wa_msgid_idx;
--   drop index if exists public.avisos_wa_tel_idx;
--
-- Deshacerlo no rompe nada: el webhook degrada solo y el envio no lo toca.
-- =====================================================================
