# Technical Wiki visual atlas

The selected atlas is the default `#library` view when the authenticated archive includes `atlas` metadata. It uses the existing app shell, typography, color tokens, buttons, editor, history and recording integration. `#library/atlas/<stage>` opens a stage; links to its underlying Wiki page resolve to the same atlas. Previous GROWI page URLs remain valid. Archives without atlas metadata retain the existing reader.

The model has two assembly groups: the upper shell with its installed internal members, and the under shell. Its assembly animation moves only the under group. Material labels and a local cross-section view help explain the structure. The mold illustration describes the manufacturing sequence and supports reduced motion. These are explanatory models, not structural calculations or manufacturing tolerances.

## Desktop reading and process views

At desktop widths (1024px and up), the visual and article occupy two stable panes. Only the article scrolls; its visible heading selects a process step. Manual visual controls pause article following until the reader enables it again. Back navigation restores the article position. Smaller screens keep a stacked reading layout and touch controls; capture remains usable on phones.

Optional `stages[].sections` entries map article heading text to a zero-based `step` and optional `stage`/`photoId`. Optional `details[]` entries map a shared Wiki `pageId` to `stageId`, initial `step`, heading sections and evidence. Thus main pages, detail links, search results, edits and recorded evidence all use the same canonical page IDs. Existing archive metadata without these fields remains readable. Source diary links and older manual pages also retain their shared content and receive a relevant process view.

`ProcessVisual` supplies distinct mold, skin layup, flange, internal-member, joining and finishing animations. The renderer reads the protected blade sections and airfoil profile rather than shipping club CAD coordinates. Insets show layer order and fixture engagement. Mold and fixture diagrams simplify spacing/counts and exaggerate thin layers for readability; they do not certify exact tooling dimensions. A protected painting-reference asset can accompany the finishing steps. Changing identity aborts requests and revokes media URLs.

Production content updates must check for concurrent page edits, preserve older generations' pages and dated practice records, and take a protected archive snapshot before replacing the authored latest-generation pages. The final method and earlier trials must be clearly separated. Assets are staged and hash-verified before the archive begins referencing them.

Optional model `manufacturing` data carries validated mold sections, product surfaces and fixture outlines through the same protected attachment transport. Its source coordinates stay out of the public renderer. The manufacturing diagram uses representative sections; a fixture detail is not a complete set of manufacturing drawings. Layer illustrations show the confirmed total without inventing an unverified material sequence.

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
