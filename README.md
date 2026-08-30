![](https://img.shields.io/badge/TypeScript-informational?style=flat&logo=typescript&logoColor=white&color=6aa6f8) ![](https://img.shields.io/badge/Node.js_22-informational?style=flat&logo=nodedotjs&logoColor=white&color=6aa6f8) ![](https://img.shields.io/badge/pnpm-informational?style=flat&logo=pnpm&logoColor=white&color=6aa6f8) ![](https://img.shields.io/badge/TrueForge-informational?style=flat&logoColor=white&color=6aa6f8) ![](https://img.shields.io/badge/MCP-informational?style=flat&logo=modelcontextprotocol&logoColor=white&color=6aa6f8) ![](https://img.shields.io/badge/Python_3-informational?style=flat&logo=python&logoColor=white&color=6aa6f8) ![](https://img.shields.io/badge/Zod-informational?style=flat&logo=zod&logoColor=white&color=6aa6f8) ![](https://img.shields.io/badge/Vitest-informational?style=flat&logo=vitest&logoColor=white&color=6aa6f8)

# CROSS-EXAM



### A dry run for AI actions that cannot be undone.

It runs the action on a copy of the data first, then makes the AI account for the gap
between what it promised and what the copy actually shows.

---

**An AI is told to refund some disputed charges. It reports back: 7 refunds, $840.**

**It is actually about to refund 1,204 charges worth $96,310, and 611 of them were already
refunded once. Every safety check waves it through.**

The checks all read what the AI *said* it was going to do. None of them ran it.

CROSS-EXAM runs it. On a copy of the database, before anything real happens. Then it goes
back to the AI with the receipt: *you said $840. It's $96,310, and 611 of these are
duplicates. Denied.* The AI rewrites its own rule and tries again. Second time the numbers
match what it promised, and the refund goes out for real.

You cannot un-send a refund. That is the whole reason to look before, not after.

*The figures above are a seeded demo scenario; the test data is built to produce them. The
grammar, the ledgers, the measurement, the verdict rules and the resolver are built and
tested; the end-to-end demo wiring is the open item. See [Status](#status).*

**Built by** 
[@MicroProofs](https://github.com/MicroProofs) ·
[@mpefaur](https://github.com/mpefaur) ·
[@TomasDmArg](https://github.com/TomasDmArg)

---



## Why the usual checks miss it

Four controls sit in front of that refund. All four pass:


| Control                        | Result | What it actually inspects         |
| ------------------------------ | ------ | --------------------------------- |
| Per-action ceiling ($2,000)    | passes | the $840 the AI declared          |
| Per-customer frequency cap     | passes | the scope the AI declared         |
| Eligibility policy check       | passes | the rule as written, not as run   |
| Model self-reported confidence | 0.94   | the model's own opinion of itself |


Every one of them grades a *prediction*. The refund rule itself, the thing that decides
who actually gets money, is never executed until it executes for real, on production, at
which point the gap between $840 and $96,310 has already left the building.

## The approach

Execute the proposed criteria against a replica ledger, and use the count that comes back.


|                  | Declared by the agent | Measured on the replica                     | Verdict |
| ---------------- | --------------------- | ------------------------------------------- | ------- |
| First proposal   | 7 charges · $840.00   | 1,204 charges · $96,310.00 · 611 duplicates | `deny`  |
| After correction | 7 charges · $840.00   | 7 charges · $840.00 · 0 duplicates          | `allow` |


The denial hands the agent the measured numbers as its reason. The agent narrows its own
criteria and proposes again; the second proposal is measured the same way, and only then
does the action run against production.

> These figures come from the seeded fixtures, which are **designed** to produce them
> ([research.md](specs/001-cross-exam-evaluator/research.md) D-05). They are the scenario's
> expected output, not a result that has been observed. No code exists yet.



### What runs


| Step         | What happens                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Propose   | The agent calls an irreversible MCP tool (`bulk_refund`, `issue_payout`, `close_account`). All three are `destructive: true` under `require_approval_for_tools: ["@all"]`, so the call pauses for approval. |
| 2. Intercept | The Bench takes the pause instead of a human: the chat shows no Allow/Deny — only *Under review by CROSS-EXAM…*. `tool.approval_required` carries only an event id, so the Bench walks back to the `model.message` and rebuilds the grammar line from the synthesised call's raw fields. |
| 3. Measure   | `measure.py` runs the proposed criteria against the replica ledger in a local isolated executor. This is the only component allowed to produce a number.                                                  |
| 4. Decide    | `decide()` applies five ordered rules and returns `allow`, `deny`, or `escalate`.                                                                                                                           |
| 5. Correct   | On a denial, the agent reads the measured figures and re-proposes. The correction comes from the evidence rather than from a scripted second turn.                                                          |
| 6. Execute   | On `allow`, the action is applied to the production ledger.                                                                                                                                                 |




### Evidence, not inference

A verdict path never returns `allow` or `deny` without numbers from an actual execution.
No measurement means `escalate`: it goes to a human, with the action left unexecuted and no
timeout that auto-approves.

Four situations reach that escalation: the proposal did not parse, no measurement was
produced, the agent declared no figures, or the measured value crossed the configured
threshold. The plan enforces this with types rather than convention: `Verdict.evidence`
is non-null unless the verdict is `escalate`, and a `Measurement` can only be constructed
by `measure()` ([data-model.md](specs/001-cross-exam-evaluator/data-model.md)
§9, [constitution](.specify/memory/constitution.md) II).

### Refunds are the demo, not the scope

The server ships three irreversible actions: `bulk_refund`, `issue_payout` and
`close_account`. One of the four escalation scenarios runs against a **payout** of $418,220
crossing the configured threshold, not against a refund at all.


| Layer                                                                   | Tied to refunds?                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `decide()`, the five rules                                              | No. It compares a declared figure to a measured one and applies a threshold                                  |
| The wire format and the executor interface                              | No                                                                                                           |
| `measure.py`                                                            | Partly. It counts over two tables (`charges`, `payouts`) with an AND-only predicate over seven named columns |
| The replica dataset                                                     | Yes. It is a payments ledger                                                                                 |


Pointing this at a different domain means supplying a replica of that data, extending
`measure.py` with its tables and fields, and adding the tools. The deciding layer does not
change.

The real boundary is not refunds. It is whether an action's true scope can be computed by
running it against a copy of the data. That is what the deliberately small predicate
grammar buys ([data-model.md](specs/001-cross-exam-evaluator/data-model.md) §5): no `OR`,
no parentheses, no functions, no `eval`, so a proposal is either measurable or it does not
parse, and anything that does not parse escalates.

### What this is not

- **Not a policy engine.** The four guardrails above are hardcoded checks that exist to be
demonstrated passing, not a rules framework.
- **Not a general safety layer.** It handles one class of problem: irreversible actions
whose real scope can be measured by executing them against a replica.
- **Not a replacement for those controls.** It catches a failure they structurally cannot,
which is a different claim from catching more than they do.
- **Not proven.** Nothing has been run end to end yet.

---



## The stack

What each piece actually does here:


|                                                                         | Role                                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **[TrueForge](https://github.com/truefoundry/trueforge)** (TrueFoundry) | The agent harness. Runs both agents, pauses every destructive tool call, streams the events the Bench reads, and shows the chat (patched: no Allow/Deny controls, no raw grammar line) |
| **[MCP](https://modelcontextprotocol.io)** (Model Context Protocol)     | How the irreversible actions are exposed. A streamable-HTTP server publishes `bulk_refund`, `issue_payout` and `close_account`, all marked destructive |
| **TypeScript 5.9.3** on **Node 22.14+**                                 | Everything except the measurement. ESM only, `tsc --noEmit` as the build                                                                               |
| **Python 3**, stdlib only                                               | `measure.py`, the one script allowed to produce a number. No dependencies by design, so there is nothing to install on venue wifi                      |
| **pnpm 9** workspace                                                    | Three packages: `core`, `mcp`, `bench`                                                                                                                 |
| **[Zod](https://zod.dev)**                                              | Tool argument schemas at the MCP boundary                                                                                                              |
| **[Vitest](https://vitest.dev)**                                        | The three unit suites. The seeded end-to-end scenario is the primary test                                                                              |


Storage is seeded JSON fixtures, generated from fixed seeds and committed. No database.

---



## Status

`specs/001-cross-exam-evaluator/` holds the spec, plan, data model, contracts, quickstart,
and the task breakdown. Every task lands on its own branch and PR, reviewed by Qodo
before merge (see [Review trail](#review-trail)).


| Phase            | Delivers                                                        | State                                                        |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Setup         | pnpm workspace; the `demo`/`test`/`lint`/`build` commands       | done                                                         |
| 2. Foundational  | emoji wire grammar, seeded ledgers, patched harness             | done                                                         |
| 3. **US1 (MVP)** | the measured denial loop, end to end                            | resolver landed; `pnpm demo` wiring (T030) and the x3 determinism test (T031) open |
| 4. US3           | every failure mode escalates to a human                         | escalate path audited (T034); scenario flags wait on T030   |
| 5. US2           | four conventional guardrails pass while the damage goes through | checks landed (T037); charge-sheet wiring and trace open     |
| 6-7. US4/US5     | parallel investigators, verdict card                            | not started; cut if the P1 loop misses the cutline           |
| 8. US6           | the docket                                                      | append-only store landed (T044); recording from the resolver open |


Scope is one day, roughly 4 net build hours, two people, one three-minute demo. Everything
at P3 or below is cancelled if the P1 loop has not closed by the 14:30 PDT cutline
([constitution](.specify/memory/constitution.md) I).

---



## Architecture

Most of the machinery is not ours. The pause, the denial reaching the agent, the
re-proposal, the parallel subagents, the verdict card, and the human decision surface are
native TrueForge behavior, used as-is (Constitution III). Own code is confined to the five
things the harness does not reach:

```
apps/bench/          The Bench (the orchestrator)
                     correlates the approval event back to its tool call,
                     serializes turns per session, resolves the verdict
packages/mcp/        Streamable-HTTP MCP server of irreversible actions
                     + the four conventional guardrails that pass
packages/measure/    Streamable-HTTP MCP server of the read-only measure tool,
                     attached only to the Evaluator; opens the replica only
packages/core/
  ├── grammar/       The emoji wire format, the contract between the two agents
  ├── ledger/        RNG-free seeded generator: production and replica, independent seeds
  ├── measure/       measure(): spawn measure.py → Measurement | null
  ├── verdict/       decide(), five ordered rules, the only place a verdict is made
  └── scripts/       measure.py, Python 3 stdlib only, the one measurement script
fixtures/            Generated, committed ledgers: 1,500 charges, 342 payouts
```

**Design constraints:**

- No randomness on the data path. Both ledgers are generated from fixed seeds with no RNG,
so repeated runs report identical counts and dollar amounts.
- The measurement never touches production; the action server never opens the replica.
- `measure.py` is stdlib-only Python: no `eval`, no network, no writes, and it never reads
a path it was not given.
- Money is integer cents everywhere, never a float.
- The replica is generated from its own seed rather than copied from production, so a
measurement cannot silently read the real ledger.



### Pinned versions

Exact pins, no caret ranges anywhere, so a background `pnpm install` cannot change the
demo underneath us:


| Package                                        | Version |
| ---------------------------------------------- | ------- |
| `@truefoundry/trueforge` (local mode, `:8790`) | 0.1.4   |
| `@truefoundry/trueforge-sdk`                   | 0.1.3   |
| `@modelcontextprotocol/sdk`                    | 1.30.0  |
| `zod`                                          | 4.5.2   |
| `tsx`                                          | 4.23.12 |
| `vitest`                                       | 4.1.11  |
| `typescript`                                   | 5.9.3   |


---



## Getting started

**Prerequisites** (the full table is in [quickstart.md](specs/001-cross-exam-evaluator/quickstart.md)):


| Requirement                                        | Check                                  |
| -------------------------------------------------- | -------------------------------------- |
| Node ≥ 22.14                                       | `node -v`                              |
| pnpm 11.4.0                                        | `pnpm -v`                              |
| Python 3                                           | `python3 --version`                    |
| TrueForge on `:8790`                               | `pnpm exec trueforge` from the workspace root — never `npx`; the harness patch applies at `pnpm install` |
| Grammar registry in the harness environment        | `echo $CROSSEXAM_GRAMMAR_REGISTRY_PATH` |
| Model provider key                                 | `OPENAI_API_KEY`                       |


```bash
cp .env.example .env     # fill in real values; .env is gitignored
pnpm install

# in its own terminal, from the workspace root — unset registry path means a stock harness
export CROSSEXAM_GRAMMAR_REGISTRY_PATH=packages/core/src/grammar/registry.json
pnpm exec trueforge

pnpm demo                # one full seeded run of the denial loop
pnpm demo -- --serve     # watch the acting agent's chats in the TrueForge UI and answer their holds
pnpm test                # the seeded scenario x3 (determinism) + three unit suites
pnpm lint                # eslint across the workspace
pnpm build               # tsc --noEmit across all packages
pnpm seed                # regenerate both ledger fixtures from their seeds
```

Never paste a key into a tracked file, and never echo one to check it. No credential value
may appear in the repository, in the demo output, or in the logs.

### Validating it

[quickstart.md](specs/001-cross-exam-evaluator/quickstart.md) carries five runnable
scenarios with the output you must read before calling anything done: the denial loop, the
determinism check, the guardrail contrast, the four escalation paths
(`--scenario unparseable | missing-declared | no-executor | over-threshold`), and the
verdict card.

---



## Development

This repo is **spec-driven**. The chain runs once for the whole event, then implementation
goes task by task:

```
constitution → specify → clarify → plan → tasks → analyze → implement
```

- **One spec, one** `tasks.md`**, one** `specs/<n>-<slug>/` **directory.** No per-task spec cycles.
- **One task = one branch = one PR = one Qodo review = merge.** Nothing lands on `main`
directly, and a review trail cannot be fabricated retroactively.
- **A task is done only when a real command proves it.** The seeded end-to-end scenario is
the required test; unit tests exist only where each is cheaper than re-running that
scenario.
- **New scope discovered mid-implementation gets cut, not added to the spec.**

**Before running** `/speckit.implement`**, read
[docs/parallel-implementation.md**](docs/parallel-implementation.md) for the wave plan, the
four lanes, and the multi-writer files that the `[P]` markers in `tasks.md` do not protect.

### Review trail

Every PR gets a Qodo `/agentic_review` on open and again after fix commits. Each finding
is answered in writing — confirmed by a real command, challenged, or dismissed with the
reason — before merge; a merge on a stale review is a fabricated trail. The protocol is
[docs/qodo-playbook.md](docs/qodo-playbook.md); the trail itself is the
[merged PR list](https://github.com/mpefaur/CROSS-EXAM/pulls?q=is%3Apr+is%3Amerged), one PR
per task, each body naming its task and FR/SC.

Agent behavior is governed by [AGENTS.md](AGENTS.md), the canonical contract every agent
reads; [CLAUDE.md](CLAUDE.md) imports it and adds Claude-specific detail. Token discipline
is inherited from the template: [RTK](https://github.com/rtk-ai/rtk) for shell output,
[Caveman](https://github.com/JuliusBrussee/caveman) `full` for prose.

---



## Repo map

```
specs/001-cross-exam-evaluator/   spec · plan · research · data-model · contracts · tasks · quickstart
docs/
  ├── parallel-implementation.md  execution waves and lanes for /speckit.implement
  ├── qodo-playbook.md            the PR review protocol: confirm / challenge / dismiss
  ├── emoji-grammar.md            the wire format registry, the two-agent contract
  ├── research-findings.md        authoritative research, milestones, demo script
  ├── research-brief.md           superseded where it conflicts with the findings
  └── constitution-input.md       what the constitution was derived from
.specify/memory/constitution.md   the seven principles, non-negotiable
AGENTS.md                         canonical agent contract
CLAUDE.md                         Claude Code entry point (imports AGENTS.md)
```



### Documents worth reading first


| If you want                          | Read                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| What is being built and why          | [spec.md](specs/001-cross-exam-evaluator/spec.md)                  |
| How it is being built                | [plan.md](specs/001-cross-exam-evaluator/plan.md)                  |
| The decisions and their rationale    | [research.md](specs/001-cross-exam-evaluator/research.md)          |
| What to build next                   | [tasks.md](specs/001-cross-exam-evaluator/tasks.md)                |
| What may be built *at the same time* | [docs/parallel-implementation.md](docs/parallel-implementation.md) |
| How to prove it works                | [quickstart.md](specs/001-cross-exam-evaluator/quickstart.md)      |
| The rules that never bend            | [constitution.md](.specify/memory/constitution.md)                 |


---



## Template

This repo was generated from
**[sdd-vibecoding-template](https://github.com/mpefaur/sdd-vibecoding-template)**, a
stack-agnostic starting point pairing [Spec Kit](https://github.com/github/spec-kit) with
RTK, Caveman, and [Karpathy's principles](https://github.com/multica-ai/andrej-karpathy-skills)
(Think Before Coding · Simplicity First · Surgical Changes · Goal-Driven Execution).

[docs/TEMPLATE_USAGE.md](docs/TEMPLATE_USAGE.md) covers the template itself: the first
feature walkthrough, multi-agent setup, and troubleshooting. `./scripts/setup.sh` (or
`.\scripts\setup.ps1`) bootstraps the toolchain idempotently.

No extra agent skills are installed, on purpose, because every loaded skill costs context on every
request. Install only what a task needs, from
[awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills), and record it in
`AGENTS.md` §9.

## Contributing

Contributions follow the workflow this repo teaches: spec first,
[Conventional Commits](https://www.conventionalcommits.org/), one task per PR, and a
verified test run before marking anything done.

## License

MIT. See [LICENSE](LICENSE).