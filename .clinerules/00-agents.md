# Cline Rules

`AGENTS.md` at the repo root is the canonical contract. Read it before non-trivial work;
everything below is a summary of it.

## Workflow — Spec-Driven Development

Spec Kit workflows live in `.clinerules/workflows/` and run as
`/speckit-constitution.md`, `/speckit-specify.md`, `/speckit-clarify.md`,
`/speckit-plan.md`, `/speckit-tasks.md`, `/speckit-analyze.md`,
`/speckit-implement.md`, `/speckit-converge.md`.

```
constitution → specify → [clarify] → plan → tasks → [analyze] → implement
```

- One feature = one branch = one `specs/<n>-<slug>/` directory.
- `spec.md` = what & why. `plan.md` = how.
- `[NEEDS CLARIFICATION]` blocks planning.
- No implementation code before `tasks.md` exists.

## Behavior — Karpathy principles

1. **Think Before Coding** — don't assume, don't hide confusion, surface tradeoffs.
2. **Simplicity First** — minimum code that solves the problem, nothing speculative.
3. **Surgical Changes** — touch only what you must, clean up only your own mess.
4. **Goal-Driven Execution** — define success criteria, loop until verified.

## Token discipline

Prefer [RTK](https://github.com/rtk-ai/rtk) in the terminal: `rtk ls`, `rtk read`,
`rtk grep`, `rtk find`, `rtk git status`, `rtk git diff`, `rtk test`, `rtk lint`,
`rtk err`. Same information, 60–90% fewer tokens; `rtk gain` reports the savings.
Keep prose dense — no preamble, no recap. Never compress code, paths, or identifiers.

## Non-negotiables

- **Verify before "done"**: run the real test/lint/build command and read its output.
- **Secrets**: never hardcode or commit keys, tokens, passwords, or `.env` files.
  `.env.example` carries key names with dummy values.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/).
  Don't commit or push unless asked.
- **Extra skills**: only when truly needed, from
  <https://github.com/VoltAgent/awesome-agent-skills>.
