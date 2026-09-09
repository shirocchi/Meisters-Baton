-- Team-specific editable overlays preserve the read-only imported archive.
create table public.wiki_page_edits (
 team_id uuid not null references public.teams(id) on delete cascade,
 page_id text not null check(char_length(page_id) between 1 and 160),
 title text not null check(char_length(trim(title)) between 1 and 240),
 body text not null check(octet_length(body)<=2000000),
 version integer not null check(version>=0),
 updated_at timestamptz not null default now(),
 author text not null,
 reason text not null,
 events jsonb not null default '[]' check(jsonb_typeof(events)='array' and octet_length(events::text)<=8000000),
 media jsonb not null default '[]' check(jsonb_typeof(media)='array'),
 primary key(team_id,page_id)
);
create table public.wiki_page_revisions (like public.wiki_page_edits including defaults including constraints);
alter table public.wiki_page_revisions add primary key(team_id,page_id,version);
alter table public.wiki_page_revisions add foreign key(team_id) references public.teams(id) on delete cascade;
alter table public.wiki_page_edits enable row level security;
alter table public.wiki_page_revisions enable row level security;
revoke all on public.wiki_page_edits,public.wiki_page_revisions from public,anon,authenticated;
grant select on public.wiki_page_edits,public.wiki_page_revisions to authenticated;
create policy wiki_edits_for_authorized_team on public.wiki_page_edits for select to authenticated using (
 team_id=(select private.current_team_id()) and exists(select 1 from public.propeller_wiki_access a where a.team_id=wiki_page_edits.team_id)
);
create policy wiki_revisions_for_authorized_team on public.wiki_page_revisions for select to authenticated using (
 team_id=(select private.current_team_id()) and exists(select 1 from public.propeller_wiki_access a where a.team_id=wiki_page_revisions.team_id)
);
create function private.save_wiki_page(p_page_id text,p_title text,p_body text,p_expected_version integer,p_reason text,p_events jsonb,p_media jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_team uuid; editor_name text; previous public.wiki_page_edits%rowtype; source_page jsonb; saved public.wiki_page_edits%rowtype;
begin
 if auth.uid() is null then raise exception 'WIKI_FORBIDDEN'; end if;
 select m.team_id,m.display_name into target_team,editor_name from public.team_members m join public.propeller_wiki_access a on a.team_id=m.team_id where m.user_id=auth.uid();
 if target_team is null then raise exception 'WIKI_FORBIDDEN'; end if;
 if p_expected_version is null or p_expected_version<0 or p_events is null or p_media is null or jsonb_typeof(p_events)<>'array' or jsonb_typeof(p_media)<>'array' or char_length(p_reason) not between 1 and 500 then raise exception 'WIKI_INVALID';end if;
 if exists(select 1 from jsonb_array_elements(p_media) asset where coalesce(asset->>'remotePath','') not like target_team::text||'/%') then raise exception 'WIKI_INVALID_MEDIA';end if;
 if exists(select 1 from jsonb_array_elements(p_events) event where event->>'recordingId' is null or coalesce(event->>'fingerprint','') !~ '^[a-f0-9]{64}$' or event->'recording'->>'id' is distinct from event->>'recordingId' or coalesce((event->'recording'->>'isDemo')::boolean,true)) then raise exception 'WIKI_INVALID_EVENT';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_team::text||':'||p_page_id,0));
 select * into previous from public.wiki_page_edits where team_id=target_team and page_id=p_page_id for update;
 if found then
   if previous.version<>p_expected_version then raise exception 'WIKI_CONFLICT';end if;
 else
   if p_expected_version<>0 then raise exception 'WIKI_CONFLICT';end if;
   select page into source_page from public.propeller_wiki_sources s cross join lateral jsonb_array_elements(coalesce(s.content->'pages','[]'::jsonb)||coalesce(s.content->'diary','[]'::jsonb)||case when s.content->'home' is not null then jsonb_build_array(s.content->'home') else '[]'::jsonb end) page where s.slug='growi-archive-v1' and page->>'id'=p_page_id;
   if source_page is null then raise exception 'WIKI_PAGE_NOT_FOUND';end if;
   previous.team_id:=target_team;previous.page_id:=p_page_id;previous.title:=source_page->>'title';previous.body:=source_page->>'body';previous.version:=0;previous.updated_at:=now();previous.author:=coalesce(source_page->>'author','元Wiki');previous.reason:='取り込んだ原文';previous.events:='[]';previous.media:='[]';
 end if;
 insert into public.wiki_page_revisions select previous.*;
 insert into public.wiki_page_edits(team_id,page_id,title,body,version,author,reason,events,media)
 values(target_team,p_page_id,p_title,p_body,previous.version+1,editor_name,p_reason,p_events,p_media)
 on conflict(team_id,page_id) do update set title=excluded.title,body=excluded.body,version=excluded.version,updated_at=now(),author=excluded.author,reason=excluded.reason,events=excluded.events,media=excluded.media returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function private.save_wiki_page(text,text,text,integer,text,jsonb,jsonb) from public,anon;
grant execute on function private.save_wiki_page(text,text,text,integer,text,jsonb,jsonb) to authenticated;
create function public.save_wiki_page(p_page_id text,p_title text,p_body text,p_expected_version integer,p_reason text,p_events jsonb,p_media jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.save_wiki_page(p_page_id,p_title,p_body,p_expected_version,p_reason,p_events,p_media)$$;
revoke all on function public.save_wiki_page(text,text,text,integer,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_wiki_page(text,text,text,integer,text,jsonb,jsonb) to authenticated;
