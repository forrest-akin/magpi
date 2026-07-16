---
title: "Workflow layer — 03 Distill & Apply (/distill · changeset · Gate 3 · /apply + E2E)"
type: feat
status: active
date: 2026-06-07
part: 3 of 3
parent: ./README.md
backbone: ./architecture-and-verification.md
covers: "parent §10 Phase 5 + Phase 4 Gate 3 + whole-plan verification"
tasks: [25, 27, 28, 29, 30, 31, 34, 36]
commits: [17, 18, 19, 20, 21, 22, 23, 24]
---

# 03 — Distill & Apply

Closes the self-correcting loop: the multi-agent `/distill` fan-out that mines the work
unit's transcripts into a ranked changeset, the changeset review UX, Gate 3, `/apply`, the
ledger inspect/prune surface — and the whole-plan verification (acceptance matrix + full-loop
E2E) that proves every Success Criterion end-to-end.

> **Read [architecture-and-verification.md](./architecture-and-verification.md) first.** The
> [parent README](./README.md) holds the authoritative global commit sequence.

**Depends on:** [01-foundation](./01-foundation.md) (ledger core Task 26, transcript reader,
subagent-runner port, replay fixtures, verification infra) **and**
[02-commands](./02-commands.md) (the full `/shape`→`/craft`→`/reflect` loop that Task 36's
E2E drives). The ledger *core* (Task 26) lives in Foundation; the distill *fan-out and
synthesis* that consume it are here.

Each task names its **hex role**, its **error shape**, and its **evidence**. The gate
(`bun test` && `bun x tsc --noEmit`) is implied Definition-of-Done for every task.

## Milestone G — `/distill` fan-out + synthesis (parent §10 Phase 5)

> The ledger core it writes into is [01 Task 26](./01-foundation.md).

- [ ] **Task 25 — Subagent runner adapter + concurrency semaphore (`src/adapters/pi-subagent-runner.ts`, `tool_call` hook).** Spawn `pi --mode json -p --no-session --session-dir /dev/null`; parse `message_end`; pure semaphore policy (cap 4) enforced in `tool_call`; retry a failed worker once → `worker_failure` annotation. — *Role:* adapter + shell (pure policy in core) · *Error shape:* `Task` · *Evidence:* concurrency-policy property test; replay test with a scripted subagent runner. — Design Doc refs: [Tech Spec §11], [ADR §7], [SPIKE additional finding]
- [ ] **Task 27 — Distill lens analyzers (`src/domain/distill/lenses.ts`).** Four pure analyzers over `FileEntry[]` (`duplicated-work`, `rabbit-holes`, `context-waste`, `handoff-gaps`); compaction handling: use `getLatestCompactionEntry`, analyze only entries ≥ `firstKeptEntryId`, flag `low_fidelity` when >50% lossy. Transcript entries supplied by `TranscriptReader`. — *Role:* core · *Error shape:* data/`Result` · *Evidence:* per-lens tests over golden transcript fixtures (the record/replay corpus). — Design Doc refs: [Tech Spec §6 fan-out + CompactionEntry], [SPIKE Q3 lens→field]
- [ ] **Task 28 — Distill synthesis + changeset (`src/domain/distill/{synthesis,routing}.ts` + `shell/phases/distill/orchestrator.ts`).** Pure `synthesize(findings, ledger, now)`: span-group, fix-type-priority conflict resolution (hook > brief > agents-md/memory > command > model-profile/skill), routing taxonomy, ledger cross-ref, recurrence≥2 gate, rank → `Result<Changeset, …>`; orchestrator fans out workers (Task 25) and writes `changeset.json` → `changeset-pending-gate`. — *Role:* core + shell · *Error shape:* `Result` · *Evidence:* synthesis snapshot over golden findings; ranking/conflict property tests; `acceptance/sc-4`. — Design Doc refs: [Tech Spec §6 synthesis], [Tech Spec §1 changeset], [ADR §6 taxonomy]

