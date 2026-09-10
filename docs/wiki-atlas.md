# Technical Wiki visual atlas

The selected atlas is the default `#library` view when the authenticated archive includes `atlas` metadata. It uses the existing app shell, typography, color tokens, buttons, editor, history and recording integration. `#library/atlas/<stage>` opens a stage; links to its underlying Wiki page resolve to the same atlas. Previous GROWI page URLs remain valid. Archives without atlas metadata retain the existing reader.

The model has two assembly groups: the upper shell with its installed internal members, and the under shell. Its assembly animation moves only the under group. Material labels and a local cross-section view help explain the structure. The mold illustration describes seven stages and supports reduced motion. These are explanatory models, not structural calculations or manufacturing tolerances.

## Protected content

The public build contains only renderers and UI. Production CAD-derived mesh buffers, photographs and diary excerpts are provisioned separately in `propeller_wiki_sources`, behind its existing team-membership and Wiki-access RLS. No service-role key is used in the browser. Do not commit the provisioning input, raw archives, screenshots containing actual records, or real CAD fixtures.

- `growi-archive-v1` remains the canonical source. Its new pages use stable IDs; the optional `atlas` field maps stages to those page IDs, a model attachment and photographs. The existing `save_wiki_page` RPC therefore creates revisions and overlays on these same pages. It does not create a second notebook.
- Small atlas attachments are content-addressed source rows, `atlas-asset-<sha256>`, with `{ "encoding": "base64", "data": "..." }`. A `WikiAsset.sourceSlug` selects this transport; attachments without it continue using private Storage. Both transports verify byte length and SHA-256 before use. Data is requested with the member token, `no-store`, and an abort signal; rendered data and object URLs are cleared when the authenticated identity changes.
- The initial material comprises seven authored stages, their linked diary entries, one model payload and selected photographs. Page and attachment schemas are validated before provisioning. The atlas loader treats missing or corrupt attachments as a recoverable error and keeps the article available.
- New captured records still use the existing matching and confirmation behavior. Ambiguous matches remain in the pending list; the atlas exposes that list through “記録をつなぐ”. Existing material is preserved when a record is integrated.

## Provisioning and rollback

Provision with authorized administrative tooling. Stage the new pages and hash-addressed attachments before enabling the metadata. Verify each attachment's decoded byte length and hash, all page/asset references, and access for both a permitted member and an unrelated identity. The publication transaction must append only missing page IDs and preserve all existing source pages, edits, revisions and access policies. Keep a protected snapshot of the previous archive. Do not overwrite an archive exported before someone else's update.

After provisioning, the old production reader can still read the appended pages. Once CI succeeds, merge the UI branch into `main` and verify the production deployment for that commit. To roll back only the new entry experience, remove the `atlas` metadata or revert the UI commit; keep authored pages, revisions and attachments so member edits are not lost.

Validation includes domain and asset integrity tests, the normal API suite, build, browser coverage for models/mold stages, legacy navigation, shared editing, captured-record integration, retry behavior and mobile widths. Browser fixtures use deliberately synthetic geometry; actual geometry is additionally reviewed locally using an ignored verification input.
