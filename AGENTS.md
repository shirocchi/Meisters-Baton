# Meister's Baton

Mobile application for capturing craft knowledge through recorded work, questions, and evidence. Japanese is the product language.

## Working agreements

- Keep runtime application code in src/, shared contracts in src/domain/, API in server/, documentation in docs/.
- No invented evidence, approvals, or AI capabilities. Demo fixtures must stay visibly labeled and separate from users' records.
- Every knowledge claim references a recorded observation or expert answer. Publication requires review; editing a reviewed claim clears approval.
- Local capture must work without accounts or networking. Do not silently replace user data on sync/import or AI errors.
- Never ship secrets. OpenAI calls run on the authenticated server only. Validate requests and model outputs.
- Mobile touch targets at least 44px, keyboard support, reduced-motion support, and safe-area insets.
- Run typecheck, domain/API tests, build, and browser end-to-end checks for the primary flow before delivery.
- Treat the 2026-09-06–07 beta as pre-event work. Preserve an accurate disclosure and do not claim it was built during the September 15 event.
- No changes to the parent Obsidian vault except explicitly scoped project/session notes. Do not commit private Vault documents.
