# Further reading

The sources behind the conventions in this skill. Read these to understand *why*
a rule exists or to go deeper on a technique — not needed to apply the skill.
Grouped by what they're good for.

## The techniques this skill encodes

- **Scott Wlaschin, [*Domain Modeling Made Functional*](https://pragprog.com/titles/swdddf/domain-modeling-made-functional/)**
  (and the [Designing with Types](https://fsharpforfunandprofit.com/series/designing-with-types/)
  series). The canonical treatment of type-driven domain modeling,
  make-illegal-states-unrepresentable, and parse-don't-validate. F# syntax, but
  the design rules transfer directly to the discriminated-union + parsed-type
  approach used here.
- **Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)**.
  The short, canonical statement of the boundary-parsing principle: validate
  untrusted input once and return a *parsed* type, so downstream code can't
  re-check or forget to.
- **Mark Seemann** — [Functional architecture is Ports and Adapters](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/)
  and [Dependency rejection](https://blog.ploeh.dk/2017/02/02/dependency-rejection/).
  The clearest working-engineer account of how a pure core talks to an impure
  world, which is exactly the functional-core / imperative-shell split the skill
  assumes.
- **Gary Bernhardt, [Boundaries](https://www.destroyallsoftware.com/talks/boundaries)**
  (talk; video only — no transcript found, so the takeaway is captured here).
  Push mutation and IO to the edges and keep a core of pure functions over
  immutable values. The pure core becomes trivially testable (no mocks — you pass
  values in and assert on values out), and the imperative shell that wraps it
  stays thin. This is the functional-core / imperative-shell split the skill
  relies on.

## Why it's worth the discipline (foundational)

- **Rich Hickey, Simple Made Easy** ([video](https://youtu.be/SxdOUGdseq4) ·
  [transcript](https://raw.githubusercontent.com/matthiasn/talk-transcripts/master/Hickey_Rich/SimpleMadeEasy.md))
  and **The Value of Values** ([video](https://youtu.be/-I-VpPMzG7c) ·
  [transcript](https://raw.githubusercontent.com/matthiasn/talk-transcripts/master/Hickey_Rich/ValueOfValuesLong.md)).
  Hickey's core distinction: *simple* (one concept, not braided together with
  others — an objective property) is not *easy* (familiar, near at hand — a
  relative one). Prefer simple even when it's less easy, because complecting
  state and behavior is what makes systems hard to change later. The case for
  immutability and for values-over-place-oriented-state follows from this.
- **Moseley & Marks, [Out of the Tar Pit](https://curtclifton.net/papers/MoseleyMarks06a.pdf)**
  (paper). Accidental vs. essential complexity; the argument for minimizing
  mutable state and side effects.

## The library and its lineage

- **true-myth docs** — the [Design philosophy](https://true-myth.js.org/guide/background/design-philosophy.html)
  and [Naming choices](https://true-myth.js.org/guide/background/naming.html)
  background pages explain why the API deliberately avoids category-theory
  vocabulary.
- **Rust's [`Option`](https://doc.rust-lang.org/std/option/) and
  [`Result`](https://doc.rust-lang.org/stable/std/result/)** — true-myth's
  `Maybe`/`Result` draw their semantics and method names from these; the Rust std
  docs are a good mental model for the combinators (`map`, `and_then`/`andThen`,
  `unwrap_or`/`unwrapOr`, etc.).

## Deliberately out of scope

Effect systems beyond `Task` (e.g. `effect`, `fp-ts`) and the academic end of the
space (denotational design, optics/lenses, free monads, typeclass-driven
abstraction) are intentionally *not* used here. The three types plus algebraic
data types are the practical ceiling for this codebase; reach for heavier
machinery only with a specific, justified need — and even then, not as a direct
dependency that leaks its vocabulary into application code.