# Meister's Baton

Desktop-first application for capturing craft knowledge through recorded work, questions, and evidence. Recording must also remain practical on phones. Japanese is the product language.

- Technical Wiki uses a fixed visual pane on the left and an independently scrolling article on the right on PC. Article sections select the matching process visualization; linked detail pages retain the same layout.
- Each manufacturing stage needs its own explanation. Do not substitute the completed blade assembly animation for skin layup, flange layup, web placement, or finishing. Use dated primary records and keep prototype conditions separate from the final manufacturing method.

## Working agreements

- Keep runtime application code in src/, shared contracts in src/domain/, API in server/, documentation in docs/.
- No invented evidence, approvals, or AI capabilities. Demo fixtures must stay visibly labeled and separate from users' records.
- Every knowledge claim references a recorded observation or expert answer. Publication requires review; editing a reviewed claim clears approval.
- Local capture must work without accounts or networking. Do not silently replace user data on sync/import or AI errors.
- Never ship secrets. OpenAI calls run on the authenticated server only. Validate requests and model outputs.
- Mobile touch targets at least 44px, keyboard support, reduced-motion support, and safe-area insets.
- Use concrete labels and necessary instructions. Do not add promotional catchphrases, hero introductions, or decorative summaries to the technical Wiki. Keep the manual before navigation indexes and keep relevant images/video within the article.
- Run typecheck, domain/API tests, build, and browser end-to-end checks for the primary flow before delivery.
- Treat the 2026-09-06–07 beta as pre-event work. Preserve an accurate disclosure and do not claim it was built during the September 15 event.
- No changes to the parent Obsidian vault except explicitly scoped project/session notes. Do not commit private Vault documents.

## Parallel development and integration

- Use one issue, one owner, one branch, and one worktree for each independently reviewable change. A worktree is an isolated snapshot; it does not automatically receive changes merged elsewhere.
- At the start of work, record the target branch and base commit SHA in the issue or pull request. List dependent pull requests and likely overlapping files or behavior.
- A stale base is acceptable for exploratory work and checkpoint commits, but a pull request must not be marked ready, merged, or deployed while it is still based on outdated application state.
- If another change is a prerequisite, keep the dependent pull request in draft and label it `Depends on #<PR>`. After the prerequisite merges, update the dependent branch from the latest target branch before final implementation and review.
- Immediately before final verification, refresh the target branch and rebase or merge it into the working branch. If the target branch changes again after verification, repeat the synchronization and affected checks.
- Resolve conflicts by preserving the current target-branch behavior and applying only the intended new delta. Do not restore an older whole-file snapshot or choose `ours`/`theirs` without reviewing the semantic result.
- Review the final diff against the refreshed target branch and test the combined application state, including regressions in behavior changed by concurrent work. Passing tests on the isolated pre-sync branch is not sufficient.
- Merge order follows dependency order, not completion time. The owner of the later or dependent pull request is responsible for proving that the combined result retains already-merged progress.