## Milestone H — Changeset review, Gate 3, `/apply`, ledger inspect (parent §10 Phases 4–5)

- [ ] **Task 31 — Ledger inspect/prune/reset (`src/domain/ledger/...` pure transforms + `src/shell/...`).** `/distill --inspect` (markdown table in TUI); `--prune <id>` → `evicted` (retained for audit); `--reset <id>` → `observed` (clear note, recurrence→1). — *Role:* core + shell · *Error shape:* `Result` · *Evidence:* transform unit tests; inspect render snapshot. — Design Doc refs: [Tech Spec §6 inspect/prune surface]
- [ ] **Task 29 — Changeset review UX (`src/domain/changeset/review.ts` + `src/adapters/tui-prompter.ts`).** Pure `applyDecision(changeset, decision)` reducer; render §8 markdown block; interactive per-item `[A]ccept/[R]eject/[S]kip` via `Prompter` port; no Gate-3 advance while any item `pending`. — *Role:* core + adapter · *Error shape:* `Result` · *Evidence:* reducer property test (no-pending invariant); scripted-prompter replay test. — Design Doc refs: [Tech Spec §8]
- [ ] **Task 30 — `/apply` Gate 3 + application (`src/domain/changeset/apply-plan.ts` + `src/shell/commands/apply.ts`).** Pure `decideApply(changeset)` → full-accept|partial|full-reject; apply accepted items by `artifactType` (shell), write rejected → ledger `rejected`; full-reject retries distill (`retryCount<2`) or falls back to critique (`>=2`); → `completed`. — *Role:* core + shell · *Error shape:* `Result`/`Task` · *Evidence:* `acceptance/sc-6` (partial). — Design Doc refs: [Tech Spec §4 Gate 3, §6], [Tech Spec SC #6]

## Milestone I — Whole-plan verification & evidence (cross-cutting proof)

> The verification *infrastructure* (property suite, replay fixtures, `bun run verify`) landed
> in [01 Tasks 32/33/35](./01-foundation.md#milestone-i-infra--verification-infrastructure-cross-cutting-lands-during-foundation).
> These two close the loop end-to-end.

- [ ] **Task 34 — Acceptance matrix + evidence records (`test/acceptance/sc-*.test.ts`, `test/_evidence/`).** One named test per Success Criterion (SC #1–8) per the [acceptance matrix](./architecture-and-verification.md#acceptance-matrix-every-success-criterion--a-named-runnable-test); each writes a machine-readable evidence record (criterion, fixtures, assertions, result). — *Role:* test · *Evidence:* 8 green acceptance tests + 8 evidence records. — Design Doc refs: [Tech Spec Success Criteria #1–8], [Verification & Evidence Strategy]
- [ ] **Task 36 — Full-loop E2E + whole-plan evidence artifact (`test/e2e/full-loop.test.ts`).** Replay-drive `/shape`→`/craft`→`/reflect`→`/apply` on a fixture; assert SC #1/#2/#3/#8 in one run; emit the consolidated whole-plan evidence artifact (all SC records + the full-loop replay manifest). — *Role:* test · *Evidence:* one green E2E producing the replayable artifact. — Design Doc refs: [Tech Spec Success Criteria #1, #2, #3, #8], [Verification & Evidence Strategy]

## Definition of Done (this seam, and the whole plan)

- Commits 17–24 in the [global sequence](./README.md#global-commit-sequence-authoritative) are green.
- `/distill` fans out lens workers under the cap-4 semaphore, synthesizes a ranked `changeset.json`, and gates on recurrence≥2 (`acceptance/sc-4`).
- Changeset review + Gate 3 + `/apply` drive the work unit to `completed`, with partial accept/reject proven (`acceptance/sc-6`).
- **Whole plan:** all eight acceptance tests (SC #1–8) are green with evidence records, and the full-loop E2E (Task 36) emits the consolidated whole-plan evidence artifact — every Success Criterion has a green, recorded, replayable proof.
