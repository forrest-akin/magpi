---
title: "Pi switch-session spike — can a running pi move into a work unit's sessions dir?"
status: resolved
date: 2026-10-26
---

> **Resolution:** Yes, inside the running pi. After `ctx.switchSession(<work unit>/sessions/<name>.jsonl)`,
> pi writes the session to that file and nothing to its default session dir; `/new` and
> `ctx.newSession()` create their files in the same dir; `/resume` lists and reopens them. A
> freshly started pi lists none of them, so after a restart only magpi's own switch brings the
> conversation back.

## Setup

Pi 0.80.7 (`node_modules/.bin/pi`) on Node from mise. `$S` is a scratch dir
holding a throwaway extension `ext.ts`, an empty git repo as cwd, and an agent dir passed as
`PI_CODING_AGENT_DIR=$S/agent`, so pi's default session dir is `$S/agent/sessions/--<cwd>--/`.

No provider key is configured. The extension registers pi-ai's faux provider, so every model
turn is a canned assistant message through pi's normal agent loop:

```ts
const core = createFauxCore({ api: "faux", provider: "faux", models: [{ id: "faux-1" }] });
core.setResponses(Array.from({ length: 20 }, (_, i) => () => fauxAssistantMessage(`canned reply ${i + 1}`)));
pi.registerProvider("faux", { baseUrl: "http://faux.invalid", apiKey: "faux", api: "faux",
  streamSimple: core.streamSimple, models: [{ id: "faux-1", /* … */ }] });
```

Its commands:

- `/q1` creates an empty `<cwd>/.magpi/work/demo/sessions/2026-10-26T00-00-00-000Z_s1-q1.jsonl` and
  calls `ctx.switchSession(path, {withSession})`; `withSession` notifies the new ctx's
  `getSessionFile()` and `getSessionDir()`.
- `/q2` calls `ctx.newSession({withSession})` and notifies the same two values.
- `/q3` notifies what `/resume` lists: `SessionManager.list(cwd, getSessionDir())` (Current
  Folder tab) and `SessionManager.listAll(getSessionDir())` (All tab), the calls
  `interactive-mode.js` `showSessionSelector` makes.

Two harnesses run pi as `pi -ne -nc -e $S/ext.ts --provider faux --model faux-1`: an rpc driver
(`--mode rpc`, one JSON command per line, each awaited) and a tmux driver for the interactive
TUI's built-in `/new` and `/resume`.

## Q1. Does pi write the session to the switched-to file after one model turn?

**Yes.** The file is a regular file holding the header and both messages; pi's default session
dir gets no `.jsonl`.

rpc run (paths trimmed to `…/`):

```
> {"type":"prompt","message":"/q1"}
< notify q1 withSession file=…/repo/.magpi/work/demo/sessions/2026-10-26T00-00-00-000Z_s1-q1.jsonl dir=…/repo/.magpi/work/demo/sessions
[stderr] q1 switchSession returned {"cancelled":false}
> {"type":"prompt","message":"first prompt in work unit"}
< agent_end
```

```
$ ls -la $S/repo/.magpi/work/demo/sessions/
-rw-r--r--  1 forrestakin  wheel  1153 Oct 26 03:21 2026-10-26T00-00-00-000Z_s1-q1.jsonl
$ # entry types in that file
session cwd=…/s1/repo
model_change
thinking_level_change
message  user: [{"type":"text","text":"first prompt in work unit"}]
message  assistant: [{"type":"text","text":"canned reply 1"}]
$ find $S/agent -type f
$S/agent/auth.json
```

The interactive run (`/q1`, then `first interactive prompt`) gives the same file with that
prompt and no `.jsonl` under `$S/agent2`.

The switch writes the header before any turn: after `/q1` and no prompt, the file holds 516
bytes, three entries (`session`, `model_change`, `thinking_level_change`) and no messages.

## Q2. Does a following `/new` create its file in the same directory?

**Yes**, for `ctx.newSession()`, rpc `new_session` and the TUI's `/new`. Each names its file
`<ISO>_<uuidv7>.jsonl` in the work unit's `sessions/`.

rpc run, continuing Q1:

```
> {"type":"prompt","message":"/q2"}
< notify q2 withSession file=…/sessions/2026-10-26T10-21-18-369Z_01a177ba-92a1-7853-9339-3b5de0cf9e99.jsonl dir=…/repo/.magpi/work/demo/sessions
> {"type":"prompt","message":"second prompt after ctx.newSession"}
> {"type":"new_session"}
< {"type":"response","command":"new_session","success":true,"data":{"cancelled":false}}
> {"type":"prompt","message":"third prompt after rpc new_session"}
```

```
$ ls -la $S/repo/.magpi/work/demo/sessions/
-rw-r--r--  1 forrestakin  wheel  1153 Oct 26 03:21 2026-10-26T00-00-00-000Z_s1-q1.jsonl
-rw-r--r--  1 forrestakin  wheel  1162 Oct 26 03:21 2026-10-26T10-21-18-369Z_01a177ba-92a1-7853-9339-3b5de0cf9e99.jsonl
-rw-r--r--  1 forrestakin  wheel  1162 Oct 26 03:21 2026-10-26T10-21-19-378Z_01a177ba-9692-7542-97c6-75f8e42bc277.jsonl
```

TUI run: `/q1`, a prompt, `/new`, a prompt; `$S/repo2/.magpi/work/demo/sessions/` holds the
`s1-q1` file and `2026-10-26T10-22-11-828Z_01a177bb-6374-7501-9ff6-0a87b877c2d9.jsonl`.

## Q3. Does `/resume` list that session and reopen it?

**Yes, in the pi that switched; no, in a freshly started pi.** `/resume` lists from the current
session manager's dir. After the switch that is the work unit's `sessions/`, for both tabs. A
fresh pi starts in its default dir, and both tabs are empty.

TUI run, continuing Q2, then `/resume`, Down, Enter:

```
Resume Session (Current Folder)                       ◉ Current Folder | ○ All
› second interactive prompt after /new                                    2 now
  first interactive prompt                                                2 now
=== after selecting the older session
 first interactive prompt
 canned reply 1
 Resumed session
```

rpc has no list command; `/q3` makes `/resume`'s list calls, and `switch_session` makes its
reopen call:

```
< notify q3 sessionDir=…/repo/.magpi/work/demo/sessions current=["…/2026-10-26T10-21-19-378Z_….jsonl msgs=2","…/2026-10-26T10-21-18-369Z_….jsonl msgs=2","…/2026-10-26T00-00-00-000Z_s1-q1.jsonl msgs=2"] allOfDir=[same three]
> {"type":"switch_session","sessionPath":"…/sessions/2026-10-26T00-00-00-000Z_s1-q1.jsonl"}
< {"type":"response","command":"switch_session","success":true,"data":{"cancelled":false}}
> {"type":"get_messages"}
< {"type":"response","command":"get_messages","success":true,"data":{"messages":[{"role":"user","content":[{"type":"text","text":"first prompt in work unit"}]…},{"role":"assistant","content":[{"type":"text","text":"canned reply 1"}]…}]}}
```

Fresh pi in `$S/repo2` after the TUI run exits:

```
Resume Session (Current Folder)                       ◉ Current Folder | ○ All
>
Resume Session (All)                                  ○ Current Folder | ◉ All
>
 q3 sessionDir=…/s1/agent2/sessions/--private-tmp-…-scratchpad-s1-repo2-- current=[] allOfDir=[]
```

## Consequences for the `/shape` switch and the `/shape` resume

- The `/shape` switch moves the running pi into the unit's `sessions/`; no `--session-dir` restart.
- `/shape` followed by a quit before any prompt leaves a file holding only Pi's session header,
  which the `/shape` resume treats like any other session file.
- `/new` inside a work unit adds files to `sessions/` that `work.json` `sessionFiles` does not
  list, so the `/shape` resume reads the directory; pi's `<ISO>_<uuidv7>` names and magpi's
  `<ISO>_<uuid>` names sort in creation order.
- After a restart, pi's `/resume` does not list work-unit sessions; the `/shape` resume is the way
  back.
- Inside a work unit, `/resume` in that pi process lists only that unit's sessions.
