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
| Run code in an isolated environment | **Partial** — Daytona sandbox + Code Mode, provisioned per agent, persists across turns of a session; but no local fallback, no fixed 20 s budget, no `script_sha256` | **Falls short.** Own `SandboxExecutor` drives Daytona behind the `measure` tool (D-03, D-15). |
| Parallel investigation angles | **Yes** — built-in `create_sub_agent`, on by default, one level, emits `thread.created`/`thread.done` | Use natively (prompt, not code). |
| Render the verdict card | **Yes** — OpenUI, on by default, `Card`/`Tag`/`Table`/bar chart/`Action(@ToAssistant)` | Use natively (prompt, not frontend code). |
| Human decision surface for `escalate` | **Yes** — the pending approval itself is the surface; the turn stays `done` with a non-empty `required_actions` until a person resolves it | Use natively. |
| Persist across sessions (docket) | **Partial** — sessions persist, but there is no cross-session query API for our own records | **Falls short.** Own JSON store (P4 only). |
| Correlate `tool.approval_required` → tool name + arguments | **No** — the event carries only `{id, source_event_id}` (`schema.ts:322-338`); the name and args live on the preceding `model.message` | **Falls short.** Own correlation in the orchestrator. |
| Serialize turns per session | **No** — *"Creating a new turn in a session automatically cancels any turn still running"* | **Falls short.** Own per-session queue (FR-003). |
| Measure a proposed action's reach over data | **No** — nothing in the harness executes a proposal against a replica and counts | **Falls short. This is the product.** Own measurement runner + seeded ledger. |
| Recognise the emoji grammar as a tool call | **No** — the loop's only tool-call source is the provider's native `tool_calls` (`trueforge-core/dist/core/runtime/AgentThread.mjs:785,794` → `enrichAssistantMessage`); plain text ends the turn | **Falls short.** `pnpm patch` wraps the `ILLM` adapter so the call is synthesised from grammar lines before the loop sees the message (D-14); everything after that point stays native. |

Own code is therefore confined to seven things: the harness patch (D-14), the `measure` server (D-15), the orchestrator (correlation + serialization),
the MCP server of irreversible actions, the seeded ledger and its generator, the measurement
runner and its script, and the verdict rules. Everything else is harness behavior.

---

## B. Decisions

### D-01 — Runtime, package manager, and workspace shape

**Decision**: Node 22.14+ (developed on 24.20.0), pnpm 11.4.0 (exact pin — the installed version on the build machine; the original `pnpm 9` pin was amended at T001), TypeScript 5.9.3, ESM only.
Four workspace packages: `packages/core`, `packages/mcp`, `packages/measure` (D-15), `apps/bench`. Packages export
**TypeScript source directly** (`"exports": "./src/index.ts"`) and everything runs through
`tsx`; `pnpm build` is a workspace-wide `tsc --noEmit` typecheck, not an emit step.

**Rationale**: `AGENTS.md §1` fixes "TypeScript on Node 22.14+, pnpm workspace" as a
pre-existing constraint. The packages map exactly onto the two-builder split of
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

**Decision**: `@truefoundry/trueforge` 0.1.4 (harness, run from the workspace with `pnpm exec trueforge` so the D-14 patch loads — never `npx`; local mode on `:8790`),
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

### D-06 — The verdict is the Evaluator's; `decide()` guards its tool use and escalates only on data

**Decision**: The Evaluator — a model — measures by calling the `measure` tool (D-15) and
then writes the verdict in the grammar. Code never approves and never denies. One pure
function, `decide(proposal, evaluatorVerdict, observed, config) → Outcome`, where
`evaluatorVerdict` is the `DecodeResult<EvaluatorVerdict>` of the Evaluator's message
(data-model §9) and `observed` is the **last** `measure` tool result of the Evaluator's turn,
as the Bench read it from the tool-result event (`null` when no call produced a result).
`Outcome` is either a final `Verdict` or a `Guidance` — text the Bench sends the Evaluator as
its next turn, carrying what was wrong and the observed figures, after which the re-issued
verdict goes through `decide()` again. The rules apply in this exact order.

