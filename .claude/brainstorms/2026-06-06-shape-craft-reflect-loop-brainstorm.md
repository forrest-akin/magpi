---
title: "magpi workflow layer — shape / craft / reflect loop"
type: brainstorm
status: captured
date: 2026-06-06
---

# magpi workflow layer — shape / craft / reflect loop

> Fleshes out the **workflow layer** that sits on top of the runtime harness in
> `docs/agent-harness-design.md`. Benchmarked against the cj-engineering plugin's
> `brainstorm → spec → plan → work → review → learn` loop; keeps what that proved
> works and closes its three biggest gaps.

## What We're Building

A workflow layer for the magpi harness that splits the SDLC into three umbrellas —
`/shape` (explore → define → plan), `/craft`, and `/reflect` (critique → distill) —
running over a durable, **branch-linked work-unit folder**. Handoffs between phases
are managed **under the hood** (auto-clear-and-reseed with a typed brief), so the
human never manually clears or re-feeds context between phases. The standout piece is
`/distill`: a transcript-mining phase that makes the **harness itself** more efficient
over time by routing recurring friction to the *most appropriate* fix — not a skill
every loop.

## Why This Approach

Builds on what cj-engineering proved works — documents-on-disk as the source of truth,
frontmatter/state as the contract, task-scoped context isolation, and write→assess→
refine quality loops — while closing its three biggest gaps:

1. **Manual re-invocation** between phases → **under-the-hood handoffs**.
2. **Single-session, skill-only "learn"** → **cross-work, transcript-driven `/distill`**
   that emits the right artifact type.
3. **A harness that can't improve its own behavior** → **every part of the SDLC the
   harness runs is self-correctable.**

**Trade-off accepted:** chose *propose-one-changeset* distill (a human gate) over
auto-apply / eval-gated auto-apply — less autonomy now in exchange for safety and a
single clean review point. Eval-validated auto-apply is deferred to a later stage.

## The Loop

```
/shape    explore   ● collaborative — understand the problem & the human's intent
          define    ● collaborative — pin the solution shape / design (human taste)
          plan      ○ autonomous   — decompose into tasks + sequence into
                                      independently-deployable, reviewable commits
            ╞══ GATE: approve the plan ══╡            (= you invoke /craft)
/craft     craft    ○ autonomous   — execute the plan
            ╞══ GATE: review the work yourself ══╡    (running /reflect is OPTIONAL)
/reflect  critique  ● collaborative — LLM-guided tour of the work → prioritized todos
          distill   ○ autonomous   — mine transcripts → ranked self-correction changeset
            ╞══ GATE: approve the changeset ══╡       (before it lands)
```

- **● collaborative** = human is in the loop continuously (taste/judgment phases).
- **○ autonomous** = harness runs solo, then surfaces output for review.
- **The umbrella commands are the gates.** Invoking the next umbrella (`/craft`,
  `/reflect`) *is* the gate — a deliberate human decision point. There are three:
  **plan → craft** (approve the plan), **craft → reflect** (review the work yourself;
  running `/reflect` is optional, never obligatory), and **distill → apply** (approve the
  changeset before it lands).
- **"Under the hood" = within and across the seam, not auto-advance.** Sub-phases
  *inside* an umbrella auto-clear-and-reseed with briefs (no manual `/compact`); when you
  invoke the next umbrella, the same under-the-hood handoff carries the brief across the
  seam. The harness never advances *past a gate* on its own.

## Key Decisions

- **D1 — Three umbrellas.** `/shape` (explore→define→plan), `/craft`, `/reflect`
  (critique→distill). Umbrellas group sub-phases that should flow together; the human
  lives in the collaborative sub-phases and at the two hard gates.
