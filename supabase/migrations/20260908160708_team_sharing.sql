create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  invite_hash text unique,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 200),
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create index teams_owner_id_idx on public.teams(owner_id);
create index team_members_team_id_idx on public.team_members(team_id);

create table public.team_state (
  team_id uuid primary key references public.teams(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(data) = 'object')
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_state enable row level security;

revoke all on public.teams, public.team_members, public.team_state from anon, authenticated;
grant select on public.teams, public.team_members, public.team_state to authenticated;

create or replace function private.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.team_id
  from public.team_members as tm
  where tm.user_id = (select auth.uid())
  limit 1
$$;

create or replace function private.is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.team_members as tm
      where tm.user_id = (select auth.uid())
        and tm.team_id = target_team_id
    )
$$;

revoke execute on function private.current_team_id() from public, anon;
revoke execute on function private.is_team_member(uuid) from public, anon;
grant execute on function private.current_team_id() to authenticated;
grant execute on function private.is_team_member(uuid) to authenticated;

create policy "members read their team"
on public.teams for select to authenticated
using (id = (select private.current_team_id()));

create policy "members read team membership"
on public.team_members for select to authenticated
using (team_id = (select private.current_team_id()));

create policy "members read team state"
on public.team_state for select to authenticated
using (team_id = (select private.current_team_id()));