**Escalation is a data condition.** Only rules 1, 2b and 3 escalate. Everything else the
guardrail catches is the Evaluator's *tool usage*, and a model corrects its tool usage when
told — so the Bench tells it. There is no retry cap: a case that outruns the SDK's 600 s
turn budget (D-09) is an infrastructure failure and escalates under rule 2b.

1. Proposal did not parse, or `🔢`/`💵` missing → **`escalate`** (FR-002, FR-025). No
   measurable proposal exists; this is the acting agent's message, not the Evaluator's.
2. No observed measurement for this proposal:
   - **2a** the Evaluator never called `measure`, or the last result's echoed
     `criteria`/`table` differ from the proposal's `🔍` and `tableFor(action)` (data-model
     §4) → **`Guidance`**: "measure the proposal's exact criteria on `<table>`".
   - **2b** `measure` was called on the right criteria but produced nothing — both executors
     failed or exceeded their 20 s budget → **`escalate`** (FR-004, FR-010).
3. `observed.value > escalation_threshold` → **`escalate`**, citing the observed figures
   (FR-011).
4. The Evaluator's message did not decode as a verdict, or on `⚖allow`/`⚖deny` (or whenever a
   triple is present) its cited `🧮`/`💰`/`♻` differ from `observed` → **`Guidance`**: the
   grammar it must use and the figures it actually measured (Constitution II).
5. The Evaluator wrote `⚖allow` while `observed.count != declared_count`,
   `observed.value != declared_value` (exact, to the cent), or `observed.duplicates > 0` →
   **`Guidance`**: the mismatch, line by line. It approved what its own measurement
   contradicts.
6. Otherwise the Evaluator's verdict stands — `allow` or `deny`, with its `📝` — as a
   `Verdict` with `evidence = observed` and `rule = 6`.

There is no "inconclusive" branch (spec, Clarification 3). The demo's first round is a
`deny` the Evaluator writes itself (1,204 ≠ 7) and the second an `allow` it writes itself
(7 = 7, $840.00, 0 duplicates); both pass rule 6 on the first try.

**Rationale**: The judgment belongs to the model — that is what an evaluator agent is. The
deterministic part guards its tool use: did it measure this proposal, did it cite what it
measured, did it approve something the numbers contradict. A person is interrupted only when
the *data* says so — no proposal, no measurement, too much money — never because a model
mis-typed a line once. Rules 1–3 precede 4–5 because they hold with no verdict at all.
Exact equality rather than a tolerance: a tolerance is a threshold nobody specified, and the
seeded data makes exactness free.

**Alternatives considered**:
- *`decide()` produces the verdict from the measurement* (the earliest form): deterministic
  code deciding, the model reduced to a narrator. Rejected — the models make the calls; code
  guards them.
- *Rules 2a/4/5 escalate* (the previous form): a human interrupted for a tool-usage slip the
  model would fix on the next turn. Rejected — escalation is for data.
- *A retry cap on guidance*: a threshold nobody specified; the turn budget already bounds it.
- *A percentage tolerance on the declared figures*: speculative configuration with one
  possible value (Constitution VIII).

### D-07 — The escalation threshold value, and the constraint the spec left implicit

**Decision**: `CROSSEXAM_ESCALATION_THRESHOLD_USD=250000`.

**Rationale**: This is the one number the spec's Assumptions under-specified, and getting it
wrong breaks User Story 1. The spec asks only that "the US3 scenario crosses it and the US1
corrected proposal does not" — but D-06 rule 3 runs *before* rule 6 lets the Evaluator's `deny` stand, so the threshold
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

### D-08 — Proposal / verdict encoding: the emoji grammar is the tool-call syntax

