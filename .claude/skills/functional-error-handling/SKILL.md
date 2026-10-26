---
name: functional-error-handling
description: >-
  Model absence, failure, and fallible async in TypeScript with true-myth's
  Maybe, Result, and Task types instead of null, thrown exceptions, and
  rejecting Promises. Use this whenever writing or refactoring TypeScript that
  has a value which may be missing, an operation that can fail, or an async
  call that can error — including any function-signature design, error-handling,
  null/undefined handling, or boundary-parsing decision, even when the user
  doesn't name a library. Treat this as the default foundational layer for
  fallibility in any full-stack TypeScript code.
---

# Functional Error Handling (true-myth)

Use [`true-myth`](https://true-myth.js.org) (v9+) for the three recurring shapes
of "this might not give you a plain value." It's a small, zero-dependency,
tree-shakeable library whose API is deliberately plain — no category-theory
vocabulary. Use its documented method and function API directly; you do not need
a wrapper around it, and you should not pull in `fp-ts` or `effect` to do this
job.

## The three types

Pick the type by the shape of the problem, not by preference:

- **`Maybe<T>`** — a value that may be absent. Use instead of `T | null`,
  `T | undefined`, or optional chaining that silently swallows the gap.
- **`Result<T, E>`** — a *synchronous* operation that can fail in an expected,
  domain way. Use instead of throwing for control flow.
- **`Task<T, E>`** — an *asynchronous* operation that can fail. A `Task` is a
  `Promise<Result<T, E>>` under the hood that **cannot reject** — every error
  lives in `E`, so callers can't forget to handle it. Use instead of a
  `Promise` that might reject.

Reserve thrown exceptions for genuinely exceptional, unrecoverable situations
(programmer error, invariant violations) — not for failures you expect and want
the caller to handle.

## Imports (v9)

The default export is the type-plus-namespace; named exports are the standalone
functions. v9 uses lowercase namespace re-exports.

```ts
import Maybe, { just, nothing } from 'true-myth/maybe';
import Result, { ok, err } from 'true-myth/result';
import Task from 'true-myth/task';
import * as task from 'true-myth/task';
```

## Where each type lives: functional core, imperative shell

This is the point of the types — they let the core stay pure and push effects to
the edge.

- **Core (pure domain logic):** plain functions over plain data that return
  `Maybe` or `Result`. No `fetch`, no DB, no filesystem, no `Task`. The core
  never performs IO and never re-validates input it's already been handed.
- **Shell (the edge):** HTTP handlers, DB calls, network, filesystem. This is
  where `Task` lives, where you `await` or `match` to actually produce a side
  effect, and where untrusted input is parsed exactly once.

## Parse, don't validate — at the boundary

Validate untrusted input *once*, at the shell, and convert it into a parsed
domain type. Pass that parsed value inward so the core can trust it and never
re-checks.

Use the in-repo `parserFor` (`src/parse.ts`) for the parse step. It wraps a
plain zod 4 schema's `safeParse` and yields a true-myth `Result`, so there is no
`safeParse`-then-branch at the call site. `parserFor(schema)` produces
`(input: unknown) => Result<T, ParseError>`, where `ParseError` is
`{ kind: 'ParseError', message, issues }`. The dependencies are `true-myth` and
`zod` (v4).

Sync parse (config, an already-in-hand request body):

```ts
import * as z from 'zod';
import { parserFor } from './parse';

const User = z.object({ id: z.string().uuid(), name: z.string().optional() });
const parseUser = parserFor(User); // (input: unknown) => Result<User, ParseError>

const outcome = parseUser(input).match({
  Ok: (user) => `parsed ${user.id}`,
  Err: (e) => `rejected: ${e.message}`,
});
```

Async boundary: wrap the IO in a `Task`, then chain the parse with `andThen`,
lifting the `Result` into the `Task`:

```ts
// shell/users.ts — impure edge
import * as task from 'true-myth/task';
import * as z from 'zod';
import { parserFor } from './parse';

const Users = z.array(z.object({ id: z.string().uuid(), name: z.string() }));
const parseUsers = parserFor(Users);

export function fetchUsers() {
  return task
    .tryOrElse(
      (e) => new Error('network error', { cause: e }),
      () => fetch('/api/users').then((res) => res.json()),
    )
    .andThen((json) => task.fromResult(parseUsers(json))); // Task<User[], Error | ParseError>
}
```

## Errors as data, not strings

Model expected failures as a discriminated union with a `kind` (or `_tag`)
field, so `match` is exhaustive and the compiler flags you when a new failure
case is added.

```ts
// domain/checkout.ts — pure core
import Result, { ok, err } from 'true-myth/result';

type CheckoutError =
        | { kind: 'EmptyCart' }
        | { kind: 'OverLimit'; max: number };

export function checkout(cart: Cart): Result<Order, CheckoutError> {
  if (cart.items.length === 0) return err({ kind: 'EmptyCart' });
  if (cart.total > LIMIT) return err({ kind: 'OverLimit', max: LIMIT });
  return ok(toOrder(cart));
}
```

## Consume by matching, not unwrapping

Thread values through with `map` / `mapErr` / `andThen` and resolve them at the
shell with `match` (exhaustive) or `unwrapOr` (with a default). Avoid reaching
for `.value` or `unwrap()` to escape the type early in the core — that throws
away the safety you bought.

```ts
const message = checkout(cart).match({
  Ok: (order) => `Order ${order.id} placed`,
  Err: (e) => {
    switch (e.kind) {
      case 'EmptyCart': return 'Your cart is empty';
      case 'OverLimit': return `Limit is ${e.max}`;
    }
  },
});

// Task: await it to get the underlying Result, or match its own variants.
const users = (await fetchUsers()).unwrapOr([]);
```

Match variant names differ by type: `Just` / `Nothing` for `Maybe`, `Ok` / `Err`
for `Result`, `Resolved` / `Rejected` for `Task`.

## Style

Both a method style (`value.map(fn).match(...)`) and a curried functional style
(standalone `map`, `andThen`, etc., auto-partially-applied) are available. Prefer
the method style for a single chain; reach for the functional style only when
composing a pipeline where it genuinely reads better.

## Anti-patterns

- Do **not** add `fp-ts` or `effect` as a direct dependency, and do not
  introduce `Functor` / `Monad` / `Applicative` / `Traversable` / `Monoid`
  vocabulary. true-myth's plain API is the entire surface this layer needs.
- Do **not** mix `null`/`undefined` and `Maybe` for the same concept — convert
  at the boundary with `Maybe.of(...)` and stay in `Maybe` inward.
- Do **not** throw for expected, recoverable conditions; that's what `Result`
  and `Task` encode.
- Do **not** let `Task` or IO leak into core domain functions — keep them in the
  shell.
- Do **not** model failures as bare strings or `Error` messages when callers need
  to branch on them; use a discriminated union.
- Do **not** hand-roll `schema.safeParse(...)` plus `if (success)` branching at
  the boundary; use `parserFor` so the parse yields a `Result` directly.

## References

The examples above cover the common cases. For anything beyond them, read:

- **`references/api-and-patterns.md`** — boundary interop, collections of
  `Result`s, conversions between the three types, retries/timeouts, and two
  type-checking gotchas (the `tryOr*` argument order and `ok()`/`err()`
  inference). Read this when a case isn't covered above or the types don't behave
  as expected.
- **`references/further-reading.md`** — the canonical sources behind these
  conventions. Read this for the *why*, or to go deeper on a technique.