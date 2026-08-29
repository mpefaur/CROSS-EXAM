# Phase 0 Research: CROSS-EXAM — Adversarial Evaluator with Measured Blast Radius

**Branch**: `001-cross-exam-evaluator` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Most of the discovery for this feature was already done and is recorded in
[docs/research-findings.md](../../docs/research-findings.md) (verified against TrueForge
`main` @ `a3a1395`). This file does not repeat it. It records the **decisions** the plan
depends on, the **Constitution III harness check** for every behavior we could have built
ourselves, and the handful of unknowns that were still open when planning started.

Every decision below is stated as Decision / Rationale / Alternatives considered.

---

## A. Harness capability check (Constitution III)

Principle III requires `plan.md` to record which harness capability was checked and why it
fell short. The check is done once, here; `plan.md` cites the outcome.

| Behavior we need | Harness provides it? | Verdict |
| --- | --- | --- |
| Hold an irreversible tool call before it runs | **Yes** — `require_approval_for_tools`, per-MCP-server policy, settable to `["@all"]` (`agent-session/schemas/agentSpec.ts:95-101`) | Use natively. No own gate. |
| Deliver a denial reason back to the acting agent | **Yes** — `deny.reason`, *"Optional reason shown to the agent when denied"* (`core/events/schema.ts:72-76`) | Use natively. **No agent-to-agent protocol is written.** |
| Re-proposal after a denial | **Yes** — emergent from the above; the agent reads the reason and proposes again | Use natively. |
| Run code in an isolated environment | **Yes** — Daytona sandbox + Code Mode, provisioned per agent, persists across turns of a session | Use natively as the default executor. |
| Parallel investigation angles | **Yes** — built-in `create_sub_agent`, on by default, one level, emits `thread.created`/`thread.done` | Use natively (prompt, not code). |
| Render the verdict card | **Yes** — OpenUI, on by default, `Card`/`Tag`/`Table`/bar chart/`Action(@ToAssistant)` | Use natively (prompt, not frontend code). |
| Human decision surface for `escalate` | **Yes** — the pending approval itself is the surface; the turn stays `done` with a non-empty `required_actions` until a person resolves it | Use natively. |
| Persist across sessions (docket) | **Partial** — sessions persist, but there is no cross-session query API for our own records | **Falls short.** Own JSON store (P4 only). |
| Correlate `tool.approval_required` → tool name + arguments | **No** — the event carries only `{id, source_event_id}` (`schema.ts:322-338`); the name and args live on the preceding `model.message` | **Falls short.** Own correlation in the orchestrator. |
| Serialize turns per session | **No** — *"Creating a new turn in a session automatically cancels any turn still running"* | **Falls short.** Own per-session queue (FR-003). |
| Measure a proposed action's reach over data | **No** — nothing in the harness executes a proposal against a replica and counts | **Falls short. This is the product.** Own measurement runner + seeded ledger. |

Own code is therefore confined to five things: the orchestrator (correlation + serialization),
the MCP server of irreversible actions, the seeded ledger and its generator, the measurement
runner and its script, and the verdict rules. Everything else is harness behavior.

---

## B. Decisions

### D-01 — Runtime, package manager, and workspace shape

**Decision**: Node 22.14+ (developed on 24.20.0), pnpm 11.4.0 (exact pin — the installed version on the build machine; the original `pnpm 9` pin was amended at T001), TypeScript 5.9.3, ESM only.
Three workspace packages: `packages/core`, `packages/mcp`, `apps/bench`. Packages export
**TypeScript source directly** (`"exports": "./src/index.ts"`) and everything runs through
`tsx`; `pnpm build` is a workspace-wide `tsc --noEmit` typecheck, not an emit step.

**Rationale**: `AGENTS.md §1` fixes "TypeScript on Node 22.14+, pnpm workspace" as a
pre-existing constraint. The three packages map exactly onto the two-builder split of
`docs/research-findings.md §7.3` (B: `packages/mcp` + the ledger fixtures in `core`;
A: `apps/bench` + the measurement runner). Exporting source and skipping emit removes the
single biggest workspace hazard under a 4-hour clock — cross-package build ordering, stale
`dist/`, and TS project references — while still giving `pnpm build` a real command that
fails on a type error.

**Alternatives considered**:
- *One package, no workspace*: simpler, but contradicts `AGENTS.md §1` and puts both
  builders in the same directory tree all afternoon.
