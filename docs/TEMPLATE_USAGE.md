# Template Usage Guide

Detailed companion to the [README](../README.md). Covers the first feature end to end,
multi-agent setup, customization, and troubleshooting.

---

## 1. Prerequisites

| Tool           | Why                                  | Required |
| -------------- | ------------------------------------ | -------- |
| Git            | Spec Kit creates a branch per feature| yes      |
| Python 3.11+   | Runtime for `specify-cli` (via `uv`) | yes      |
| `uv`           | Installs/updates `specify-cli`       | installed by setup |
| Node 18+       | Caveman installer                    | for Caveman |
| An agent       | Claude Code, Cursor, Cline, Copilot… | yes      |

`./scripts/setup.sh` installs `uv`, `specify-cli`, RTK, and Caveman itself. It never
installs Git, Python, or Node — install those the way your OS expects.

---

## 2. Creating a new project

### From GitHub (template repo)

```bash
gh repo create my-project --template <you>/sdd-vibecoding-template --private --clone
cd my-project
./scripts/setup.sh
```

### From a clone (no GitHub)

```bash
git clone https://github.com/<you>/sdd-vibecoding-template my-project
cd my-project
rm -rf .git && git init -b main       # start a fresh history
./scripts/setup.sh
```

### What setup does

| Step | Action                         | Idempotency guard                        |
| ---- | ------------------------------ | ---------------------------------------- |
| 1    | Install `uv`                   | skipped if `uv` on PATH                  |
| 2    | Install/upgrade `specify-cli`  | `uv tool install --force` is safe to repeat |
| 3    | `specify init`                 | **skipped** if `.specify/memory/constitution.md` exists — your constitution is never overwritten |
| 4    | Install RTK                    | skipped if `rtk` on PATH                 |
| 5    | `rtk init` for detected agent  | `--auto-patch` re-applies harmlessly     |
| 6    | Install Caveman                | installer patches only agents present    |
| 7    | Verify every artifact          | read-only                                |
| 8    | Print summary + next steps     | —                                        |

Flags: `--skip-rtk`, `--skip-caveman`, `--skip-speckit`, `--agent <name>` (same names on
`setup.ps1`, as `-SkipRtk`, `-SkipCaveman`, `-SkipSpeckit`, `-Agent`).

If a step fails the script keeps going and reports it at the end — a missing RTK or
Caveman degrades cost, not correctness.

---

## 3. Configure the project (do this before your first prompt)

Open [`AGENTS.md`](../AGENTS.md) and fill in **§1**:

```markdown
- **Name:** invoice-api
- **Purpose:** REST API that issues and reconciles customer invoices.
- **Stack:** Python 3.12, FastAPI, PostgreSQL, pytest
- **Run:** `uv run fastapi dev` · **Test:** `uv run pytest -q` · **Lint:** `uv run ruff check .` · **Build:** `docker build .`
```

Those four commands are what every agent uses to prove work is done, so they must be real
and runnable. Everything else in `AGENTS.md` works unchanged.

Then run `/speckit.constitution` to adapt
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md). The shipped
version is deliberately light (5 principles + quality gates); add only principles you'd
actually enforce in review — a constitution nobody follows is worse than none.

---

## 4. Your first feature, end to end

```
/speckit.specify  Users authenticate with email and password. Sessions last 24h and
                  can be revoked. Failed logins are rate-limited per account.
```

Creates branch `001-user-auth`, directory `specs/001-user-auth/`, and `spec.md` with
requirements, user stories, and `[NEEDS CLARIFICATION]` markers where you were vague.

```
/speckit.clarify
```

Asks focused questions (token lifetime? lockout policy? password rules?) and writes the
answers back into `spec.md`. **Run this whenever markers remain** — an unresolved marker
becomes a wrong assumption in the plan.

```
/speckit.plan  Use FastAPI + PostgreSQL, argon2 for hashing, JWT access tokens with a
               server-side revocation list. Prefer stdlib over new dependencies.
```

Produces `plan.md`, `research.md`, `data-model.md`, and contracts. Technology choices live
**here**, never in `spec.md`.

```
/speckit.tasks
```

Produces `tasks.md`: ordered, dependency-aware, each mapped to a requirement.

