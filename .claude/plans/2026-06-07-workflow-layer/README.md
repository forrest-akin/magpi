---
title: "magpi workflow layer — shape / craft / reflect loop"
type: feat
status: active
date: 2026-06-07
commits: stacked
architecture: hexagonal + functional-core/imperative-shell
runtime: bun
structure: multi-part (index + shared backbone + 3 seam plans)
brainstorm_path: .claude/brainstorms/2026-06-06-shape-craft-reflect-loop-brainstorm.md
spike_path: docs/spikes/2026-06-07-pi-transcript-feasibility-spike.md
---

# magpi workflow layer — shape / craft / reflect loop

✨ Implement the three-umbrella workflow layer (`/shape` · `/craft` · `/reflect`) over a
branch-linked work-unit folder, with under-the-hood handoffs and a transcript-mining
`/distill` phase that makes the harness self-correcting — built as a **functional core
behind ports with a thin imperative shell**, and **proven at every level by runnable,
recorded, replayable evidence**.

> **Repo state:** greenfield. No source, no commits — only the design records below. This
> plan stands up the Bun project scaffold and the minimal Pi-bootstrap / context-hook /
> model-profile prerequisites the Tech Spec depends on (parent
> `docs/agent-harness-design.md §10` Phases 1–3), then builds the workflow layer (Phases 4–5).
> **Out of scope** (spec Non-Goals): the eval head-to-head (§10 Phase 6), full profile tuning
> (§10 Phase 7), eval-gated auto-apply.

## How this plan is organized

This was one monolithic plan; it is now split into a **thin index (this file) + a shared
backbone + three seam plans**, each a self-contained, independently-deployable slice of the
work-unit lifecycle. Read the backbone first, then execute the seam plans in order.

| File | Contents | Tasks |
|---|---|---|
| **[architecture-and-verification.md](./architecture-and-verification.md)** | Binding conventions (by reference), module layout, ERD, verification & evidence strategy, acceptance matrix. **Read first.** | — |
| **[01-foundation.md](./01-foundation.md)** | Milestones A–C: toolchain/ports/boundary/adapters, pure work-unit core, hooks/briefs/profiles + the learnings-ledger core and the verification infrastructure. | 1–16, 26, 32, 33, 35 |
| **[02-commands.md](./02-commands.md)** | Milestones D–F: `/shape`, `/craft`, `/reflect` (critique). | 17–24 |
| **[03-distill-apply.md](./03-distill-apply.md)** | Milestones G–H + end-to-end verification: `/distill`, subagents, changeset review, Gate 3, `/apply`, and the acceptance matrix + full-loop E2E. | 25, 27, 28, 29, 30, 31, 34, 36 |

**Why split by *deployable seam*, not by design-doc phase.** The parent design doc's §10
phases are deliberately *interleaved* across this plan's architecture layers — e.g. Phase 4's
domain substrate (Milestone B) is built *before* Phase 2–3's hooks (Milestone C), because the
hooks depend on the work-unit store. Cutting along phase lines would fight the dependency
graph. The seam split respects it: each seam plan depends only on the seams before it.

### Design-doc phase → seam plan (they interleave — read the parent §10 map)

| Parent §10 phase | Milestones | Seam plan |
|---|---|---|
| Phase 1 — stand up Pi (scaffold, adapters) | A | 01 |
| Phase 2 — context hooks | C | 01 |
| Phase 3 — Seam-2 profiles | C | 01 |
| Phase 4 — workflow commands | B (substrate), D, E, F, H (Gate 3) | 01 + 02 + 03 |
| Phase 5 — multi-agent (subagents, ledger, distill) | G, H | 01 (ledger) + 03 |
| Phase 6 — evals | — | **out of scope** |
| Phase 7 — tune | — | **out of scope** |

## Global commit sequence (authoritative)

<!-- Re-sequenced by commit-sequencer after the hexagonal + verification rework; preserved
verbatim across the seam split. The seam plans hold task detail; THIS table is the single
source of truth for commit order. -->

Stacked, trunk-safe commits along the work-unit lifecycle. The **Seam** column shows which
plan owns each commit's tasks.

