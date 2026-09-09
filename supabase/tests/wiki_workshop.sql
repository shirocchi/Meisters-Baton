-- Run inside a transaction, then ROLLBACK. Uses an existing authorized membership.
select set_config('request.jwt.claims',json_build_object('sub',(select m.user_id from public.team_members m join public.propeller_wiki_access a on a.team_id=m.team_id limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare first jsonb; second jsonb; baseline text; failed boolean:=false;
begin
 select content->'home'->>'body' into baseline from public.propeller_wiki_sources where slug='growi-archive-v1';
 first:=public.save_wiki_page('home','QA temporary title',baseline||E'\nQA temporary note',0,'QA fixture','[]','[]');
 if (first->>'version')::int<>1 then raise exception 'first_version_failed';end if;
 if (select body from public.wiki_page_revisions where page_id='home' and version=0) is distinct from baseline then raise exception 'original_not_preserved';end if;
 begin perform public.save_wiki_page('home','stale','stale',0,'QA conflict','[]','[]');exception when others then if SQLERRM='WIKI_CONFLICT' then failed:=true;else raise;end if;end;
 if not failed then raise exception 'conflict_not_rejected';end if;
 second:=public.save_wiki_page('home','QA restored title',baseline,1,'QA restore','[]','[]');
 if (second->>'version')::int<>2 or second->>'body' is distinct from baseline then raise exception 'restore_failed';end if;
 if (select count(*) from public.wiki_page_revisions where page_id='home')<>2 then raise exception 'history_missing';end if;
 failed:=false;
 begin update public.wiki_page_edits set body='bypass';exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'direct_write_allowed';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare failed boolean:=false;
begin
 if (select count(*) from public.wiki_page_edits)>0 or (select count(*) from public.wiki_page_revisions)>0 then raise exception 'cross_team_read';end if;
 begin perform public.save_wiki_page('home','not allowed','not allowed',0,'QA unauthorized','[]','[]');exception when others then if SQLERRM='WIKI_FORBIDDEN' then failed:=true;else raise;end if;end;
 if not failed then raise exception 'unauthorized_write';end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.save_wiki_page(text,text,text,integer,text,jsonb,jsonb)','execute') or has_table_privilege('anon','public.wiki_page_edits','select') then raise exception 'anonymous_access';end if;
end $$;
select 'history, restore, CAS, direct-write rejection, team isolation, anonymous rejection passed' as result;
