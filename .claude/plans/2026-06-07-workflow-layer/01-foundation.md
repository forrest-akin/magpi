---
title: "Workflow layer — 01 Foundation (toolchain · core · hooks · ledger · verify infra)"
type: feat
status: active
date: 2026-06-07
part: 1 of 3
parent: ./README.md
backbone: ./architecture-and-verification.md
covers: "parent §10 Phases 1–3 + Phase 4 substrate + ledger core"
tasks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 26, 32, 33, 35]
commits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]
---

# 01 — Foundation

The prerequisite floor everything else stands on: the Bun toolchain + hexagonal skeleton,
the pure work-unit domain core, the six Pi hooks + briefs + model profiles, the learnings
ledger core, and the day-one verification infrastructure (property suite, replay fixtures,
`bun run verify`).

> **Read [architecture-and-verification.md](./architecture-and-verification.md) first** — the
> binding conventions, module layout, and verification strategy are shared and not restated
> here. The [parent README](./README.md) holds the authoritative global commit sequence.

**Depends on:** nothing (greenfield). **Downstream:** [02-commands](./02-commands.md) and
[03-distill-apply](./03-distill-apply.md) both build on everything here.

Each task names its **hex role** (core/port/adapter/boundary/shell), its **error shape**
(`Result`/`Task`/`Maybe`/data), and its **evidence** (the test that proves it). The gate
(`bun test` && `bun x tsc --noEmit`) is implied Definition-of-Done for every task.

## Milestone A — Toolchain, hexagonal skeleton & boundary (parent §10 Phase 1)