**Decision**: Implement [docs/emoji-grammar.md](../../docs/emoji-grammar.md) verbatim in
`packages/core/src/grammar/`. The grammar is not a payload inside a native tool call — it
**replaces** the provider's native tool-call format for the acting agent. The model writes
the four proposal lines as plain assistant text; the patched harness (D-14) turns a message
that carries a `🧾` line into a tool call named by that line, and the verdict travels back
as grammar lines too. No JSON tool schema is ever sent to the model. Encoder and decoder are
pure functions; the decoder is strict (unknown key, keyless line, or a key from the other
direction → parse failure, no second attempt under a looser grammar).

**Rationale**: FR-024/FR-025, and the source article's point taken in full: reliability
degrades with nesting × heterogeneity × cleverness. A JSON tool call is a nested,
heterogeneous structure the model must emit byte-perfect; a flat emoji-keyed line set is
neither. This remains a **deliberate deviation** on two counts — a *how* in the spec
(Constitution VII) and a patched harness instead of its native tool-call path
(Constitution III) — both carried in `plan.md` Complexity Tracking.

**Alternatives considered**:
- *Native tool-calling with a JSON argument object*: rejected per the spec's own reasoning.
- *The grammar as the content of one string argument of a native call*: leaves the harness
  untouched, but the model still emits the JSON tool-call wrapper — the exact failure
  surface the grammar exists to remove.
- *The Bench decodes model text and owns the hold itself*: rebuilds the hold, the denial
  delivery and the escalate surface the harness already has (Constitution III). See D-14.

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
3. `decide()`'s six rules, their ordering, and that only 1/2b/3 escalate.

Nothing else gets a unit test.

**Rationale**: Constitution IV, verbatim — the deterministic scenario IS the required test,
and unit tests are required *only where they are cheaper than re-running it*. These three
are pure functions with no harness, no sandbox, and no model in the path; each runs in
milliseconds and each guards a number the whole demo depends on.

**Alternatives considered**: a test per behavior change (the default outside this event) —
does not fit the 4-hour budget and the constitution says so explicitly.

### D-13 — Guardrail contrast (P2) is data the Bench computes from the proposal

**Decision**: The four conventional controls — per-action $2,000 ceiling, per-customer
frequency cap, eligibility-policy check, self-reported confidence — are a pure function in
`packages/mcp/src/guardrails.ts` that the **Bench** calls at charge-sheet assembly, on the
decoded proposal and the session's history. The report goes into the charge sheet the
Evaluator reads ([contracts/charge-sheet.md](./contracts/charge-sheet.md) `guardrails`) — the
model sees the four passes beside its own measurement and can name the gap — and is rendered
as four pass/fail lines beside the verdict. They run in no tool handler (the handler does not execute until `allow`) and
they are **not part of the harness patch** (D-14), which knows nothing about them.

**Rationale**: FR-017/FR-018 and `docs/research-findings.md §5.2` price this at ~10 minutes
for a high demo return. It is deliberately *not* a policy engine: four checks that all pass,
which is the entire point. Everything they read is already in the transcript, so a static
check in the Bench needs no harness state.

**Alternatives considered**: a configurable rules engine — speculative complexity for four
hardcoded checks that exist to be shown passing. A read-only `check_guardrails` MCP tool —
one more surface for a computation the Bench can do on data it already holds.

---

### D-14 — Harness patch: a registry-driven emoji-lines-to-tool-call adapter

**Decision**: Patch `@truefoundry/trueforge@0.1.4` with `pnpm patch`, committed as
`patches/@truefoundry__trueforge@0.1.4.patch` and applied on every install. One seam: the
`llm:` factory in `apis/turns.ts` (`dist/main.js:10328` in 0.1.4, unbundled and
source-mapped) constructs `new VercelAILLM(...)`; wrap it in `GrammarToolCallLLM`, an `ILLM`
implementation (`create()` / `createNonStream()`), ~80 lines. **Generic and registry-driven,
not hardcoded to our keys.** At harness start it reads `CROSSEXAM_GRAMMAR_REGISTRY`
(data-model §12): a JSON object mapping an emoji to a field name, with two reserved entries —
the key mapped to `$tool` names the tool, and `$tools` lists the tool names the grammar
covers. Unset → the wrapper is inert and the harness behaves stock.

