-- Rollback-only integration test on a database with at least one existing team member.
begin;
insert into public.propeller_wiki_access(team_id)
select team_id from public.team_members limit 1 on conflict do nothing;
insert into public.propeller_wiki_sources(slug, content)
values ('rls-propeller-fixture', '{"test": true}');
insert into storage.objects(bucket_id, name)
values ('propeller-wiki-media', 'rls-propeller-fixture');

set local role anon;
do $$ begin
  if has_table_privilege(current_user, 'public.propeller_wiki_sources', 'select') then
    raise exception 'Anonymous source read grant exists';
  end if;
  if exists(select 1 from storage.objects where bucket_id = 'propeller-wiki-media') then
    raise exception 'Anonymous media exposure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.propeller_wiki_sources) then raise exception 'Nonmember source exposure'; end if;
  if exists(select 1 from storage.objects where bucket_id = 'propeller-wiki-media') then raise exception 'Nonmember media exposure'; end if;
  if has_table_privilege(current_user, 'public.propeller_wiki_access', 'insert') then raise exception 'Self-grant possible'; end if;
  if has_table_privilege(current_user, 'public.propeller_wiki_sources', 'update') then raise exception 'Client source overwrite possible'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', (select m.user_id from public.team_members m join public.propeller_wiki_access a on m.team_id = a.team_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.propeller_wiki_sources where slug = 'rls-propeller-fixture') then raise exception 'Approved member cannot read source'; end if;
  if not exists(select 1 from storage.objects where bucket_id = 'propeller-wiki-media' and name = 'rls-propeller-fixture') then raise exception 'Approved member cannot read media'; end if;
end $$;
reset role;
rollback;
select 'PASS: anonymous deny, nonmember deny, approved member allow; fixtures rolled back' as result;