- [ ] **Task 1 — Bun project scaffold + dependencies + Bun↔Pi go/no-go gate.** `package.json` (Bun; `@earendil-works/pi-coding-agent` **pinned exact**; `true-myth@^9`, `zod@^4` (parsed through the in-repo `parserFor`); dev: `fast-check`, `@biomejs/biome`), `tsconfig.json` (strict, ESM), Biome config, the `src/{domain,ports,boundary,adapters,shell}` + `test/` skeleton, and scripts wiring the `bun test` + `bun x tsc --noEmit` gate. **Go/no-go gate (do this first, it is the riskiest assumption — ADR 0002):** confirm Pi imports cleanly under Bun **and** one real session launches + writes its JSONL under a redirected session dir. *Pass →* proceed on Bun. *Fail →* execute the documented fallback: swap the runtime/test-runner to **Node + `tsx` + `vitest`** (architecture, ports/adapters, and all tests carry over unchanged; ~half a day) and note the swap in ADR 0002. — *Role:* shell/tooling · *Evidence:* gate runs green on an empty suite; the Pi-on-Bun probe is recorded as the first evidence record. — Design Doc refs: [ADR 0002 (toolchain + fallback)], [Tech Spec §12 `@earendil-works/`], [SPIKE Residual risk #1, #2]
- [ ] **Task 2 — Port interfaces (`src/ports/*.ts`).** Typed interfaces only: `Clock.now()`, `Ids.uuidv7()/crc32()`, `FileSystem.exists/read/atomicWrite`, `Git.currentBranch/checkoutNew/adopt/stashCheckpoint`, `WorkStore.read/write`, `LedgerStore.append/read`, `SessionLauncher.launch`, `SubagentRunner.spawn`, `TranscriptReader.loadEntries/latestCompaction`, `Prompter.choose`. IO ports return `Task<…, E>` with `E` a `kind`-tagged union. — *Role:* port · *Error shape:* `Task`/`Result` signatures · *Evidence:* `tsc` compiles; fakes in Task 6 implement each. — Design Doc refs: [CLAUDE.md ports-and-adapters], [Tech Spec §12]
- [ ] **Task 3 — Boundary schemas + parsers (`src/boundary/{schemas,parsers}.ts`).** `zod` schemas for `work.json`, handoff brief, `changeset.json`, `critique-todos.json`, ledger line; `parserFor`/`asyncParserFor` yielding `Result`/`Task`; lift parsed `work.json` → `WorkUnit` DU and lower DU → persisted shape. — *Role:* boundary · *Error shape:* `Result<T, ZodError>` · *Evidence:* round-trip property test (lower∘lift = id) in Task 11; malformed-input rejection tests. — Design Doc refs: [functional-error-handling: parse-at-boundary], [Tech Spec §1 schemas]
- [ ] **Task 4 — Effect adapters: fs / clock / ids / git (`src/adapters/{bun-fs,bun-clock,uuid-ids,git-cli}.ts`).** Concrete Bun/CLI implementations of those ports; `bun-fs.atomicWrite` = write `.tmp` + `rename`; `git-cli` via `Bun.$`. Unknown rejections normalized with `.mapRejected`. — *Role:* adapter · *Error shape:* `Task` · *Evidence:* adapter integration tests against a tmp dir / throwaway git repo. — Design Doc refs: [Tech Spec §1 atomic write], [Tech Spec §3 git], [functional-error-handling: boundary interop]
- [ ] **Task 5 — Pi adapters: transcript-reader + session-launcher (`src/adapters/{pi-transcript-reader,pi-session-launcher}.ts`).** `pi-transcript-reader` wraps Pi's exported `parseSessionEntries`/`migrateSessionEntries`/`getLatestCompactionEntry` — read the file bytes, then parse (0.80.7 does **not** publicly export `loadEntriesFromFile`; this parser is the **only** JSONL reader; SC #7); `pi-session-launcher` launches a session with `PI_CODING_AGENT_SESSION_DIR` = absolute `sessions/` (or `SessionManager.create(cwd, sessionDir, {id})` on the in-process path). — *Role:* adapter · *Error shape:* `Task` · *Evidence:* `acceptance/sc-2`, `acceptance/sc-7`. — Design Doc refs: [Tech Spec §12 loader + redirect], [SPIKE Q2, Q6]
- [ ] **Task 6 — Test substrate: in-memory fakes for every port + architecture-fitness test (`test/support/fakes/**`, `test/architecture/boundaries.test.ts`).** A deterministic fake per port (fake clock, seeded ids, in-memory fs/store/ledger, scriptable launcher/subagent/prompter); the fitness test asserting `domain/` imports no IO. — *Role:* test infra · *Evidence:* fitness test runs and (initially trivially) passes; fakes type-check against the ports. — Design Doc refs: [CLAUDE.md functional core], [Verification & Evidence Strategy]

## Milestone B — Work-unit domain core, pure (parent §10 Phase 4 substrate)

- [ ] **Task 7 — WorkUnit model (`src/domain/workunit/model.ts`).** `WorkUnit` discriminated union on state (illegal states unrepresentable); `WorkUnitState`/`WorkUnitPhase`/`BriefName`/`LensName`/`RoutingType`/`ArtifactType` as `const` string-literal unions (no enums); `assertNever` helper. — *Role:* core · *Error shape:* data · *Evidence:* type-level tests (illegal combos fail to compile); construction unit tests. — Design Doc refs: [CLAUDE.md illegal-states-unrepresentable], [Tech Spec §1, §6]
- [ ] **Task 8 — Pure transition function (`src/domain/workunit/transitions.ts`).** `transition(unit, event): Result<WorkUnit, TransitionError>` encoding the full §2 graph; exhaustive `switch` + `never`; undefined transitions → `err({kind:'IllegalTransition', …})`. — *Role:* core · *Error shape:* `Result` · *Evidence:* example tests for every edge + property test "no event from any state ever throws or yields an illegal state" (SC #5 backbone). — Design Doc refs: [Tech Spec §2 transition graph]
- [ ] **Task 9 — Pure crash-recovery decision (`src/domain/workunit/recovery.ts`).** `recoveryAction(persisted): RecoveryAction` returning the §2 recovery-table action as data (resume / no-op / clean-orphan / discard-tmp / display-blocked). — *Role:* core · *Error shape:* `Result`/data · *Evidence:* table-driven tests for each state; feeds `acceptance/sc-3`. — Design Doc refs: [Tech Spec §2 crash recovery], [Tech Spec Error Handling #2]
- [ ] **Task 10 — Pure slug derivation (`src/domain/workunit/slug.ts`).** `deriveSlug(summary, {crc, salt})` — kebab-case normalize, 4-hex crc suffix, deterministic; collision resolver `-2/-3` as a pure fold over an existing-slug set. Entropy/crc supplied by caller (Ids port at the shell). — *Role:* core · *Error shape:* data · *Evidence:* property tests (determinism, charset, length cap, collision uniqueness). — Design Doc refs: [Tech Spec §3], [Tech Spec Error Handling #5]
- [ ] **Task 11 — WorkStore adapter + recovery wiring (`src/adapters/work-store-fs.ts`, shell glue).** Compose boundary parser + `bun-fs.atomicWrite` into `WorkStore`; harness is sole mutation authority; on read apply `recoveryAction`; `.tmp` orphan discard. — *Role:* adapter/shell · *Error shape:* `Task` · *Evidence:* round-trip property test (lift∘read∘write∘lower = id); crash-simulation test (orphan `.tmp`, partial folder). — Design Doc refs: [Tech Spec §1 atomic write, §2 authority], [Tech Spec Error Handling #4], [Tech Spec §3 branch↔folder]

## Milestone C — Briefs, model profiles, Pi hooks (parent §10 Phases 2–3, prerequisite for Phase 4)

- [ ] **Task 12 — Pure brief validate + render (`src/domain/briefs/{validate,render}.ts`).** `validateBrief(brief, knownPaths): Result<ValidBrief, BriefError>` — `schemaVersion "1"`, ≥1 decision, `briefType`-matches-seam, every `artifacts` path ∈ `knownPaths` (path **set** injected — existence check stays pure); `renderBrief` → the cache-eligible system-prompt block. — *Role:* core · *Error shape:* `Result` · *Evidence:* unit tests per failure `kind`; render snapshot. — Design Doc refs: [Tech Spec §1 HandoffBrief, §10 (GAP 11) validation/injection], [Tech Spec Error Handling #1]
- [ ] **Task 13 — Seam-2 model profiles (`src/domain/profiles.ts`).** `const` discriminated record keyed by model: routing role, thinking budget, context-window, parallel-tool-call; minimal Claude + Codex. — *Role:* core (data) · *Evidence:* type + lookup tests. — Design Doc refs: [agent-harness §6.1 Seam 2, §10 Phase 3], [Tech Spec §11 routing]
- [ ] **Task 14 — Register the six Pi hooks (`src/shell/hooks/*`).** `session_start`, `session_shutdown`, `before_agent_start`, `context`, `session_before_compact`, `tool_call` as adapters translating Pi events → core calls (validate/render brief, request transitions, enforce semaphore). — *Role:* shell · *Error shape:* `Task` at the edge · *Evidence:* `acceptance/sc-8` (all six fire). — Design Doc refs: [Tech Spec §12 hooks], [SPIKE Q5], [agent-harness §6.2]
- [ ] **Task 15 — Auto-clear-and-reseed handoff (`src/shell/hooks/{session-shutdown,session-start}.ts`).** Shutdown: render+write outgoing brief, request state advance via WorkStore, record craft checkpoint SHA. Start: parse+validate incoming brief, inject via `ctx.newSession({ setup, withSession })`; on missing artifact → transition to `blocked`. — *Role:* shell · *Error shape:* `Task`/`Result` · *Evidence:* replay test of a seam handoff; `blocked`-on-missing-artifact test. — Design Doc refs: [ADR §4], [Tech Spec §7 seam], [SPIKE Q5 `handoff.ts`]
- [ ] **Task 16 — context-trim + compaction hooks (`src/shell/hooks/{context,session-before-compact}.ts`).** `context`: lean-active-context trim (drop stale tool results), reading from profile. `session_before_compact`: write pre-compact brief; optional cheaper summarizer. — *Role:* shell · *Error shape:* `Task` · *Evidence:* trim-policy unit test (pure policy) + hook integration test. — Design Doc refs: [agent-harness §6.2], [Tech Spec §12], [ADR Accepted trade-offs (compaction lossy)]

## Milestone G-core — Learnings ledger (parent §10 Phase 5; deployed here as a prerequisite)

> Conceptually part of `/distill` (Milestone G), but the ledger is a **pure core + adapter**
> that must exist before any command writes to it — Gate-1 (Commands
> [Task 20](./02-commands.md)) records the first ledger entry. It therefore lands here, at
> **global commit 12** (the one cross-seam sequencing edge; see the [parent README](./README.md#global-commit-sequence-authoritative)).

- [ ] **Task 26 — Learnings ledger (`src/domain/ledger/{signature,recurrence}.ts` + `src/adapters/ledger-store-fs.ts`).** Pure `signature = sha256(lens:routingType:normalizedDescription)[0..12]`, recurrence bump+dedup, confidence start 0.5/+0.2/cap 1.0, lazy 90-day decay (now injected); append-only `ledger.jsonl` via adapter, status lifecycle. — *Role:* core + adapter · *Error shape:* `Result`/`Task` · *Evidence:* property tests (signature stability, confidence monotonic+capped, decay floor); `acceptance/sc-4`. — Design Doc refs: [Tech Spec §6 ledger + decay + signature], [Tech Spec Determination (threshold 2)], [ADR §6]

## Milestone I-infra — Verification infrastructure (cross-cutting; lands during Foundation)

> These three are the day-one verification substrate every later commit relies on. The
> end-to-end acceptance matrix (Task 34) and full-loop E2E (Task 36) close the loop in
> [03-distill-apply](./03-distill-apply.md).

- [ ] **Task 35 — `bun run verify` (day-one tier only) + ritual doc.** Wire one `bun run verify` = `bun test` && `bun x tsc --noEmit` + architecture-fitness (Task 6) + `JSON.parse`-on-`.jsonl` scan (SC #7) + no-`throw`-in-`domain` scan. **Deliberately excludes** strict coverage thresholds and the complexity budget — those are the deferred ratchet (a later follow-up once the design stabilizes; see [Verification & Evidence Strategy](./architecture-and-verification.md#proving-simple-elegant-high-quality-mechanically-not-by-assertion)), so the gate stays fast and never blocks iteration. Document the per-commit ritual in `AGENTS.md`. — *Role:* tooling · *Evidence:* `bun run verify` green and quick; SC #7 test. — Design Doc refs: [Verification & Evidence Strategy (right-sizing)], [Tech Spec SC #7]
- [ ] **Task 32 — Property-based core suite (`test/domain/**` with `fast-check`).** Invariants: transitions never yield illegal states (SC #5); slug determinism/charset/collision; brief-validate totality; recurrence monotonic+capped; decay floor; signature stability; synthesis ranking order; review no-pending invariant. — *Role:* test · *Evidence:* the suite itself, green; `domain/` exercised broadly (a coverage *threshold* is the deferred ratchet, not asserted here). — Design Doc refs: [Verification & Evidence Strategy], [CLAUDE.md functional core]
- [ ] **Task 33 — Record/replay fixtures + replay adapters (`test/fixtures/transcripts/**`, `test/replay/**`).** Record golden Pi transcripts + subagent JSON for plan/craft/distill against a fixture project; replay `SessionLauncher`/`SubagentRunner` and scripted `Prompter` that play them back deterministically. — *Role:* test infra · *Evidence:* a replay run reproduces a recorded changeset byte-for-byte. — Design Doc refs: [Verification & Evidence Strategy], [SPIKE Q2/Q3]

## Definition of Done (this seam)

- Commits 1–10 and 12 in the [global sequence](./README.md#global-commit-sequence-authoritative) are green.
- `bun run verify` is wired and fast (Task 35); the architecture-fitness test passes with a real (non-empty) `domain/`.
- The pure work-unit core, briefs, profiles, and ledger core are property-tested; replay fixtures + adapters exist so every downstream command test can run offline.
- Acceptance scaffolds `sc-2`, `sc-7`, `sc-8` are green; the SC #5 transition-invariant backbone (Task 32) is proven.
