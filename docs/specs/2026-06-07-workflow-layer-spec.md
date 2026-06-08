---
title: "Magpi workflow layer — shape / craft / reflect implementation spec"
status: draft
date: 2026-06-07
---

## Goals

1. A developer can invoke `/shape`, `/craft`, and `/reflect` as Pi slash-commands and traverse the full explore→define→plan→craft→critique→distill lifecycle without manually compacting or re-feeding context between phases.
2. Every phase's Pi session transcript is captured natively in `.magpi/work/<slug>/sessions/` with no copy/symlink shim, such that `/distill` can mine the complete per-work transcript corpus after any work unit reaches `completed` or `abandoned`.
3. The work-unit state machine tracks the exact lifecycle position of every piece of work; a crash at any point leaves the work unit in a recoverable state that resumes correctly on next invocation of the appropriate command.
4. The learnings ledger at `.magpi/ledger.jsonl` accumulates findings across all completed work units; after N≥2 recurrences of a friction signature the finding is promoted to a proposed changeset entry that a human must approve before it lands.
5. `/distill` routes each detected friction to the most appropriate artifact type (per ADR §6 routing taxonomy), never issuing a skill unless the routing taxonomy maps to the skill row.
6. Gate-rejection at either Gate 1 (plan) or Gate 3 (changeset) retries the autonomous phase up to 2 times with rejection feedback as input, then falls back to the prior collaborative phase without requiring a full restart.
7. Partial accept/reject of distill changeset items is supported; rejected items remain in the ledger as `rejected` without being promoted to accepted.

## Non-Goals

1. Eval-validated auto-apply of distill changesets. The `distill → apply` gate remains a human decision; autonomous self-modification is deferred.
2. Concurrent work units within a single git working tree. Concurrent work is supported across branches (the current branch selects the work unit), not within one checkout with multiple active work units.
3. A GUI or TUI beyond the Pi TUI for reviewing changesets, handoff briefs, or ledger entries.
4. Cross-repository or multi-repo work units. One work unit = one repository.
5. Real-time streaming of subagent output to the parent session's TUI. Subagent output is collected and reported at completion.
6. Automatic rollback of `/craft` changes if the user invokes `/craft` a second time without resolving a `failed` state. The human controls the git working tree.
7. Local/self-hosted inference for any phase. Cloud providers only (Anthropic and OpenAI via `@earendil-works/pi-ai`).

## Design

### 1. Work-unit folder schema

Every piece of work lives under a single directory rooted at `.magpi/work/<slug>/`. All harness-written files are within this tree. Nothing outside `.magpi/` is written by the harness state machine (only by the agents it spawns, which write to the project tree).

#### Top-level `.magpi/` layout

```
.magpi/
  ledger.jsonl             # durable learnings ledger, append-only JSONL (one entry per line)
  work/
    <slug>/                # one directory per work unit
      work.json            # canonical state + metadata file (machine-written)
      plan.md              # the approved plan artifact (written during plan sub-phase)
      critique-todos.json  # structured critique todo list (written during critique sub-phase)
      changeset.json       # distill-proposed changeset (written during distill sub-phase)
      sessions/            # Pi JSONL transcripts, one file per launched session
        <ISO>_<uuid>.jsonl # written natively by Pi via PI_CODING_AGENT_SESSION_DIR redirect
      briefs/
        explore-to-define.json    # handoff brief from explore → define
        define-to-plan.json       # handoff brief from define → plan
        plan-to-craft.json        # handoff brief from plan → craft (crosses Gate 1)
        craft-to-critique.json    # handoff brief from craft → critique (crosses Gate 2)
        critique-to-distill.json  # handoff brief from critique → distill
      seams/
        <slug>-explore-seam.md    # optional: human-readable seam note (not machine-read)
```

No manifest file listing session paths is required. The session-dir redirect ensures every `.jsonl` under `sessions/` belongs to this work unit by construction. `loadEntriesFromFile` can be called directly on each file in `sessions/` by enumeration.

#### `work.json` schema (canonical)

`work.json` is the single source of truth for state. It is written atomically (write to a `.tmp` file, then `rename`) by the harness on every state transition.

```ts
interface WorkUnit {
  // identity
  slug: string;               // kebab-case, derived at shape-time (see §3)
  branch: string;             // git branch name this work unit is bound to
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp of last state write

  // lifecycle
  state: WorkUnitState;       // see §2 for the full state set
  retryCount: number;         // gate-rejection retry counter (reset on phase advance)
  blockedReason?: string;     // set when state = "blocked"; human-readable

  // phase-level sub-state (tracks position within a multi-sub-phase umbrella)
  phase: WorkUnitPhase;       // see values below

  // artifact paths (relative to .magpi/work/<slug>/)
  artifacts: {
    plan?: string;            // "plan.md" once written
    critiqueTodos?: string;   // "critique-todos.json" once written
    changeset?: string;       // "changeset.json" once written
  };

  // brief tracking: which briefs have been written
  briefs: Partial<Record<BriefName, string>>;  // brief name → relative path

  // session manifest (informational, not load-bearing — sessions/ dir is authoritative)
  sessionFiles: string[];     // relative paths under sessions/, in order of creation

  // lineage
  parentSlug?: string;        // set if this work unit was spawned as a child (critique minor-fix)
  childSlugs?: string[];      // spawned child work units, if any
}

type WorkUnitState =
  | "created"
  | "shaping"               // explore or define sub-phase is active
  | "plan-pending-gate"     // autonomous plan written; awaiting Gate 1 (/craft invocation)
  | "crafting"              // autonomous craft is running or was interrupted
  | "awaiting-reflect"      // craft completed; Gate 2 — human may invoke /reflect or ship
  | "reflecting"            // critique sub-phase is active
  | "changeset-pending-gate"// autonomous distill written; awaiting Gate 3 (/apply invocation)
  | "completed"             // changeset approved and applied, or work shipped without /reflect
  | "abandoned"             // explicitly closed without completion
  | "blocked"               // craft failure, retry budget exhausted; awaiting human action
  | "rework";               // critique critical-severity todos triggered in-place rework

type WorkUnitPhase =
  | "explore"
  | "define"
  | "plan"
  | "craft"
  | "critique"
  | "distill"
  | "none";   // terminal states

type BriefName =
  | "explore-to-define"
  | "define-to-plan"
  | "plan-to-craft"
  | "craft-to-critique"
  | "critique-to-distill";
```

#### `plan.md` format

Markdown. Front matter carries `status: draft | approved | rejected` and `retryCount: <n>`. Body is the plan itself: a sequenced list of independently-deployable commits, each with a title, description, and acceptance criteria. The plan sub-phase autonomous agent writes this file; it is not templated — the agent generates the markdown. Approved plans are read by `plan-to-craft` brief generation.

