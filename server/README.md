# Meister's Baton API

Node 22.13+ / Express 5 / built-in SQLite. Run `npm run dev:api` for the loopback-only development service. Copy the root `.env.example` to `.env` before configuring an API key. In production, set `NODE_ENV=production`, build the frontend, and `npm start`; the same service serves `dist/` and `/api/`. Native clients need a deployed HTTPS API origin.

## Storage and authentication

`DATA_DIR` contains `baton.sqlite` (WAL mode) and private `media/` files. It must be a durable, access-restricted volume. This release supports one API service instance; use an SQLite-aware backup or shut down the service before copying the database, WAL files, and media together. There is no automatic backup or at-rest encryption built into this beta. The host's disk encryption and backup policy are operational responsibilities.

Passwords use salted `crypto.scrypt`. Random 256-bit opaque sessions last 30 days; only their SHA-256 hashes are stored. Logout revokes the current token; account deletion revokes all of its tokens. Invite codes are 80 random bits, hashed at rest, rotate on owner request, and expire after seven days. `GET /api/team/invite` returns `{code:null,expiresAt}`; only `POST` returns the new plaintext code. Exact `ALLOWED_ORIGINS` are required for browser clients; no wildcard is accepted. Without an Origin header, authenticated native/server clients are permitted. Set `TRUST_PROXY_HOPS` only to the actual trusted proxy hop count so clients cannot spoof rate-limit identities.

Registration creates an empty owner team. The owner can only join another team if their current team has no members, records, requests, activity, or media. Members may leave a team to join another; its shared records remain with the original team. Joining revokes other device sessions to avoid accidental writes into the new team. Deleting the last account also deletes its team data and files. When other members remain, shared content is retained and ownership transfers to the oldest remaining member. The mobile confirmation text must explain this retention.

## Sync and media limits

`PUT /api/sync {version,data}` is explicit optimistic replacement: version conflicts return `409 {error,code:'SYNC_CONFLICT',currentVersion}` and never replace server data. The authenticated team's workspace ID/name override client metadata. Clients must present and resolve conflicts before retrying. They must exclude demo records and their demo-only activity/requests from sync.

Request JSON is capped at 12MB. Recording samples are at most 12 JPEG/PNG/WebP data URLs, each at most 700,000 characters. Media uses multipart field `file`, one file at a time, at most 100MB, and 1GB total per team. Only approved video, audio and raster image MIME types with matching file signatures are accepted. Original filenames are never used as disk paths. Media download and deletion require the correct team session. Range requests are supported for authorized playback. `DELETE /api/media/:id` is supported only if no shared recording still references the file; it also lets clients remove unused uploads. Remote media references are validated against team ownership on sync.

The server independently validates JSON structure and record references, exact answer/note/observation quotes, observation timestamps, reviewer metadata, and publication state. Hand-authored interview scaffold segments are not valid video observations. Shared drafts and published material remain user-authored records, not cryptographically certified expert identity or scientific validation. Old revision snapshots are retained for history; only current claims can appear in knowledge search.

## AI gateway

The Responses API uses `store:false`, strict JSON Schema structured output, explicit Japanese evidence-first instructions, timestamped sample images for analysis, a 120-second timeout, no automatic retry, and a 12,000-token output cap. `OPENAI_MODEL` defaults to `gpt-6-astra`; account access is not assumed. `OPENAI_API_KEY` is read on the server only. Health exposes configuration, never the key. Without configuration, authenticated AI routes return 503 and leave local data unchanged. All AI routes require authentication and are limited to 12 attempted requests per hour per user in persistent SQLite counters. Configure a project spend budget in the OpenAI dashboard before exposing registration publicly.

Analysis receives sampled images and notes, not video bytes or audio; it always labels this limitation. Generation rejects invented references and nonverbatim quotes and always returns unapproved drafts. Search retrieves at most 30 relevant claims from the authenticated team's published, confirmed, non-demo articles; Japanese word/bigram retrieval ranks candidates. Every returned citation must match a selected source ID and exact text. If the team has no eligible claims, it returns an explicit insufficient-evidence answer without calling the model. Semantic entailment still requires expert review: a mechanically valid quote alone does not prove every generated assertion.

Contract tests inject a provider; no live OpenAI inference was performed during this implementation because no key was configured. Official docs checked September 6, 2026:

- [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)

## Before public operation

This is a functional controlled-beta backend. Public operation additionally needs HTTPS termination, persistent volume backups and restoration rehearsal, real-device tests, an operator contact/privacy URL, API account/model smoke testing, abuse monitoring, and an account recovery/email verification workflow (the latter two are not implemented here). Registration is currently open to anyone who can access the service. Keep a pre-release server private or behind an access gate until these operational steps are complete. Rate limits are not a substitute for a project spending cap.