- **D2 — Work anchor = branch-linked work-unit folder.** A `.magpi/work/<slug>/` folder
  born at `/shape`, linked to a git branch, that accumulates **every** phase's artifacts
  **and** copies/links of **every** session transcript (`sessions/`). One folder = one
  piece of work. This is the handoff substrate *and* the `/distill` gold mine.
  *(Extends cj's per-work-phase `progress.json` to span the whole loop.)*
- **D3 — Phase character.** `explore` and `define` are **collaborative** (taste-dense);
  `plan`, `craft`, and `distill` are **autonomous**; `critique` is **collaborative**.
  Rationale for plan being autonomous: the LLM is better than a human at breaking a
  problem into tasks and sequencing them into independently-deployable, easily
  human-reviewable commits.
- **D4 — Three gates, at the umbrella seams + before apply.** `plan → craft` (approve the
  plan before tokens burn), `craft → reflect` (the human reviews the work on their own and
  is **not obligated** to run `/reflect`), and `distill → apply` (approve the
  self-correction changeset). Invoking the next umbrella command *is* the gate; the harness
  never auto-advances past one.
- **D5 — Handoff mechanic = auto-clear-and-reseed.** At each seam the harness clears the
  conversation and boots the next phase fresh — no manual `/compact`, no manual re-feed.
- **D6 — Lean active context vs. complete durable record live in different stores.** The
  next phase's *active window* gets only a lean carry; the *full raw transcripts* never
  enter it — they sit in `sessions/`. `/distill` mines the complete record later; the
  next phase never pays those tokens. This dissolves the "too little vs. too much
  context" tension instead of trading it off.
- **D7 — Lean carry = typed handoff brief + named artifacts.** Each phase emits a brief
  with fixed slots: `decisions` (+why), `constraints`, `artifacts` (paths the next phase
  needs), `open_qs`, `do_not_revisit` (dead-ends already ruled out). The fixed schema is
  itself a **self-correctable artifact**: when `/distill` sees a phase re-derive
  something a prior brief should have carried, the fix is "widen the brief / improve the
  brief-writing prompt."
- **D8 — Every phase is an orchestrator.** Each phase can spawn **researchers**
  (this project or others) and **critics** (to sharpen the work — fallible, but worth
  weighing). The runtime `orchestrator → worker → critic` topology (design-doc §4.3) is
  the **inner engine** nested under the outer human-facing SDLC loop, available to all
  phases — not just `/craft`.
- **D9 — `/critique` = guided tour, not human code review.** An LLM-guided walkthrough of
  the completed work: the key design decisions made, the gotchas, and the spots where a
  wrong choice carries serious consequences (immediate or eventual). The LLM has already
  run its own multi-lens code review and brings that feedback; the human adds theirs;
  **all feedback merges into one prioritized list of todos.**
- **D10 — `/distill` authority = propose one changeset.** Distill produces a single
  consolidated, ranked self-correction changeset (a diff across memory / AGENTS.md /
  skills / hooks / commands / extensions) in the work-unit folder. Nothing lands without
  review at the `distill → apply` gate.
- **D11 — `/distill` routing taxonomy** (friction-signature → best-fit fix). The answer
  to "not a skill every loop" — only one row earns a skill:

  | What distill detects in the transcripts | Best-fit fix |
  |---|---|
  | Re-derived a **fact about this codebase** it could've known | AGENTS.md line *or* project memory |
  | Repeated a **multi-step method** across works | **project skill** ← the only skill case |
  | Repeated a **mistake a rule could prevent** | **hook** (deterministic enforcement) |
  | **Rabbit-holed** because a command's own prompt invited it | **edit that command/agent** (meta) |
  | **Duplicated work across sessions** (context didn't carry) | **widen the handoff brief** |
  | Spent context on tokens that **didn't help / hurt** | **tune context hooks / model profile** |
  | A **user-taste preference** surfaced again and again | **user memory** |

- **D12 — `/distill` method = multi-agent fan-out.** One lens per worker
  (`duplicated-work`, `rabbit-holes` + earliest-redirect-signal, `context-waste`,
  `handoff-gaps`) → routing/synthesis pass → ranked changeset. **`/distill` is itself a
  magpi workflow** — the harness eats its own dog food.
- **D13 — `/distill` scope/cadence = per-work, ledger-cross-referenced.** Runs once per
  piece of work at `/reflect`. Each finding is checked against a **durable learnings
  ledger**: first sighting → log an observation (no change proposed); recurrence across
  works → confidence increments and the finding is **promoted** to a proposed correction.
  Most loops change nothing; only recurring friction spends a correction. The ledger is
  the harness's institutional memory of *how it works*, separate from the project's
  domain knowledge.

## How this maps to / improves on cj-engineering

| cj-engineering | magpi |
|---|---|
| 6 phases, manual re-invocation, AskUserQuestion "what next?" at each seam | 3 umbrellas, under-the-hood auto-clear-and-reseed, **2 hard gates** |
| Manual `/compact` with preserve/discard lists | Typed handoff brief; full transcripts retained in `sessions/` |
| `learn` reads **current session only**, always emits **one SKILL.md** | `distill` mines **all sessions of the work**, emits the **right artifact type** |
| Knowledge improves the **project** | The **whole SDLC the harness runs** is self-correctable, gated by recurrence |
| `progress.json` persists only the work phase | Work-unit folder persists the **whole loop** end-to-end |

## Open Questions

### Blocker — RESOLVED ✅ (see `docs/spikes/2026-06-07-pi-transcript-feasibility-spike.md`)

- **Pi transcript feasibility — RESOLVED, green light.** Pi natively persists every session
  as append-only **JSONL** (`~/.pi/agent/sessions/<encoded-cwd>/<ts>_<uuid>.jsonl`) with full
  tool calls, tool results, per-turn token usage + cost, and timestamps, and **exports a
  loader** (`loadEntriesFromFile`) a child `/distill` process can import. All four assumed
  hooks exist verbatim. The session dir is **redirectable** (`PI_CODING_AGENT_SESSION_DIR` /
  `--session-dir`), so Pi writes transcripts **natively** into `.magpi/work/<slug>/sessions/`
  — no shim. D11/D12/D13 are **validated** (refine only: handle compaction boundaries). Two
  findings folded back: (a) **no native cross-session work-unit grouping** → magpi owns it,
  which D2 + the dir-redirect already cover; (b) **no core subagent primitive** → D8 is
  build-not-buy (spawn via CLI/SDK). Factual correction: packages are **`@earendil-works/pi-*`**,
  not `@mariozechner/pi-*`.

### Deferred to spec / planning (post-SPIKE)

- **Work-unit lifecycle state machine:** the canonical states (`created`, `shaping`,
  `plan-pending-gate`, `crafting`, `awaiting-reflect`, `reflecting`, `changeset-pending-gate`,
  `completed`, `abandoned`) and their transitions — needed before specifying the folder.
- **Slug & branch origin:** does `/shape` derive the slug from `explore` and create the
  branch (git side-effect), or adopt a human-created branch? Linking direction.
- **Gate rejection re-entry:** what happens when the human rejects the plan or the
  changeset — re-run the autonomous phase with feedback (capped at N), drop back to the
  prior collaborative phase, or hand-edit the artifact?
- **Craft failure handling:** test/build/tool failures during autonomous `/craft` —
  retry, surface, roll back, or transition to a `failed` state.
- **Critique todo disposition:** do `/critique`'s prioritized todos get fixed in place
  before ship, spawned as new pieces of work, or split by severity? (Load-bearing — it
  determines what state the work is in when `/distill` mines it.)
- **Distill routing conflict resolution:** when multiple lenses fire on the same span
  (e.g. a rabbit-hole that was *also* a handoff gap), which fix wins in the synthesis pass?
- **Changeset review UX:** the changeset spans prose (AGENTS.md, memory), code (hooks,
  extensions), and prompts (commands) — per-target review, partial accept/reject.
- **Ledger mechanics:** recurrence threshold (default N=2?), confidence decay over time,
  and a command to inspect/prune the ledger.
- **Eval loop:** does the skill-eval framework (design-doc §6) validate that *accepted*
  corrections actually improved efficiency and feed that back into ledger confidence —
  closing the loop short of full eval-gated auto-apply?
- **Concurrent work units:** strictly one-at-a-time, or multiple active branches/folders?
- **define ↔ explore seam:** both collaborative, so the boundary is soft — what signals
  the transition? (refine during `define`)
- **Doc structure:** fold these decisions into `docs/agent-harness-design.md` as new
  sections, or a sibling `docs/workflow-layer-design.md`? (decide at handoff)

## Planning Determination

**Design docs required:** yes
**Production code involved:** yes
**Recommended doc types (if yes):** SPIKE ✅ DONE (`docs/spikes/2026-06-07-pi-transcript-feasibility-spike.md`, resolved feasible) → now unblocked for ADR (workflow-layer shape) + Tech Spec
**Investigation only:** no
