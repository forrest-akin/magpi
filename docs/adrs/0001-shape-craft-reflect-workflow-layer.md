---
title: "Adopt the shape/craft/reflect workflow layer with branch-linked work-unit folders, under-the-hood handoffs, and a transcript-mining distill phase"
status: Partly superseded by ADR 0003
number: 1
date: 2026-06-07
---

## Context

The magpi harness (`docs/agent-harness-design.md`) needed a workflow layer that
organizes the full software development lifecycle from exploration through
self-correction. The prior art — the cj-engineering plugin's six-phase model
(`brainstorm → spec → plan → work → review → learn`) — validated several
principles: documents on disk as source of truth, frontmatter/state as contract,
task-scoped context isolation, and write→assess→refine quality loops. But it had
three structural gaps that limited its long-term utility:

1. **Manual seams.** Each phase required explicit user re-invocation; there was no
   mechanism to carry context automatically from one phase to the next without manual
   `/compact` and re-feed.
2. **Single-session, skill-only learning.** The `learn` phase read only the current
   session and always emitted a SKILL.md, regardless of whether a skill was the most
   appropriate fix for the friction it observed.
3. **A harness that could not improve its own behavior.** Nothing in the loop fed
   learning back into the harness's prompts, hooks, commands, or memory — only into
   project-level knowledge.

A feasibility spike (`docs/spikes/2026-06-07-pi-transcript-feasibility-spike.md`)
established the load-bearing facts about the Pi runtime (`@earendil-works/pi-*`)
that constrain the architecture: Pi persists every session as append-only JSONL
with full tool calls, token usage, and timestamps; the session directory is
redirectable via `PI_CODING_AGENT_SESSION_DIR` / `--session-dir`; all four
extension hooks assumed by the design doc exist verbatim; the `session_start` /
`session_shutdown` lifecycle hooks plus `newSession({withSession})` provide the
auto-clear-and-reseed capability; and Pi has no native cross-session work-unit
grouping and no core subagent primitive — both of which magpi must supply.

## Decision

We adopt the shape/craft/reflect workflow layer over a branch-linked work-unit
folder, with under-the-hood handoffs between phases and a transcript-mining
/distill phase that makes the harness self-correcting.

In full: we chose this three-umbrella loop over cj-engineering's six-phase
manual-re-invocation model because it closes all three structural gaps —
auto-clear-and-reseed handoffs eliminate manual seams; the per-work-unit
`sessions/` folder populated by redirecting Pi's session directory provides the
multi-session transcript substrate that skill-only learning cannot mine; and the
routing taxonomy and learnings ledger let /distill emit the right artifact type for
each recurring friction pattern instead of issuing a skill every loop.

The seven committed positions that constitute this decision are:

### 1. Three umbrellas with character-differentiated sub-phases

The workflow is `/shape` (explore → define → plan), `/craft`, and `/reflect`
(critique → distill). The sub-phases have distinct characters: `explore`,
`define`, and `critique` are **collaborative** (the human is in the loop
continuously, exercising taste and judgment); `plan`, `craft`, and `distill` are
**autonomous** (the harness runs solo, then surfaces output for human review).

Rationale: grouping taste-dense phases under the same umbrella invocation keeps the
human-facing API small (three commands) while the character split ensures that phases
requiring human judgment never run unsupervised and phases that benefit from
uninterrupted autonomous execution are not interrupted by unnecessary checkpoints.
The LLM is better than a human at decomposing a defined problem into sequenced,
independently-deployable commits — so `plan` is autonomous, not collaborative.

### 2. Work anchor = branch-linked work-unit folder

Every piece of work is anchored by a `.magpi/work/<slug>/` folder, born at
`/shape`, linked to a git branch, that accumulates every phase's artifacts and the
session transcripts for every phase in `sessions/`. One folder = one piece of work,
spanning the entire loop.

Rationale: cj-engineering's `progress.json` tracked only the work phase. A
whole-loop durable record is the handoff substrate for under-the-hood phase
transitions AND the transcript corpus that `/distill` mines. The two roles are
inseparable — the same folder serves both. The folder is also the boundary that
answers the cross-session grouping problem the spike found: Pi has no native
work-unit grouping, so magpi must own it.

### 3. Native transcript capture via session-dir redirect, not a shim

