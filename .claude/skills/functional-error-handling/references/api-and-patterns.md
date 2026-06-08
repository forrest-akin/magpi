# true-myth: applied patterns & gotchas

Companion reference for the `functional-error-handling` skill. Read this when a
case isn't covered by the examples in `SKILL.md` — boundary interop, collections,
conversions, retries — or when something doesn't type-check the way you expect.
For the exhaustive method list, see the API docs at <https://true-myth.js.org>.

## Contents

- Creating values at the boundary
- The `tryOr*` argument-order gotcha
- The `ok()` / `err()` inference gotcha
- Consuming values
- Collections of `Result`s
- Converting between the three types
- Retries, delays, and timeouts
- Parsing with `true-myth-zod`

## Creating values at the boundary

The shell is where untrusted/effectful values become typed ones. Use the
narrowest constructor that fits:

- **A nullable from an existing API →** `Maybe.of(value)` returns `Nothing` for
  `null`/`undefined`, `Just` otherwise.
- **A throwing/rejecting promise →** `Task.fromPromise(promise)` catches every
  rejection into the `Rejected` variant. The resulting error type is `unknown`
  (it can't know what was thrown), so normalize it immediately with
  `.mapRejected(...)`. This is the most robust async-boundary primitive because
  it has no argument-order ambiguity:

  ```ts
  import Task from 'true-myth/task';

  function fetchUsers() {
    return Task.fromPromise(fetch('/api/users').then((r) => r.json()))
      .mapRejected((e) => new Error('fetch/parse failed', { cause: e })) // unknown -> Error
      .andThen(parseUsers); // parse at the boundary (see below)
  }
  ```

- **A known value, already in hand →** `Task.resolve(value)` / `Task.reject(reason)`
  to lift into a `Task`; `ok(value)` / `err(reason)` to lift into a `Result`.

## The `tryOr*` argument-order gotcha

`Task.tryOr` and `Task.tryOrElse` exist as conveniences, but the argument order
differs between the static-method style and the functional/standalone style, so
pick one style and stay in it:

- Static method: `Task.tryOrElse(promise, (reason) => mappedError)` — promise first.
- Functional (`import * as task from 'true-myth/task'`): `task.tryOrElse(onError, () => promise)` — handler first, promise as a thunk.

When in doubt, prefer `Task.fromPromise(...).mapRejected(...)` (above): it does the
same job with no ordering to get wrong. (The docs site is mid-migration, so
confirm exact signatures against the installed `.d.ts` if you use the `tryOr*`
forms.)

## The `ok()` / `err()` inference gotcha

Constructors only know about *one* of the two type parameters, so a bare `ok(12)`
infers `Result<number, {}>` and a bare `err('x')` infers `Result<{}, string>`.
This bites when you assign to a variable and return it separately:

```ts
// ❌ does not type-check against the declared return type
const make = (): Result<number, string> => {
  const r = ok(12); // inferred Result<number, {}>
  return r;
};

// ✅ annotate the return type and return the expression directly
const make = (): Result<number, string> => ok(12);
```

So: return constructor calls as the expression value of the function, or
annotate explicitly. The same applies to `just()` / `nothing()`.

## Consuming values

Resolve at the shell, not in the core. `match` for an exhaustive branch,
`unwrapOr` / `unwrapOrElse` for a default, or narrow with `isOk` / `isJust` and
then read `.value`. Match variant names differ by type: `Just` / `Nothing`,
`Ok` / `Err`, `Resolved` / `Rejected`. A `Task` is `await`-able and yields its
underlying `Result`.

## Collections of `Result`s

To turn an `Array<Result<T, E>>` into a single `Result`, use `transposeAll`
(fails if any element is `Err`) or `transposeAny` (succeeds if any element is
`Ok`). Reach for these instead of looping and short-circuiting by hand.

## Converting between the three types

`Maybe` and `Result` interconvert (a `Maybe` becomes a `Result` by supplying the
error to use for `Nothing`; a `Result` becomes a `Maybe` by discarding the
error), and a `Task` can be built from a `Result`. The exact method names live in
the API docs — confirm them there rather than guessing, since this is a common
spot to typo. The design rule matters more than the spelling: convert *toward*
the type that carries the information the caller needs, and do it at the boundary,
not deep in the core.

## Retries, delays, and timeouts

`Task` has first-class retry/backoff support via `true-myth/task` plus the delay
strategies in `true-myth/task/delay` (e.g. `exponential`, `jitter`, `fixed`).
This belongs in the shell, around real IO. See
<https://true-myth.js.org/guide/understanding/task/retries-and-delays.html> for
the current API.

## Parsing with `true-myth-zod`

`parserFor(schema)` → `(input: unknown) => Result<T, ZodError>` for sync parses;
`asyncParserFor(schema)` → `(input: unknown) => Task<T, ZodError>` for async (or
schemas with async refinements). Both let you chain a parse straight onto a
boundary `Task` with `.andThen(...)`. Peer deps: `true-myth >=9`, `zod >=3.25`,
and the Zod v4 import path (`import * as z from 'zod/v4'`).
