---
title: "magpi runs inside pi's Node process"
status: Accepted
number: 3
date: 2026-10-26
---

## Context

`pi` is a Node program (`#!/usr/bin/env node`) that loads extensions through jiti, so an
extension's code runs in pi's Node process. Pi's packaging rules forbid bundling its core
packages (`docs/packages.md`).

## Decision

- magpi ships as a pi package, loaded by `pi -e <path to magpi>` or pi settings, and runs only
  inside pi. Its `package.json` `pi` manifest names `./src/extension.ts`.
- The extension is the only writer of `work.json`. There is no outer process and no IPC.
- Runtime code uses `node:` built-ins.
- Pi core packages are `peerDependencies` (`"*"`). The exact version used for types and tests is a
  dev dependency.
- Tests run against real git and files in temp dirs, not port fakes and replay adapters.
- Bun is the package manager, test runner and script runner. `tsc` only type-checks: `src/`
  against Node types, `test/` against Node and Bun types.

## Consequences

Tests run on Bun while magpi runs on Node in pi, so a Bun-only behavior can pass the tests and
fail in pi. The manual pi checks of each slice cover that gap.

## Alternatives Considered

| Alternative | Why not |
|---|---|
| A harness process spawning pi per phase and taking state changes over IPC (spec §2 as first written) | Two processes and a protocol where one process suffices. |
| `Bun.$` / `Bun.file` adapters | Undefined in pi's Node process. |
| Bundling Pi | Pi `docs/packages.md` forbids it. |

## Status

Accepted (2026-10-26). Supersedes ADR 0002's positions 1, 2, 4 and 5 and its bundler role, and
ADR 0001 decision 3's launch of each phase's pi with `PI_CODING_AGENT_SESSION_DIR`.
