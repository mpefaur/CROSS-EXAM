# sdd-vibecoding-template

A clean, stack-agnostic starting point for **any** new project built with an AI coding
agent: [Spec-Driven Development](https://github.com/github/spec-kit) for the workflow,
[RTK](https://github.com/rtk-ai/rtk) + [Caveman](https://github.com/JuliusBrussee/caveman)
for token cost, and [Karpathy's principles](https://github.com/multica-ai/andrej-karpathy-skills)
for agent behavior.

Built for **VS Code + Claude** (Claude Code, Cline, Cursor). No opinion about your
language, framework, or architecture.

---

## What's inside

| Piece                      | What it gives you                                                     |
| -------------------------- | --------------------------------------------------------------------- |
| **GitHub Spec Kit**        | `/speckit.*` workflow, templates, scripts, and a base constitution     |
| **RTK**                    | Shell output at 60–90% fewer tokens (`rtk ls/read/grep/git/test/…`)    |
| **Caveman**                | Dense agent prose — ~65% fewer output tokens, default level `full`     |
| **Karpathy principles**    | Think → Simplify → Stay surgical → Verify, wired into every agent file |
| **`AGENTS.md`**            | Canonical cross-agent contract — one source of truth                   |
| **`CLAUDE.md`**            | Claude Code entry point; imports `AGENTS.md`                           |
| **`.cursor/rules/`**       | Cursor rules (Karpathy + SDD workflow), always applied                 |
| **`.clinerules/`**         | Cline rules + Spec Kit workflows                                       |
| **`scripts/setup.*`**      | Idempotent bootstrap for macOS/Linux/WSL and Windows                   |

```
sdd-vibecoding-template/
├── .specify/          Spec Kit: constitution, templates, scripts, workflows
├── .claude/           Claude skills (speckit-*) + /speckit.* command aliases
├── .cursor/           Cursor rules + Spec Kit skills
├── .clinerules/       Cline rules + Spec Kit workflows
├── docs/TEMPLATE_USAGE.md
├── scripts/           setup.sh · setup.ps1
├── AGENTS.md          canonical agent contract
├── CLAUDE.md          Claude Code entry point (imports AGENTS.md)
├── .editorconfig · .env.example · .gitignore · LICENSE
```

---

## Start a new project

```bash
# 1. Get the template (pick one)
gh repo create my-project --template <you>/sdd-vibecoding-template --private --clone
#   …or: git clone https://github.com/<you>/sdd-vibecoding-template my-project \
#          && rm -rf my-project/.git && cd my-project && git init -b main

cd my-project

# 2. Bootstrap the toolchain (idempotent — safe to re-run)
./scripts/setup.sh          # macOS / Linux / WSL
.\scripts\setup.ps1         # Windows PowerShell 5.1+

# 3. Tell the agents what this project is
$EDITOR AGENTS.md           # fill in §1: name, purpose, stack, run/test/lint commands

# 4. Open in your agent and start the flow
claude                      # or Cursor / Cline / VS Code
```

Then, inside the agent:

```
/speckit.constitution   Adapt the base constitution to this project
/speckit.specify        Describe the first feature — what & why
/speckit.clarify        Answer the questions that de-risk the spec
/speckit.plan           Choose the stack and the approach — how
/speckit.tasks          Break it into ordered, testable tasks
/speckit.analyze        Check spec ↔ plan ↔ tasks consistency
/speckit.implement      Build it, verified
```

> **Naming note.** Spec Kit ≥ 0.15 installs these as Claude *skills* named
> `speckit-<name>`. This template ships `/speckit.<name>` aliases in
> `.claude/commands/`, so both spellings work in Claude Code. In Cursor use the
> `speckit-*` skills; in Cline use `/speckit-*.md` workflows.

---

## Recommended workflow

```
constitution ──> specify ──> clarify ──> plan ──> tasks ──> analyze ──> implement
   (once)         what/why    de-risk     how     ordered    consistency   verified
```

- **`clarify` before `plan`.** Any `[NEEDS CLARIFICATION]` marker left in the spec turns
  into a wrong assumption in the plan. One round of questions is far cheaper than
  rebuilding a misunderstood feature.
- **`analyze` before `implement`.** It's read-only: it reports requirements with no task,
  tasks with no requirement, and constitution violations — before you spend tokens coding.
- **One feature = one branch = one `specs/<n>-<slug>/` directory.** `/speckit.specify`
  creates all three.
- **`spec.md` says *what and why*; `plan.md` says *how*.** Keep tech choices out of specs.
- **Existing codebase?** `/speckit.converge` assesses it against your artifacts and
  appends the gaps as tasks.
- **Scope creep goes back to the spec**, not into the diff.

---

## How this saves tokens

Three independent layers, no overlap:

1. **RTK — input tokens.** Wraps common dev commands and returns the same information in a
   compact form: `rtk ls`, `rtk read`, `rtk grep`, `rtk find`, `rtk git status`,
   `rtk git diff`, `rtk test`, `rtk lint`, `rtk err`. Typically 60–90% smaller than the raw
   output. Check your own numbers:

   ```bash
   rtk gain        # savings report
   rtk discover    # commands you're still running the expensive way
   ```

2. **Caveman — output tokens.** Compresses the agent's *prose* (never code, paths, or
   identifiers). Default level here is `full`.

   ```
   /caveman lite | full | ultra     switch level (persists for the session)
   normal mode                      turn it off
   /caveman-stats                   tokens and cost saved
   ```

3. **Karpathy principles — wasted work.** The cheapest token is the one never generated.
   Simplicity First kills speculative code; Surgical Changes keeps diffs small;
   Goal-Driven Execution stops the retry loops that burn whole context windows.

On top of that, Spec Kit itself is a token strategy: a spec the agent re-reads is far
cheaper than re-deriving intent from a long chat history.

---

## Customizing `AGENTS.md` / `CLAUDE.md`

`AGENTS.md` is the **canonical contract** — every agent reads it. `CLAUDE.md` imports it
with `@AGENTS.md` and adds only Claude-specific detail.

1. **Always edit `AGENTS.md` first.** §1 (project, stack, commands) is mandatory; §9 tracks
   any extra skills you install.
2. **Put shared rules in `AGENTS.md`.** Only genuinely Claude-specific behavior belongs in
   `CLAUDE.md`; Cursor-specific rules go in `.cursor/rules/`, Cline's in `.clinerules/`.
3. **Keep both short.** These files are re-sent on every request — every line is a
   recurring cost. If `AGENTS.md` passes ~120 lines, move the detail into `docs/`.
4. **Write rules as commands, not essays.** "Run `pytest -q` before saying done" beats a
   paragraph about the value of testing.
5. **Project-wide conventions belong in the constitution**, not in agent files.

---

## Useful commands

| Command                                   | What it does                            |
| ----------------------------------------- | --------------------------------------- |
| `./scripts/setup.sh`                      | Bootstrap / repair the toolchain        |
| `./scripts/setup.sh --skip-rtk --skip-caveman` | Spec Kit only                      |
| `specify check`                           | Which agents and tools are detected     |
| `specify integration list`                | Installed / available agent integrations|
| `specify integration install <key>`       | Add another agent (e.g. `copilot`)      |
| `uv tool install specify-cli --force`     | Install or upgrade the Spec Kit CLI     |
| `rtk gain` · `rtk discover`               | Token savings · missed opportunities    |
| `rtk init --show`                         | Verify the RTK agent integration        |
| `/caveman full` · `/caveman-stats`        | Compression level · savings             |

---

## Additional skills

This template installs **no** extra skills on purpose — every loaded skill costs context
on every request.

When a task genuinely needs a specialized capability, browse the curated collection at
**<https://github.com/VoltAgent/awesome-agent-skills>** and install **only** what that task
requires. Then record it in `AGENTS.md` §9 so the next person (or agent) knows why it's
there. Remove skills you stopped using.

---

## Docs

- [docs/TEMPLATE_USAGE.md](docs/TEMPLATE_USAGE.md) — detailed guide: first feature
  walkthrough, multi-agent setup, troubleshooting, adapting the template.
- [AGENTS.md](AGENTS.md) — the contract every agent follows.
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — project principles.

## Author

Created and maintained by [**@mpefaur**](https://github.com/mpefaur).

Contributions are welcome — open an issue or a PR. Please follow the workflow this
template teaches: spec first, [Conventional Commits](https://www.conventionalcommits.org/),
and a verified test run before marking anything done.

## License

MIT — see [LICENSE](LICENSE).
