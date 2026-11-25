-- ============================================================
-- AVISO POR WHATSAPP AL PROVEEDOR CUANDO LE ESCRIBEN POR EL CHAT (2026-11-25)
--
-- Bitacora + anti-duplicado de api/notificar-mensaje.js -> ?action=wa_chat.
-- Mismo criterio que avisos_wa e informes_wa: adentro hay telefonos y emails,
-- asi que RLS activada, CERO policies y CERO grants. Solo la ve el service-role.
--
-- "ventana" = bloque de 30 minutos (epoch / 1800). El indice unico
-- (proveedor_id, ventana) es lo que agrupa: dos mensajes en el mismo bloque
-- generan UN aviso, aunque lleguen al mismo tiempo. La fila se RESERVA antes
-- de mandar, igual que en avisos_wa.
--
-- Para deshacer: drop table if exists public.avisos_chat_wa;
-- ============================================================
create table if not exists public.avisos_chat_wa (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null,
  usuario_email text,
  ventana       bigint not null,
  telefono      text,
  estado        text not null default 'reservado',  -- reservado | enviado | fallo
  error         text,
  wa_message_id text,
  created_at    timestamptz not null default now()
);

create unique index if not exists avisos_chat_wa_unico
  on public.avisos_chat_wa (proveedor_id, ventana);
create index if not exists avisos_chat_wa_prov_fecha
  on public.avisos_chat_wa (proveedor_id, created_at desc);

alter table public.avisos_chat_wa enable row level security;
revoke all on public.avisos_chat_wa from anon, authenticated;

notify pgrst, 'reload schema';