```
/speckit.analyze
```

Read-only consistency report: requirements without tasks, tasks without requirements,
constitution violations, ambiguity that survived clarification. Fix what it finds before
spending implementation tokens.

```
/speckit.implement
```

Executes the tasks, writes the tests, runs them. Review the diff like any PR — the
constitution's Quality Gates section is the checklist.

Optional along the way:

- `/speckit.checklist` — quality checklists validating requirement completeness/clarity.
- `/speckit.taskstoissues` — push `tasks.md` into GitHub Issues.
- `/speckit.converge` — point it at an existing codebase to get the gap tasks.

### Adopting an existing codebase

```bash
cd existing-project
# copy AGENTS.md, CLAUDE.md, .cursor/, .clinerules/, scripts/ from this template
./scripts/setup.sh
```

Then `/speckit.constitution` → `/speckit.converge`. Converge assesses what exists against
your artifacts and appends the remaining work as tasks, instead of pretending the codebase
is greenfield.

---

## 5. Multi-agent setup

Spec Kit is installed here for three integrations. They share `.specify/` and coexist:

| Agent           | Files                                    | How you invoke Spec Kit  |
| --------------- | ---------------------------------------- | ------------------------ |
| **Claude Code** | `.claude/skills/`, `.claude/commands/`   | `/speckit.plan` (alias) or `/speckit-plan` (skill) |
| **Cursor**      | `.cursor/skills/`, `.cursor/rules/`      | `speckit-plan` skill     |
| **Cline**       | `.clinerules/workflows/`, `.clinerules/00-agents.md` | `/speckit-plan.md`  |
| **Others**      | `AGENTS.md` (read by Copilot, Codex, Gemini, Amp, Zed…) | add with `specify integration install <key>` |

Add another agent at any time:

```bash
specify integration list                 # see all keys and multi-install safety
specify integration install copilot      # e.g. GitHub Copilot → .github/prompts/
specify integration upgrade claude       # refresh after a specify-cli update
```

The precedence rule is simple: **`AGENTS.md` is canonical**; agent-specific files add
detail and never contradict it. When you change a rule, change it in `AGENTS.md` first.

### About the `/speckit.` vs `speckit-` naming

Spec Kit ≥ 0.15 ships Claude/Cursor integrations as *skills* named `speckit-<name>`
(directory names can't contain a dot). This template adds thin
`.claude/commands/speckit.<name>.md` aliases that delegate to the matching skill, so the
documented `/speckit.plan` form works in Claude Code. Both are equivalent; the alias files
are 6 lines each and safe to delete if you prefer only the skill names.

---

## 6. Token optimization in practice

### RTK

Verify and inspect:

```bash
rtk init --show     # confirm the agent integration is patched in
rtk gain            # tokens and cost saved so far
rtk discover        # commands you're still running the expensive way
rtk session         # adoption metrics
```

Everyday swaps (all produce the same information, compacted):

```bash
rtk ls                 # instead of ls -R / tree
rtk read src/api.py    # instead of cat
rtk grep "TODO"        # instead of grep -r
rtk find "*.test.ts"   # instead of find
rtk git status         # instead of git status
rtk git diff           # instead of git diff
rtk test               # instead of npm test / pytest / cargo test
rtk lint               # instead of eslint / ruff
rtk err <command>      # collapse a noisy stack trace
```

Re-run `rtk init` after switching agents so the new agent gets the same instructions.

### Caveman

Installed globally by the setup script and active at level **`full`**, which `CLAUDE.md`
also declares so any freshly installed agent inherits it.

```
/caveman lite      light compression — good for docs and user-facing prose
/caveman full      default — dense, technical, no filler
/caveman ultra     maximum — terse notation, for long mechanical runs
normal mode        disable for this session
/caveman-stats     tokens and cost saved
/caveman-commit    conventional commit message, ≤50 chars
/caveman-compress <file>   shrink a memory/context file (~46% input reduction)
```

Caveman compresses **prose only** — code, commands, paths, and identifiers are always
emitted verbatim. If an answer needs to be shared with non-technical readers, drop to
`lite` or `normal mode` for that message.

### The compounding effect

RTK cuts what goes *in*, Caveman cuts what comes *out*, and the Karpathy principles cut
how much work happens at all. Spec Kit underpins all three: an agent that re-reads
`spec.md` and `tasks.md` doesn't need to re-read a 200-message conversation.

---

## 7. Customizing the agent files

**Order of edits**

1. `AGENTS.md` — anything that applies to every agent (stack, commands, conventions).
2. `.specify/memory/constitution.md` — durable project principles and quality gates.
3. `CLAUDE.md` / `.cursor/rules/` / `.clinerules/` — only genuinely agent-specific detail.

**Rules that work**

- Imperative and checkable: "Run `pytest -q` and paste the output before saying done."
- Include the *why* in one clause; agents follow rules they understand.
- Prefer a table or list to a paragraph.
- Delete rules that stopped being true. A stale rule is worse than a missing one.

**Rules that waste tokens**

- Restating general good practice ("write clean code", "be careful").
- Duplicating the same rule in `AGENTS.md` and every agent file.
- Long rationale essays. Move those to `docs/`.

**Budget**: `AGENTS.md` ≤ ~120 lines, `CLAUDE.md` ≤ ~100. These are re-sent on every
request — they're the highest-leverage lines in the repo, in both directions.

---

## 8. Additional skills

The template installs **no** extra skills by design. Every installed skill consumes
context on every request, whether or not it's used.

When a task genuinely needs a specialized capability — a niche framework, a document
format, a domain review style — browse the curated collection at
**<https://github.com/VoltAgent/awesome-agent-skills>** and install only that one.

Checklist before adding a skill:

1. Does an existing skill, or a plain prompt, already cover it?
2. Will it be used more than once?
3. Is it from a source you'd trust with repo access? (Skills can contain instructions —
   read them.)