| Commit # | Task # | Seam | Deployable | Task Complete | Task Committed |
|----------|--------|------|------------|---------------|----------------|
| 1 | 1, 2, 3 | 01 | Hexagonal skeleton compiles and gates pass on an empty suite; `bun test` + `tsc --noEmit` are green; **Bun↔Pi go/no-go gate cleared** (or fallback taken per ADR 0002); all port interfaces and boundary schemas exist so every later commit has a stable contract to build against. | | |
| 2 | 6 | 01 | Architecture-fitness test asserts `domain/` imports no IO (trivially passes on an empty domain); every port has a typed in-memory fake so any future test can inject them without live IO. | | |
| 3 | 4, 5 | 01 | All effect adapters (fs/clock/ids/git/Pi transcript-reader/session-launcher) compile and pass their integration tests; the full adapter layer is shippable as a standalone Bun IO toolkit. | | |
| 4 | 7, 8, 9, 10 | 01 | Pure work-unit domain core (model DU, transitions, recovery, slug) is fully typed and property-tested; fitness test confirms zero IO imports; deployable as a zero-dependency pure library. | | |
| 5 | 11 | 01 | WorkStore adapter wires boundary parsers + atomic-write + recovery; round-trip and crash-simulation tests pass; the harness can now safely read and write `work.json` with full crash recovery. | | |
| 6 | 12, 13 | 01 | Brief validate/render and model profiles are pure, typed, and snapshot-tested; the context-injection contract that hooks and commands depend on is complete. | | |
| 7 | 35 | 01 | `bun run verify` (day-one tier: `bun test` + `tsc --noEmit` + architecture-fitness + SC-7 scan + no-throw-in-domain scan) is wired, fast, and green; every subsequent commit runs it. Strict coverage/complexity ratchet is deferred to a later follow-up so the gate doesn't ossify the design. | | |
| 8 | 14, 15, 16 | 01 | All six Pi hooks are registered and wire core calls; handoff reseed (shutdown→start brief pass-through) and context-trim/compaction hooks pass integration tests; `acceptance/sc-8` scaffold is green. | | |
| 9 | 32 | 01 | Property-based core suite covers transition invariants, slug, brief-validate, recovery, recurrence math, and signature stability; `domain/` is exercised broadly; SC #5 backbone (transitions never yield illegal states) is mechanically proven. | | |
| 10 | 33 | 01 | Golden Pi transcript fixtures and replay adapters (SessionLauncher, SubagentRunner, scripted Prompter) land; a replay run byte-for-byte reproduces a recorded changeset; all subsequent shell-command tests can run offline via replay. | | |
| 11 | 17, 18 | 02 | `/shape` command and explore→define seams are wired; fake-port command tests pass (work-unit folder + branch created, `created`→`shaping` transition); seam brief written on define signal. | | |
| 12 | 26 | 01† | Learnings ledger core (signature, recurrence, decay math) + `ledger-store-fs` adapter land; property tests (signature stability, confidence monotonic+capped, decay floor) pass; ledger is independently shippable before any command writes to it. | | |
| 13 | 19 | 02 | Autonomous plan sub-phase runs via replay SessionLauncher; golden transcript test asserts `plan.md` written + state → `plan-pending-gate`; deployable as a complete plan phase. | | |
| 14 | 20 | 02 | Gate-1 pure decision + rejection re-entry wired; `acceptance/sc-5` (≤2 retries → revert to `shaping (define)`) is green; ledger `observed` record written on rejection. | | |
| 15 | 21, 22 | 02 | `/craft` umbrella + craft failure/checkpoint land together; `craftOutcome` BLOCKED detector, checkpoint SHA, and resume path are co-deployed (splitting would leave craft without its crash-safety invariant); `acceptance/sc-3` is green. | | |
| 16 | 23, 24 | 02 | `/reflect` + critique disposition routing land together; disposition is exercised directly by the reflect command and has no safe intermediate state; rework-cycle replay test passes. | | |
| 17 | 25 | 03 | Subagent runner adapter + semaphore policy (cap 4, `tool_call` enforcement, one retry → `worker_failure`) land; concurrency-policy property test and scripted-runner replay pass; distill orchestrator can now fan out workers. | | |
| 18 | 27 | 03 | Four pure distill lens analyzers (`duplicated-work`, `rabbit-holes`, `context-waste`, `handoff-gaps`) + compaction-aware logic pass per-lens golden-fixture tests; deployable as an offline transcript analysis toolkit. | | |
| 19 | 28 | 03 | Distill synthesis + routing taxonomy + orchestrator land; synthesis snapshot + ranking/conflict property tests pass; orchestrator fans out lens workers and writes `changeset.json`; `acceptance/sc-4` (recurrence≥2 gate) is green. | | |
| 20 | 31 | 03 | Ledger inspect/prune/reset (pure transforms + shell surface) land; transform unit tests and inspect render snapshot pass; `/distill --inspect` is independently useful without any changeset in flight. | | |
| 21 | 29 | 03 | Changeset review UX (pure reducer + `tui-prompter` adapter) lands; no-pending-items invariant property test and scripted-prompter replay pass; the interactive accept/reject/skip loop is shippable before Gate-3. | | |
| 22 | 30 | 03 | `/apply` Gate-3 + application logic land; `acceptance/sc-6` (partial apply: accepted items applied, rejected items → ledger `rejected`, state → `completed`) is green; the full lifecycle through `/apply` is now deployable. | | |
| 23 | 34 | 03 | Acceptance matrix (sc-1 through sc-8) with machine-readable evidence records lands; all eight acceptance tests are green given the fixtures and replay adapters from commit 10; evidence records in `test/_evidence/` are written and inspectable. | | |
| 24 | 36 | 03 | Full-loop E2E replay drives `/shape`→`/craft`→`/reflect`→`/apply` on a fixture and asserts SC #1/#2/#3/#8 in one run; consolidated whole-plan evidence artifact (all SC records + replay manifest) is emitted; the plan is proven end-to-end. | | |
> **† The single cross-seam sequencing edge.** Commit 12 (ledger core, **Foundation** Task 26)
> lands *mid-Commands* because Gate-1 (Commands Task 20, commit 14) writes the first ledger
> record — the ledger must exist first. The ledger is a pure-core + adapter that Foundation
> owns and ships independently ("before any command writes to it"); it simply *deploys* at
> commit 12. Every other commit's tasks belong to a single seam, in seam order.