Each phase's Pi session is launched with `PI_CODING_AGENT_SESSION_DIR` (or
`--session-dir`) pointed at `.magpi/work/<slug>/sessions/`, so Pi writes JSONL
transcripts natively into the work-unit folder. No copy/symlink shim is required
after each session.

Rationale: the spike (Q6) confirmed that Pi's session directory is overridable at
process startup, resolving Pi's session-dir via `config.ts:472`. This redirect
makes cross-session grouping automatic by construction: every JSONL file under
`sessions/` belongs to the work unit without any manifest reconciliation. A shim
approach would require a separate process step, introduce a race condition between
session exit and file copy, and add code that has no purpose beyond compensating for
a gap that the redirect already closes natively.

### 4. Under-the-hood handoffs via auto-clear-and-reseed

At each sub-phase seam the harness clears the conversation window and boots the next
phase pre-seeded with a typed handoff brief — no manual `/compact`, no manual
re-feed. The mechanism uses Pi's `session_start` / `session_shutdown` hooks plus
`newSession({withSession})`; the existing `examples/extensions/handoff.ts` extension
in the Pi repository is the working precedent. The brief has fixed slots:
`decisions` (with rationale), `constraints`, `artifacts` (paths the next phase
needs), `open_qs`, and `do_not_revisit` (dead-ends already ruled out).

Rationale: the typed brief with fixed slots creates two properties that an ad-hoc
carry cannot. First, it enforces a lean active context: the next phase's window gets
only what it needs, while the full raw transcripts remain in `sessions/` for
`/distill` to mine later — dissolving the "too little vs. too much context" tension
instead of trading it off. Second, the brief schema is itself a self-correctable
artifact: when `/distill` detects that a later phase re-derived something the prior
brief should have carried, the fix is to widen that brief's writing prompt, not to
issue a project skill.

### 5. Three human gates at umbrella seams and before apply

There are exactly three hard gates: `plan → craft` (approve the plan before tokens
burn on execution), `craft → reflect` (the human reviews the work on their own;
invoking `/reflect` is **optional, not obligatory**), and `distill → apply`
(approve the self-correction changeset before it lands). Invoking the next umbrella
command IS the gate. The harness never auto-advances past a gate.

Rationale: gates are placed at points where the cost of a wrong decision is high
enough that human judgment must be explicit. Between gates, sub-phase transitions
inside an umbrella are handled under the hood — the human is not interrupted for
internal housekeeping. The optionality of `/reflect` reflects the trade-off between
quality assurance and flow: sometimes the work is clearly good and the human should
be able to ship without being forced through a critique loop.

### 6. Self-correcting /distill that routes friction to the right artifact type

`/distill` mines all session transcripts in the work unit via a multi-agent fan-out
(one lens per worker: `duplicated-work`, `rabbit-holes` with earliest-redirect
signal, `context-waste`, `handoff-gaps`), routes each friction signature to its
best-fit fix according to a routing taxonomy, and proposes a single consolidated
ranked changeset. Nothing lands without review at the `distill → apply` gate. Each
finding is cross-referenced against a durable learnings ledger: first sighting logs
an observation; recurrence across works increments confidence and promotes the
finding to a proposed correction. Only recurring friction spends a correction.

The routing taxonomy governs what artifact type each friction pattern earns:

| What /distill detects | Best-fit fix |
|---|---|
| Re-derived a fact about this codebase it could have known | AGENTS.md line or project memory |
| Repeated a multi-step method across works | project skill (the only skill case) |
| Repeated a mistake a rule could prevent | hook (deterministic enforcement) |
| Rabbit-holed because a command's own prompt invited it | edit that command/agent |
| Duplicated work across sessions (context did not carry) | widen the handoff brief |
| Spent context on tokens that did not help | tune context hooks or model profile |
| A user-taste preference surfaced repeatedly | user memory |

Rationale: the skill-every-loop pattern of cj-engineering issues a SKILL.md
regardless of whether the friction was a missing fact, a repeated method, a
preventable mistake, or a prompt defect. Only one row in the taxonomy above earns a
skill. The taxonomy forces the resolution to match the failure mode. The recurrence
gate prevents noise from single-instance observations becoming permanent artifacts.
`/distill` is itself a magpi workflow — the harness eats its own dog food, using the
same orchestrator→worker→critic topology it provides to every other phase.

