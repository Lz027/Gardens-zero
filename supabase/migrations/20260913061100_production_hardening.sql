-- Gardens Zero production hardening.
-- Idempotent: safe to apply once through Supabase migrations and safe to re-run manually.

-- Keep the editor check invoker-safe. It only needs to inspect the caller's own profile,
-- and should not be exposed as a privileged SECURITY DEFINER RPC.
create or replace function public.is_opportunity_editor()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('editor', 'admin')
  );
$$;
revoke execute on function public.is_opportunity_editor() from public, anon;
grant execute on function public.is_opportunity_editor() to authenticated;

-- Add user ownership foreign keys that were missing from the original migrations.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'apps_user_id_fkey') then
    alter table public.apps add constraint apps_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_user_id_fkey') then
    alter table public.events add constraint events_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_user_id_fkey') then
    alter table public.messages add constraint messages_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'note_folders_user_id_fkey') then
    alter table public.note_folders add constraint note_folders_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notes_user_id_fkey') then
    alter table public.notes add constraint notes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_user_id_fkey') then
    alter table public.notifications add constraint notifications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pillar_entries_user_id_fkey') then
    alter table public.pillar_entries add constraint pillar_entries_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pillars_user_id_fkey') then
    alter table public.pillars add constraint pillars_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recents_user_id_fkey') then
    alter table public.recents add constraint recents_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'threads_user_id_fkey') then
    alter table public.threads add constraint threads_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- Cover user and relationship foreign keys used by RLS and joins.
create index if not exists apps_user_idx on public.apps (user_id);
create index if not exists apps_parent_idx on public.apps (parent_id);
create index if not exists events_user_idx on public.events (user_id, starts_at);
create index if not exists messages_user_idx on public.messages (user_id, created_at desc);
create index if not exists note_folders_user_idx on public.note_folders (user_id, created_at);
create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);
create index if not exists notes_folder_idx on public.notes (folder_id);
create index if not exists notes_pillar_idx on public.notes (pillar_id);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists pillar_entries_user_idx on public.pillar_entries (user_id, updated_at desc);
create index if not exists pillars_user_idx on public.pillars (user_id, sort_order);
create index if not exists recents_user_idx on public.recents (user_id, visited_at desc);
create index if not exists threads_user_idx on public.threads (user_id, updated_at desc);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);
create index if not exists applications_opportunity_idx on public.applications (opportunity_id);
create index if not exists saved_opportunities_opportunity_idx on public.saved_opportunities (opportunity_id);

-- Prevent cross-user references through otherwise valid UUID foreign keys.
create or replace function public.enforce_user_owned_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'notes' then
    if new.pillar_id is not null and not exists (
      select 1 from public.pillars where id = new.pillar_id and user_id = new.user_id
    ) then
      raise exception 'note pillar must belong to the note owner';
    end if;
    if new.folder_id is not null and not exists (
      select 1 from public.note_folders where id = new.folder_id and user_id = new.user_id
    ) then
      raise exception 'note folder must belong to the note owner';
    end if;
  elsif tg_table_name = 'messages' then
    if not exists (
      select 1 from public.threads where id = new.thread_id and user_id = new.user_id
    ) then
      raise exception 'message thread must belong to the message owner';
    end if;
  elsif tg_table_name = 'apps' then
    if new.parent_id is not null and not exists (
      select 1 from public.apps where id = new.parent_id and user_id = new.user_id and is_folder = true
    ) then
      raise exception 'app parent must be an owned folder';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_user_owned_references() from public, anon, authenticated;
drop trigger if exists notes_owned_references on public.notes;
create trigger notes_owned_references before insert or update on public.notes for each row execute function public.enforce_user_owned_references();
drop trigger if exists messages_owned_references on public.messages;
create trigger messages_owned_references before insert or update on public.messages for each row execute function public.enforce_user_owned_references();
drop trigger if exists apps_owned_references on public.apps;
create trigger apps_owned_references before insert or update on public.apps for each row execute function public.enforce_user_owned_references();

-- Use initplan-friendly auth checks and avoid multiple permissive SELECT policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles','settings','pillars','note_folders','notes','apps','pillar_entries','events','notifications','recents','threads','messages','saved_opportunities','applications'] loop
    execute format('drop policy if exists %I on public.%I', case table_name
      when 'profiles' then 'own profile'
      when 'settings' then 'own settings'
      when 'pillars' then 'own pillars'
      when 'note_folders' then 'own note folders'
      when 'notes' then 'own notes'
      when 'apps' then 'own apps'
      when 'pillar_entries' then 'own pillar entries'
      when 'events' then 'own events'
      when 'notifications' then 'own notifications'
      when 'recents' then 'own recents'
      when 'threads' then 'own threads'
      when 'messages' then 'own messages'
      when 'saved_opportunities' then 'own saved opportunities'
      when 'applications' then 'own applications'
    end, table_name);
  end loop;
end $$;

create policy "own profile" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own settings" on public.settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own pillars" on public.pillars for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own note folders" on public.note_folders for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own notes" on public.notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own apps" on public.apps for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own pillar entries" on public.pillar_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own events" on public.events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own notifications" on public.notifications for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own recents" on public.recents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own threads" on public.threads for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own messages" on public.messages for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own saved opportunities" on public.saved_opportunities for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own applications" on public.applications for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Authenticated opportunity readers get one SELECT policy; editors get write policies only.
drop policy if exists "read active opportunities" on public.opportunities;
drop policy if exists "edit opportunities" on public.opportunities;
create policy "read active opportunities" on public.opportunities for select to anon, authenticated using (is_active = true or (select public.is_opportunity_editor()));
create policy "insert opportunities" on public.opportunities for insert to authenticated with check ((select public.is_opportunity_editor()));
create policy "update opportunities" on public.opportunities for update to authenticated using ((select public.is_opportunity_editor())) with check ((select public.is_opportunity_editor()));
create policy "delete opportunities" on public.opportunities for delete to authenticated using ((select public.is_opportunity_editor()));
