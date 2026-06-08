---
title: "Pi transcript feasibility — can a child process mine per-session transcripts, and where does `sessions/` come from?"
status: resolved
date: 2026-06-07
---

> **Resolution (TL;DR):** **Feasible — green light.** Pi natively persists every
> session as append-only **JSONL** at `~/.pi/agent/sessions/<encoded-cwd>/<ts>_<uuid>.jsonl`,
> with full tool calls, tool results, per-turn token usage + cost, and timestamps.
> It **exports** a loader (`loadEntriesFromFile`) a child `/distill` process can import.
> All four extension hooks the design doc assumed exist **verbatim**, plus
> `session_start`/`session_shutdown` lifecycle hooks. The session directory is
> **redirectable** via `PI_CODING_AGENT_SESSION_DIR` / `--session-dir`, so Pi can write
> transcripts **natively** into `.magpi/work/<slug>/sessions/` — no copy/symlink shim.
> One real gap: Pi has **no native cross-session "work unit" grouping** (only
> fork/branch lineage), so magpi must supply that — which the work-unit folder (D2)
> already does. The `/distill` design (D11/D12/D13) is validated; only refinements,
> not a redesign, are required.

## Context

This SPIKE was flagged as the **one hard blocker** by both the spec-flow-analyzer and
the design-doc-evaluator during the workflow-layer brainstorm
(`.claude/brainstorms/2026-06-06-shape-craft-reflect-loop-brainstorm.md`). The entire
`/distill` design (decisions **D11** routing taxonomy, **D12** multi-agent fan-out,
**D13** per-work ledger) rests on an *assumed-but-unverified* premise: that Pi persists
machine-readable per-session transcripts a separate process can mine. Decisions **D2**
(work-unit folder with a `sessions/` subdir), **D5** (auto-clear-and-reseed), and **D7**
(typed handoff brief) also assume specific runtime capabilities. If the premise were
false, the workflow layer would need a redesign before any Tech Spec.

**Investigation substrate:** the upstream monorepo `badlogic/pi-mono` (packages
`@earendil-works/pi-{ai,agent-core,coding-agent,tui}`), cloned locally to
`~/github.com/badlogic/pi-mono` and read directly. The repo dogfoods Pi (it ships a
committed `.pi/` config dir), so the on-disk format and extension API are first-hand
ground truth, not docs.

## Questions to Answer

- **Q1.** Does the Pi runtime persist a per-session transcript to disk **automatically**
  (no custom code required), and at what path?
- **Q2.** Is the persisted transcript in a format a **separate (non-Pi) process can
  parse**, and does Pi **export** a loader/parser a child process can reuse rather than
  reimplement?
- **Q3.** Does each transcript capture enough per-turn signal for `/distill`'s lenses —
  specifically **full tool-call inputs**, **full tool-result outputs**, **per-turn token
  usage + cost**, and **per-record timestamps**?
- **Q4.** Can a separate process **enumerate and group all sessions belonging to one piece
  of work** (which may span many separately-launched sessions over days)? Is there a
  native grouping/lineage concept, or must magpi supply one?
- **Q5.** Does Pi expose the **extension hooks** magpi's under-the-hood handoff needs — a
  session-start hook to inject a seeded brief, a session-end hook, a context-rewrite hook,
  and a compaction hook — and do the four hook names named in the design doc
  (`before_agent_start`, `context`, `session_before_compact`, `tool_call`) exist verbatim?
- **Q6.** For the `.magpi/work/<slug>/sessions/` subdir (D2): can Pi be made to write
  transcripts **there natively**, or must magpi add a copy/symlink shim after each session?

## Investigation Plan

1. **Clone and map the runtime.** Clone `badlogic/pi-mono`; map the four packages and
   locate session-persistence, extension-hook, and SDK source. *(Answers Q1–Q6.)*
2. **Trace the write path.** Read `coding-agent/src/config.ts` (path resolution) and
   `core/session-manager.ts` (the persistence engine): where files are written, append vs.
   rewrite, automatic vs. opt-in. *(Q1.)*
