# Project Constitution

<!--
  Base constitution shipped with sdd-vibecoding-template.
  Stack-agnostic and intentionally light: 5 principles you can defend in a code review.
  Run /speckit.constitution to adapt it to your project, then bump the version below.
  Every /speckit.plan and /speckit.analyze run is checked against this file.
-->

**Project**: `<PROJECT_NAME>`

## Core Principles

### I. Spec Before Code (NON-NEGOTIABLE)

No implementation without an approved spec and plan. Every change traces to a task in
`specs/<n>-<slug>/tasks.md`, which traces to a requirement in `spec.md`. Specs state
**what** and **why**; `plan.md` states **how**. Discovering new scope mid-implementation
means going back to the spec, not widening the diff.

*Rationale: unwritten intent cannot be reviewed, tested, or handed to another agent.*

### II. Simplicity First

Ship the minimum that satisfies the spec. No speculative abstractions, no
single-caller indirection, no configuration with one possible value, no error handling
for impossible errors. Complexity must be justified in `plan.md` against a concrete,
present requirement — never a hypothetical future one.

*Rationale: every unused line is permanent cost in reading, testing, and context.*

### III. Verified, Not Assumed

Done means a real command proved it. Each requirement has an observable acceptance
criterion, and each behavior change ships with a test that fails without it. Test and
lint output is read, not imagined. "Should work" is not a status.

*Rationale: agents and humans both hallucinate success; commands don't.*

### IV. Surgical Change

Touch only what the task requires. Preserve surrounding style and structure. Unrelated
bugs, dead code, and formatting drift get reported, not fixed in passing. Public
contracts (APIs, schemas, CLI flags) change only through an explicit spec requirement.

*Rationale: small diffs are reviewable; drive-by refactors hide regressions.*

### V. Secure and Reproducible by Default

Secrets never live in the repository — not in code, config, fixtures, logs, or history.
`.env.example` documents the keys; real values come from the environment. Dependencies
are pinned via committed lockfiles. Setup and verification run from a documented command
on a clean machine.

*Rationale: a leaked key and an unreproducible build are both unrecoverable failures.*

## Quality Gates

Every change must, before it is called complete:

1. Trace to a task in the active feature's `tasks.md`.
2. Pass the project's test, lint, and build commands (recorded in `AGENTS.md` §1).
3. Add or update tests covering the new behavior.
4. Introduce no new secret, credential, or hardcoded environment value.
5. Carry a [Conventional Commits](https://www.conventionalcommits.org/) message.

## Development Workflow

`/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` →
`/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`

One feature per branch (`<n>-<slug>`) and per `specs/` directory. `/speckit.clarify`
runs before planning whenever the spec contains `[NEEDS CLARIFICATION]`;
`/speckit.analyze` runs before implementing. Both are cheap next to reworking a
misunderstood feature.

## Governance

This constitution supersedes ad-hoc convention and agent defaults. Amendments require an
explicit edit here plus a version bump; principles are added or removed deliberately, not
implicitly by counterexample. Any deviation must be recorded in the feature's `plan.md`
under Complexity Tracking with its justification and the simpler alternative rejected.
Agents load this file through `AGENTS.md` and must flag — not silently work around — a
requested change that violates it.

**Version**: 1.0.0 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-08-04