The spike confirmed that all per-turn signal required by the four lenses is present
in Pi's JSONL transcripts: full tool-call inputs, full tool-result outputs, per-turn
token usage and cost, timestamps, and the `parentId` tree for path reconstruction.
`/distill` must treat `CompactionEntry` records as lossy boundaries and prefer raw
per-session JSONL over post-compaction context; raw files retain everything up to
each compaction point.

### 7. Orchestrator→worker→critic topology is build-not-buy

Every phase can act as an orchestrator, spawning researcher workers and critic
workers using the inner `orchestrator → worker → critic` topology from the harness
design (§6.3). This topology is available to all phases as the inner engine — not
only to `/craft`. The spike confirmed that Pi has no core subagent primitive: the
`subagent` tool exists only as an example extension. magpi builds the inner topology
via process-spawn (`pi --mode json -p --no-session`) or recursive SDK
`createAgentSession()` with isolated `SessionManager.inMemory()` state.

Rationale: accepting build-not-buy here is the right call because the spawn
mechanism is solid (the example extension demonstrates it), the SDK headless path
works without a TUI, and owning the topology lets magpi parameterize concurrency,
model routing, and failure semantics rather than being constrained by a primitive's
API. This is an explicitly accepted cost, not an oversight.

## Consequences

### Intended

- Manual context management between phases is eliminated. The human interacts with
  collaborative sub-phases and explicit gate decisions; all other transitions are
  invisible.
- The full transcript record of every phase is available to `/distill` without
  having been paid for twice (the active context window never holds it).
- The harness becomes self-correcting over time: the SDLC it runs is itself subject
  to the same analysis it applies to project code.
- The routing taxonomy keeps `/distill`'s output varied and targeted — most runs
  produce no changeset at all, only ledger observations, until recurrence justifies
  a correction.

### Accepted trade-offs

- **Propose-one-changeset over auto-apply.** `/distill` proposes a changeset that a
  human must approve at the `distill → apply` gate. Eval-validated auto-apply is
  deferred. This sacrifices autonomy in exchange for safety and a single clean review
  point.
- **magpi owns work-unit grouping and state.** Pi provides no native cross-session
  grouping. magpi owns the work-unit folder, the state machine, and the slug-to-branch
  linkage. This is additional complexity the harness must maintain correctly; a bug in
  the state machine can corrupt the transcript record or break phase transitions.
- **Build-not-buy cost for the subagent topology.** The orchestrator→worker→critic
  inner engine is magpi's to build and maintain. Process-spawn topology has observable
  failure modes (process leak, stderr routing, JSON parse errors on model output) that
  a native primitive would absorb.
- **Compaction is a lossy boundary.** When Pi compacts a session, it replaces raw
  turns with a summary and marks the boundary with a `CompactionEntry`. `/distill`
  cannot recover the compacted turns. Phases that run long enough to trigger
  compaction will produce a lower-fidelity transcript for mining. Mitigation is to
  prefer short sessions per sub-phase and use the `session_before_compact` hook to
  write a brief before compaction fires.

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| cj-engineering's 6-phase manual-re-invocation model | Manual seams (user must re-invoke each phase), single-session scope for `learn`, always emits SKILL.md regardless of friction type, no mechanism to correct the harness itself. These are the three gaps this ADR's design closes. |
| Auto-apply the /distill changeset (no gate) | Deferred for safety. An autonomous self-modification to AGENTS.md, hooks, or commands without human review introduces unvalidated changes to the harness's own behavior with no rollback point. Revisit when an eval loop can validate that accepted corrections actually improved efficiency. |
| Copy/symlink shim to populate sessions/ after each Pi session | Rejected. The `PI_CODING_AGENT_SESSION_DIR` redirect makes Pi write transcripts natively into the work-unit folder at session open, with no post-session step. The shim adds code, a race window between session exit and copy completion, and complexity with no compensating benefit. |

## Status

Accepted (2026-06-07). [ADR 0003](0003-magpi-runs-inside-pi.md) supersedes decision 3's
launch of each phase's pi with `PI_CODING_AGENT_SESSION_DIR`: magpi runs inside pi and launches
no pi process.
