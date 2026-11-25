-- Deshace sql/2026-11-25_chat_interno_base.sql y deja mensajes como estaba
-- el 2026-11-25 a la manana (incluidos los permisos de mas, a proposito:
-- "como estaba" es lo unico seguro de prometer en una vuelta atras).
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes') then
    alter publication supabase_realtime drop table public.mensajes;
  end if;
end $$;

drop policy if exists msg_update_comprador on public.mensajes;
drop index if exists public.idx_mensajes_conversacion;
drop index if exists public.idx_mensajes_comprador;
alter table public.mensajes drop column if exists producto_id;

grant all on public.mensajes to anon, authenticated;

notify pgrst, 'reload schema';
