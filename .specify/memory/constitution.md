# CROSS-EXAM Constitution

<!--
  SYNC IMPACT REPORT
  Version change: (none) → 1.0.0 — INITIAL RATIFICATION.

  The 1.0.0 previously committed at this path was the unmodified Spec Kit
  scaffold template (`<PROJECT_NAME>` placeholders, no project content). It was
  never a ratified constitution of this project, so this is a first adoption,
  not an amendment of it.

  Principles ratified (9):
    I.   The Live Demo Is the Definition of Done
    II.  Evidence, Not Inference (NON-NEGOTIABLE)
    III. The Harness Does the Work
    IV.  Verified by a Real Command
    V.   One Task = One Branch = One PR = One Qodo Review = Merge
    VI.  Secrets Never Enter the Repo
    VII. One Spec, One Task List (NON-NEGOTIABLE)
    VIII. Simplicity First
    IX.  Surgical Change

  Sections ratified:
    - Event Clock (hard cutoffs for 2026-08-29)
    - Quality Gates
    - Development Workflow
    - Governance

  Template deltas: the scaffold ships 5 principle slots and 2 generic sections;
  this project ratifies 9 principles and adds Event Clock, as permitted when the
  project specifies its own count.

  Deferred TODOs: none. No bracket placeholders remain.
-->

**Project**: `CROSS-EXAM`

An adversarial Evaluator agent that stands in front of another agent's irreversible
actions, measures their real blast radius by executing them against a replica in a
sandbox, and cross-examines that agent with the evidence before the action reaches
production.

This constitution is calibrated to a specific event: a one-day, in-person hackathon on
Saturday 2026-08-29, 09:00–18:00 PDT — roughly four net hours of build time, two people,
judged by a LIVE demo in front of a jury at 18:00. It must be defensible in a code
review, but a rule that costs more than it saves inside four hours is a luxury, not a
principle.

## Core Principles

### I. The Live Demo Is the Definition of Done

Every task is judged by one question: is its result visible in the three-minute demo in
front of the jury? What is not seen is not built. A working loop wins; three
half-finished features do not.

The demo loop is: **proposal → sandbox measurement → denial with evidence → the agent's
re-proposal → approval.**

Hard cutoffs (see *Event Clock*): if that end-to-end loop does not close by **14:30
PDT**, all remaining work is cancelled and the rest of the time goes to closing it.
Total code freeze at **16:00 PDT**.

*Rationale: the jury scores what it watches, once. Unseen work scores zero regardless of
its quality.*

### II. Evidence, Not Inference (NON-NEGOTIABLE)

This is the product's invariant, not a style preference. Every Evaluator verdict MUST
cite numbers produced by real code execution in the sandbox against the replica. If no
execution happened, the only permitted verdict is `escalate` to a human.

Emitting `allow` or `deny` based solely on model reasoning is **forbidden**. There is no
time-pressure exception, no demo-day exception, and no "the sandbox was flaky" exception —
sandbox failure produces `escalate`, never a guess.

*Rationale: a verdict from reasoning alone makes us the same classifier every product on
the market already ships, and erases the only reason this project exists.*

### III. The Harness Does the Work

Before writing our own code, verify whether TrueForge already provides the behavior
natively — approvals with a reason visible to the agent, dynamic subagents, generative
UI, code mode, persistent sessions. Own code is written only where the harness does not
reach, and `plan.md` records which harness capability was checked and why it fell short.