```json
{"$tools":["bulk_refund","issue_payout","close_account","measure"],
 "🧾":"$tool","🔍":"criteria","🔢":"declared_count","💵":"declared_value","🗂":"table"}
```

The wrapper is symmetric:

- **In** — removes from `body.tools` every entry whose name is in `$tools`, so no JSON
  schema for a grammar tool reaches the model; other tools (the harness's built-ins —
  `create_sub_agent`, OpenUI) stay native. In prior context it drops `tool_calls` for
  grammar tools from assistant messages (their `content` already holds the lines) and turns
  the matching `role: tool` results into `role: user` text. `VercelAILLM` would otherwise
  render them as provider tool-call / tool-result parts, and Anthropic rejects `tool_use`
  without `tools`. Provider-agnostic; the deny reason and the `measure` result arrive as
  plain text.
- **Out** — re-yields every stream chunk untouched. On the generator's final
  `RawAssistantMessage`, if `tool_calls` is empty: for each `content` line whose first
  codepoint is a registered key, the rest of the line is the raw string value; the `$tool`
  key names the tool, every other registered key becomes an argument under its mapped name;
  one leading `U+FE0F` after the key is dropped (models add it to `⚖`, `♻`, `🗂`); unregistered
  lines are ignored. If a `$tool` line was found, set
  `tool_calls = [{ id, type: "function", function: { name, arguments } }]` and
  `finish_reason: "tool_calls"`. `content` is left untouched — the model must read its own
  proposal back.

No types, no validation, no knowledge of guardrails, verdict rules or measurement. The
registry is user-chosen; the adapter is reusable for any emoji-keyed line grammar.

`trueforge-core` is not edited. Everything after the seam is native: `stepLLMCall`
(`AgentThread.mjs:740-792`) reads the generator's return value → `enrichAssistantMessage` →
`tool_info.is_approval_required` from the MCP `destructive` annotation →
`tool.approval_required` → resolve with `reason` → tool result → next LLM call. Source at
upstream `a3a1395`: seam `packages/trueforge/src/apis/turns.ts:146-162`; gate
`packages/trueforge-core/src/core/runtime/AgentThread.ts:1073-1144` (`enrichAssistantMessage`
is called twice — execution and SSE event — which is why the injection lives upstream of
both, on the `ILLM` return value); approval sentinel `packages/trueforge-core/src/core/mcp/ToolSet.ts:69-91`.

**Presentation.** The grammar lines stay in the model's context and therefore in the raw
transcript. What a person sees is a rendering concern, as a coding agent renders a tool call
as a block rather than raw text: the Bench trace renders a proposal as
"`bulk_refund` · `status=disputed` · declared 7 / $840.00" (T030); rendering in the harness
frontend (`dist/_frontend`) is polish, T051, cut first. The Bench decodes the proposal from
`content` with `decodeProposal` (T026) — the only source of truth; a missing `🔢` or a
malformed line is a parse failure → `escalate` (FR-002, FR-025). The tool never runs on a
proposal the Bench did not decode, because the approval is the Bench's to resolve.

**Rationale**: The loop's only tool-call source is the provider's `tool_calls`; plain text
ends the turn (§A). `ILLM` is a public, pluggable interface whose return value every
downstream consumer reads — the synthesis plugs into an existing contract instead of editing
control flow. Registry-driven so the patch carries no product knowledge and survives a key
change without a re-derive. `pnpm patch` rather than a fork because the pin to 0.1.4 already
exists (R9), the dist is readable, and a fork costs a clone, a build and a `file:` link
under the clock. Constitution VIII tradeoff (one config surface with one value today) is in
`plan.md` Complexity Tracking.