3. **Extract the on-disk schema.** Quote the `SessionHeader` / `SessionEntry` union and the
   `AgentMessage` / `Usage` types; confirm an exported loader exists. *(Q2, Q3.)*
4. **Trace session identity & lineage.** Read session id/metadata generation and the
   fork/branch/resume paths; determine whether multi-session work is natively linkable. *(Q4.)*
5. **Enumerate the hook surface.** Read `agent/src/harness/agent-harness.ts` and
   `coding-agent/src/core/extensions/types.ts`; verify the four design-doc hook names
   verbatim and find session-lifecycle hooks. Confirm against example extensions
   (`handoff.ts`, `custom-compaction.ts`, `auto-commit-on-exit.ts`, `provider-payload.ts`). *(Q5.)*
6. **Trace the session-dir resolution.** Determine whether the session directory is
   overridable by env var or flag. *(Q6.)*
7. **Verify the linchpins first-hand.** Re-grep the package scope, the loader export, the
   four hook names, the absence of a core subagent tool, and the env override — directly,
   not via summary.

## Expected Output

- **Q1:** Boolean (auto-persisted?) + the exact on-disk path pattern, with `file:line`.
- **Q2:** Format name (JSONL?) + the names/signatures of exported parser/loader functions.
- **Q3:** Per-field yes/no (tool input, tool result, usage, cost, timestamps) + the quoted
  TypeScript types that prove it.
- **Q4:** Native grouping mechanism (if any) + an explicit statement of what magpi must add
  to group a multi-session work unit.
- **Q5:** Verbatim ✓/✗ for each of the four hook names + the session-lifecycle hooks, with
  payload types and firing timing.
- **Q6:** "Native (via redirect)" vs. "shim required," with the mechanism and `file:line`.

## Timebox

**Estimated:** 1–3 days (read Pi runtime source + run a test session).
**Actual:** ~half a day of source archaeology against the clone. A live test session
proved unnecessary: the repo dogfoods Pi, the schema is explicit in source, and the loader
is exported — so the format is verifiable by reading, not just by running.

## Outcome

**Verdict: FEASIBLE. Proceed to Tech Spec.** Every load-bearing assumption behind the
`/distill` design holds. Findings below are first-hand-verified against the clone; each
claim carries a `path:line` citation (paths relative to `~/github.com/badlogic/pi-mono`).

### Q1 — Native, automatic, append-only JSONL on disk → **YES**

Pi persists every session with no custom code. Path pattern:

```
~/.pi/agent/sessions/<encoded-cwd>/<ISO-timestamp>_<uuidv7>.jsonl
```

- Sessions root: `getSessionsDir() = join(getAgentDir(), "sessions")` —
  `packages/coding-agent/src/config.ts:535-536`; `getAgentDir()` defaults to
  `~/.pi/agent` (`config.ts:490-497`, `CONFIG_DIR_NAME = ".pi"` at `config.ts:467`).
- Per-cwd subdir is the resolved cwd with separators flattened:
  `--${cwd.replace(/^[/\\]/,"").replace(/[/\\:]/g,"-")}--` —
  `core/session-manager.ts:438-442`.
- Per-session filename is `${isoTimestamp}_${sessionId}.jsonl` —
  `core/session-manager.ts:845-846`; `sessionId = uuidv7()` (`session-manager.ts:203-205`).
- Writing is automatic once a `SessionManager` persists: user messages buffer in memory,
  then flush on the first assistant message via `writeFileSync`, and every subsequent entry
  is `appendFileSync`'d — `core/session-manager.ts:908-935`. Crash-safe (header always
  precedes entries). A migration comment documents the layout history —
  `src/migrations.ts:207-244`.

### Q2 — Machine-readable JSONL with an **exported** loader → **YES**

The format is JSON Lines: one JSON object per line, first line a header, rest are entries.
Pi exports the parser/loader, so a child `/distill` process imports it rather than
reimplementing:

- `export function loadEntriesFromFile(filePath): FileEntry[]` —
  `core/session-manager.ts:466`.
