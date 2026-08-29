# Qodo playbook — how this repo argues with its reviewer

Operational detail behind [AGENTS.md](../AGENTS.md) §7 and Constitution V
(*One Task = One Branch = One PR = One Qodo Review = Merge*). Using Qodo is a hard
requirement of the Best Code Quality track, and the review trail is itself a judged
artifact: it exists only if it is created in real time.

The bar is not "Qodo ran". The bar is **a productive conversation** — the agent reproduces
what Qodo found, challenges what it cannot verify, and closes every thread with a reason.

## 1. What Qodo already knows about us

Qodo imports review rules automatically from `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`,
`.claude/skills/<name>/SKILL.md`, `best_practices.md` and `RULE.md`, and rules scope to the
folder that contains the file. **Our constitution is therefore already the review standard.**
Do not restate it in a Qodo-specific file — that is duplication, and it drifts.

It reviews against the full codebase, the PR history, and linked artifacts — not the diff
alone — and reports in six categories: **Bugs**, **Rule violations**, **Requirement gaps**
("where a pull request misses its linked spec"), **UX deviations**, **Cross-repository
conflicts**, **Skill-related findings**.

Consequence for us: *Requirement gaps only fires if the PR says which requirement it
implements.* Every PR body links its task and its FR/SC (§7 template).

## 2. Commands — verbatim, nothing invented

| Command | What it does |
| --- | --- |
| `/agentic_review` | the main review; prioritized findings. Automatic on open/reopen/ready-for-review |
| `/agentic_describe` | structured PR summary |
| `/ask <question>` | answers a question about the PR and its changes |
| `/checks` | analyzes a CI failure and surfaces debugging context |
| `/config` | prints supported configuration keys and defaults |
| `/generate_labels` | suggests PR labels |

Chat triggers: `@qodo …`, `/qodo …`, or a bare `qodo …` at the start of the comment.
**Re-mention `@qodo` on every reply, including follow-ups in a thread it already answered** —
otherwise it stays silent and the thread dies unresolved.

Remediation (`/fix`, auto-fix, "Fix with Chat Agent") depends on `[fixer_agent]` /
`[chat_agent]` being enabled in the portal or `.pr_agent.toml`. Check with `/config` before
relying on it; never assume it is on.

## 3. Opening a PR (once per task)

1. Branch `task/<TaskID>-<slug>` off `main`, one task only (Constitution V, IX).
2. Open the PR with the §7 body template. The review starts automatically.
3. No review comment within ~2 minutes → post `/agentic_review` once. Qodo acknowledges with
   a 👀 reaction; if that reaction never appears, the integration is the problem, not the queue.
4. Read the **Findings Overview** before any individual finding: severity tiers
   (High / Medium / Low) and relevance stars (⭐⭐⭐ … ⭐) are the triage order.

## 4. The finding protocol — triage in writing, before touching code

Every finding gets exactly one of three labels, stated in a reply. Nothing is closed silently.

**A. CONFIRMED** — you reproduced it.
Reproduce *first*: run the command, cite the failing line, show the number. Then fix, then
reply with the real output and the fix commit SHA. A finding is not confirmed because it
sounds right; it is confirmed because a command said so (Constitution IV).

**B. UNSURE** — you cannot verify it either way. **Do not apply it. Challenge it.**
This is the default when the finding rests on an assumption about code Qodo inferred rather
than read, on runtime behavior nobody exercised, or on a tradeoff the spec already settled.
Applying an unverified suggestion is the same failure as writing unverified code.

**C. WRONG or NOT APPLICABLE** — dismiss in plain language using Qodo's own taxonomy, which
it records: **Rejected** (the finding is incorrect), **Deferred** (real, handled outside this
PR — say where), **Intentional** (the flagged behavior is deliberate — say why).

Two hard rules, no waiver:

- **Never apply a suggestion you cannot explain in one sentence.** "Qodo recommended it" is
  not a reason and does not survive a jury question.
- **A suggestion that would violate the constitution is challenged, never applied** — name
  the principle in the reply. The likely ones here: a `try/catch` that falls back to a
  decisive verdict (II), a defensive branch for an impossible error (VIII), a drive-by
  refactor of code the task did not touch (IX).

## 5. How to challenge so the answer is worth something

A challenge that is just "I disagree" wastes the turn. A good one names four things:

> `@qodo` In `packages/core/src/verdict/decide.ts:42` you flag the missing `catch` around the
> executor call. I think that assumes `run()` can throw — the contract
> (`contracts/measurement-executor.md`) has both executors return `Measurement | null` and
> never throw, and `local.ts:31` swallows its own errors. **Is there a path where `run()`
> throws that I am not seeing?** If not, catching here would let a failed measurement reach
> rule 6 as a `deny`, which Constitution II forbids — no measurement must produce `escalate`.

Then honor the answer:

- Qodo comes back with **new evidence** (a path you missed, a caller you did not read) → say
  so, apply, cite the evidence. Being wrong in public and fixing it is the productive outcome.
- Qodo **concedes or restates without new evidence** → dismiss as **Rejected**, one line, move on.

Never leave the exchange hanging. An open thread at merge time is an unresolved finding.

## 6. Worked examples

**Challenge that wins.** Qodo: "wrap the sandbox call in try/catch and default to the previous
verdict on failure." → Challenge citing Constitution II: a fallback verdict without cited
execution numbers is exactly what this project exists to refuse; the correct default is
`escalate`, already rule 2. Dismiss as **Rejected**, quote the principle.

**Challenge that loses.** Qodo: "`CROSSEXAM_ESCALATION_THRESHOLD_USD` is compared against a
cents value." → Ask for the two lines it means, run the verdict suite at $96,310, watch it
escalate instead of deny. Qodo was right and the P1 demo was one commit from breaking.
Fix, paste the now-passing output, thank it in the thread.

**Defer.** Qodo flags missing tests on the MCP handler. Real, but spec § Out of Scope caps unit
tests at three pure functions (Constitution IV, research D-12). Dismiss as **Intentional**,
link the decision — not as "won't fix".

## 7. PR body template

~~~markdown
## Task
T0XX — <task title>, from `specs/001-cross-exam-evaluator/tasks.md`

## Requirement
FR-0XX / SC-0XX — <one line of what the spec asks>
Spec: specs/001-cross-exam-evaluator/spec.md · Plan: .../plan.md

## Verified by
```
<the real command and its real output>
```

## Notes for review
<anything deliberately not done, and why>
~~~

The Task and Requirement lines are what let Qodo detect a **Requirement gap**. Without them
it can only review style.

## 8. Before merge — non-negotiable

- [ ] Every **High** finding is fixed or dismissed with a stated reason.
- [ ] Every finding — all severities — has at least one reply. Zero silent closes.
- [ ] Fixes pushed, then `/agentic_review` re-run so the review matches the merged tree.
      Merging on a stale review is a fabricated trail.
- [ ] `pnpm test` / `pnpm lint` / `pnpm build` output pasted in the PR, read not assumed.
- [ ] No credential value anywhere in the diff, the PR body, or the pasted output
      (Constitution VI, FR-023).

## 9. Anti-patterns

- Batch-applying every suggestion to clear the list — unreviewed code with extra steps.
- "Apply Suggestion" on a finding you never reproduced.
- Resolving a thread with a reaction instead of a reply.
- Forgetting `@qodo` on a follow-up, then reporting the thread as answered.
- Force-pushing over the commits a finding points at.
- Writing the conversation after the merge. It cannot be fabricated retroactively
  (Constitution V) and the timestamps show it.