#### `critique-todos.json` schema

```ts
interface CritiqueTodos {
  generatedAt: string;       // ISO timestamp
  workSlug: string;
  items: CritiqueTodoItem[];
}
interface CritiqueTodoItem {
  id: string;                // stable slug, e.g. "ct-001"
  severity: "critical" | "minor";
  description: string;       // human-readable statement of the issue
  location?: string;         // file path (or file:line) where the issue lives, if known
  disposition?: "fix-in-place" | "spawn-child" | "deferred" | "accepted-as-is";
                             // set by human during critique session; null until decided
}
```

#### `changeset.json` schema

```ts
interface Changeset {
  generatedAt: string;
  workSlug: string;
  retryCount: number;
  items: ChangesetItem[];
}
interface ChangesetItem {
  id: string;                // stable slug, e.g. "cs-001"
  rank: number;              // 1 = highest priority
  lens: LensName;            // which distill lens produced it
  routingType: RoutingType;  // the routing taxonomy category
  artifactType: ArtifactType;// which file/artifact type would be modified
  targetPath: string;        // path to the artifact to be modified (relative to repo root)
  description: string;       // human-readable description of the change
  rationale: string;         // why this friction recurred
  ledgerEntryId: string;     // cross-reference to ledger.jsonl entry
  reviewStatus: "pending" | "accepted" | "rejected";  // set at Gate 3
  rejectionNote?: string;    // human note if rejected
}

type LensName = "duplicated-work" | "rabbit-holes" | "context-waste" | "handoff-gaps";
type RoutingType =
  | "codebase-fact"        // → AGENTS.md or project memory
  | "repeated-method"      // → project skill
  | "preventable-mistake"  // → hook
  | "rabbit-hole-prompt"   // → edit command/agent
  | "duplicated-context"   // → widen handoff brief
  | "context-waste"        // → tune context hooks / model profile
  | "user-taste"           // → user memory
  ;
type ArtifactType =
  | "agents-md" | "project-memory" | "project-skill"
  | "hook" | "command" | "handoff-brief-prompt" | "user-memory"
  | "model-profile";
```

#### Handoff brief schema

All briefs share a common envelope. `briefType` identifies the seam. Slot names are fixed; sub-phases write to these slots via a template prompt — the schema is enforced, not advisory.

```ts
interface HandoffBrief {
  briefType: BriefName;
  schemaVersion: "1";        // increment when slots change; readers must check
  writtenAt: string;         // ISO timestamp
  sourcePhase: WorkUnitPhase;
  targetPhase: WorkUnitPhase;
  workSlug: string;
  branch: string;

  slots: {
    decisions: Array<{ decision: string; rationale: string }>;
    constraints: string[];
    artifacts: Array<{ description: string; path: string }>;   // all paths must exist on disk
    openQs: string[];
    doNotRevisit: string[];  // dead-ends already ruled out
  };
}
```

Artifact paths in `slots.artifacts` are validated to exist on disk by the extension before the brief is injected into the next session. A missing artifact path causes the transition to fail with a clear error logged to `work.json.blockedReason`; the state transitions to `"blocked"`.

---

### 2. Work-unit lifecycle state machine

#### State set

| State | Description |
|---|---|
| `created` | work.json written, branch created, no Pi session started yet |
| `shaping` | explore or define sub-phase is the active Pi session |
| `plan-pending-gate` | plan.md written; Gate 1 open; awaiting `/craft` invocation |
| `crafting` | craft autonomous session running or was mid-session when process died |
| `awaiting-reflect` | craft session exited normally; Gate 2 open |
| `reflecting` | critique or distill sub-phase is the active Pi session |
| `changeset-pending-gate` | changeset.json written; Gate 3 open; awaiting `/apply` |
| `completed` | work unit closed (shipped with or without /reflect, or changeset applied) |
| `abandoned` | explicitly closed via `/shape --abandon <slug>` or equivalent |
| `blocked` | craft autonomous retry budget exhausted; human action required |
| `rework` | critique emitted critical todos; in-place rework re-entered; treated as `crafting` for crash recovery purposes |

#### Full transition graph

Each row is: `from_state → to_state : trigger [guard]`.

```
created                 → shaping                  : harness boots explore session
                                                      [work.json exists, branch exists]

shaping (explore)       → shaping (define)          : human issues /define sub-command within Pi session
                                                      [explore-to-define brief written]
                                                      SYSTEM-DRIVEN (internal seam)

shaping (define)        → plan-pending-gate         : plan sub-phase completes (autonomous, writes plan.md)
                                                      [plan.md written, define-to-plan brief written]
                                                      SYSTEM-DRIVEN (internal seam)

plan-pending-gate       → crafting                  : human invokes /craft
                                                      [state == plan-pending-gate, plan.md exists]
                                                      HUMAN-DRIVEN (Gate 1)

plan-pending-gate       → shaping (define)          : human rejects plan (Gate 1 rejection, retryCount >= 2)
                                                      [retryCount >= 2]
                                                      HUMAN-DRIVEN (fallback after retry budget)

plan-pending-gate       → plan-pending-gate         : gate-rejection retry
                                                      [retryCount < 2, rejection feedback provided]
                                                      SYSTEM-DRIVEN (retry autonomous plan)

crafting                → awaiting-reflect          : craft session exits cleanly (no unresolved failures)
                                                      [state == crafting, no pending craft errors]
                                                      SYSTEM-DRIVEN

crafting                → blocked                   : craft session exits with failure AND retryCount >= 2
                                                      [craft failure detected, retryCount >= 2]
                                                      SYSTEM-DRIVEN

crafting                → crafting                  : craft session died mid-session (process crash)
                                                      [state was crafting on startup, resume]
                                                      CRASH-RECOVERY (see §2 crash recovery)

awaiting-reflect        → reflecting                : human invokes /reflect
                                                      [state == awaiting-reflect]
                                                      HUMAN-DRIVEN (Gate 2 — optional)

awaiting-reflect        → completed                 : human ships without invoking /reflect
                                                      (no harness action; state transitions on /shape
                                                       invocation with --close flag or manual edit)
                                                      HUMAN-DRIVEN

reflecting (critique)   → reflecting (distill)      : distill sub-phase starts (autonomous)
                                                      [critique-todos.json written,
                                                       critique-to-distill brief written]
                                                      SYSTEM-DRIVEN (internal seam)

reflecting (critique)   → rework                    : critique produced critical todos AND human
                                                      confirms fix-in-place disposition
                                                      [critique-todos.json has critical items,
                                                       human sets disposition=fix-in-place]
                                                      HUMAN-DRIVEN

rework                  → reflecting (distill)      : rework craft session exits cleanly
                                                      SYSTEM-DRIVEN

rework                  → blocked                   : rework craft failures, retryCount >= 2
                                                      SYSTEM-DRIVEN

reflecting (distill)    → changeset-pending-gate    : distill autonomous session writes changeset.json
                                                      SYSTEM-DRIVEN

changeset-pending-gate  → completed                 : human invokes /apply (Gate 3 approval)
                                                      [all changeset items have reviewStatus set]
                                                      HUMAN-DRIVEN (Gate 3)

changeset-pending-gate  → reflecting (distill)      : human rejects entire changeset AND retryCount < 2
                                                      [retryCount < 2, rejection feedback provided]
                                                      HUMAN-DRIVEN (Gate 3 rejection, retry)

changeset-pending-gate  → changeset-pending-gate    : partial accept/reject — some items accepted,
                                                      some rejected; no retry needed
                                                      HUMAN-DRIVEN

changeset-pending-gate  → reflecting (distill)      : full rejection, retryCount < 2
                                                      SYSTEM-DRIVEN (retry distill)

changeset-pending-gate  → reflecting (critique)     : full rejection, retryCount >= 2
                                                      HUMAN-DRIVEN (fall back to collaborative phase)

blocked                 → crafting                  : human resolves the blocking issue and invokes /craft
                                                      [state == blocked, human confirms ready]
                                                      HUMAN-DRIVEN

any (except completed,
  abandoned)            → abandoned                 : human invokes /shape --abandon <slug>
                                                      HUMAN-DRIVEN
```