- `export function parseSessionEntries(content): FileEntry[]` —
  `core/session-manager.ts:294`.
- Helpers also exported: `getLatestCompactionEntry(...)` (`session-manager.ts:311`),
  `migrateSessionEntries(...)` (`session-manager.ts:289`).
- Harness-level async loader for non-coding-agent contexts:
  `loadJsonlSessionMetadata(...)` / `loadJsonlStorage(...)` —
  `packages/agent/src/harness/session/jsonl-storage.ts:123-159`.

The on-disk shape (`core/session-manager.ts:32-149`):

```ts
interface SessionHeader {            // first line only
  type: "session"; version?: number; id: string;
  timestamp: string; cwd: string; parentSession?: string;
}
type SessionEntry =                  // every subsequent line
  | SessionMessageEntry | ThinkingLevelChangeEntry | ModelChangeEntry
  | CompactionEntry | BranchSummaryEntry | CustomEntry
  | CustomMessageEntry | LabelEntry | SessionInfoEntry;
interface SessionEntryBase { type: string; id: string; parentId: string|null; timestamp: string; }
```

The `parentId` tree (`parentId` on every entry) means a transcript is a navigable tree, not
just a flat log — useful for `/distill` to follow the actual taken path vs. branches.

### Q3 — Per-turn signal is rich enough for every `/distill` lens → **YES (all fields present)**

`SessionMessageEntry.message` stores the full `AgentMessage`. From `packages/ai/src/types.ts`:

| Signal `/distill` needs | Present? | Evidence |
|---|---|---|
| Full **tool-call input** (`arguments`) | ✅ | `ToolCall` in `AssistantMessage.content[]` — `ai/src/types.ts:288-301` |
| Full **tool-result output** | ✅ | `ToolResultMessage.content` + `isError` — persisted as its own message entry |
| **Token usage** (input/output/cache) | ✅ | `AssistantMessage.usage: Usage` — `ai/src/types.ts:265-278` |
| **Cost** per turn | ✅ | `Usage.cost.{input,output,cacheRead,cacheWrite,total}` — `ai/src/types.ts:272-277` |
| **Timestamps** per record | ✅ | `SessionEntryBase.timestamp` (ISO) + per-message Unix `timestamp` |
| Model / provider per turn | ✅ | `AssistantMessage.{api,provider,model}` |
| **Compaction markers** (lossy points) | ✅ | `CompactionEntry{summary, firstKeptEntryId, tokensBefore, fromHook}` — `session-manager.ts:69-78` |
| Stop reason / errors | ✅ | `AssistantMessage.{stopReason,errorMessage}` |

This directly powers the D12 lenses: **context-waste** (per-turn `usage` deltas + which tool
results bloated the window), **rabbit-holes** (timestamps + the `parentId` tree + stop
reasons to find the earliest-redirect signal), **duplicated-work** (tool-call `arguments`
repeated across sessions), and **handoff-gaps** (a later session re-deriving a fact present
in an earlier transcript). No field that any lens needs is missing.

### Q4 — No native cross-session "work unit" grouping → **magpi must supply it (D2 already does)**

This is the one genuine gap, and it is *expected and already handled* by the design.

- Each session has a stable `uuidv7` id stored in both the header and the filename
  (`session-manager.ts:203-205, 830-846`), plus metadata (`SessionInfo`: name, cwd,
  created/modified, messageCount, firstMessage) read on demand from the header +
  `session_info` entries — `session-manager.ts:170-184, 589-667`. **No central index file.**
- The **only** native linkage is `SessionHeader.parentSession` (a file path), recorded for
  **explicit fork / branch** operations — `session-manager.ts:1301-1307, 1466-1474` — and
  surfaced as a tree in the session picker (`buildSessionTree`, session-selector).
- **Critical caveat:** normal `--continue` / `--resume` *reopens the same `.jsonl`* and
  records **no** new lineage link. A piece of work spanning many separately-launched
  sessions in the same cwd is therefore **N independent files with no native connective
  tissue**. Compaction also keeps appending to the *same* file (no new session) —
  `session-manager.ts:989-1010`.

