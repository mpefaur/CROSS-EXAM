# CLAUDE.md

@AGENTS.md

`AGENTS.md` above is the canonical contract and is imported verbatim. This file adds
only Claude-specific detail. On conflict, **AGENTS.md wins**.

## Karpathy principles — expanded

**1. Think Before Coding** — Don't assume. Don't hide confusion. Surface tradeoffs.
State assumptions explicitly. If a request has two plausible readings, present both and
ask — one question beats a wrong implementation. Name the tradeoff you took and what you
gave up.

**2. Simplicity First** — Minimum code that solves the problem. Nothing speculative.
No features that weren't requested. No abstraction with a single caller. No config flag
with one value. No error handling for errors that can't happen. YAGNI is the default.

**3. Surgical Changes** — Touch only what you must. Clean up only your own mess.
Match the surrounding style even if you'd write it differently. Don't refactor working
code you happened to read. Don't fix unrelated bugs, dead code, or formatting you didn't
create — report them instead.

**4. Goal-Driven Execution** — Define success criteria. Loop until verified.
Turn "make it work" into a checkable statement ("`pytest tests/auth` passes, login
returns 200"). Run it. If it fails, fix and re-run. Report only verified results.

## Workflow

Always Spec → Plan → Tasks → Implement. Concretely:

```
/speckit.constitution   # once per project
/speckit.specify        # what & why  → creates branch + specs/<n>-<slug>/spec.md
/speckit.clarify        # resolve [NEEDS CLARIFICATION] before planning
/speckit.plan           # how → plan.md, research.md, contracts
/speckit.tasks          # tasks.md
/speckit.analyze        # cross-artifact consistency (read-only)
/speckit.implement      # build, verify, done
```

`/speckit.converge` adopts an existing codebase into this flow.

> Spec Kit ≥ 0.15 installs these as Claude **skills** named `speckit-<name>`.
> This template ships `/speckit.<name>` command aliases in `.claude/commands/` so both
> spellings work. Prefer the `/speckit.` form.

Do not write implementation code before `tasks.md` exists — except for one-line typo
fixes and answering questions.

## Response style

- **Caveman `full` is the default.** Dense, telegraphic, technically exact. Drop
  articles and filler. No preamble, no summary of what you just did unless asked.
- Change level with `/caveman lite` (light), `/caveman full` (default), `/caveman ultra`
  (maximum). `normal mode` disables it. `/caveman-stats` shows tokens saved.
- Code, commands, file paths and identifiers are **never** compressed — only prose.

## Shell commands

Prefer RTK over raw tools; it emits the same information with 60–90% fewer tokens.

| Instead of                | Use                             |
| ------------------------- | ------------------------------- |
| `ls -R`                   | `rtk ls`                        |
| `cat file`                | `rtk read file`                 |
| `grep -r pat`             | `rtk grep pat`                  |
| `find . -name`            | `rtk find <pat>`                |
| `git status` / `git diff` | `rtk git status` / `rtk git diff` |
| `npm test` / `pytest`     | `rtk test`                      |
| `eslint` / `ruff`         | `rtk lint`                      |
| noisy stack trace         | `rtk err <cmd>`                 |

Check the payoff with `rtk gain`. If RTK is not installed, fall back to the raw command —
never block on it.

## Before saying "done"

1. Ran the real test/lint/build command and read the actual output.
2. No secrets, keys, tokens, or `.env` values added to tracked files.
3. Diff contains only what the task required (Surgical Changes).
4. Commit message follows Conventional Commits.

If any check failed, say which one and what the output was. Never report success you
did not observe.

## Extra skills

Need a specialized capability (e.g. a niche framework, a data format, a review style)?
Browse <https://github.com/VoltAgent/awesome-agent-skills> and install **only** the
skill that task needs — then note it in `AGENTS.md` §9.
