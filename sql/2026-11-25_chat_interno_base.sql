-- ============================================================
-- CHAT INTERNO, PASO 2: LA BASE (2026-11-25)
--
-- Solo agrega y cierra permisos de mas. No borra filas ni columnas, y la app
-- publicada sigue funcionando igual: todo lo que hoy lee o escribe mensajes lo
-- hace con sesion (revisado en js/app.js y admin.html el 2026-11-25).
--
-- Para deshacer: sql/2026-11-25_chat_interno_base_deshacer.sql
-- ============================================================

-- 1) De que producto se habla. Nulo = se escribio desde el perfil del
--    proveedor. Si el producto se borra, la conversacion queda y pierde la ficha.
alter table public.mensajes
  add column if not exists producto_id uuid references public.productos(id) on delete set null;

-- 2) Indices para abrir una conversacion y la bandeja sin recorrer la tabla.
create index if not exists idx_mensajes_conversacion
  on public.mensajes (proveedor_id, usuario_email, created_at desc);
create index if not exists idx_mensajes_comprador
  on public.mensajes (usuario_email, created_at desc);

-- 3) El comprador marca como leido lo que le contesto el proveedor (los dos
--    tildes celestes). Solo filas de SU conversacion y solo las del proveedor.
drop policy if exists msg_update_comprador on public.mensajes;
create policy msg_update_comprador on public.mensajes
  for update to authenticated
  using (usuario_email = auth.email() and de_tipo = 'proveedor')
  with check (usuario_email = auth.email() and de_tipo = 'proveedor');

-- 4) Permisos de mas. Hasta hoy cualquiera con sesion podia EDITAR el texto de
--    un mensaje de su conversacion (el grant de UPDATE era de tabla entera).
--    Ahora lo unico que se puede cambiar es "leido".
--    anon no lo necesita para nada: sin sesion no se lee ni se manda un mensaje.
revoke all on public.mensajes from anon;
revoke update, truncate, references, trigger on public.mensajes from authenticated;
grant update (leido) on public.mensajes to authenticated;
-- select / insert / delete de authenticated quedan como estaban
-- (delete solo lo pasa un admin, por la policy msg_delete).

-- 5) Los mensajes llegan al instante (Supabase Realtime). Respeta RLS: cada
--    uno recibe solo las filas que ya podia leer.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes') then
    alter publication supabase_realtime add table public.mensajes;
  end if;
end $$;

notify pgrst, 'reload schema';
