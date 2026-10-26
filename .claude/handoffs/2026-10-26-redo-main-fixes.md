# Handoff: fold the review fixes into redo-main

Two reviews of `redo-main` (R1–C3) are in `.claude/work/redo-main/review-code.md` and
`review-docs.md`, with verdicts beside them. Fold each confirmed fix into the commit that
introduced the defect: `git commit --fixup <sha>`, then
`GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash --autostash 8953b17`. The branch is local and
unpushed. Code fixes are test-first: the new test runs red for the stated reason before the fix.

## R2

- D7: the replayed mise handoff's Verify names `<repo>`, not the build worktree path.

## C1

- D1: spec §2 "State storage and mutation authority" and the §12 `session_shutdown` row move
  from C2 into C1, so the spec agrees with ADR 0003 from the commit that adds it.
- D2: ADR 0003's Decision gains the test-seam bullet ADR 0002's status points to.
- D3: ADR 0002's status also names position 3, superseded by the split type check.
- C6: plan section 4's rule that calls into pi's API return `Task` narrows to `switchSession`;
  `notify` stays a direct call. Edit the plan in the worktree and copy it to the primary
  worktree, so both stay identical.
- Add this handoff to C1's seeding artifacts.

## C2

- C1 (blocks): `checkout` uses `git switch --quiet <branch>`, which refuses paths and non-branch
  refs. Driving test: `/shape --branch README.md` with uncommitted edits to tracked `README.md`
  gives `CheckoutFailed`, keeps the edits, leaves HEAD and writes no unit. The missing-branch
  test's expected stderr follows git switch's.
- C4: a handler test that `/shape --branch '!!'` notifies `InvalidSlug` with HEAD unchanged, and
  a `git.ts` test that `checkout` with a missing root gives `Unexpected`.
- D4, first half: spec §3 escape hatch derives the slug before checking out.

## C3

The user chose to split C3 into three commits. The unsplit commit is tagged `c3-unsplit`; it is
the reference, not the code to move. Reset `redo-main` to C2 and rebuild C3 test-first as three
commits, each green alone, taking each test from `c3-unsplit` and running it red before its
code:

1. `feat: /shape reports the work unit on the current branch`: `/shape` with no args reports
   the current branch's unit, `/shape --branch` on an existing unit checks out and reports it,
   and `Corrupt` for a schema or syntax error. Brings `src/parse.ts`, zod, `currentBranch` and
   `readWorkUnit` (`Missing | Found`), plus the README, skill and old-plan parse edits.
2. `--branch` on a slug another branch's unit holds uses `<slug>-<crc>`, and `SlugTaken` when that
   is held too; no-args lookup tries both. Spec §3 escape hatch step 2 and D4's second half: the
   slug is looked up before checkout.
3. A unit folder without `work.json` is removed and recreated with `Recreated` (`Orphaned`,
   `removeWorkUnitDir`).

Fixes, each in the commit that brings its code:

- C2: `Corrupt` for a root-level issue (`null` work.json) has no `: ` prefix.
- C3: tests for the reachable `Unexpected` mappings: an `EACCES` work.json makes the handler throw
  `/shape: readWorkUnit: …`, `currentBranch` outside a repo, and a failing `removeWorkUnitDir`.
  The stat after a read's `ENOENT` keeps the default mapping untested; only a race reaches it.
- C5: a handler test that `/shape` with no args on a detached HEAD gives `Usage`.

`git diff c3-unsplit redo-main` at the end shows only these fixes. Delete the tag once that holds.
