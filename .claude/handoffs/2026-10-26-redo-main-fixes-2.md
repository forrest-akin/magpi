# Handoff: fold the C4/C5 review fixes into redo-main

The review of the orphan refusal, the refactor, C4 and C5 is in
`.claude/work/redo-main/review3-code.md` and `review3-docs.md`, with verdicts beside them. Fold
each fix into the commit named below; code fixes are test-first. The branch is local and unpushed.

## C1

- D2, first half: ADR 0003 says it also supersedes ADR 0001 decision 3's per-phase pi launch with
  `PI_CODING_AGENT_SESSION_DIR`, and ADR 0001's status names that.
- Copy this handoff into the build worktree and fold it into C1.

## C4

- `/shape` with no arguments on a `created` unit takes the same path as `--branch`, as the plan's
  C4 says: it switches to a new session file and the unit becomes `shaping (explore)`. Driving
  test: a `created` unit on HEAD, no args.
- D1: spec §2's `shaping` crash-recovery row drops the `PI_CODING_AGENT_SESSION_DIR` mechanism.
- D2, second half: `docs/agent-harness-design.md` line 103 describes `/shape` switching pi into
  the unit's `sessions/`.
- D3, first half: README and spec §12 say `/resume` lists the unit's sessions in the pi process
  that switched.
- D4: the spike doc names behaviors (the `/shape` switch, the `/shape` resume), not plan labels,
  and `node_modules/.bin/pi`, not a worktree path.
- D7: C4's commit body states what the commit does once the above lands.

## C5

- D6: a refactor commit before C5 extracts `addSession` from `startShaping`, with no behavior
  change and no test change. `startSession` stays where C4 put it. C5 then holds behavior only.
- C1: `listSessionFiles` maps `readdir`'s `ENOENT` to no files, so a missing `sessions/` starts a
  new session file like an empty one.
- C2: `lastSessionFile` considers only names ending `.jsonl`.
- C4: a test for a cancelled resume: `SwitchCancelled` names the unit and `work.json` is unchanged.
- D3, second half: spec §12 says `/shape` is the way back to a unit's sessions after pi restarts.
- D8: the README's `/shape` text becomes a short list, one item per form and state.
- Run the pending orphan-folder check through pi's rpc mode with the faux provider: a folder
  without `work.json` gives the `Orphaned` notice for `/shape` and `/shape --branch demo`, HEAD
  stays, and the folder stays empty.
