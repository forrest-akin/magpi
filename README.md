# magpi

A model-agnostic agent harness built on [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). It adds a shape / craft / reflect workflow layer, with work units linked to git branches.

## Setup

Install [mise](https://mise.jdx.dev), then:

```sh
mise trust && mise install
bun install --frozen-lockfile
```

`mise.toml` pins Bun. Keep `bun.lock`: a fresh resolve takes `@earendil-works/pi-ai` 0.80.10, which pi 0.80.7 cannot load, and the lock holds Pi's internal packages at 0.80.7.

## Commands

- `bun test` runs the tests.
- `bun run typecheck` type-checks `src/` against Node types and `test/` against Node and Bun types.
- `bun run verify` runs both.
- `bun x biome check` lints and checks formatting.

## Using magpi in pi

magpi is a pi package and runs inside pi ([ADR 0003](docs/adrs/0003-magpi-runs-inside-pi.md)). Load it with:

```sh
pi -e <path to magpi>
```

In a git repository:

- `/shape --branch <branch>` checks out an existing branch and works on its unit, creating it at `.magpi/work/<slug>/work.json` when the branch has none. It never overwrites an existing work unit.
- `/shape` with no arguments works on the unit of the current branch.
- On a unit that has not started shaping, either form moves the conversation into a new session file in `.magpi/work/<slug>/sessions/` and the unit starts shaping. From then on, in that pi process, `/new` starts sessions in that folder and `/resume` lists only that unit's sessions.
- On a shaping unit, either form resumes the last session file in `sessions/` by name, or starts a new one there when it has none. When pi is already in that session, it reports the unit. After pi restarts, `/resume` does not list the unit's sessions; `/shape` is the way back.
- A unit folder without `work.json` is refused and left for you to restore or remove.
- Other arguments print the usage.

## Layout

- `src/` the pi extension; `src/extension.ts` is its entrypoint
- `test/` tests, run by `bun test`
- `docs/` [design record](docs/agent-harness-design.md), [ADRs](docs/adrs), [specs](docs/specs), [spikes](docs/spikes)

Conventions for contributors and agents are in [CLAUDE.md](CLAUDE.md).
