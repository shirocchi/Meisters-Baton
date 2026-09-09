# Beta architecture / pre-event development 2026-09-06–07

React + TypeScript + Vite working app, packaged for iOS/Android using Capacitor. IndexedDB stores device-local recordings, video blobs, draft interviews and knowledge pages. Supabase Auth, Postgres, and private Storage provide cross-device team sharing. An optional Node 22 service supplies OpenAI Responses requests; local/manual use and team sharing do not depend on that AI service.

## Supabase sharing interfaces

Shared contracts: `src/domain/types.ts`; browser adapter: `src/lib/supabase.ts`; schema: `supabase/migrations/`.

- Supabase Auth email/password signup, login, persisted refresh sessions, logout.
- `public.create_team`, `rotate_team_invite`, `join_team`, `replace_team_state`, and `delete_my_account` RPCs.
- `public.teams`, `team_members`, and `team_state` are read through RLS; writes are restricted to validated RPCs.
- Private `team-media` Storage objects use `{team_id}/{media_id}` paths and team-membership RLS.
- Sync is explicit optimistic replacement. The caller supplies the expected version; a mismatch raises `SYNC_CONFLICT`.
- Database signup trigger creates the initial team before email confirmation, so confirmation can be completed on another device.

## Optional Node AI / legacy local interfaces

- GET /api/health → {ok, aiConfigured, model}
- POST /api/auth/register {email,password,name,teamName} → AuthSession
- POST /api/auth/login {email,password} → AuthSession
- GET /api/auth/me → AuthUser
- POST /api/auth/logout → {ok:true}
- DELETE /api/auth/account → {ok:true}; require current password in body
- GET /api/team/invite → {code, expiresAt}; owner only, creation/rotation through POST
- POST /api/team/invite → {code,expiresAt}; owner only
- POST /api/team/join {code} → AuthUser (must not silently discard existing team data)
- GET /api/sync → SyncEnvelope
- PUT /api/sync {version,data} → SyncEnvelope; conflicting version returns HTTP 409
- POST /api/media multipart field file → {id}; authenticated, type/size checks
- GET /api/media/:id → private media, team-authorized
- POST /api/ai/analyze {recording:Recording, context:Article[]} → Analysis
- POST /api/ai/generate {recording:Recording} → {title,summary,tags,claims:Claim[]}
- POST /api/ai/search {query:string} → SearchAnswer; server selects only team's published confirmed records

The current browser sharing UI no longer calls the Node auth, sync, or media endpoints; they remain for legacy local tests and self-hosting compatibility. AI endpoints are optional. Keys remain server-only. In local mode without a key, expert-led questions and verbatim answer-based drafts work and are labeled; prerecorded demo analysis is explicitly a demonstration. Never present local/manual results as live AI. Model defaults to configurable gpt-6-astra after checking official documentation; availability still depends on account credentials.

## Work ownership

Main agent: app UX, mobile wrappers, integration and E2E. Domain agent: src/domain excluding shared types, src/lib/storage.ts and tests/domain.test.ts. API agent: server and tests/server.test.ts. Research agent: product/release docs and independent review. No agents edit another's assigned paths without coordinating.
