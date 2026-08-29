# Implementation Plan: CROSS-EXAM — Adversarial Evaluator with Measured Blast Radius

**Branch**: `001-cross-exam-evaluator` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-cross-exam-evaluator/spec.md`

## Summary

Hold every irreversible action an ordinary support agent proposes, **execute that exact
proposal against a seeded replica ledger** to measure what it would really do, and hand the
agent the numbers as a denial reason until it corrects its own plan — escalating to a human
whenever no measurement was produced or the measured value crosses the threshold.

The technical approach is deliberately thin, because the harness already does most of it
(Constitution III; full capability audit in [research.md](./research.md) §A). Own code is
confined to seven things the harness does not reach:

1. **`apps/bench`** — the orchestrator: correlates `tool.approval_required` with the
   preceding `model.message` to recover the tool name and text content, serializes turns per
   session, computes the four guardrails, runs the `decide()` guardrail, and resolves the
   approval.
2. **`packages/mcp`** — a streamable-HTTP MCP server exposing `bulk_refund`,
   `issue_payout`, `close_account` under `require_approval_for_tools: ["@all"]`; the four
   conventional guardrails live there as a pure function the Bench calls.
3. **The seeded ledgers** — production and replica, generated from independent seeds with
   no RNG, engineered so the demo's figures fall out of the data.
4. **The measurement runner** — one `measure.py`, run in the Daytona sandbox by default and
   locally when the sandbox is unreachable, behind a single interface.
5. **`decide()`** — six ordered rules: escalate on data (no proposal, no measurement, over
   threshold), guide the Evaluator on a tool-usage slip, otherwise let its verdict stand
   (research D-06).
6. **`packages/measure`** — the read-only `measure` MCP tool the Evaluator calls, wrapping
   the runner (research D-15).
7. **`patches/`** — `GrammarToolCallLLM`, the registry-driven `ILLM` wrapper that makes an
   emoji-keyed message a tool call and keeps JSON tool schemas away from the model
   (research D-14).

Everything else — the pause, the denial reason reaching the agent, the re-proposal, the
parallel subagents, the verdict card, the human decision surface — is native harness
behavior used as-is.

## Technical Context

**Language/Version**: TypeScript 5.9.3 on Node 22.14+ (developed on 24.20.0), ESM only.
Python 3 (stdlib only) for the measurement script.

**Primary Dependencies** (exact pins, no ranges — Risk R9): `@truefoundry/trueforge` 0.1.4
(harness, local mode, `:8790`), `@truefoundry/trueforge-sdk` 0.1.3,
`@modelcontextprotocol/sdk` 1.30.0, `zod` 4.5.2, `tsx` 4.23.12, `vitest` 4.1.11.

**Storage**: Seeded JSON fixtures — `fixtures/production.json`, `fixtures/replica.json`,
generated from independent seeds (FR-006). Docket (P4 only): append-only
`.crossexam/docket.jsonl`. No database.

**Testing**: The seeded end-to-end scenario is the required test (`pnpm demo`; `pnpm test`
runs it three times for SC-002). Vitest unit suites for exactly three pure functions — the
grammar decoder, the ledger generator's cohort totals, and `decide()` — because each is
cheaper than a scenario re-run and each guards a number the demo depends on
(Constitution IV, [research.md](./research.md) D-12).

**Target Platform**: Local developer machine (macOS/Linux) driving TrueForge in local mode
on `localhost:8790`, plus a Daytona sandbox reached over the network.

**Project Type**: pnpm workspace — three libraries and one application, all Node-side. No
frontend is written: the verdict card is OpenUI emitted by the Evaluator's prompt.

**Performance Goals**: No throughput target — this is a three-minute live demo of a single
case at a time. The only timing requirement is SC-011: no measurement attempt exceeds
20 seconds.

**Constraints**: ~4 net build hours, two people, hard 14:30 PDT cutline and 16:00 freeze
(Constitution, Event Clock). No randomness anywhere on the data path (FR-006). No
credential value in the repo, in output, or in logs (FR-023). Measurement never touches
production; the action server never touches the replica.

**Scale/Scope**: 1,500 seeded charges and 342 payouts; 3 irreversible MCP tools + 1 read-only `measure` tool; 2 harness sessions;
1 round of cross-examination; 6 user stories of which P1 is the only commitment.

## Constitution Check

*GATE: passed before Phase 0, re-evaluated after Phase 1 design. Both evaluations below.*

| # | Principle | Gate | Initial | Post-design |
| --- | --- | --- | --- | --- |
| I | The Live Demo Is the Definition of Done | Every planned artifact appears in the 3-minute demo, or is cut at 14:30 | ✅ | ✅ — [quickstart.md](./quickstart.md) § Cut order names exactly what is cancelled and what never is |
| II | **Evidence, Not Inference** (NON-NEGOTIABLE) | No code path emits `allow`/`deny` without cited execution numbers | ✅ | ✅ — enforced by type: `Verdict.evidence` is non-null for `allow`/`deny` ([data-model.md](./data-model.md) §9); `Measurement` is constructible only by a `MeasurementExecutor` ([contract](./contracts/measurement-executor.md)); rules 1/2b/3 escalate on data, 2a/4/5 return guidance and escalate only once the retries are spent; code never emits `allow`/`deny` (D-06) |
| III | The Harness Does the Work | Every behavior checked against the harness first, with the check recorded | ✅ | ✅ — full audit table, [research.md](./research.md) §A. Six behaviors fall short and only those are written |
| IV | Verified by a Real Command | A real command proves done; the seeded scenario is the test | ✅ | ✅ — [quickstart.md](./quickstart.md) gives five runnable scenarios with the output to read |
| V | One Task = One Branch = One PR = One Qodo Review | Plan does not batch tasks onto one branch | ✅ | ✅ — plan produces no code; `tasks.md` carries the per-task branches |
| VI | Secrets Never Enter the Repo | Config from the environment only | ✅ | ✅ — [data-model.md](./data-model.md) §12; `.env.example` gains names only |
| VII | **One Spec, One Task List** (NON-NEGOTIABLE) | One spec dir, one `tasks.md`; spec says what, plan says how | ⚠️ | ⚠️ — **deviation, tracked below**: FR-024/FR-025 put the wire grammar (a *how*) in the spec. Accepted by the owner in the spec's Assumptions; recorded in Complexity Tracking as Governance requires. No second spec cycle is opened |
| VIII | Simplicity First | No speculative abstraction, no single-value config | ✅ | ✅ — one predicate grammar instead of SQL, JSON instead of SQLite, no build emit, no rules engine for four hardcoded guardrails |
| IX | Surgical Change | Touch only what the task requires | ✅ | ✅ — plan writes only `specs/001-cross-exam-evaluator/**`; no source file is touched by this command |

**Gate result: PASS.** One tracked deviation (VII/III, the emoji grammar), justified below.
No unjustified violation. Principles II, V, VI, and VII admit no time-pressure waiver and
none is requested.

## Project Structure

### Documentation (this feature)

```text
specs/001-cross-exam-evaluator/
├── plan.md                          # This file
├── spec.md                          # Input
├── research.md                      # Phase 0 — decisions D-01…D-15 + harness audit
├── data-model.md                    # Phase 1 — entities, invariants, state machine
├── quickstart.md                    # Phase 1 — five runnable validation scenarios
├── contracts/
│   ├── README.md                    # the four boundaries, and nothing else is a contract
│   ├── wire-grammar.md              # parser obligations over docs/emoji-grammar.md
│   ├── mcp-tools.md                 # the three irreversible actions
│   ├── charge-sheet.md              # orchestrator ⇄ Evaluator hand-off (§7.2 contract)
│   └── measurement-executor.md      # the only interface that may produce a Measurement
├── checklists/requirements.md       # from /speckit.specify
└── tasks.md                         # NOT created by /speckit.plan
```

### Source Code (repository root)

```text
packages/
├── core/                            # shared: the numbers and the rules
│   ├── src/
│   │   ├── grammar/                 # emoji encode/decode (FR-024, FR-025)
│   │   ├── model/                   # Charge, ChargeSheet, Measurement, Verdict, config
│   │   ├── ledger/                  # deterministic generator, both seeds (FR-006, FR-007)
│   │   ├── measure/                 # SandboxExecutor | LocalExecutor behind one interface
│   │   └── verdict/                 # decide() — six rules: escalate on data, guide on tool use
│   ├── scripts/measure.py           # the ONE measurement script, both transports run it
│   └── tests/                       # grammar · ledger totals · verdict rules
├── mcp/                             # streamable-HTTP MCP: bulk_refund, issue_payout,
│   └── src/                         #   close_account + guardrails.ts (pure function, FR-017)
└── measure/                         # read-only MCP: the `measure` tool the Evaluator calls (D-15)
    └── src/

apps/
└── bench/                           # the orchestrator — "the Bench"
    └── src/
        ├── sessions/                # create both agents, per-session FIFO queue (FR-003)
        ├── correlate/               # approval_required → model.message → name + text content
        ├── prompts/                 # Evaluator prompt: 3 subagent angles + OpenUI card
        └── demo.ts                  # pnpm demo — the seeded scenario entrypoint

fixtures/                            # generated, committed: production.json, replica.json
patches/                             # pnpm patch on @truefoundry/trueforge — research D-14
```

**Structure Decision**: pnpm workspace with four packages, fixed by `AGENTS.md §1` and
chosen so the boundaries match the two-builder split of `docs/research-findings.md §7.3` —
builder **B** owns `packages/mcp` and `packages/core/src/ledger`, builder **A** owns
`apps/bench`, `packages/core/src/measure` and `packages/measure`. `packages/core/src/grammar` is the one shared
surface and is therefore the first task, landed before either builder branches off it.
Packages export TypeScript source directly and everything runs under `tsx`; `pnpm build` is
a workspace `tsc --noEmit`. This removes cross-package build ordering — the largest
workspace hazard under a 4-hour clock — while keeping `pnpm build` a command that really
fails on a type error ([research.md](./research.md) D-01).

## Complexity Tracking

> Deviations from the constitution, recorded here as Governance requires.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| **A *how* lives in the spec** (Constitution VII): FR-024/FR-025 fix the emoji-keyed wire grammar in `spec.md` rather than here | The grammar is the contract **between the two agents**, and both sides must be built against it in parallel by two people in the same afternoon. Pinning it in the spec is what let `docs/emoji-grammar.md` be frozen before either builder started. Accepted explicitly by the owner in the spec's Assumptions and noted in `checklists/requirements.md` validation run 2 | Leaving it to `plan.md` — the artifact both builders agree on would then not exist until planning finished, which is after the point where builder B needs it. The cost of the deviation is one paragraph in the spec; the cost of the alternative is a merge conflict on the wire format at 13:00 |
| **Own wire grammar replaces the harness's native tool-calling, through a `pnpm patch` on the harness's `ILLM` seam** (Constitution III, research D-14) | A field carrying JSON-escaped content must be re-parsed, and a failed re-parse is a lost tool call — on the one message the entire demo depends on. The flat emoji format is fewer tokens and is emitted more reliably by small models ([docs/emoji-grammar.md](../../docs/emoji-grammar.md) § Why) | Native tool-calling with a JSON argument object. The source article puts it ahead only past ~10 tools; this feature has three. Rejected on the spec's own reasoning, not re-litigated here |
| **One config surface with one value today** (Constitution VIII): `CROSSEXAM_GRAMMAR_REGISTRY` drives the D-14 adapter | The adapter is a reusable emoji-keyed-lines-to-tool-call patch; hardcoding our nine keys into a third-party dist would tie a harness patch to product detail and force a re-derive on every key change | A hardcoded key table — smaller, but the patch would carry product knowledge it should not have |
| **Two measurement transports** (Constitution VIII — extra code) | FR-004 requires the identical measurement to run through a local isolated executor when the sandbox is unreachable, and Risk R1 rates sandbox loss as terminal | A single sandbox path — one venue-network failure ends the demo. Mitigated to near-zero extra complexity by sharing **one** `measure.py` across both transports, so the arithmetic has exactly one implementation ([research.md](./research.md) D-03) |