#### State storage and mutation authority

State is stored in `work.json` (`state` field + `phase` field). The **harness Node.js process** is the sole mutation authority. Pi sessions do not write to `work.json` directly. At session shutdown, the extension calls the harness's state-transition API (exposed as a local IPC socket or a CLI call) to advance state.

The harness writes `work.json` atomically: write to `work.json.tmp`, then `rename()`. On crash, an orphaned `.tmp` file is treated as if the transition did not complete (see crash recovery below).

#### Human-driven vs. system-driven transitions

**Human-driven** transitions require an explicit user action — invoking a command or answering a prompt. The harness never auto-advances past these.

**System-driven** transitions fire automatically when their guard conditions are satisfied, without user interaction. They always happen within an umbrella invocation.

#### Crash recovery

On startup of any `/shape`, `/craft`, or `/reflect` command, the harness reads `work.json` and applies the following recovery rules:

| `work.json` state on startup | Recovery action |
|---|---|
| `shaping` (any sub-phase) | Resume: boot the Pi session with the same `PI_CODING_AGENT_SESSION_DIR` redirect. The last session file in `sessions/` is the continuing session. |
| `plan-pending-gate` | No-op. The plan is already written. Display the plan; prompt human to invoke `/craft` or provide rejection feedback. |
| `crafting` or `rework` | Resume: the craft was interrupted. Boot the Pi session. Log a note to the session context via `before_agent_start` that the previous session was interrupted and provide the last checkpoint git SHA (see §5). |
| `awaiting-reflect` | No-op. Prompt human to invoke `/reflect` or close the work unit. |
| `reflecting` (any sub-phase) | Resume: boot the Pi session with the current sub-phase's brief as seed. |
| `changeset-pending-gate` | No-op. Display the changeset for review. |
| `blocked` | Display `blockedReason`. Prompt human for resolution. |
| `completed` / `abandoned` | No-op. Display status. |

If `work.json` is absent but `.magpi/work/<slug>/` exists (partial folder, crash during `created` transition), the harness deletes the folder and treats the work unit as non-existent, logging a warning.

If `work.json.tmp` exists alongside `work.json`, the `.tmp` file is discarded (the rename did not complete; `work.json` is the last valid state).

---

### 3. Slug and branch origin

#### Default behavior: harness-derived slug, harness-created branch

When `/shape` is invoked with no `--branch` flag:

1. The explore sub-phase runs. When the human signals transition to define (see §7 below), the harness reads the explore session's final summary from the last `session_shutdown` brief.
2. The harness derives a kebab-case slug from the explore summary using this algorithm:
   - Extract the first meaningful noun phrase from the summary (up to 5 words).
   - Lowercase, replace spaces/underscores/slashes with `-`, strip all non-alphanumeric-hyphen characters.
   - Truncate to 40 characters.
   - Append a 4-character hex suffix derived from `crc32(summary)[0..3]` to guarantee uniqueness within the repo (collision probability negligible at single-digit concurrent work units).
   - Example: "Add OAuth2 login flow" → `add-oauth2-login-flow-3a1f`.
3. The harness runs `git checkout -b <slug>` from the current branch. The slug IS the branch name. `work.json.branch` = `<slug>`.
4. The harness creates `.magpi/work/<slug>/` and writes `work.json` with `state: "created"`.

The slug algorithm is deterministic given the same input. The harness is the source of truth for both the slug and the branch; no external naming convention is assumed.

#### Escape hatch: adopt an existing branch

`/shape --branch <existing-branch>` skips slug derivation and branch creation:

1. The harness checks out `<existing-branch>`.
2. The slug is derived from the branch name itself: apply the same kebab-case normalization, but skip the crc suffix if the name is already unique within `.magpi/work/`.
3. If `.magpi/work/<derived-slug>/` already exists and has a `work.json`, the harness treats this as **resume** (see below). Otherwise it creates a fresh work unit.

#### Resume behavior: `/shape` on a branch that already has a work unit

If `work.json` exists for the current branch's slug, `/shape` resumes rather than creating a new work unit:

- State is read from `work.json`. Recovery rules from §2 apply.
- A new work unit is NOT created. No branch is created.
- If the user explicitly wants a new work unit on the same branch, they must first close the existing one with `/shape --abandon <slug>` or by advancing it to `completed`.

#### Branch ↔ folder link

`work.json.branch` stores the git branch name. `work.json.slug` stores the folder name. The link is bidirectional: given a branch, find the work unit by `ls .magpi/work/` and read `work.json.branch`; given a slug, the folder path is `.magpi/work/<slug>/`.

The harness does not enforce that the git working tree is on the correct branch at all times — it reads `git rev-parse --abbrev-ref HEAD` on each command invocation and emits a warning if the current branch does not match any known `work.json.branch`. It does not block execution.

---

### 4. Gate-rejection re-entry

#### Gate 1 — Plan rejection

Gate 1 fires when the human invokes `/craft` after `/shape`. If the human instead provides rejection feedback (via a `-m` flag or an interactive prompt at Gate 1), the harness:

1. Reads `work.json.retryCount`.
2. If `retryCount < 2`: increments `retryCount`, records the rejection feedback in `plan.md` front matter (`rejectionFeedback: "<text>"`), and re-runs the autonomous plan sub-phase with the prior `define-to-plan` brief **plus** the rejection feedback prepended as a `before_agent_start` system-prompt injection. The new plan overwrites `plan.md`. The rejection event is appended to `ledger.jsonl` with `status: observed` and `lens: null` (recorded for /distill context, not as a friction signal).
3. If `retryCount >= 2`: transitions to `shaping (define)` — drops back to the collaborative define sub-phase. The prior plans and their rejection reasons are preserved in `plan.md` as a versioned history (appended with H2 headers `## Attempt 1`, `## Attempt 2`, etc.). The human re-engages define to re-specify; the retryCount resets to 0 on successful define→plan transition.

Rejection feedback is supplied as: `pi /shape --reject-plan -m "Feedback text"` (proposed default, revisable). If `-m` is omitted, Pi prompts interactively before re-running.

#### Gate 3 — Changeset rejection

Gate 3 fires at `/apply`. The human reviews `changeset.json` in the distill session (see §8 for UX). Three outcomes are possible:

**Full rejection:** all items set to `reviewStatus: "rejected"`. Behaves identically to Gate 1 rejection: retryCount check, re-run distill with rejection feedback, or fall back to critique if retryCount >= 2.

**Partial rejection:** some items `accepted`, some `rejected`. This is NOT a retry trigger. The harness:
1. Sets all rejected items to `reviewStatus: "rejected"` in `changeset.json`.
2. Writes rejected items back to `ledger.jsonl` with `status: "rejected"` (not promoted to `accepted`). They remain in the ledger with their current `recurrenceCount` and `confidence` but will not be proposed again unless the confidence resets via decay (see §6).
3. Applies only the accepted items. Transitions to `completed`.

**Full acceptance:** all items set to `reviewStatus: "accepted"`. Applies all items. Transitions to `completed`.

Rejection feedback is stored in each rejected item's `rejectionNote` field. The rejection is itself a signal: if the same friction signature is rejected across multiple work units, `/distill` will note the pattern in the ledger but will not re-propose it until the ledger entry is manually reset to `observed` via the inspect command.

---

### 5. Craft failure handling

#### Retry budget and surface trigger

The craft sub-phase is autonomous. Tool failures (test failures, build errors, bash errors, file-not-found, etc.) are detected by the craft agent itself, which attempts autonomous recovery. The retry budget for autonomous recovery within a single craft session is **3 consecutive tool-failure cycles** (proposed default, revisable). After 3 consecutive failures on the same operation without successful forward progress, the agent writes a `BLOCKED` marker to `craft-to-critique.json` (repurposed as a failure report) and exits cleanly.

"Consecutive failure cycles" is defined as: 3 or more successive tool calls that all return errors, with no successful tool call interleaved. The agent tracks this counter in its own context; the harness does not need to count — it inspects the session transcript on craft exit to determine if the BLOCKED marker was written.

If the craft session exits without writing a BLOCKED marker but the working tree is in a modified state (uncommitted changes exist), the harness treats this as clean completion and transitions to `awaiting-reflect`.

#### `blocked` state and git checkpoint

Before the craft session is launched (in the `before_agent_start` hook), the harness:
1. Runs `git stash push -u --include-untracked -m "magpi-craft-checkpoint-<slug>"` (proposed default, revisable) to save the current working tree state. The stash ref is stored in `work.json` as `craftCheckpointRef`.
2. The stash is popped immediately after being created (it was only for snapshot purposes) — the stash serves as a rollback point, not a storage mechanism. On successful craft completion, `craftCheckpointRef` is cleared.

When the craft agent writes a BLOCKED marker and exits:
1. The harness transitions state to `blocked` and writes `blockedReason` from the BLOCKED marker's content.
2. The working tree remains in its current state (partially applied changes are visible to the human).
3. The human can inspect the partial work, resolve the blocking issue manually, and then invoke `/craft` to resume (see below).

If `retryCount >= 2` for craft failures across separate `/craft` invocations (not within one session), the harness transitions to `blocked` and does not auto-retry. It informs the human that the retry budget is exhausted.

#### Resume UX

`/craft` invoked on a work unit in `crafting` or `blocked` state resumes rather than restarts:
- State transitions to `crafting`.
- The craft session is booted with a `before_agent_start` injection that includes: "This is a resumed craft session. The previous session was interrupted or blocked. The last checkpoint was at git SHA `<craftCheckpointRef>`. Review the current working tree state and continue from where the previous session left off."
- The `plan-to-craft` brief is re-injected as the seed context.

---

### 6. Distill synthesis, conflict resolution, and ledger mechanics

#### Multi-agent fan-out

The distill sub-phase uses the orchestrator→worker→critic topology (ADR §7). One worker per lens:

| Worker | Lens | What it reads | What it looks for |
|---|---|---|---|
| `duplicated-work-worker` | `duplicated-work` | All sessions in `sessions/`; tool-call `arguments` across sessions | Identical or near-identical tool calls repeated across sessions; same file read multiple times without change; same bash command run multiple times |
| `rabbit-holes-worker` | `rabbit-holes` | Session timestamps, `parentId` tree, `stopReason` fields | Long chains of tool calls that dead-end (stopReason != success); earliest point where a redirect signal was present but not acted on; branches in the `parentId` tree that were abandoned |
| `context-waste-worker` | `context-waste` | Per-turn `usage.cost` and `usage.{input,output,cacheRead}` deltas; tool-result sizes | Tool results that inflated the context window without contributing to the final output; turns with high cost and no forward-progress tool calls following them |
| `handoff-gaps-worker` | `handoff-gaps` | Content of briefs in `briefs/`; re-derivations in later sessions | Facts or decisions established in session N that were re-derived from scratch in session N+1; questions marked `open_qs` in one brief that were never answered |

Each worker receives:
- The list of `.jsonl` file paths under `sessions/` for this work unit.
- The briefs directory path.
- Read access via `loadEntriesFromFile` from `@earendil-works/pi-coding-agent` (the harness imports this; it is not re-implemented).
- The existing `ledger.jsonl` entries for context (to avoid proposing already-rejected items).

Workers write structured findings to temporary JSON files in a scratch directory inside the work unit folder (`.magpi/work/<slug>/_distill-scratch/`). The scratch directory is deleted after the distill session completes.

#### CompactionEntry handling

