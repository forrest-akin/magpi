# Handoff: say why bun.lock must be kept

Only C1's commit body says that a fresh resolve takes `@earendil-works/pi-ai` 0.80.10, which pi
0.80.7 cannot load, and that `bun.lock` holds Pi's internal packages at 0.80.7. A reader running
setup never sees it.

- README Setup installs with `bun install --frozen-lockfile` and says in one sentence why the lock
  is kept. Fold it into C1 (`feat: register /shape in pi`), which adds `bun.lock` and the install
  step; later commits keep their own README changes. `main` is local and unpushed.
- This handoff lands in C1 with the other `2026-10-26-redo-main*` handoffs.
- Explicit paths, no attribution trailers, never push.