**Implication (validates D2, refines D13):** magpi cannot lean on Pi to know which sessions
belong to one piece of work. It must own that mapping — exactly what the **work-unit folder
(D2)** is for. The clean mechanism is a **manifest** in `.magpi/work/<slug>/` listing the
session-file paths (or session ids) that belong to the work unit, written as each phase
runs. Temporal-clustering-by-cwd is a fragile fallback; the manifest is authoritative.
See Q6 — redirecting the session dir per work unit makes the grouping *automatic* (every
file under the work unit's `sessions/` belongs to it), which is even better than a manifest.

### Q5 — Hook surface is mature; all four design-doc hooks exist verbatim → **YES**

Verified verbatim in `packages/coding-agent/src/core/extensions/types.ts` (registration at
`:1098-1135`; payload types alongside):

| Design-doc hook | Exists verbatim? | Evidence |
|---|---|---|
| `before_agent_start` | ✅ | `types.ts:632, 1119` — can modify system prompt + messages |
| `context` | ✅ | `types.ts:613, 1113`; `ContextEventResult.messages?` can **replace the message array** (`types.ts:987-988`) |
| `session_before_compact` | ✅ | `types.ts:544, 1106`; may cancel or return a custom `compaction` |
| `tool_call` | ✅ | `types.ts:781, 1132` — can block/mutate before a tool runs |

Plus the lifecycle hooks magpi's under-the-hood handoff (D5) needs:

- **`session_start`** (`types.ts:521, 1099`) — fires after load, before the first turn;
  payload carries `reason: "startup"|"reload"|"new"|"resume"|"fork"` and `previousSessionFile`.
  This is the injection point for a seeded brief.
- **`session_shutdown`** (`types.ts:560, 1110`) — fires before teardown; the seam to persist
  the outgoing brief. Demonstrated by `examples/extensions/auto-commit-on-exit.ts`.
- Extensions have **full Node `fs` + `pi.exec()`** access (proven by
  `examples/extensions/provider-payload.ts` doing `appendFileSync`, and `auto-commit-on-exit.ts`
  running git), so a handoff extension can read the branch, write a typed brief to the
  work-unit folder, and seed the next session.
- `examples/extensions/handoff.ts` is a **working precedent for D5/D7**: it serializes the
  branch, asks an LLM to produce a self-contained brief, then calls
  `ctx.newSession({ parentSession, withSession })` to open a fresh session pre-loaded with
  that brief (`handoff.ts:100-184`). magpi's auto-clear-and-reseed is this pattern, made
  automatic and writing the brief into `.magpi/work/<slug>/` with the D7 fixed slots.
- `examples/extensions/custom-compaction.ts` proves `session_before_compact` can fully
  replace summarization with a custom (even cheaper-model) pass — useful for the D6
  "lean active context" goal.

### Q6 — `sessions/` populated **natively via directory redirect** → **NO shim required**

Pi's session directory is overridable two ways, so magpi can make Pi write transcripts
directly into the work-unit folder:

- **Env var:** `PI_CODING_AGENT_SESSION_DIR` is read at startup — `main.ts:620`
  (constant `ENV_SESSION_DIR`, `config.ts:472`). `getAgentDir()` similarly honors
  `PI_CODING_AGENT_DIR` (`config.ts:491-496`).
- **CLI flag:** `--session-dir <path>` — used internally at
  `modes/interactive/interactive-mode.ts:216`.

So launching a phase with `PI_CODING_AGENT_SESSION_DIR=.magpi/work/<slug>/sessions` (or the
flag) makes Pi append the JSONL transcript **straight into the work unit**. This *also*
solves Q4's grouping for free: every file under that dir belongs to the work unit by
construction — no manifest reconciliation, no copy/symlink, no post-session shim. (A manifest
may still be worth keeping as a human-readable index, but it's no longer load-bearing.)

### Additional finding (surfaced, affects D8) — no core subagent primitive

D8 ("every phase is an orchestrator that can spawn researchers + critics") assumes a
spawning capability. Finding: **there is no built-in subagent/Task tool.** The core tool set
is exactly `bash, edit, find, grep, ls, read, write` (`core/tools/`). Subagents exist only
as an **example extension** (`examples/extensions/subagent/index.ts`) that spawns *separate
`pi` CLI processes* with `--mode json -p --no-session [--tools …] [--append-system-prompt …]`
and parses their JSON `message_end` events (supports single / parallel-capped / chain modes).

**Implication for D8 (and design-doc §6.3):** the orchestrator→worker→critic topology is
*feasible* but is **magpi's to build**, not a Pi primitive — via either (a) the
process-spawn pattern the example demonstrates, or (b) recursive use of the SDK
`createAgentSession()` (`core/sdk.ts:166`) with isolated `SessionManager.inMemory()` state.
The headless path is solid: `--mode json` + `-p` + `--no-session` (`cli/args.ts:10,78,104,253`)
and the programmatic `createAgentSession()/session.prompt()` SDK both work without a TUI.
This should become an explicit line item in the Tech Spec / phased plan rather than an
assumed capability.

### Correction to the design doc (factual)

`docs/agent-harness-design.md` refers to the packages as **`@mariozechner/pi-*`**. The actual
published scope is **`@earendil-works/pi-*`** (`@earendil-works/pi-{ai,agent-core,coding-agent,tui}`,
verified across all four `package.json` files). Every install/import reference in the design
doc and future specs must use `@earendil-works/`. (Mario Zechner is the author; the npm scope
is `earendil-works`.)

### Residual risks & follow-ups (for the Tech Spec, not blockers)

1. **Schema is `CURRENT_SESSION_VERSION = 3` and migrates** (`session-manager.ts`). The JSONL
   shape can change across Pi releases. magpi should **import Pi's exported loader** (which
   runs `migrateSessionEntries`) rather than hand-parsing lines, and **pin the Pi version**.
2. **Session-dir redirect interaction with the picker / resume UX** is unverified end-to-end
   under a per-work-unit dir — confirm with one live run during Tech Spec spike-in.
3. **Subagent topology is build-not-buy** (above) — size it explicitly in the phased plan.
4. **`/distill` reads transcripts that may include compaction markers** — it must treat a
   `CompactionEntry` as a lossy boundary (some raw turns are summarized away). For full-fidelity
   mining, prefer the raw per-session JSONL over post-compaction context; the raw files retain
   everything up to each compaction point.
5. **`context` hook rewriting the message array** is the lever for D6 "select" — powerful but
   easy to get wrong; gate behind evals (design-doc §8).

### Decision impact summary

| Decision | Status after SPIKE |
|---|---|
| D2 — work-unit folder w/ `sessions/` | **Validated & strengthened** — redirect Pi's session dir into it (Q6); folder becomes the native grouping (Q4). |
| D5 — auto-clear-and-reseed | **Validated** — `session_start`/`session_shutdown` + `newSession({withSession})` precedent in `handoff.ts` (Q5). |
| D6 — lean active vs. full durable record | **Validated** — raw JSONL retained on disk; `context` hook trims the active window (Q2, Q5). |
| D7 — typed handoff brief | **Validated** — extensions have fs access to write the brief; `handoff.ts` is the precedent (Q5). |
| D8 — every phase an orchestrator | **Feasible, build-not-buy** — no core subagent tool; spawn via CLI/SDK (Additional finding). |
| D11/D12/D13 — `/distill` mining | **Validated** — all per-turn signal present (Q3); exported loader (Q2); grouping solvable (Q4/Q6). Refine: handle compaction boundaries (risk #4); ledger keyed off the work-unit folder. |

**Recommended next step:** unblock `/workflows:spec` — proceed to ADR (workflow-layer
shape) + Tech Spec, folding these findings (especially the Q4 grouping decision, the Q6
redirect mechanism, the D8 build-not-buy note, and the `@earendil-works/` correction) into
`docs/agent-harness-design.md` or a sibling `docs/workflow-layer-design.md`.
