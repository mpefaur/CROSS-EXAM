# Parallel implementation plan

Companion to [specs/001-cross-exam-evaluator/tasks.md](../specs/001-cross-exam-evaluator/tasks.md).
`tasks.md` stays the source of truth for **what** each task is; this file is the source of
truth for **what may run at the same time**, and it corrects four dependencies `tasks.md`
states incorrectly or omits.

Read this before `/speckit.implement`. It does not change scope, and it does not waive the
per-task branch/PR/Qodo discipline of [AGENTS.md](../AGENTS.md) §7.

## 0. How to actually run in parallel

`/speckit.implement` walks `tasks.md` **sequentially inside one session**. It does not fan
out on its own. Parallelism here means one of two things:

- **Two people** (the A/B owner split of [research-findings.md](./research-findings.md)
  §7.3), each running their own `/speckit.implement` scoped to their lane, or
- **One person, several git worktrees**, one branch and one agent session per lane.

If you run a single sequential session, §1 (the corrected dependencies) and §3 (the hot
files) still matter — they prevent a mid-phase block and the rework that follows. §2 buys
you nothing until there is a second lane.

**The real throughput ceiling is not code.** One task = one branch = one PR = one Qodo
review. Four open lanes means four concurrent Qodo reviews to read and reply to before
anything merges. Against the 14:30 PDT cutline, **2–3 lanes is the honest maximum**.

## 1. Corrections to the dependency graph in `tasks.md`

| # | `tasks.md` says | Actually | Consequence |
|---|---|---|---|
| C-1 | T007 is `[P]`, parallel with T008 after T006 | **T009 depends on T007.** [contracts/wire-grammar.md](../specs/001-cross-exam-evaluator/contracts/wire-grammar.md) types `decodeProposal(text): DecodeResult<ProposedAction>` and the encoder takes a `Verdict` — both live in `case.ts` (T007) | T007 is on the critical path, not a side branch. If it slips, the grammar and both builders slip with it |
| C-2 | T014 sits in Phase 3 | **T014 has zero TypeScript dependencies.** `measure.py` is stdlib Python written against the predicate grammar of [data-model.md](../specs/001-cross-exam-evaluator/data-model.md) §5 and the registry in [emoji-grammar.md](./emoji-grammar.md) | It can start at t=0, alongside Phase 1. Largest single scheduling win |
| C-3 | T018 sits in Phase 3 | **`decide()` needs only T007 + T008.** No grammar, no measurement code, no fixtures | The verdict lane opens during the Phase 2 window |
| C-4 | "No user story work begins until T009 **and T013** are merged" | **T013 gates only the fixture readers** — T015's real run, T016, T021, T030. T014, T018, T020, T022–T024, T027, T028 never open a ledger | The Phase 2 → Phase 3 gate is narrower than written; four lanes can open on T009 alone |

C-1 is the one that bites. The others only cost you idle time.

The T009 gate itself is **not** negotiable and is correctly stated in `tasks.md`: the grammar
is the contract between the two agents, and changing it after either builder has branched
breaks both sides at once.

## 2. Execution waves

| Wave | Opens when | Tasks | Width |
|---|---|---|---|
| **0** | — | T000 | 1 — must **merge** before any feature PR; may be authored concurrently with Wave 1 |
| **1** | — | T001 → T004 · T002 → T003 · **T005** · **T014** | 3–4. T005 and T014 have no dependencies at all — start both at t=0 |
| **2** | T001–T005 | T006 → { **T007**, T008 } | 2 |
| **3** | T007 + T008 | **T009** → T010 ‖ T011 → T012 → T013 ‖ T018 → T019 ‖ T022, T023, T024, T027, T028 | 4 lanes |
| **4** | T009 merged | T015 → T016 → T017 ‖ T020 → T021 *(needs T013)* ‖ T025 → T026 ‖ T029 | 4 lanes |
| **5** | Wave 4 | T030 → T031 → T032 | **1 — serial join. The 14:30 cutline.** |
| **6** | T032 | Phase 4 ‖ Phase 5 — **collide on `demo.ts`, see §3** | 2 with care |
| **7** | — | T046 ‖ T047 | 2 |

### The four lanes, as standing assignments

Mapped onto the A/B owner split of `tasks.md` § Owner split, plus one free-floating lane for
the measurement script:

| Lane | Owner | Chain |
|---|---|---|
| **A-measure** | A | T014 → T015 → T016 → T017 |
| **A-verdict** | A | T018 → T019 |
| **A-bench** | A | T022, T023, T024 → T025 → T026, T027, T028, T029 |
| **B-data/actions** | B | T006 → T011 → T012 → T013, then T020 → T021, later T037 |

A carries three lanes and B one. That is the shape of the work, not a mistake — but it means
A is the cutline risk, and B should take T020/T021 early rather than waiting on the ledger to
be perfect.

## 3. Hot files — where parallelism actually breaks

The `[P]` markers in `tasks.md` mean "different files". These files have several writers, so
`[P]` does not protect you:

| File | Writers | Severity |
|---|---|---|
| `packages/core/src/index.ts` | T006, T007, T008, T009, T011, T018, T044 | 7-way append. Trivial per conflict, constant across the whole build |
| `apps/bench/src/sessions/resolve.ts` | T029, T034, T043, T045 | Real logic conflict |
| `apps/bench/src/demo.ts` | T030, T033, T038 | **Blocks Phase 4 ‖ Phase 5** |
| `apps/bench/src/prompts/evaluator.ts` | T027, T040, T042 | **Blocks Phase 6 ‖ Phase 7** |
| `apps/bench/src/correlate/chargeSheet.ts` | T026, T038 | Phase 5 reopens a Phase 3 file |
| `apps/bench/src/scenarios.ts` | T033, T035 | Same phase; keep serial |

Two consequences `tasks.md` does not draw:

- **Phases 4 and 5 are not independently mergeable.** Both edit `demo.ts`, and Phase 5 also
  reopens `chargeSheet.ts`. Run them serially — Phase 4 first, it is the phase that is never
  cut — or give both to one owner.
- **Phases 6 and 7 are both prompt edits to the same `evaluator.ts`.** Same rule.

### Mitigations, in order of payoff

1. **Do not append to the root barrel from seven branches.** Import from the area barrels
   (`packages/core/src/<area>/index.ts`) and write the root `index.ts` once, at the end of
   Phase 2. `tasks.md` § Notes already concedes "expect to rebase" — this removes the need.
2. **Give `demo.ts` and `resolve.ts` a single owner across all phases.** Every cross-phase
   conflict in the table above is one of those two files.
3. **Merge Wave 3 in a fixed order** — T007, T008, T009, T011, T018 — so the barrel rebase is
   linear instead of a four-way race.

## 4. What is never parallel

- **T030 → T031 → T032** is the serial join. Everything converges here, and this is the
  14:30 PDT gate (Constitution I). No lane merges past it independently.
- **Every phase-closing task** — T032, T036, T039, T041, T043, T045, T050 — runs a real
  command and reads its output. These are not parallelizable with the work they verify.
- **T000** merges before the first feature PR, alone.

## 5. Cut order is unchanged

This document reorders nothing and cuts nothing. If 14:30 PDT arrives and Phase 3 has not
closed, Phases 6, 7 and 8 are cancelled outright and every lane collapses onto closing
Phase 3 ([tasks.md](../specs/001-cross-exam-evaluator/tasks.md) § Cut order under the clock).
Phases 3, 4 and the determinism check of T031 are never cut.
