---
title: "Adopt Bun as the single-package toolchain (runtime, test runner, bundler) with tsc as the type authority"
status: Accepted
number: 2
date: 2026-06-07
---

## Context

magpi is a greenfield, single-package TypeScript project: a CLI + Pi extension built
on `@earendil-works/pi-coding-agent` (a Node package). It needs a toolchain decision —
runtime, test runner, bundler, package manager — recorded so it is not left implicit.

An earlier `CLAUDE.md` named Bun, but it did so inside a "Build & Test Commands" section
that was actually a web-app template (it referenced `src/index.html`, `src/server.ts`, and
an Auth0 startup guard — none of which apply to a CLI/TUI harness). That section was removed
to stop the contradiction. Removing it also removed the only written statement of the
toolchain, so this ADR records the decision deliberately. The functional-architecture
section of `CLAUDE.md` (functional core / imperative shell, hexagonal, `true-myth`) is
unaffected and remains binding.

## Decision

Use **Bun** as the all-in-one toolchain for magpi: runtime, test runner (`bun test`),
bundler, and package manager, in a single package (no separate Node, Vite, Jest, or pnpm
toolchain).

The committed positions:

1. **Bun is the runtime and dev loop.** Bun runs `.ts` directly — no separate compile step
   for development.
2. **`bun test` is the test runner.** Jest-compatible API; tests run offline against the
   in-memory port fakes and replay adapters (the architecture is the test seam).
3. **`tsc` is the type authority.** Bun executes TypeScript by stripping types; it does
   **not** type-check. Therefore the verification gate is **`bun test` && `bun x tsc
   --noEmit`** — both clean before any commit. `tsc` is not optional.
4. **`Bun.$` / `Bun.file` for the adapter layer.** The imperative-shell adapters (git-cli,
   fs) use Bun's native shell and file APIs.
5. **Pin `@earendil-works/pi-coding-agent` to an exact version.** Pi's session JSONL schema
   migrates across releases (SPIKE residual risk #1); pin it and import its exported loader
   rather than hand-parsing.

### Go/no-go validation and fallback

The one assumption this decision rests on is that **Pi runs correctly under Bun**. Pi is a
Node package that spawns child processes, touches the filesystem, and ships a TUI. This is
validated as an explicit **go/no-go gate in the first implementation task** (confirm Pi
imports + one real session launch under Bun).

The exposure is small: magpi's primary subagent mechanism is **process spawn** (`pi --mode
json -p …`), which launches the `pi` binary as its own process and is therefore
runtime-agnostic. Bun↔Node compatibility only bites on the **in-process SDK path**
(`createAgentSession`), which the spec already designates as the fallback path.

**Documented fallback:** if Pi misbehaves under Bun, fall back to **Node + `tsx` +
`vitest`** — the same hexagonal architecture, the same ports/adapters, and the same tests
carry over unchanged; only the runtime and test-runner adapters swap. Estimated ~half a day.

## Consequences

### Intended

- One tool replaces `node + tsx + esbuild/tsup + vitest/jest + pnpm`, collapsing the
  toolchain — aligned with the `CLAUDE.md` "stay simple and pragmatic" rule.
- Fast installs, fast startup, fast tests; first-class TypeScript with no build step in dev.
- `Bun.$` makes the git/fs adapters concise and readable.

### Accepted trade-offs

- **Bun does not type-check.** `tsc --noEmit` remains mandatory as a separate gate step;
  losing sight of that would let type errors ship.
- **Node-compat is high but not 100%.** This is acceptable specifically because magpi
  controls its own runtime (it is a tool you run, not a library that must run on consumers'
  arbitrary Node). The Pi-on-Bun assumption is gated and has a documented fallback.
- **Bun moves fast.** Behavior can shift across releases; pin where reproducibility matters
  and re-validate the Pi-on-Bun gate on Bun upgrades.

## Alternatives Considered

| Alternative | Why not (now) |
|---|---|
| Node + `tsx` + `vitest` + `tsup` | More mature and maximally compatible, but more moving parts to wire and maintain. Retained as the **documented fallback** if the Pi-on-Bun gate fails — the architecture makes the swap cheap. |
| Deno | Strong runtime, but npm-compat friction with a Node package like Pi and a different ecosystem/std-lib; more risk for this specific dependency than Bun. |
| Node + `ts-node` / plain `node --experimental-strip-types` | Slower/clunkier dev loop than Bun; still needs a separate test runner and bundler — the toolchain sprawl this decision exists to avoid. |

## Status

Accepted (2026-06-07).
