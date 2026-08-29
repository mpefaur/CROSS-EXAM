# AGENTS.md — Canonical Agent Contract

Single source of truth for **every** coding agent in this repo (Claude Code, Cursor,
Cline, Copilot, Codex, Gemini…). Agent-specific files (`CLAUDE.md`,
`.cursor/rules/`, `.clinerules/`) import or restate this file — they never contradict it.

> Replace the `<PROJECT>` placeholders below when you start a real project.
> Keep this file short. If it grows past ~120 lines, move detail into `docs/`.

## 1. Project

- **Name:** CROSS-EXAM
- **Purpose:** An adversarial evaluator agent that measures the real blast radius of
  another agent's irreversible action — by executing it against an isolated replica —
  and cross-examines that agent with the evidence before the action reaches production.
- **Stack:** TypeScript on Node 22.14+, pnpm workspace. TrueForge harness (local mode,
  `:8790`) via `@truefoundry/trueforge-sdk`; two custom streamable-HTTP MCP servers
  (`@modelcontextprotocol/sdk`); a seeded deterministic ledger.
- **Run:** `pnpm demo` · **Test:** `pnpm test` · **Lint:** `pnpm lint` · **Build:** `pnpm build`

> The four commands exist since Wave 1 (T001–T005). "Verified" means the command was run
> and its output read — see the constitution's Verified by a Real Command principle.

## 2. Workflow — Spec-Driven Development (non-negotiable)

Never jump straight to code. Follow [GitHub Spec Kit](https://github.com/github/spec-kit):

```
constitution → specify → [clarify] → plan → tasks → [analyze] → implement
```

| Step                    | Command                  | Output                              |
| ----------------------- | ------------------------ | ----------------------------------- |
| Principles (once)       | `/speckit.constitution`  | `.specify/memory/constitution.md`   |
| What & why              | `/speckit.specify`       | `specs/<n>-<slug>/spec.md`          |
| De-risk ambiguity       | `/speckit.clarify`       | updated `spec.md`                   |
| How                     | `/speckit.plan`          | `plan.md`, `research.md`, contracts |
| Break down              | `/speckit.tasks`         | `tasks.md`                          |
| Consistency check       | `/speckit.analyze`       | report (no writes)                  |
| Build                   | `/speckit.implement`     | code + tests                        |
| Adopt existing codebase | `/speckit.converge`      | gap tasks appended                  |

Rules:

- **One spec, one `tasks.md` for the whole event** — one `specs/<n>-<slug>/` directory.
  The chain above runs once; no per-task spec cycles. (Constitution VII.)
- Implementation then goes **task by task, each on its own branch and PR** (§7).
- The spec describes **what and why**, never *how*. Implementation detail lives in `plan.md`.
- Any `[NEEDS CLARIFICATION]` marker blocks `/speckit.plan`. Resolve it first.
- New scope discovered mid-implementation gets **cut**, not added to the spec.

## 3. Behavior — Karpathy principles

1. **Think Before Coding** — don't assume, don't hide confusion, surface tradeoffs.
2. **Simplicity First** — minimum code that solves the problem, nothing speculative.
3. **Surgical Changes** — touch only what you must, clean up only your own mess.
4. **Goal-Driven Execution** — define success criteria, loop until verified.

Expanded in [CLAUDE.md](CLAUDE.md) and [.cursor/rules/karpathy.mdc](.cursor/rules/karpathy.mdc).

## 4. Verification (definition of done)

A task is done only when a **real command** proves it — never "should work".

- Run the project's test/lint/build commands from §1 and paste the actual result.
- The **seeded, deterministic end-to-end demo scenario is the required test**. Unit tests
  are written only where they are cheaper than re-running that scenario. (Constitution IV —
  a deliberate calibration to the 4-hour budget, not a tacit exception.)
- A verdict path never emits `allow`/`deny` without cited execution numbers; no execution
  means `escalate`. (Constitution II — no waiver.)
- If verification is impossible, say so explicitly instead of implying success.

## 5. Token discipline

- **Shell output → use [RTK](https://github.com/rtk-ai/rtk)** whenever an equivalent exists:
  `rtk ls`, `rtk read`, `rtk grep`, `rtk find`, `rtk git status`, `rtk git diff`,
  `rtk test`, `rtk lint`, `rtk err`. 60–90% fewer tokens, same information.
- **Prose → [Caveman](https://github.com/JuliusBrussee/caveman) `full` by default.** Dense,
  telegraphic answers. No preamble, no recap, no "great question".
- Read the narrowest slice of a file that answers the question; avoid whole-file dumps.

## 6. Security

- **Never** hardcode or commit secrets: API keys, tokens, passwords, private keys, `.env`.
- `.env.example` is committed (keys only, dummy values). `.env*` is gitignored.
- Secrets come from the environment or a secret manager at runtime.
- Never print, log, or echo a secret's value — not even truncated.
- Never disable auth, TLS verification, or security checks "to make it work".

## 7. Git

- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`
  (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`).
  Imperative mood, ≤72 chars, `!` or `BREAKING CHANGE:` for breaks.
- **One task = one branch = one PR = one Qodo review = merge.** Never commit directly to
  `main`. Opening the branch and PR for a task in `tasks.md` is pre-authorized — no need
  to ask each time. Anything outside that (pushing `main`, releases) still needs a request.
- Every PR passes Qodo — automatic on open, or triggered with `/agentic_review` — and its
  findings are resolved **before** merge. This cannot be fabricated retroactively.
  (Constitution V.) Full protocol: [docs/qodo-playbook.md](docs/qodo-playbook.md).
  The four rules that never bend:
  1. Every finding gets a written reply — **confirmed** (reproduced by a real command),
     **challenged** (you could not verify it), or **dismissed** (Rejected / Deferred /
     Intentional, with the reason). No silent closes, no reaction-only resolutions.
  2. Never apply a suggestion you cannot explain in one sentence, and never one you have
     not reproduced. "Qodo recommended it" is not verification (Constitution IV).
  3. A suggestion that would violate the constitution is challenged and the principle is
     named — never applied quietly.
  4. Re-run `/agentic_review` after the fix commits; merging on a stale review is a
     fabricated trail.
- The PR body names its task and its FR/SC (playbook §7) — that is what lets Qodo detect a
  requirement gap against `spec.md` instead of reviewing style alone.
- Never force-push shared branches.

## 8. Extra skills

Only when a task genuinely needs a specialized capability, pick from the curated
collection at <https://github.com/VoltAgent/awesome-agent-skills> and install **only**
what is needed. Unused skills are pure context tax. Record every addition in §9.

## 9. Repo map

```
.specify/        Spec Kit: constitution, templates, scripts, workflows
.claude/         Claude Code: speckit skills + /speckit.* command aliases
.cursor/rules/   Cursor rules (Karpathy + SDD workflow)
.clinerules/     Cline rules + speckit workflows
specs/           One directory per feature (created by /speckit.specify)
scripts/         setup.sh / setup.ps1 — idempotent toolchain bootstrap
docs/            Extended documentation
AGENTS.md        This file — canonical contract
CLAUDE.md        Claude Code entry point (imports this file)
```
