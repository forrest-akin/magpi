# magpi

A model-agnostic agent harness built on [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). It adds a shape / craft / reflect workflow layer, with work units linked to git branches.

## Setup

Install [mise](https://mise.jdx.dev), then:

```sh
mise trust && mise install
```

`mise.toml` pins Bun.

## Layout

- `docs/` [design record](docs/agent-harness-design.md), [ADRs](docs/adrs), [specs](docs/specs), [spikes](docs/spikes)

Conventions for contributors and agents are in [CLAUDE.md](CLAUDE.md).