## Acceptance Criteria

Every criterion is a **named, runnable, recorded** test (see the [acceptance
matrix](./architecture-and-verification.md#acceptance-matrix-every-success-criterion--a-named-runnable-test));
a criterion is "met" only when its test is green *and* its evidence record exists.

- [ ] **SC #1 — Full loop, no manual context management.** `acceptance/sc-1` green.
- [ ] **SC #2 — Native transcript capture.** `acceptance/sc-2` green.
- [ ] **SC #3 — Crash-safe craft resume.** `acceptance/sc-3` green.
- [ ] **SC #4 — Recurrence-gated distill.** `acceptance/sc-4` green.
- [ ] **SC #5 — Gate-1 retry cap.** `acceptance/sc-5` + transition property test green.
- [ ] **SC #6 — Partial Gate-3.** `acceptance/sc-6` green.
- [ ] **SC #7 — Loader-only JSONL reads.** `acceptance/sc-7` static scan green.
- [ ] **SC #8 — All six hooks fire.** `acceptance/sc-8` green.
- [ ] **Architecture fitness.** `test/architecture/boundaries.test.ts` green — `domain/` imports no IO/adapters/node/bun.
- [ ] **Error-handling conventions.** No `throw` for control flow in `domain/`; expected failures are `Result`/`Task`/`Maybe` with `kind`-tagged errors; on-disk artifacts parsed once at the boundary.
- [ ] **Build & quality health.** `bun run verify` (= `bun test` && `bun x tsc --noEmit` + architecture-fitness + SC-7 / no-throw scans — the day-one tier) is green and fast; `@earendil-works/pi-coding-agent` pinned exact. (Strict coverage/complexity ratchet is a deferred follow-up, by design.)

## Determination

**Type:** feat — net-new workflow layer; architecture committed in
[ADR 0001](../../../docs/adrs/0001-shape-craft-reflect-workflow-layer.md), contract in the
[Tech Spec](../../../docs/specs/2026-06-07-workflow-layer-spec.md), engineering style governed
by repo [`CLAUDE.md`](../../../CLAUDE.md) + the `functional-error-handling` skill.

**Decision:** Build the shape/craft/reflect layer greenfield on **Bun** as a **functional core
behind ports with a thin imperative shell** (hexagonal), sequenced as trunk-safe stacked
commits along the work-unit lifecycle, and **prove every level with runnable, recorded,
replayable evidence**. Land toolchain + ports + boundary + adapters + pure core + hooks/briefs/
profiles + ledger + verification infrastructure ([01-foundation](./01-foundation.md)), then
`/shape`→`/craft`→`/reflect` ([02-commands](./02-commands.md)), then
`/distill`→changeset→Gate 3→`/apply` plus the end-to-end proof
([03-distill-apply](./03-distill-apply.md)).

**Rationale:**

- **The architecture is the test seam.** Putting the spec's algorithms (transitions, slug,
  signature, recurrence/decay, synthesis, routing, gate decisions) in a pure core, and every
  effect behind a port, is what makes the work *provable*: the core is property-tested with
  zero IO, and the shell is exercised by injecting fakes or **replay adapters**. Determinism by
  construction.
- **Record/replay fits the domain natively.** magpi mines Pi's JSONL transcripts, so golden
  transcript fixtures are both realistic and perfectly replayable — "record once, play it back"
  is the harness's own medium turned into its test substrate (Tech Spec SC #1–4 proven this way
  without burning tokens).
- **Prerequisite-first, per the spec.** Phase-2 context hooks must precede the Phase-4 commands
  that inject briefs / enforce concurrency; the work-unit folder is the single source of truth,
  so its schema/store/state/recovery land before any command mutates state. The seam order
  encodes this.
- **Functional error handling removes whole bug classes.** `Result`/`Task`/`Maybe` +
  errors-as-data + exhaustive `match` make missing-case and unhandled-failure bugs *compile
  errors*; parse-at-boundary means nothing downstream re-checks untrusted shapes.
- **"Elegant/simple" is enforced, not asserted.** The architecture-fitness test, the
  exhaustiveness `never` checks, and the loader-only / no-throw scans make quality claims
  mechanically verifiable and replayable in CI from day one — with a strict coverage/complexity
  ratchet deferred until the design stabilizes, so rigor never competes with greenfield agility.
- **Greenfield removes trunk-break risk but not wiring risk.** No command ships before its
  dependencies (schema, hooks, ledger, changeset) have landed; the sequencer validates each
  boundary.
