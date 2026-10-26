# Handoff: refine the redo-main plan

`.claude/plans/2026-10-26-redo-main.md` was reviewed (`.claude/work/redo-main/review.md`) and the
user settled its decisions. Edit the plan in place so a fresh implementer can build R1 through C4
from it without asking.

## Decisions

Record each in section 7 as one settled line; drop the options.

- **Runtime:** magpi runs inside pi only. The extension is the only writer of `work.json`; there
  is no outer process and no IPC. C1 rewrites spec §2 "State storage and mutation authority" and
  the §12 `session_shutdown` hooks row; C3 rewrites the §12 session-dir redirect. ADR 0003 records
  the decision.
- **First slice:** `/shape --branch <branch>`, C1–C4.
- **Parsing:** zod `^4` with the in-repo `parserFor`. `efcb63e` made this call and it is on
  `origin/main`; C2 rewrites the `functional-error-handling` skill's parse section to match.
- **Async errors:** true-myth `Task<T, E>`, as the `functional-error-handling` skill says. Rewrite
  section 4 for it: `git.ts` and `store.ts` return `Task`, and every rejection maps to a variant.
  Settle how an unexpected failure (git missing, `EACCES`) is represented and where it ends, given
  that pi reports an exception thrown from a command handler. The skill's async section stands;
  drop the convention comment block planned for `command.ts`.
- **ADR:** new ADR 0003; ADR 0002's status names the positions it supersedes.
- **Type check:** `src/` type-checks against Node types only, and a `test/` tsconfig adds Bun's.
  `verify` runs both. Lands in C1.
- **Verification infrastructure (D5):** stays as proposals, each put to the user when the slice
  that would use it is planned.

## Review findings

Fold in items 1–11 of the review, adjusted:

- 1 is settled by the runtime decision.
- 2: C2 applies spec §3's crc suffix to a non-unique slug instead of returning `SlugTaken`. Check
  that the crc32 source runs under both `bun test` and pi's Node before naming it.
- 5 is moot under `Task`; only the comment block goes.
- 6: reword for `Task`.
- 7 and 11: C1's record type and C2's schema cover only the states and fields the code writes so
  far, and each later slice widens them. `craftCheckpointRef` gets a findings-table row, first
  applying at later slice 5.
- 8: the build worktree is `/Users/forrestakin/github.com/forrest-akin/magpi-redo-main`, the tip
  check `/Users/forrestakin/github.com/forrest-akin/magpi-redo-main-tip`; `mise trust` each.

## Readiness findings

A readiness check of the refined plan (`.claude/work/redo-main/readiness.md`) followed. Fold in
items 1–12, adjusted:

- 3: the work-unit lookup runs before checkout, so a refused request leaves HEAD in place.
- 10: the replayed handoffs are rewritten to what R2 and R3 do.
- 12: split C1. The first commit holds the scaffold, the extension registering `/shape`, and the
  Usage path; the next holds the create path. Each doc edit (ADR 0003, ADR 0002's status, spec §2,
  README, the carried `tsconfig.json` comments) lands in the commit that makes it true.

## Constraints

- Edit only the plan; keep checkpoint notes in `.claude/work/redo-main/refine-notes.md`. No source
  edits, branches, commits or pushes.
- Add this handoff to C1's seeding artifacts and to cutover step 4's list of untracked copies.
- Keep the plan's style: terse, present tense.
