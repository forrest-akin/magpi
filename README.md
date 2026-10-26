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

`/shape` prints its usage.

## Layout

- `src/` the pi extension; `src/extension.ts` is its entrypoint
- `test/` tests, run by `bun test`
- `docs/` [design record](docs/agent-harness-design.md), [ADRs](docs/adrs), [specs](docs/specs), [spikes](docs/spikes)

Conventions for contributors and agents are in [CLAUDE.md](CLAUDE.md).