4. Record it in `AGENTS.md` §9 with one line on why.
5. Remove it when the need passes.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `specify: command not found` | `uv tool install specify-cli --force` then `export PATH="$HOME/.local/bin:$PATH"` (persist it in your shell profile). |
| `/speckit.*` not offered in Claude Code | Restart the agent so it rescans `.claude/`. Confirm `.claude/commands/speckit.specify.md` and `.claude/skills/speckit-specify/` exist. |
| Cursor ignores the rules | `.cursor/rules/*.mdc` need `alwaysApply: true` in frontmatter (both shipped files have it). Reload the window. |
| Cline ignores the rules | Rules live in `.clinerules/`; confirm `.clinerules/00-agents.md` is present and the workspace root is the repo root. |
| `specify init` refuses to run | Directory isn't empty — that's expected here. Use `specify init . --integration claude --force`; it merges. |
| Re-running setup wiped my constitution | It shouldn't: step 3 is skipped when `.specify/memory/constitution.md` exists. If you ran `specify init --force` manually, recover it with `git checkout .specify/memory/constitution.md`. |
| Spec Kit scripts fail on Windows | The committed `.specify/scripts/` are POSIX (`sh`). Run them from WSL or Git Bash, or regenerate for PowerShell: `specify init . --integration claude --script ps --force` (back up your constitution first). |
| `rtk: command not found` after install | Add `~/.local/bin` and `~/.cargo/bin` to PATH, or install via `brew install rtk`. Agents fall back to raw commands — nothing breaks. |
| Caveman install fails | Needs Node ≥ 18. Verify with `node -v`; re-run `curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh \| bash`. |
| Agent skips straight to code | Point it at `AGENTS.md` §2 and ask for `/speckit.specify` first. If it happens repeatedly, tighten the rule — don't repeat it every prompt. |
| Spec Kit files look outdated | `uv tool install specify-cli --force && specify integration upgrade claude`. |

---

## 10. Reference

- Spec Kit — <https://github.com/github/spec-kit>
- RTK — <https://github.com/rtk-ai/rtk>
- Caveman — <https://github.com/JuliusBrussee/caveman>
- Karpathy skills — <https://github.com/multica-ai/andrej-karpathy-skills>
- Curated skills — <https://github.com/VoltAgent/awesome-agent-skills>
- Conventional Commits — <https://www.conventionalcommits.org/>
- `AGENTS.md` convention — <https://agents.md>