- *TypeScript 7.0.2* (current latest): the native port. Rejected — unproven against
  vitest 4 for this toolchain, and a toolchain surprise at 12:00 costs the demo. Pinned to
  5.9.3 (Risk R9: pin versions).
- *Real `tsc` emit + `dist/`*: costs build ordering for zero benefit; nothing here ships as
  a published artifact (spec: Out of Scope).

### D-02 — Pinned dependency versions

**Decision**: `@truefoundry/trueforge` 0.1.4 (harness, run via `npx`, local mode on `:8790`),
`@truefoundry/trueforge-sdk` 0.1.3, `@modelcontextprotocol/sdk` 1.30.0, `zod` 4.5.2,
`tsx` 4.23.12, `vitest` 4.1.11, `typescript` 5.9.3. Exact pins, no `^`.

**Rationale**: Risk R9 — the TrueForge repo lands commits daily (`a3a1395` is from
2026-08-28). A minor bump mid-afternoon is an unforced demo failure. Versions verified
against the registry on 2026-08-28.

**Alternatives considered**: caret ranges — rejected outright by R9.

### D-03 — Measurement executor: one script, two transports

**Decision**: The measurement is a single Python 3 file, `measure.py`, using only the
standard library. It takes the replica ledger path and the proposal's criteria string, and
prints the measurement as emoji-keyed lines on stdout. It is executed:
1. **Default** — inside the Daytona sandbox (upload ledger + script, run, read stdout).
2. **Fallback** — locally via `python3` in a temporary working directory with no network,
   when the sandbox is unreachable.

Both paths run **byte-identical code** behind one TypeScript interface,
`MeasurementExecutor`. Each attempt gets its own 20-second budget (FR-010).

**Rationale**: FR-004 requires the fallback to run "the identical measurement ... behind the
same interface". Sharing the *script* rather than reimplementing the logic in TypeScript is
the only version of that claim we can defend in a code review — there is one implementation
of the counting, and it is the one that ran. Python because Code Mode is Python and the
sandbox has it; stdlib-only because a `pip install` inside a sandbox on venue wifi is a risk
we do not need.

**Alternatives considered**:
- *TypeScript measurement in the sandbox*: Code Mode is Python-shaped; fighting that buys
  nothing.
- *Reimplement the counting in TS for the fallback*: two implementations of the number the
  entire product rests on. Rejected on Constitution II grounds — the fallback could disagree
  with the sandbox and we would not know which one lied.
- *SQLite + SQL `WHERE`*: attractive (the criteria is SQL-shaped), but it needs a native
  module in the sandbox and it turns the criteria string into arbitrary SQL. Rejected; see
  D-04.

### D-04 — Criteria are a fixed predicate grammar, never evaluated code

**Decision**: A proposal's `🔍criteria` is a conjunction of comparisons joined by ` AND `:
`field op value`, where `field` is one of the ledger's known columns, `op` is one of
`= != > >= < <=`, and `value` is a bare literal. No `OR`, no parentheses, no functions, no
`eval`, no SQL. Anything else does not parse → no measurement → `escalate` (FR-025 → FR-010).

**Rationale**: Simplicity First, and the demo needs exactly two predicates:
`status=disputed` and `status=disputed AND refunded=false AND age_days<=30`. A fixed
grammar is ~30 lines in `measure.py`, is safe to run on a string an LLM produced, and makes
"it did not parse" a first-class, testable outcome instead of a crash.

**Alternatives considered**:
- *SQL against SQLite*: real SQL from a model, executed. Larger surface, native dependency,
  and no gain — the demo uses two predicates.
- *Python `eval` on the criteria*: arbitrary code from a model inside our own process.
  Rejected on sight.

### D-05 — Ledger storage: seeded JSON, generated on both sides

**Decision**: Both the production ledger and the replica ledger are JSON files produced by
the same deterministic generator from **different seeds of their own fixture** — the replica
is never a copy of production (FR-006). Generator uses no RNG at all: amounts come from a
fixed cycle and the final charge in each cohort absorbs the rounding remainder so cohort
totals land exactly on the spec's figures.

Replica composition (seed `crossexam-replica-v1`), engineered to satisfy FR-007 and the
spec's demo numbers exactly:

| Cohort | Count | Total | Purpose |
| --- | --- | --- | --- |
| `status=disputed`, already refunded (`refunded=true`) | 611 | — | the duplicate trap |
| `status=disputed`, not refunded, `age_days > 30` | 586 | — | outside the policy window |
| `status=disputed`, not refunded, `age_days <= 30` | **7** | **$840.00** | the legitimately refundable set |
| **all `status=disputed`** | **1,204** | **$96,310.00** | what the broad predicate measures |
| `status` in {`settled`,`open`} | 296 | — | so `status=disputed` actually filters |
| payouts, `payout_eligible=true` (US3) | 342 | $418,220.00 | crosses the escalation threshold |

**Rationale**: FR-006 (deterministic, no randomness anywhere), FR-007 (the corrected
predicate must *arise from the data*, not from a script), SC-002 (three identical runs).
JSON because the fallback executor, the sandbox, and a human reading the fixture all handle
it with zero setup.

**Alternatives considered**:
- *SQLite fixture*: native module in the sandbox; no benefit at 1,500 rows.
- *Hardcode the totals in the verdict*: this is precisely the Constitution II violation the
  whole project exists to refuse (Risk R4).

### D-06 — Verdict rules, and the order they are applied in

**Decision**: One pure function, `decide(proposal, measurement, config) → Verdict`, applying
these rules in this exact order. The order is normative — later rules never override earlier
ones.

1. Proposal did not parse, or `🔢`/`💵` missing → **`escalate`** (FR-002, FR-025).
2. No measurement produced — both executors failed, or each exceeded its 20 s budget →
   **`escalate`** (FR-010).
3. `measured_value > escalation_threshold` → **`escalate`**, citing the measured figures
   (FR-011).
4. `measured_count != declared_count`, or `measured_value != declared_value` (exact, to the
   cent), or `duplicate_count > 0` → **`deny`**, reason carrying all three measured figures
   (FR-012).
5. Otherwise → **`allow`**, citing the measured figures (FR-009).

There is no sixth branch, and no "inconclusive" branch (spec, Clarification 3).

**Rationale**: Rules 1–3 are escalations and must precede the decisive verdicts, because
`escalate` is the conservative outcome and Constitution II admits no waiver. Rule 4 fires on
the demo's first proposal (1,204 ≠ 7) and rule 5 on the second (7 = 7, $840.00 = $840.00,
0 duplicates). Exact equality rather than a tolerance: a tolerance is a threshold nobody
specified, and the seeded data makes exactness free.

**Alternatives considered**:
- *Threshold check after the deny check*: would let a catastrophic-but-mismatched action
  come back `deny` instead of reaching a human. Less conservative; rejected.
- *A percentage tolerance on the declared figures*: speculative configuration with one
  possible value (Constitution VIII).

### D-07 — The escalation threshold value, and the constraint the spec left implicit

**Decision**: `CROSSEXAM_ESCALATION_THRESHOLD_USD=250000`.

**Rationale**: This is the one number the spec's Assumptions under-specified, and getting it
wrong breaks User Story 1. The spec asks only that "the US3 scenario crosses it and the US1
corrected proposal does not" — but D-06 rule 3 runs *before* the deny rule, so the threshold
must also sit **above** US1's *first* measurement ($96,310) or that proposal would escalate
instead of being denied, and acceptance scenario US1-2 would fail. The binding constraint is
therefore:

```
$840  <  $96,310  <  threshold  <  $418,220
```

$250,000 sits in the middle of that band with room on both sides, and reads as a plausible
"a machine is not the last word above this" figure to a jury.

**Alternatives considered**: $10,000 (a natural-sounding number) — **would have broken the
P1 demo**, escalating the flagship denial. Recorded because it was the obvious first choice.

### D-08 — Proposal / verdict encoding: the emoji grammar

**Decision**: Implement [docs/emoji-grammar.md](../../docs/emoji-grammar.md) verbatim as the
single wire format between the two agents, in `packages/core/src/grammar/`. Encoder and
decoder are pure functions; the decoder is strict (unknown key or keyless line → parse
failure, no second attempt under a looser grammar).

**Rationale**: FR-024/FR-025, and `docs/emoji-grammar.md` is already the declared source of
truth for the key set. This is a **deliberate deviation** on two counts — it puts a *how* in
the spec (Constitution VII) and it prefers our own grammar over the harness's native
tool-calls (Constitution III) — both carried into `plan.md` Complexity Tracking as the
constitution's Governance section requires.