Every worker, before processing a session file, calls `getLatestCompactionEntry()` from `@earendil-works/pi-coding-agent`. If a `CompactionEntry` is present:
- Entries before `firstKeptEntryId` are treated as a lossy zone. The worker logs a `lossy_boundary` annotation in its findings.
- The worker processes only entries at or after `firstKeptEntryId` for full-fidelity analysis.
- The compaction summary is used as a low-fidelity supplement for context, not for signal extraction.
- Sessions where >50% of entries are in the lossy zone are flagged in the distill output as `low_fidelity: true`.

#### Synthesis pass and conflict resolution

After all four workers complete, a synthesis-pass orchestrator reads all worker findings and:

1. Groups findings by the session span they reference (a span = a contiguous sequence of session entries, identified by `[firstEntryId, lastEntryId]`).
2. For spans where multiple lenses fired, applies the following fix-type priority ordering to select the primary fix:
   - Priority 1 (highest): `hook` — a deterministic enforcement fix
   - Priority 2: `handoff-brief-prompt` — widening a handoff brief
   - Priority 3: `agents-md` or `project-memory` — adding a codebase fact
   - Priority 4: `command` — editing a command or agent prompt
   - Priority 5 (lowest): `model-profile` or `project-skill`
3. The highest-priority fix type wins for the primary `routingType`. The secondary lens's finding is preserved as a `secondaryFindings` array on the changeset item (proposed default, revisable — a combined finding may be preferred in some cases). The synthesis pass may emit a combined finding if the two lenses' fixes are non-overlapping (e.g., both a hook fix and a brief-widening fix address different aspects of the same span).
4. Each finding is cross-referenced against `ledger.jsonl` by its `signature` (see ledger schema below). New findings become new ledger entries; existing findings have their `recurrenceCount` incremented.
5. Only findings with `recurrenceCount >= 2` (proposed default, revisable) are included in the `changeset.json` as proposed corrections. Findings with `recurrenceCount == 1` are written to the ledger as `status: observed` but produce no changeset item.
6. The synthesis pass ranks changeset items by: `recurrenceCount DESC`, then `confidence DESC`, then `fix-type priority ASC` (hooks first).

#### Ledger schema (`ledger.jsonl`)

Each line is a JSON object conforming to:

```ts
interface LedgerEntry {
  id: string;              // stable UUID (uuidv7 at first sighting)
  lens: LensName | null;   // null for gate-rejection recordings
  signature: string;       // content-hash of the finding's core pattern (for deduplication)
  description: string;     // human-readable summary of the friction
  routingType: RoutingType | null;
  artifactType: ArtifactType | null;
  firstSeenWorkSlug: string;
  firstSeenAt: string;     // ISO timestamp
  lastSeenWorkSlug: string;
  lastSeenAt: string;      // ISO timestamp
  recurrenceCount: number; // 1 = first sighting, 2+ = recurrence
  confidence: number;      // float [0.0, 1.0]; starts at 0.5, increments by 0.2 per recurrence, capped at 1.0
  status: LedgerEntryStatus;
  rejectionNote?: string;  // set when status = "rejected"
}

type LedgerEntryStatus =
  | "observed"    // first sighting, no changeset proposed yet
  | "promoted"    // recurrenceCount >= 2; included in a changeset proposal
  | "accepted"    // human accepted the changeset item
  | "rejected"    // human rejected the changeset item at Gate 3
  | "evicted";    // manually pruned via the inspect command
```

**Confidence decay rule:** if a ledger entry with `status: accepted` has `lastSeenAt` more than 90 days in the past and no new sighting has occurred, confidence decays by 0.1 per 30-day interval until it reaches 0.3 (floor). At 0.3 the entry transitions from `accepted` to `observed` and would require re-promotion. This prevents stale fixes from having perpetual authority. The decay is computed lazily at read time; no background job is required.

**Signature derivation:** the signature is `sha256(<lens> + ":" + <routingType> + ":" + <normalizedDescription>)[0..12]` where `normalizedDescription` is the description lowercased and stop-word-stripped. Two findings are considered the same friction pattern if their signatures match.

#### Inspect and prune command surface

`/distill --inspect` opens the ledger in a tabular view within the Pi session (rendered as markdown table in the TUI context).

`/distill --prune <id>` sets a ledger entry to `status: "evicted"` and removes it from future changeset proposals. This is the only manual ledger mutation allowed. Evicted entries are retained in `ledger.jsonl` for audit purposes (they are never deleted).

`/distill --reset <id>` resets a `rejected` or `accepted` entry back to `observed`, clearing `rejectionNote` and resetting `recurrenceCount` to 1 (proposed default, revisable). Used when a previously-rejected fix should be reconsidered.

---

### 7. Critique todo disposition and the explore↔define seam

#### Critique todo disposition

The critique sub-phase is collaborative. The LLM runs its own multi-lens code review (correctness, design, tests, edge cases) and presents findings to the human as a guided tour. The output is `critique-todos.json` (schema in §1).

**Severity split:**

- **Critical** todos (correctness bugs, security issues, data-loss risks, broken tests): the human sets `disposition: "fix-in-place"`. The harness transitions to `rework` state. A new craft session is launched with the `critique-to-distill.json` brief repurposed as a `rework-brief.json` that lists exactly the critical items to fix. The rework session uses the same retry budget as a regular craft session (3 consecutive failure cycles). On rework completion, state transitions back to `reflecting (distill)`.
- **Minor** todos (style, naming, non-blocking improvements, tech-debt): the human sets `disposition` to one of:
  - `"deferred"` — recorded in `critique-todos.json`, not fixed now, not spawned. The distill lens will see these as unresolved minor items in the transcript.
  - `"spawn-child"` — the harness creates a new child work unit (new `work.json` with `parentSlug` set) with the minor todo as the explore seed. The child work unit starts in `created` state on the current branch.
  - `"accepted-as-is"` — intentionally accepted, will not be fixed.

The disposition for each item is set during the collaborative critique session via the human answering prompts from the LLM guide. The LLM proposes a default disposition for each item; the human confirms or overrides.

If the human bypasses the critique session entirely (goes directly from `awaiting-reflect` to invoking `/distill`), `critique-todos.json` is not written and distill runs without it. This is allowed; the distill session notes in its output that no critique todos were provided.

#### Explore↔define seam (explicit user signal)

The explore sub-phase is open-ended and collaborative. The define sub-phase is also collaborative but has a specific deliverable (a typed spec/brief that the autonomous plan phase will act on). The transition must be explicit.

**Mechanism:** within the explore Pi session, the human issues `/define` as a Pi slash-command. This:
1. Triggers the `session_shutdown` hook, which writes the `explore-to-define` brief by asking the LLM to summarize the explore session into the fixed brief slots.
2. Calls `newSession({ withSession })` (the `handoff.ts` precedent) to open a fresh Pi session pre-seeded with the `explore-to-define` brief.
3. Transitions `work.json.phase` from `explore` to `define`.

