create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_team_id uuid := gen_random_uuid();
  clean_display_name text := left(
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'メンバー'),
    200
  );
  clean_team_name text := left(
    coalesce(nullif(trim(new.raw_user_meta_data->>'team_name'), ''), '新しい工房'),
    120
  );
begin
  insert into public.teams(id, name, owner_id)
  values (created_team_id, clean_team_name, new.id);
  insert into public.team_members(user_id, team_id, display_name, role)
  values (new.id, created_team_id, clean_display_name, 'owner');
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
  return new;
end
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