*Rationale: this is simultaneously the main prize criterion ("the harness doing the work,
not a thin wrapper") and the reason the project fits in four hours.*

### IV. Verified by a Real Command

Done means a command demonstrated it and its output was read. "Should work" is not a
status.

The demo scenario is **seeded and deterministic, with no randomness** — the live demo
cannot depend on the model's mood. That end-to-end scenario IS this project's required
test.

Given the four-hour budget, a unit test is NOT required for every behavior change. Tests
are required only where they are cheaper than re-running the full scenario. This is a
deliberate calibration to the event clock, not a tacit exception: outside this event, the
default returns to a test per behavior change.

*Rationale: agents and humans both hallucinate success; commands don't. But a test suite
nobody has time to run is also a hallucination.*

### V. One Task = One Branch = One PR = One Qodo Review = Merge

Never commit directly to `main`. Every task gets its own branch and its own pull request.
Every PR goes through Qodo — automatically on open, or triggered with `/agentic_review` —
and its findings are resolved before merge.

This is a mandatory requirement of the code-quality track and **cannot be fabricated
retroactively** at the end of the day. A PR merged without a Qodo review is a violation
that no later review repairs.

*Rationale: the review trail is itself a judged artifact, and it only exists if it is
created in real time.*

### VI. Secrets Never Enter the Repo

The repository is **public from the first commit** — a secret leaked there is
irreversible and visible. Daytona and model-provider keys live in the environment;
`.env.example` documents only the names, never values. A secret's value is never printed
or logged, not even truncated.

*Rationale: every other mistake today is recoverable with a `git revert`. This one is not.*

### VII. One Spec, One Task List (NON-NEGOTIABLE)

No implementation without an approved spec and plan. For this event there is **exactly
one** spec and **exactly one** `tasks.md` covering the whole day. Per-task spec cycles
are not opened.

Every change traces to a task in that `tasks.md`, which traces to a requirement in
`spec.md`. The spec states **what** and **why**; `plan.md` states **how**. Discovering
new scope mid-implementation means **cutting it**, not widening the spec.

*Rationale: unwritten intent cannot be reviewed or handed to another agent — but a
spec ceremony per task would consume the build budget it is meant to protect.*

### VIII. Simplicity First

Ship the minimum that satisfies the spec. No speculative abstractions, no
single-caller indirection, no configuration with one possible value, no error handling
for impossible errors. Complexity must be justified in `plan.md` against a concrete,
present requirement — never a hypothetical future one.

*Rationale: every unused line is permanent cost in reading, testing, and context.*

### IX. Surgical Change

Touch only what the task requires. Preserve surrounding style and structure. Unrelated
bugs, dead code, and formatting drift get reported, not fixed in passing. Public
contracts (APIs, schemas, CLI flags) change only through an explicit spec requirement.

*Rationale: small diffs are reviewable; drive-by refactors hide regressions.*

## Event Clock

Saturday 2026-08-29, all times PDT. These are hard, not aspirational.

| Time      | Gate                                                                     |
| --------- | ------------------------------------------------------------------------ |
| **14:30** | End-to-end loop must close. If it has not: cancel all remaining scope and work only on closing it. |
| **16:00** | Total code freeze. After this, only rehearsal and the demo script.        |
| **18:00** | Live demo, three minutes, in front of the jury.                           |

Scope is the variable. The clock is not.

## Quality Gates

Every change must, before it is called complete:

1. Trace to a task in the single active `tasks.md`.
2. Produce something visible in the three-minute demo, or be cut (Principle I).
3. Have been demonstrated by a real command whose output was read (Principle IV).
4. Never let a verdict path emit `allow`/`deny` without cited execution numbers
   (Principle II).
5. Ship as its own branch and PR, with Qodo findings resolved before merge
   (Principle V).
6. Introduce no secret, credential, or hardcoded environment value (Principle VI).
7. Carry a [Conventional Commits](https://www.conventionalcommits.org/) message.

## Development Workflow

`/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` →
`/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`

This sequence runs **once** for the event, producing one `specs/<n>-<slug>/` directory
that covers the whole day. `/speckit.clarify` runs before planning whenever the spec
contains `[NEEDS CLARIFICATION]`; `/speckit.analyze` runs once before implementing. After
that, implementation proceeds task by task — each task on its own branch and PR
(Principle V) — without re-entering the spec loop.

## Governance

This constitution supersedes ad-hoc convention and agent defaults. Amendments require an
explicit edit here plus a version bump; principles are added or removed deliberately, not
implicitly by counterexample. Any deviation must be recorded in the feature's `plan.md`
under Complexity Tracking with its justification and the simpler alternative rejected.

Principles II (Evidence, Not Inference), V (Qodo review), VI (secrets), and VII (one
spec) admit **no** time-pressure waiver — the clock is a reason to cut scope, never a
reason to cross these. Every other principle yields to Principle I when the two conflict.

Agents load this file through `AGENTS.md` and must flag — not silently work around — a
requested change that violates it.

**Version**: 1.0.0 | **Ratified**: 2026-08-28 | **Last Amended**: 2026-08-28