The harness does NOT attempt to detect the explore→define transition implicitly (e.g., by detecting that the human has been silent for N minutes, or by parsing session content for "we've decided"). Implicit detection is fragile and rejected here. The human's `/define` invocation is the sole trigger.

The define→plan transition is system-driven: when the human is satisfied with the spec defined in the session and types `/plan` (another Pi slash-command), the same mechanism fires — `session_shutdown` writes the `define-to-plan` brief, a new autonomous session starts for the plan sub-phase. The plan session runs to completion (no mid-session human interaction required), writes `plan.md`, and exits.

---

### 8. Changeset review UX (GAP 8)

The distill session, after writing `changeset.json`, presents the changeset to the human in the Pi TUI as a structured review artifact. The review happens within the same distill Pi session (not in a separate tool).

**Review format:** the distill agent renders each changeset item as a markdown block:

```
## cs-001 [rank 1] [hook] — "Prevent re-derivation of DB schema on every craft session"
Lens: handoff-gaps | Routing: preventable-mistake | Artifact: .pi/config/hooks/before-craft.ts
Rationale: The DB schema was re-read from disk in 3 of the last 4 craft sessions despite
           being unchanged. A hook can inject it at session start.
Ledger: <ledger-id> | Recurrences: 3 | Confidence: 0.90
[A]ccept / [R]eject / [S]kip (decide later): _
```

Per-item accept/reject/skip is interactive within the session. "Skip" means the item remains in `changeset.json` with `reviewStatus: "pending"`. The human can skip an item and return to it; the session does not advance to Gate 3 until all items are `accepted` or `rejected` (no `pending` items remain).

The distill agent does NOT show the full diff of a proposed hook or skill inline. It shows the `targetPath` and a description. The human is expected to read the file separately if needed. This keeps the review session focused on the decision, not the implementation.

When all items are reviewed, the distill session writes the updated `changeset.json` with `reviewStatus` fields set and presents a summary: "N items accepted, M items rejected. Invoke `/apply` to apply accepted items." The session then exits.

---

### 9. Concurrent work units (GAP 10)

Concurrent work units are supported via the git branch model. The current git branch is the work-unit selector: when any magpi command is invoked, the harness reads `git rev-parse --abbrev-ref HEAD` and finds the matching work unit in `.magpi/work/` by `work.json.branch`.

Multiple work units can exist in `.magpi/work/` simultaneously (one per branch). Switching work units = switching branches with `git checkout`. No harness command is needed to switch work units; the human uses standard git.

The harness does not prevent two work units from being `crafting` at the same time if a human checks out a different branch and invokes `/craft`. This is intentional: the work tree state is managed by git (separate branches); the harness trusts that the human understands git branch semantics.

One constraint is enforced: a work unit in `crafting` state that was launched on the current branch but the branch has since been switched (i.e., another branch is now checked out) will emit a warning on the next harness command: "Work unit `<slug>` is in `crafting` state but the current branch is `<other>`. Proceed with caution."

---

### 10. Handoff brief schema and validation (GAP 11)

The handoff brief schema is defined in §1 (`HandoffBrief` interface). Here the validation rules and injection mechanism are specified precisely.

#### Validation before injection

Before a brief is injected into the next session's `before_agent_start` hook, the harness validates:

1. `schemaVersion` is `"1"`. If a different version is found, the harness emits an error and halts. (Schema migration is a manual task; no auto-migration for briefs.)
2. Every path listed in `slots.artifacts` exists on disk at the time of injection. Missing paths: the harness writes `blockedReason` to `work.json`, transitions to `blocked`, and does not start the next session.
3. `slots.decisions` has at least one entry (the brief must carry at least one decision with rationale).
4. `briefType` matches the expected seam (e.g., a brief at the `explore-to-define` seam must have `briefType: "explore-to-define"`).

Validation failures produce a human-readable error message naming the exact field and path that failed.

#### Injection mechanism

The brief is injected via the `before_agent_start` hook. The hook reads the brief JSON from disk and serializes it as a structured markdown block prepended to the system prompt:

```
=== HANDOFF BRIEF (explore → define) ===
Schema version: 1 | Written at: <ISO>

DECISIONS (carry forward, do not re-derive):
- <decision>: <rationale>

CONSTRAINTS:
- <constraint>

ARTIFACTS (read these before starting):
- <description>: <path>

OPEN QUESTIONS (resolve during this phase):
- <question>

DO NOT REVISIT (already ruled out):
- <dead-end>
=== END BRIEF ===
```

The brief is prepended, not appended, so it appears before any other system prompt content and is cache-eligible (it does not change turn-to-turn within a session).

#### Version-stamping

`schemaVersion` is a string (not a number) to allow non-numeric versioning if needed. The current version is `"1"`. Any change to the slot names or types requires incrementing this version. The harness source code hard-codes the supported version and rejects unknown versions at validation time.

---

### 11. Subagent topology scope (GAP 12)

The orchestrator→worker→critic topology is available to phases as follows, mapped to the parent design doc §10 phased plan:

| Phase plan milestone | Phases that use subagents | Topology used | Spawn mechanism |
|---|---|---|---|
| Phase 4 (workflow commands, initial) | plan, craft | None yet — single-session, no subagents | N/A |
| Phase 5 (multi-agent) | distill | Fan-out: orchestrator spawns 4 lens workers in parallel, then synthesis pass | `pi --mode json -p --no-session` process spawn, capped at 4 concurrent |
| Phase 5 (multi-agent) | craft (complex tasks) | Orchestrator→worker→critic: task decomposition, parallel workers, critic pass | Same process spawn mechanism |
| Phase 5 (multi-agent) | plan | Researcher workers for codebase investigation | Process spawn |
| Phase 7 (tune) | critique | Optional critic worker for automated code review prior to human tour | Process spawn |

**Spawn mechanism (build-not-buy, per ADR §7):**

Process spawn is the primary mechanism:
```sh
pi --mode json -p --no-session \
   --tools "read,write,edit,bash,find,grep,ls" \
   --append-system-prompt "<worker role prompt>" \
   --session-dir /dev/null  # subagents do not write transcripts
   -p "<task prompt>"
```

The `--mode json` flag causes Pi to emit JSON `message_end` events on stdout. The harness reads stdout line by line, parsing `message_end` events for the worker's output. stderr is captured separately and logged to the work unit's scratch directory.

The SDK path (`createAgentSession()` with `SessionManager.inMemory()`) is the fallback for cases where process spawn is impractical (e.g., in-process testing). The primary production path is process spawn.

