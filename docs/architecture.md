# Beta architecture / pre-event development 2026-09-06–07

React + TypeScript + Vite working app, packaged for iOS/Android using Capacitor. IndexedDB stores device-local recordings, video blobs, draft interviews and knowledge pages. A separate Node 22 service supplies authenticated OpenAI Responses requests and optional team sync using SQLite and private media storage. There is no dependency on another project's cloud database.

## Interfaces

Shared contracts: `src/domain/types.ts`.

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

All endpoints except health/register/login require a Bearer session. Keys remain server-only. In local mode without a key, expert-led questions and verbatim answer-based drafts work and are labeled; prerecorded demo analysis is explicitly a demonstration. Never present local/manual results as live AI. Model defaults to configurable gpt-6-astra after checking official documentation; availability still depends on account credentials.

## Work ownership

Main agent: app UX, mobile wrappers, integration and E2E. Domain agent: src/domain excluding shared types, src/lib/storage.ts and tests/domain.test.ts. API agent: server and tests/server.test.ts. Research agent: product/release docs and independent review. No agents edit another's assigned paths without coordinating.
