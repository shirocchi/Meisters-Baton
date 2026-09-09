-- Requires the existing teams / team_members migration. Source payloads are seeded privately.
create table public.propeller_wiki_access (
  team_id uuid primary key references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.propeller_wiki_access enable row level security;
revoke all on public.propeller_wiki_access from anon, authenticated;
grant select on public.propeller_wiki_access to authenticated;
create policy propeller_access_for_members on public.propeller_wiki_access
for select to authenticated using (
  team_id in (select m.team_id from public.team_members m where m.user_id = (select auth.uid()))
);

create table public.propeller_wiki_sources (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.propeller_wiki_sources enable row level security;
revoke all on public.propeller_wiki_sources from anon, authenticated;
grant select on public.propeller_wiki_sources to authenticated;
create policy propeller_sources_for_members on public.propeller_wiki_sources
for select to authenticated using (
  exists (
    select 1 from public.propeller_wiki_access a
    join public.team_members m on m.team_id = a.team_id
    where m.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('propeller-wiki-media', 'propeller-wiki-media', false, 52428800);
create policy propeller_media_for_members on storage.objects
for select to authenticated using (
  bucket_id = 'propeller-wiki-media' and exists (
    select 1 from public.propeller_wiki_access a
    join public.team_members m on m.team_id = a.team_id
    where m.user_id = (select auth.uid())
  )
);
-- No client write policies: a newly registered account or team cannot grant itself access.
-- No PUBLIC/anon read grants and no public/signed media URLs in the application bundle.