**Concurrency cap:** at most 4 subagent processes may run concurrently per work unit, enforced by a semaphore in the `tool_call` hook (per the backpressure design in `agent-harness-design.md` §6.3). This is a proposed default, revisable based on provider rate limits.

**Subagents do not write Pi session transcripts** (the `--session-dir /dev/null` flag). Only the parent orchestrator session writes a transcript to `.magpi/work/<slug>/sessions/`. This keeps the transcript corpus focused on the human-facing session, not internal fan-out chatter.

**Failure handling for subagents:** if a worker process exits non-zero or produces unparseable JSON, the orchestrator retries that worker once. If the retry also fails, the orchestrator proceeds without that worker's findings and logs a `worker_failure` annotation in the synthesis output. The distill session reports which workers failed. A complete fan-out failure (all 4 workers fail) transitions the distill session to `blocked`.

---

### 12. Pi integration specifics

All Pi hook, SDK, and env-var names used by the harness are listed here with their exact spellings. No synonyms or approximations. These are the integration contracts.

#### Extension hooks (registered in the magpi harness extension module)

| Hook name | When it fires | Magpi use |
|---|---|---|
| `session_start` | After session load, before first turn; carries `reason` and `previousSessionFile` | Inject the handoff brief for the incoming phase (read from `briefs/`); validate artifact paths; set `PI_CODING_AGENT_SESSION_DIR` context |
| `session_shutdown` | Before session teardown | Write the outgoing handoff brief to `briefs/`; advance `work.json` state via harness IPC; write craft checkpoint git SHA to `work.json` |
| `before_agent_start` | Before the agent's first turn in a session | Prepend the handoff brief as a structured system-prompt block; inject model profile context |
| `context` | Each turn, before the message array is sent to the model | Trim stale tool results; enforce the "lean active context" principle per §6.2 of `agent-harness-design.md`; drop entries the model no longer needs |
| `session_before_compact` | When Pi is about to compact the session | Write a brief summarizing the session state to `sessions/pre-compact-<timestamp>.json`; optionally replace Pi's default summarizer with a cheaper model to reduce compaction cost |
| `tool_call` | Before any tool executes | Enforce the subagent concurrency semaphore; gate subagent spawning; validate tool inputs for dangerous operations |

Hook names are exactly as listed here. They are registered in the magpi extension's `types.ts`-compatible registration object (see `@earendil-works/pi-coding-agent` `extensions/types.ts` for the registration API).

#### Session-dir redirect

```sh
PI_CODING_AGENT_SESSION_DIR=".magpi/work/<slug>/sessions"
```

Set in the harness's process environment before spawning each phase's Pi session. The path must be an absolute path in practice (resolved via `path.resolve()` before setting). The CLI flag equivalent is `--session-dir <path>`.

#### Headless subagent flags

```sh
pi --mode json -p --no-session
```

- `--mode json`: emit JSON events on stdout; no TUI
- `-p`: pipe mode (read prompt from stdin or `-p "<prompt>"`)
- `--no-session`: do not write a session transcript file

These are the exact flags from `@earendil-works/pi-coding-agent` `cli/args.ts`. Do not substitute alternatives.

#### Exported loader

```ts
import { loadEntriesFromFile } from "@earendil-works/pi-coding-agent";
```

Used by all distill workers. `loadEntriesFromFile(filePath: string): FileEntry[]` returns the parsed and migrated entries for a session file, handling `CURRENT_SESSION_VERSION` migration automatically. Never hand-parse the JSONL; always use this loader to remain compatible with future schema versions.

Also available: `getLatestCompactionEntry(entries: FileEntry[])` for CompactionEntry detection; `parseSessionEntries(content: string): FileEntry[]` for in-memory parsing if needed.

#### SDK headless path (fallback for in-process subagents)

```ts
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const session = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  // ...other config
});
await session.prompt("<worker task prompt>");
```

`SessionManager.inMemory()` ensures no JSONL file is written to disk for in-process subagents.

---

## Error Handling

### 1. Brief artifact path missing at injection time

**Trigger:** `session_start` or `before_agent_start` hook validates `slots.artifacts` paths; one or more paths do not exist on disk.

**Handling:** the hook writes `blockedReason: "Brief artifact missing: <path>"` to `work.json` and transitions state to `blocked`. The Pi session does not start. The harness prints an error to stderr: "Cannot start `<phase>` phase: artifact `<path>` referenced in `<brief-name>.json` does not exist. Resolve by ensuring the file exists, then re-invoke the command." No silent degradation.

### 2. Pi session crash mid-craft

**Trigger:** the Pi process exits unexpectedly (SIGKILL, OOM, etc.) while `work.json.state == "crafting"` or `"rework"`. The session JSONL may be incomplete (append-only, so entries up to the crash point are intact).

**Handling:** on the next `/craft` invocation, the harness detects the `crafting` state and applies crash recovery per §2. The `craftCheckpointRef` stash (written before session start) is available if the human wants to restore a clean state. The resumed session receives a `before_agent_start` injection noting the crash and providing the checkpoint SHA. If the stash ref is no longer valid (e.g., was manually popped), the harness logs a warning but does not block resumption — the stash is a convenience, not a hard requirement.

### 3. Distill worker process failure

**Trigger:** a lens worker spawned via `pi --mode json -p --no-session` exits non-zero or emits unparseable JSON.

**Handling:** the orchestrator retries the worker once with the same prompt. If the retry fails: the orchestrator proceeds without that lens's findings; the distill output includes a `worker_failures: ["<lens-name>"]` field; the changeset is generated from the remaining lenses only. If all 4 workers fail: the harness transitions state to `blocked` with `blockedReason: "All distill workers failed"` and exits the distill session. The scratch directory is retained for debugging.

### 4. `work.json` write failure (disk full, permissions)

**Trigger:** `writeFileSync` on `work.json.tmp` throws (disk full, permission denied, etc.).

**Handling:** the harness catches the exception, logs to stderr with the full error, and does NOT transition state (the last valid `work.json` is preserved). The current Pi session is allowed to continue (the state write is advisory during the session; the session itself is the source of truth during execution). On session exit, the harness retries the state write once. If it fails again, the harness logs an error and exits with code 1. Manual recovery: the human can inspect `work.json` and `work.json.tmp`, determine which is valid, and rename as appropriate.

### 5. Slug collision (two work units derive the same slug)

**Trigger:** the 4-char hex suffix from CRC32 collides with an existing slug in `.magpi/work/`.

**Handling:** on collision, the harness appends `-2` (then `-3`, etc.) to the slug until it is unique. This is deterministic and does not affect the branch name (branch name = slug, so the branch is renamed accordingly). Collision is logged as an info-level event.

### 6. Git checkout failure at work-unit creation