create or replace function private.create_team(p_team_name text, p_display_name text)
returns table(team_id uuid, team_name text, member_role text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  created_team_id uuid := gen_random_uuid();
  clean_team_name text := trim(p_team_name);
  clean_display_name text := trim(p_display_name);
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(clean_team_name) not between 1 and 120 then raise exception 'INVALID_TEAM_NAME'; end if;
  if char_length(clean_display_name) not between 1 and 200 then raise exception 'INVALID_DISPLAY_NAME'; end if;
  if exists (select 1 from public.team_members where user_id = caller) then
    raise exception 'ALREADY_IN_TEAM';
  end if;

  insert into public.teams(id, name, owner_id)
  values (created_team_id, clean_team_name, caller);
  insert into public.team_members(user_id, team_id, display_name, role)
  values (caller, created_team_id, clean_display_name, 'owner');
  insert into public.team_state(team_id, data)
  values (
    created_team_id,
    jsonb_build_object(
      'schemaVersion', 1,
      'workspace', jsonb_build_object('id', created_team_id::text, 'name', clean_team_name),
      'recordings', '[]'::jsonb,
      'articles', '[]'::jsonb,
      'requests', '[]'::jsonb,
      'activity', '[]'::jsonb
    )
  );

  return query select created_team_id, clean_team_name, 'owner'::text, clean_display_name;
end
$$;

create or replace function private.rotate_team_invite()
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  membership public.team_members%rowtype;
  invite_code text := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  expiry timestamptz := now() + interval '7 days';
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into membership from public.team_members where user_id = caller;
  if membership.user_id is null then raise exception 'TEAM_REQUIRED'; end if;
  if membership.role <> 'owner' then raise exception 'OWNER_REQUIRED'; end if;

  update public.teams
  set invite_hash = encode(extensions.digest(invite_code, 'sha256'), 'hex'),
      invite_expires_at = expiry
  where id = membership.team_id;
  return query select invite_code, expiry;
end
$$;

create or replace function private.join_team(p_code text)
returns table(team_id uuid, team_name text, member_role text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean_code text := upper(trim(p_code));
  current_member public.team_members%rowtype;
  target_team public.teams%rowtype;
  current_state jsonb;
  old_team_id uuid;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if clean_code !~ '^[A-F0-9]{20}$' then raise exception 'INVALID_INVITE'; end if;

  select * into target_team
  from public.teams
  where invite_hash = encode(extensions.digest(clean_code, 'sha256'), 'hex')
    and invite_expires_at > now();
  if target_team.id is null then raise exception 'INVITE_NOT_FOUND'; end if;

  select * into current_member from public.team_members where user_id = caller;
  if current_member.user_id is null then raise exception 'TEAM_REQUIRED'; end if;
  if current_member.team_id = target_team.id then
    return query select target_team.id, target_team.name, current_member.role, current_member.display_name;
    return;
  end if;

  if current_member.role = 'owner' then
    select ts.data into current_state from public.team_state as ts where ts.team_id = current_member.team_id;
    if exists (
      select 1 from public.team_members as tm
      where tm.team_id = current_member.team_id and tm.user_id <> caller
    ) or jsonb_array_length(coalesce(current_state->'recordings', '[]'::jsonb)) > 0
      or jsonb_array_length(coalesce(current_state->'articles', '[]'::jsonb)) > 0
      or jsonb_array_length(coalesce(current_state->'requests', '[]'::jsonb)) > 0
      or jsonb_array_length(coalesce(current_state->'activity', '[]'::jsonb)) > 0
      or exists (
        select 1 from storage.objects as object
        where object.bucket_id = 'team-media'
          and (storage.foldername(object.name))[1] = current_member.team_id::text
      ) then
      raise exception 'TEAM_NOT_EMPTY';
    end if;
  end if;

  old_team_id := current_member.team_id;
  update public.team_members
  set team_id = target_team.id, role = 'member'
  where user_id = caller;
  if current_member.role = 'owner' then delete from public.teams where id = old_team_id; end if;

  return query select target_team.id, target_team.name, 'member'::text, current_member.display_name;
end
$$;

create or replace function private.replace_team_state(p_expected_version bigint, p_data jsonb)
returns table(version bigint, data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  membership public.team_members%rowtype;
  team_name text;
  clean_data jsonb;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into membership from public.team_members where user_id = caller;
  if membership.user_id is null then raise exception 'TEAM_REQUIRED'; end if;
  select t.name into team_name from public.teams as t where t.id = membership.team_id;

  if p_expected_version < 0 or jsonb_typeof(p_data) <> 'object'
    or p_data->>'schemaVersion' <> '1'
    or jsonb_typeof(p_data->'recordings') <> 'array'
    or jsonb_typeof(p_data->'articles') <> 'array'
    or jsonb_typeof(p_data->'requests') <> 'array'
    or jsonb_typeof(p_data->'activity') <> 'array' then
    raise exception 'INVALID_TEAM_DATA';
  end if;
  if octet_length(p_data::text) > 12582912 then raise exception 'TEAM_DATA_TOO_LARGE'; end if;
  if jsonb_path_exists(p_data, '$.recordings[*] ? (@.isDemo == true)')
    or jsonb_path_exists(p_data, '$.articles[*] ? (@.isDemo == true)') then
    raise exception 'DEMO_DATA_NOT_ALLOWED';
  end if;

  clean_data := jsonb_set(
    p_data,
    '{workspace}',
    jsonb_build_object('id', membership.team_id::text, 'name', team_name),
    true
  );
  return query
  update public.team_state as ts
  set data = clean_data, version = ts.version + 1, updated_at = now()
  where ts.team_id = membership.team_id and ts.version = p_expected_version
  returning ts.version, ts.data;
  if not found then raise exception 'SYNC_CONFLICT'; end if;
end
$$;

create or replace function private.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  membership public.team_members%rowtype;
  successor uuid;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into membership from public.team_members where user_id = caller;
  if membership.user_id is not null then
    select tm.user_id into successor
    from public.team_members as tm
    where tm.team_id = membership.team_id and tm.user_id <> caller
    order by tm.created_at, tm.user_id
    limit 1;
    if successor is not null and membership.role = 'owner' then
      update public.team_members set role = 'owner' where user_id = successor;
      update public.teams
      set owner_id = successor, invite_hash = null, invite_expires_at = null
      where id = membership.team_id;
    end if;
    delete from public.team_members where user_id = caller;
    if successor is null then delete from public.teams where id = membership.team_id; end if;
  end if;
  delete from auth.users where id = caller;
end
$$;

revoke execute on function private.create_team(text, text) from public, anon;
revoke execute on function private.rotate_team_invite() from public, anon;
revoke execute on function private.join_team(text) from public, anon;
revoke execute on function private.replace_team_state(bigint, jsonb) from public, anon;
revoke execute on function private.delete_my_account() from public, anon;
grant execute on function private.create_team(text, text) to authenticated;
grant execute on function private.rotate_team_invite() to authenticated;
grant execute on function private.join_team(text) to authenticated;
grant execute on function private.replace_team_state(bigint, jsonb) to authenticated;
grant execute on function private.delete_my_account() to authenticated;

create or replace function public.create_team(p_team_name text, p_display_name text)
returns table(team_id uuid, team_name text, member_role text, display_name text)
language sql
security invoker
set search_path = ''
as $$ select * from private.create_team(p_team_name, p_display_name) $$;

create or replace function public.rotate_team_invite()
returns table(code text, expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from private.rotate_team_invite() $$;

create or replace function public.join_team(p_code text)
returns table(team_id uuid, team_name text, member_role text, display_name text)
language sql
security invoker
set search_path = ''
as $$ select * from private.join_team(p_code) $$;

create or replace function public.replace_team_state(p_expected_version bigint, p_data jsonb)
returns table(version bigint, data jsonb)
language sql
security invoker
set search_path = ''
as $$ select * from private.replace_team_state(p_expected_version, p_data) $$;

create or replace function public.delete_my_account()
returns void
language sql
security invoker
set search_path = ''
as $$ select private.delete_my_account() $$;

revoke execute on function public.create_team(text, text) from public, anon;
revoke execute on function public.rotate_team_invite() from public, anon;
revoke execute on function public.join_team(text) from public, anon;
revoke execute on function public.replace_team_state(bigint, jsonb) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.rotate_team_invite() to authenticated;
grant execute on function public.join_team(text) to authenticated;
grant execute on function public.replace_team_state(bigint, jsonb) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-media',
  'team-media',
  false,
  52428800,
  array[
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
    'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/wav', 'audio/x-wav',
    'audio/mpeg', 'audio/ogg', 'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "team members download media"
on storage.objects for select to authenticated
using (
  bucket_id = 'team-media'
  and (storage.foldername(name))[1] = (select private.current_team_id())::text
);

create policy "team members upload media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'team-media'
  and (storage.foldername(name))[1] = (select private.current_team_id())::text
);

create policy "team members delete media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'team-media'
  and (storage.foldername(name))[1] = (select private.current_team_id())::text
);
