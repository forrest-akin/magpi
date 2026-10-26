# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Functional architecture (applies to all code)

These are defaults for *all* code you write here, not a special mode. They keep
logic easy to reason about, test, and change. Apply them by habit; deviate only
with a concrete reason.

- **Immutability by default.** Use `readonly` and `as const`; don't mutate in
  place — derive new values. Mutable shared state is where most reasoning breaks
  down.
- **Keep functions pure; isolate effects.** Separate calculations (input →
  output, no side effects) from actions (IO, time, randomness, network, DB). Most
  code should be calculations.
- **Functional core, imperative shell.** Put domain logic in a pure core of plain
  functions over plain data. Push IO and side effects to a thin shell at the
  edges that orchestrates the core. The core never performs IO.
- **Make illegal states unrepresentable.** Model data with discriminated unions
  so impossible combinations can't be constructed; prefer total functions and
  exhaustive `switch`/match (with a `never` check) so the compiler flags missing
  cases.
- **Parse at the boundary.** Validate untrusted input exactly once, at the shell,
  converting it into a typed domain value. Pass that value inward so nothing
  downstream re-checks or has to handle the untrusted shape.
- **Compose small pieces.** Prefer composing small functions over inheritance or
  large stateful objects. Pass data and behavior around as values.
- **Stay simple and pragmatic.** The habits above plus algebraic data types are
  the ceiling — they cover almost everything. Do not pull in `fp-ts` or `effect`,
  and do not expose category-theory vocabulary (`Functor`, `Monad`,
  `Applicative`, `Traversable`, `Monoid`) in application code.

For modeling absence and failure specifically — values that may be missing, or
operations that can fail synchronously or asynchronously — use the
`functional-error-handling` skill (`Maybe` / `Result` / `Task` via true-myth).

Foundations, if you want the reasoning: Rich Hickey's Simple Made Easy
([video](https://youtu.be/SxdOUGdseq4), [transcript](https://raw.githubusercontent.com/matthiasn/talk-transcripts/master/Hickey_Rich/SimpleMadeEasy.md))
(why simple beats easy), Scott Wlaschin's [*Domain Modeling Made Functional*](https://pragprog.com/titles/swdddf/domain-modeling-made-functional/)
(type-driven modeling, parse-don't-validate), and Mark Seemann on
[functional core / ports-and-adapters](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/).
A fuller annotated list lives in the `functional-error-handling` skill's
`references/further-reading.md`.

## Setup

Setup and commands are in [README.md](README.md). `bun run verify` runs the tests and the type check.
