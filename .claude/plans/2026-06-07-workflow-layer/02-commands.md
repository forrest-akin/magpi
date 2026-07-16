---
title: "Workflow layer — 02 Commands (/shape · /craft · /reflect)"
type: feat
status: active
date: 2026-06-07
part: 2 of 3
parent: ./README.md
backbone: ./architecture-and-verification.md
covers: "parent §10 Phase 4 (workflow commands)"
tasks: [17, 18, 19, 20, 21, 22, 23, 24]
commits: [11, 13, 14, 15, 16]
---

# 02 — Commands (`/shape` · `/craft` · `/reflect`)

The three umbrella commands and their sub-phases over the work-unit lifecycle: `/shape`
(explore · define · plan) with the Gate-1 plan gate, `/craft` with crash-safe checkpointing,
and `/reflect`'s critique sub-phase with disposition routing.

> **Read [architecture-and-verification.md](./architecture-and-verification.md) first.** The
> [parent README](./README.md) holds the authoritative global commit sequence.

**Depends on:** [01-foundation](./01-foundation.md) — the pure work-unit core, WorkStore,
hooks/briefs/profiles, the ledger core (Task 26, needed by Gate-1 Task 20), and the replay
fixtures/adapters (Task 33) that these command tests run against.
**Downstream:** [03-distill-apply](./03-distill-apply.md) picks up at `awaiting-reflect` →
`distill`.

Each task names its **hex role**, its **error shape**, and its **evidence**. The gate
(`bun test` && `bun x tsc --noEmit`) is implied Definition-of-Done for every task.

## Milestone D — `/shape` umbrella (parent §10 Phase 4)

- [ ] **Task 17 — `/shape` + explore (`src/shell/commands/shape.ts`, `src/shell/phases/explore.ts`).** Create work unit (slug via Ids+Git ports, branch), boot explore; `--branch`, `--abandon <slug>`, resume-on-existing. — *Role:* shell · *Error shape:* `Task` · *Evidence:* command test with fake ports (creates folder, branch, `created`→`shaping`). — Design Doc refs: [Tech Spec §3, §9], [ADR §1]
- [ ] **Task 18 — explore→define & define→plan seams (`src/shell/phases/define.ts`, `/define` + `/plan`).** Explicit user-signal transitions only; write seam brief; `/plan` launches the autonomous plan session. — *Role:* shell · *Evidence:* seam replay test (brief written, next sub-phase seeded). — Design Doc refs: [Tech Spec §7], [ADR Determination (explicit seams)]
- [ ] **Task 19 — Autonomous plan sub-phase (`src/shell/phases/plan.ts`).** Run plan agent to completion via `SessionLauncher`; write `plan.md` (frontmatter `status`/`retryCount`); → `plan-pending-gate`. — *Role:* shell · *Error shape:* `Task` · *Evidence:* replay test using a golden plan transcript → asserts `plan.md` + state. — Design Doc refs: [Tech Spec §1 plan.md, §2], [ADR §1]
- [ ] **Task 20 — Gate-1 plan-rejection re-entry (`src/domain/workunit/gate.ts` + `shape.ts --reject-plan`).** Pure `gate1Decision(retryCount, feedback)` → retry|fallback; shell re-runs plan with feedback injected or reverts to `shaping (define)`; ledger `observed` record on rejection. — *Role:* core + shell · *Error shape:* `Result` · *Evidence:* `acceptance/sc-5` (≤2 retries → revert). — Design Doc refs: [Tech Spec §4 Gate 1], [Tech Spec SC #5] · *Cross-seam:* writes to the ledger core ([01 Task 26](./01-foundation.md), global commit 12) — it must land first.

## Milestone E — `/craft` umbrella (parent §10 Phase 4)

- [ ] **Task 21 — `/craft` + autonomous craft (`src/shell/commands/craft.ts`, `src/shell/phases/craft.ts`).** Gate-1 entry from `plan-pending-gate`; seed `plan-to-craft` brief; clean exit (changes, no BLOCKED) → `awaiting-reflect`. — *Role:* shell · *Error shape:* `Task` · *Evidence:* replay test of a golden craft transcript. — Design Doc refs: [Tech Spec §5], [ADR §5]
- [ ] **Task 22 — Craft failure handling + checkpoint (`src/shell/phases/craft.ts`; pure decision in `domain`).** Pre-craft `git.stashCheckpoint` (store `craftCheckpointRef`); pure `craftOutcome(transcript)` detects BLOCKED after 3 consecutive failure cycles → `blocked` + `blockedReason`; resume re-injects checkpoint SHA; cross-invocation `retryCount>=2` stays `blocked`. — *Role:* core + shell · *Error shape:* `Result`/`Task` · *Evidence:* `acceptance/sc-3` (kill-replay-resume). — Design Doc refs: [Tech Spec §5], [Tech Spec Error Handling #2], [Tech Spec SC #3]

## Milestone F — `/reflect` critique sub-phase (parent §10 Phase 4)

- [ ] **Task 23 — `/reflect` + critique (`src/shell/commands/reflect.ts`, `src/shell/phases/critique.ts`).** Gate-2 entry from `awaiting-reflect` (optional, never forced); collaborative guided tour from the harness's multi-lens review; write `critique-todos.json`. — *Role:* shell · *Error shape:* `Task` · *Evidence:* command test; bypass-to-distill (no todos) path test. — Design Doc refs: [Tech Spec §7], [ADR §5, §6]
- [ ] **Task 24 — Critique disposition + rework (`src/domain/...` pure routing + `critique.ts`).** Pure `disposition(item)` → routing; `critical`→`fix-in-place`→`rework` (+ rework brief, 3-cycle budget) → `reflecting (distill)`; `minor`→`deferred`/`spawn-child` (child work unit, `parentSlug`)/`accepted-as-is`. — *Role:* core + shell · *Error shape:* `Result` · *Evidence:* disposition-routing property test; rework-cycle replay test. — Design Doc refs: [Tech Spec §7], [Tech Spec §2 rework]

## Definition of Done (this seam)

- Commits 11 and 13–16 in the [global sequence](./README.md#global-commit-sequence-authoritative) are green.
- `/shape`→`/craft`→`/reflect(critique)` traverse the lifecycle on fake ports + replay adapters, with no live models.
- `acceptance/sc-3` (crash-safe craft resume) and `acceptance/sc-5` (Gate-1 retry cap) are green.
- The work unit lands at `reflecting (distill)` (or `awaiting-reflect` when reflect is skipped), ready for [03-distill-apply](./03-distill-apply.md).