**Alternatives considered**: native tool-calling with a JSON argument object. Rejected per
the spec's own reasoning: the source article puts native tool-calling ahead only past ~10
tools, and this feature has three. Recorded, not re-litigated.

### D-09 — Serialization and timeouts

**Decision**: One FIFO queue per `sessionId` in the orchestrator; a turn is never created
while another is in flight for that session (FR-003). SDK client constructed with
`timeoutInSeconds: 600`. Each measurement attempt is bounded at 20,000 ms by an
`AbortSignal`; expiry abandons that attempt and counts as "no measurement produced" for
that executor.

**Rationale**: Risks R5 and R6 verbatim — *"Creating a new turn in a session automatically
cancels any turn still running in that session"*, and the SDK's 60 s default would abort a
long SSE read and look like an agent bug.

**Alternatives considered**: none; both are corrections of documented harness behavior.

### D-10 — Models

**Decision**: Both agents configured by environment variable, defaulting to
`openai/gpt-5.4-mini` for the acting agent and `anthropic/claude-sonnet-4-6` for the
Evaluator. Neither is hardcoded (FR-022 applies the same principle to agent identity).

**Rationale**: `docs/research-findings.md §2.3` marks the model split an **[ASSUMPTION] to
validate at the table** — OpenAI is the event's model partner and gives every attendee $50
in credits, so it is the right default for the ordinary, unremarkable acting agent; the
Evaluator carries the adversarial reasoning. Making it a variable means Saturday's
measurement can change the answer without a code change.

**Alternatives considered**: deciding definitively now — the source doc explicitly says
"decide with evidence on Saturday, not before".

### D-11 — Escalation reaches a human through the pending approval

**Decision**: `escalate` leaves the harness approval pending and renders the verdict card
with Allow / Deny / Escalate buttons wired through OpenUI `Action(@ToAssistant(...))`. The
action stays unexecuted until a person answers. No timeout auto-approves it, ever.

**Rationale**: FR-013, FR-014, and the spec's edge case "A human never answers an
escalation". The pending approval *is* the human surface (harness check, §A) — nothing to
build, and it is what makes the human-approval claim genuine rather than theatre.

**Alternatives considered**: email/chat routing — explicitly out of scope per the spec's
Assumptions.

### D-12 — Testing strategy

**Decision**: The seeded end-to-end demo scenario is the required test (`pnpm demo`, and
`pnpm test` runs it three times for SC-002). Unit tests (vitest) are written for exactly
three things, because each is cheaper to check than a full scenario re-run:
1. the grammar decoder (round-trip + every malformed-input rejection path),
2. the ledger generator's cohort totals (1,204 / $96,310.00 / 611 / 7 / $840.00 / $418,220.00),
3. `decide()`'s five rules and their ordering.

Nothing else gets a unit test.

**Rationale**: Constitution IV, verbatim — the deterministic scenario IS the required test,
and unit tests are required *only where they are cheaper than re-running it*. These three
are pure functions with no harness, no sandbox, and no model in the path; each runs in
milliseconds and each guards a number the whole demo depends on.

**Alternatives considered**: a test per behavior change (the default outside this event) —
does not fit the 4-hour budget and the constitution says so explicitly.

### D-13 — Guardrail contrast (P2) is data on the proposal, not a second system

**Decision**: The acting agent's four conventional controls — per-action $2,000 ceiling,
per-customer frequency cap, eligibility-policy check, self-reported confidence — are
evaluated inside the MCP tool handler before it returns its proposal, and reported as four
pass/fail lines rendered alongside the verdict.

**Rationale**: FR-017/FR-018 and `docs/research-findings.md §5.2` price this at ~10 minutes
for a high demo return. It is deliberately *not* a policy engine: it is four checks that all
pass, which is the entire point.

**Alternatives considered**: a configurable rules engine — speculative complexity for four
hardcoded checks that exist to be shown passing.

---

## C. Remaining assumptions

Carried from the spec rather than resolved here; none blocks Phase 1.

- **[ASSUMPTION]** The exact model per agent (D-10) is validated at the table on Saturday.
- **[ASSUMPTION]** Daytona is reachable from the venue network. If it is not, D-03's local
  executor carries the demo and the sandbox becomes the thing we describe rather than show.
  Verified the night before per Risk R1, not on the day.