**Trigger:** `git checkout -b <slug>` fails (e.g., the branch already exists, or there are uncommitted changes that would be overwritten).

**Handling:** if the branch already exists, the harness checks whether a work unit exists for that branch (see §3 escape hatch). If yes, it offers to resume. If no, it errors with: "Branch `<slug>` already exists but has no associated work unit. Use `/shape --branch <slug>` to adopt it or resolve the conflict manually." If the checkout fails for another reason (uncommitted changes), the harness does not create the work unit and prints the git error verbatim.

### 7. `loadEntriesFromFile` throws on a corrupt JSONL file

**Trigger:** a session JSONL file was partially written (crash during append) and the last line is malformed JSON.

**Handling:** `loadEntriesFromFile` uses `migrateSessionEntries` internally, which processes lines one at a time. A malformed last line causes a parse error on that line only; preceding valid lines are returned. The harness catches the error from `loadEntriesFromFile`, logs a warning naming the file and the corrupt line number, and proceeds with the partial entries. The corrupt line is skipped. This is consistent with Pi's own crash-safe write behavior (the header precedes entries; a corrupt tail line is a known failure mode after a crash).

---

## Success Criteria

1. A developer can run `/shape`, progress through explore→define→plan, invoke `/craft`, and invoke `/reflect` on a real feature without any manual `/compact` or context re-feed between phases. Verified by a trace showing no user-initiated compact command in any session transcript.
2. After any work unit completes, `ls .magpi/work/<slug>/sessions/` contains one `.jsonl` file per Pi session launched for that work unit, all written natively by Pi (no symlinks, no copies). Verified by comparing session file mtimes with session launch times.
3. Killing a Pi craft session mid-run and re-invoking `/craft` successfully resumes without data loss or state corruption. Verified by inspection of `work.json` state before and after the kill, and by confirming the resumed session references the correct checkpoint SHA.
4. After 2+ work units are completed, `/distill` on a work unit that exhibits a recurring friction produces a `changeset.json` with at least one item with `recurrenceCount >= 2`. Verified by checking `ledger.jsonl` entries.
5. A gate-rejected plan retries at most twice before `/shape` reverts to `shaping (define)` state. Verified by checking `work.json.retryCount` and state after two rejections.
6. Partial changeset accept/reject at Gate 3 results in: accepted items applied, rejected items in `ledger.jsonl` with `status: "rejected"`, and `work.json.state == "completed"`. Verified by end-to-end test.
7. `loadEntriesFromFile` is the only mechanism used to read Pi JSONL transcripts in the distill workers (no hand-parsing). Verified by code review: no `JSON.parse` calls on `.jsonl` file content outside of `loadEntriesFromFile`.
8. All six Pi extension hooks (`session_start`, `session_shutdown`, `before_agent_start`, `context`, `session_before_compact`, `tool_call`) are registered in the magpi extension module and fire without error on a standard `/craft` run. Verified by a test session with hook-call logging enabled.

## Determination

### Work-unit folder as single source of truth

Everything the harness needs to recover, resume, or mine a piece of work lives under `.magpi/work/<slug>/`. There is no external database, no central manifest, and no state split across multiple locations. `work.json` is the only file that must be read to determine a work unit's current position. This makes crash recovery trivially deterministic and the folder trivially archivable.

### Slug = branch name

Making the slug identical to the git branch name eliminates a two-way mapping. One string identifies both the folder and the branch. The cost is that branch names are constrained to the kebab-case slug format; the benefit is that `git checkout <slug>` is the work-unit selector.

### Explicit seam signals (/define, /plan as slash-commands) rather than implicit detection

Implicit detection of the explore→define boundary (e.g., by parsing session content) is fragile and unspecified. The human issuing `/define` within the Pi session is an intentional design decision, not a convenience. The same pattern (`/plan` to trigger the define→plan transition) keeps the seam logic uniform and auditable.

### Gate retry cap of 2 (proposed default, revisable)

N=2 was chosen as the default retry cap for gate rejections. Two retries consume meaningful tokens but provide one initial attempt plus two correction attempts — sufficient for well-specified work, not so many that a bad plan loops indefinitely. The cap is stored in a harness configuration constant and can be changed without a spec update.

### Ledger recurrence threshold of 2 (proposed default, revisable)

A friction must be observed in at least 2 separate work units before a correction is proposed. One occurrence is noise; two is a pattern. The threshold errs toward under-correcting the harness, which is safer than over-correcting it with speculative changes.

### Confidence decay at 90-day intervals

Stale accepted corrections should not have perpetual authority. The 90-day window is long enough that active projects are unlikely to trigger spurious decay, but short enough that abandoned fixes don't block re-detection of new instances. The decay is computed lazily at read time to avoid background jobs.

### Subagents do not write transcripts

Distill subagent (lens worker) sessions write to `/dev/null` for session dir. The parent distill orchestrator session IS transcribed. This keeps the transcript corpus legible (4 parallel lens-worker transcripts per distill run would be noise, not signal) while preserving the orchestrator's reasoning for future `/distill` runs to mine.

### Process spawn over SDK for subagents (proposed default, revisable)

Process spawn (`pi --mode json -p --no-session`) is the primary spawn mechanism because it isolates failures to a child process, is the mechanism demonstrated by Pi's own example extension, and requires no in-process SDK state management. The SDK path (`createAgentSession()`) is the fallback for testing contexts where process spawn is impractical.

### Implementation sequencing mapped to §10 phased plan

The §10 phased plan in `docs/agent-harness-design.md` defines the build order. This spec's components map as follows:

| This spec's component | Parent doc phase |
|---|---|
| Work-unit folder schema (§1) + state machine (§2) + slug/branch (§3) | Phase 4 — workflow commands |
| Gate-rejection re-entry (§4) | Phase 4 — workflow commands |
| Craft failure handling (§5) | Phase 4 — workflow commands |
| Handoff brief schema + Pi hook integration (§§10–12) | Phase 2 — context hooks (prerequisite) + Phase 4 |
| Distill fan-out, synthesis, ledger (§6) | Phase 5 — multi-agent |
| Critique todo disposition (§7) | Phase 4 — workflow commands |
| Changeset review UX (§8) | Phase 4 — workflow commands |
| Concurrent work units (§9) | Phase 4 — workflow commands (no additional work; branch model suffices) |
| Subagent topology (§11) | Phase 5 — multi-agent |

Phase 2 (context hooks) must deliver `before_agent_start`, `context`, `session_before_compact`, and `tool_call` before Phase 4 can use them for handoff injection and concurrency enforcement. Phase 4 delivers the workflow commands and state machine. Phase 5 adds the distill fan-out and craft subagent workers.