**Facts to know**:
- A denial reaches the model as the text `{"error":"User denied tool call: <reason>"}`
  (`ToolSet.ts:85-90`, after the wrapper's `role: user` conversion; the wrapper does not unwrap
  the envelope — it validates and reshapes nothing). Harness input, not model output; FR-024
  governs what the model *emits*.
- Streaming shows the grammar as plain-text deltas; only the final `model.message` carries
  `tool_calls`. The state machine reads the final message, so this is cosmetic.
- `stop` sequences exist per agent through `model_params` passthrough. Not needed: the turn
  ends on its own and the wrapper reads the finished message.

**Risks**:
- *R-14a* — A model that emits a native built-in call and grammar lines in the same message:
  the wrapper synthesises only when `tool_calls` is empty, so the grammar lines are ignored
  that turn. Prompts keep the proposal in its own message. Watched in the T008a run.
- *R-14b* — Converting grammar tool results to `role: user` changes the provider's view of
  history. Verified by a Claude turn after a deny in T008a, not assumed.
- *R-14c* — The patch pins to 0.1.4 and fails loudly on a bump. Intended: R9 forbids bumps.

**Alternatives considered**: edit `AgentThread.stepLLMCall` in `trueforge-core` before both
`enrichAssistantMessage()` calls — a core control-flow edit and a second site for `tools`.
Keep `body.tools` when history holds tool blocks — re-sends the JSON schema on every turn
after the first deny, the exact surface D-08 removes. Scope the wrapper by model name —
breaks when both agents share a model; scoping by `$tools` does not. Fork
`github.com/truefoundry/trueforge` and build from source — same change, more toolchain.
Bench owns the pause — D-08, third alternative.

### D-15 — Measurement is a tool the Evaluator calls: `measure` on a read-only server

**Decision**: A second MCP server, `packages/measure` (`@crossexam/measure`,
streamable-HTTP, attached only to the Evaluator agent), exposes one tool, `measure`, with
string arguments `criteria` and `table` (`charges` | `payouts`), annotated read-only and
non-destructive so it needs no approval. It runs the resolution order of D-03 (sandbox
first, local fallback, one fresh 20 s budget each) and returns the three grammar lines
exactly as `measure.py` printed them as its text result, with `{executor, duration_ms,
script_sha256, criteria, table}` in `structuredContent` — the echo is what lets rule 2 of D-06
tie the result to the proposal. It reads the replica at `CROSSEXAM_REPLICA_PATH` and listens
on `CROSSEXAM_MEASURE_SERVER_URL`; the action server listens on `CROSSEXAM_ACTION_SERVER_URL`
(data-model §12). `pnpm demo` starts both (T030). The Evaluator invokes it in the grammar —
`🧾measure` / `🔍<criteria>` / `🗂<table>` — through the D-14 adapter. The Bench reads the
tool-result event of the Evaluator's turn to obtain `observed` for `decide()` (D-06).

**Rationale**: The models make the tool calls; nothing deterministic decides for them. The
action server (`packages/mcp`) must never open the replica, so measurement lives on its own
server. One tool, two string arguments, the same executor code (T015–T017) behind it.

**Alternatives considered**: the Bench runs the executor and injects the triple into the
charge sheet — the Evaluator reduced to reading numbers someone else produced. The
Evaluator uses the harness's Code Mode sandbox directly — loses the local fallback, the
fixed 20 s budgets and `script_sha256`.

## C. Remaining assumptions

Carried from the spec rather than resolved here; none blocks Phase 1.

- **[ASSUMPTION]** The exact model per agent (D-10) is validated at the table on Saturday.
- **[ASSUMPTION]** Daytona is reachable from the venue network. If it is not, D-03's local
  executor carries the demo and the sandbox becomes the thing we describe rather than show.
  Verified the night before per Risk R1, not on the day.
