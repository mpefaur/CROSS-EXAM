---
description: "Task list for CROSS-EXAM — Adversarial Evaluator with Measured Blast Radius"
---

# Tasks: CROSS-EXAM — Adversarial Evaluator with Measured Blast Radius

**Input**: Design documents from `/specs/001-cross-exam-evaluator/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Unit tests appear for **exactly three** pure functions (grammar decoder, ledger
cohort totals, `decide()`), because research [D-12](./research.md) rules each cheaper than a
scenario re-run. The seeded end-to-end scenario is the required test everywhere else
(Constitution IV). No other unit test is in scope (spec § Out of Scope).

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: `[US1]`…`[US6]`, mapping to the user stories in [spec.md](./spec.md)
- Every task names its exact file path

## Path Conventions

pnpm workspace, four packages ([plan.md](./plan.md) § Source Code):

- `packages/core/` — grammar, model, ledger, measure, verdict, `scripts/measure.py`
- `packages/mcp/` — the streamable-HTTP MCP server of irreversible actions (+ `guardrails.ts`, a pure function)
- `packages/measure/` — the read-only `measure` MCP server the Evaluator calls (D-15)
- `patches/` — the `pnpm patch` on `@truefoundry/trueforge` (D-14)
- `apps/bench/` — the orchestrator ("the Bench") and `pnpm demo`
- `fixtures/` — generated, committed ledgers

## Per-task git discipline (Constitution V — no waiver)

**One task = one branch = one PR = one Qodo review = merge.** Branch name for every task
below: `task/<TaskID>-<short-slug>` off `main`. Opening the branch and PR for a task in this
file is pre-authorized ([AGENTS.md](../../AGENTS.md) §7); Qodo findings are resolved before
merge and cannot be fabricated retroactively.

## Owner split ([research-findings.md](../../docs/research-findings.md) §7.3)

**A** — critical path: `apps/bench`, `packages/core/src/measure`, `packages/measure`, `packages/core/src/verdict`, `patches/`.
**B** — `packages/mcp`, `packages/core/src/ledger`, `packages/core/src/docket`. The OpenUI card (T042) and the docket wiring (T045) edit A's hot files `evaluator.ts` and `resolve.ts`, so A owns them ([docs/parallel-implementation.md](../../docs/parallel-implementation.md) §3).
`packages/core/src/grammar` is the one shared surface: it lands in Phase 2, **before** either
builder branches off it.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the workspace and the four commands of [AGENTS.md](../../AGENTS.md) §1,
which do not yet exist.

- [x] T000 Land the Qodo review contract **before the first feature PR**: [docs/qodo-playbook.md](../../docs/qodo-playbook.md) (commands, the confirm/challenge/dismiss protocol, the PR body template) and the four non-negotiable rules in [AGENTS.md](../../AGENTS.md) §7. Open this task's own PR and use it as the protocol's first live run — read the review, reply to every finding, and leave that thread as the worked example (Constitution V, SC-009)
- [x] T001 Create the pnpm workspace root: `pnpm-workspace.yaml` listing `packages/*` and `apps/*`; root `package.json` (ESM, `"type": "module"`, `packageManager: pnpm@11.4.0`) with the scripts `demo`, `test`, `lint`, `build`, `seed`; `.gitignore` covering `.env*`, `node_modules/`, `.crossexam/`; `.nvmrc` pinning Node 22.14
- [x] T002 Create the three package manifests — `packages/core/package.json`, `packages/mcp/package.json`, `apps/bench/package.json` — each with `"exports": "./src/index.ts"` (source export, no emit) and the exact pins of research [D-02](./research.md): `@truefoundry/trueforge` 0.1.4, `@truefoundry/trueforge-sdk` 0.1.3, `@modelcontextprotocol/sdk` 1.30.0, `zod` 4.5.2, `tsx` 4.23.12, `vitest` 4.1.11, `typescript` 5.9.3 — no caret ranges anywhere (Risk R9)
- [x] T003 [P] Create `tsconfig.base.json` at the repo root and a `tsconfig.json` in each of the three packages; wire `pnpm build` to a workspace-wide `tsc --noEmit` so it fails on a real type error ([D-01](./research.md))
- [x] T004 [P] Configure ESLint in `eslint.config.js` at the repo root and wire `pnpm lint`
- [x] T005 [P] Create `.env.example` with the variable **names only** from [data-model.md](./data-model.md) §12 and dummy values — `TRUEFORGE_BASE_URL`, `TARGET_AGENT_NAME`, `EVALUATOR_AGENT_NAME`, `TARGET_MODEL`, `EVALUATOR_MODEL`, `CROSSEXAM_ESCALATION_THRESHOLD_USD`, `CROSSEXAM_MEASUREMENT_TIMEOUT_MS`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — and confirm `.env` is gitignored (FR-023, Constitution VI)

**Checkpoint**: `pnpm install`, `pnpm build`, and `pnpm lint` all run and their output was read.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared surface both builders compile against, plus the seeded data every
measurement depends on.

**⚠️ CRITICAL — T009 is the hard gate.** No task that *encodes or decodes the wire format*
begins until T009 (grammar) is merged. The grammar is the contract *between the two agents*;
a change to it after either builder branches breaks both sides at once
([docs/emoji-grammar.md](../../docs/emoji-grammar.md) § Maintenance).

**T013 (fixtures) is a narrower gate**: it blocks only the tasks that *open a ledger* —
T015's real run, T017a's real call, T021, T030. It does not block T014, T018, T020, T022–T028.

**T008a (harness patch) gates every live turn** — T020's manual check and T022 onward. It
does not gate T009–T019, and it needs only T001–T002.

**Three Phase 3 tasks do not wait for this phase at all** and should be started early rather
than held: **T014** (`measure.py` is stdlib Python — no TypeScript dependency, startable at
t=0 alongside Phase 1), **T018** (`decide()` needs only T007 + T008), and **T022** (agent
creation needs T008 + T008a). See [docs/parallel-implementation.md](../../docs/parallel-implementation.md) §2.

- [x] T006 Create the ledger entity types — `Charge`, `Payout`, `ReplicaLedger`/`ProductionLedger` — in `packages/core/src/model/entities.ts` per [data-model.md](./data-model.md) §1–§3, money as integer cents only; create the barrel `packages/core/src/index.ts` re-exporting the model (later tasks append their own export line)
- [x] T007 **[critical path — T009 depends on it]** Create the case types — `ProposedAction`, `GuardrailReport`, `ChargeSheet`, `Measurement`, `Verdict` — in `packages/core/src/model/case.ts` per [data-model.md](./data-model.md) §4, §6–§9, typing the Constitution II invariant so `verdict !== 'escalate'` forces `evidence !== null` at compile time. `[P]` with T008 only — this is **not** a side branch: [contracts/wire-grammar.md](./contracts/wire-grammar.md) types `decodeProposal(text): DecodeResult<ProposedAction>` and the encoder takes a `Verdict`, so T009 cannot start until this lands
- [x] T008 [P] Create the environment config loader in `packages/core/src/model/config.ts` reading every variable of [data-model.md](./data-model.md) §12 with its documented default; it must never print, log, or echo a credential value, not even truncated (FR-023, SC-010)
- [x] T008a [P] **(needs only T001–T002)** Patch the harness with the registry-driven adapter of [research.md](./research.md) D-14: `pnpm patch @truefoundry/trueforge@0.1.4`, wrap the `new VercelAILLM(...)` of the `llm:` factory in `dist/main.js` in `GrammarToolCallLLM` — reads the registry file at `CROSSEXAM_GRAMMAR_REGISTRY_PATH` at start (unset → inert) — `packages/core/src/grammar/registry.json`, keeping its `kind: "tool"` entries — and logs one startup line — key count and tool names, or `inert`; strips `body.tools` entries whose name is a registered tool; drops prior grammar-tool `tool_calls` and turns their `role: tool` results into `role: user` text; on the final message maps the first registered-emoji line to that tool, its `|`-split fields to the argument names by position, and sets `finish_reason: "tool_calls"` — then `pnpm patch-commit`, commit `patches/` and the `patchedDependencies` entry; `.env.example` carries `CROSSEXAM_GRAMMAR_REGISTRY_PATH` pointing at that file ([docs/emoji-grammar.md](../../docs/emoji-grammar.md) § The registry file). No guardrail, rule or measurement knowledge in the patch. Verify with a real run from the workspace (`pnpm exec trueforge`, never `npx`): the startup line appears in the harness log — paste it; a model emitting the one proposal line produces `tool.approval_required` naming the tool — paste it; a Claude turn after a deny succeeds with no `tools` in the request (R-14b) — paste it; a built-in tool still works natively beside a grammar tool (FR-001, FR-024, D-14)
- [x] T009 Implement the emoji grammar encoder and the three decoders — `decodeProposal`, `decodeVerdict`, `decodeMeasurement` — in `packages/core/src/grammar/index.ts` against the registry in [docs/emoji-grammar.md](../../docs/emoji-grammar.md), honouring every obligation in [contracts/wire-grammar.md](./contracts/wire-grammar.md): strict single-pass decode, an unknown key, a key from another direction, more than one non-blank line or a field count other than the key's arity is a terminal parse failure, `declared_value`/`measured_value` parsed `#.##` → integer cents, encoder throws on a value containing `\n` or `|`, and `✅`/`⛔` cannot be encoded without the measured triple (FR-024, FR-025)
- [x] T010 Write the grammar unit suite in `packages/core/tests/grammar.test.ts`: `decodeProposal(encodeProposal(p))` deep-equals `p` for every fixture proposal, `decodeMeasurement` accepts the one-line `measure.py` output and rejects a `✅`/`⛔` line, `⚖` fails `decodeVerdict`, a verdict key fails `decodeProposal`, `📏` fails all three decoders, `🧾`/`💸`/`🔒` each map to their action, one leading `U+FE0F` after a key is dropped, `🧾a=1|1|1.00` and `🧾a=1 | 1 | 1.00` decode equal, plus one asserting-`ok:false` case per malformed class — unregistered key, keyless line, two fields (a declared figure missing), four fields (a `|` inside a value), non-`#.##` money, empty reason, embedded newline, two non-blank lines ([D-12](./research.md))
- [x] T011 Implement the RNG-free ledger generator in `packages/core/src/ledger/generate.ts` producing the cohorts of [research.md](./research.md) [D-05](./research.md) exactly — 611 disputed+refunded, 586 disputed+unrefunded+`age_days>30`, 7 disputed+unrefunded+`age_days<=30` totalling $840.00, 1,204 disputed totalling $96,310.00, 296 settled/open, 342 eligible payouts totalling $418,220.00 — amounts from a fixed repeating cycle with the last charge of each cohort absorbing the remainder; add the `packages/core/src/ledger/seed.ts` entrypoint behind `pnpm seed`, writing both seeds independently (FR-006, FR-007)
- [x] T012 Write the ledger cohort unit suite in `packages/core/tests/ledger.test.ts` asserting every count and total of the table above, plus the `refunded === (refunded_at !== null)` invariant and `amount_cents > 0` on every row ([data-model.md](./data-model.md) §1)
- [x] T013 Run `pnpm seed` and commit the generated `fixtures/production.json` and `fixtures/replica.json`; re-run and confirm both files are byte-identical to the committed ones (FR-006, SC-002)

**Checkpoint**: `pnpm test` runs the grammar and ledger suites green; both builders can now
branch in parallel without touching each other's files.

---

## Phase 3: User Story 1 — The measured denial loop (Priority: P1) 🎯 MVP

**Goal**: Hold the bulk refund, execute its exact criteria against the seeded replica, deny it
with the measured numbers, let the agent re-propose, measure again, allow, execute against
production. This loop is the entire product.

**Independent Test**: `pnpm demo` — round 1 is denied citing 1,204 / $96,310.00 / 611, round 2's
criteria are narrower, the second measurement returns 7 / $840.00 / 0, the verdict is `allow`,
and the action executes ([quickstart.md](./quickstart.md) Scenario 1).

### Measurement — the only thing that may produce a number (owner A)

- [x] T014 [P] [US1] **(no dependency — start during Phase 1)** Write the one measurement script `packages/core/scripts/measure.py` — Python 3, **stdlib only** — implementing the predicate grammar of [data-model.md](./data-model.md) §5 (`term (' AND ' term)*`, no `OR`, no parens, no `eval`), counting matched rows, their value and the already-acted-on duplicates over the `charges` or `payouts` table, printing the one `🧮count | value | duplicates` line on stdout and nothing else, with exit codes `0`/`2`/`3` per [contracts/measurement-executor.md](./contracts/measurement-executor.md); it never writes, never opens a socket, and never reads a path it was not given (FR-004, FR-005, D-04)
- [x] T015 [P] [US1] Implement `measure()` in `packages/core/src/measure/index.ts` — no interface, one transport ([contracts/measurement-executor.md](./contracts/measurement-executor.md)): spawns `python3 -I measure.py` with `env: { PATH }`, `cwd` a fresh `mkdtemp` directory, the replica path as its only ledger argument and a fresh `AbortSignal` at `CROSSEXAM_MEASUREMENT_TIMEOUT_MS`; decodes stdout through the Phase 2 grammar, records `script_sha256` of the file that actually ran, returns `Measurement | null` — `null` on any failure or on the signal, no second attempt, no retry loop. Its unit test asserts the spawn options above (FR-004, FR-010)
- [ ] ~~T016~~ **Cut 2026-08-29** (spec Clarifications, Session 2026-08-29 — the sandbox is not a transport). Was: Implement `SandboxExecutor` in `packages/core/src/measure/sandbox.ts` — uploads `measure.py` and `fixtures/replica.json` into the Daytona sandbox once per run, executes, reads stdout, records the same `script_sha256`; returns `null` on any failure rather than throwing (FR-004, Risk R1)
- [ ] ~~T017~~ **Folded into T015 2026-08-29** — with one transport the resolution order is the function itself
- [x] T017a [US1] Create `packages/measure` (`@crossexam/measure`): manifest with `"exports": "./src/index.ts"`, the `typecheck`/`test` scripts and D-02 pins of the other packages, `@crossexam/core` as a workspace dependency, a `tsconfig.json` extending `tsconfig.base.json` and a `src/index.ts` so `pnpm build` and `pnpm lint` cover it from the first commit — a streamable-HTTP MCP server exposing the read-only `measure` tool of [research.md](./research.md) D-15: string arguments `criteria` and `table`, runs T017's resolution order, reads only `CROSSEXAM_REPLICA_PATH`, listens on `CROSSEXAM_MEASURE_SERVER_URL`, on success returns the one `🧮` line as text and the full `Measurement` — `{criteria, table, measured_count, measured_value_cents, duplicate_count, executor, duration_ms, script_sha256}` — as `structuredContent`; on failure `isError: true`, one reason line as text and `{criteria, table, executor: null}` as `structuredContent` ([contracts/measurement-executor.md](./contracts/measurement-executor.md) § The tool the Evaluator calls); non-destructive, so no approval. Verify with two real calls over HTTP against `fixtures/replica.json` — `status=disputed` on `charges`, and a criteria string that does not parse — and paste both results; confirm `pnpm build` lists the package (FR-004, FR-005, D-15)

### The verdict guardrail — escalates on data, guides the Evaluator on tool use (owner A)

- [x] T018 [P] [US1] **(needs only T007 + T008 — start during the Phase 2 window)** Implement the guardrail `decide(proposal, evaluatorVerdict: DecodeResult<EvaluatorVerdict>, observed: MeasureAttempt | null, state: { guidances, elapsed_ms }, config): Outcome` in `packages/core/src/verdict/decide.ts` as the six ordered rules of [research.md](./research.md) D-06 — rules 1, 2b and 3 return an `escalate` `Verdict`; rules 2a, 4 and 5 return a `Guidance` with the observed figures, or an `escalate` `Verdict` carrying that rule once `CROSSEXAM_EVALUATOR_RETRIES` guidances have been spent on the held action; rule 6 returns the Evaluator's `allow` or `deny` as a `Verdict` with `evidence = observed.result`. Code never emits `allow` or `deny` on its own (Constitution II, FR-008–FR-012, [data-model.md](./data-model.md) §9)
- [x] T019 [US1] Write the verdict unit suite in `packages/core/tests/verdict.test.ts` covering each rule and their **ordering**: threshold exceeded plus a mismatch → `escalate` under rule 3; `observed.result === null` on the proposal's criteria → `escalate` under rule 2b; `observed === null` (no call), or `observed.criteria`/`observed.table` differing from the proposal → `Guidance` under rule 2a whatever the Evaluator wrote; `evaluatorVerdict.ok === false` → `Guidance` under rule 4; a `deny` citing figures that differ from `observed` → rule 4; an `allow` with `observed.duplicates > 0` → `Guidance` under rule 5; a matching `deny` and a matching `allow` both stand under rule 6; `state.guidances === 3` and a rule-4 failure → `escalate` with `rule: '4'`; `state.elapsed_ms > CROSSEXAM_CASE_BUDGET_MS` → `escalate` under rule 2b whatever else holds; the invariant `verdict !== 'escalate' ⇒ evidence !== null` (Constitution II, [data-model.md](./data-model.md) §9)

### The irreversible actions (owner B)

- [x] T020 [P] [US1] Implement the streamable-HTTP MCP server in `packages/mcp/src/server.ts` with the entrypoint `packages/mcp/src/index.ts`, exposing `bulk_refund`, `issue_payout`, and `close_account` with the arguments and `destructive: true` annotations of [contracts/mcp-tools.md](./contracts/mcp-tools.md); handlers take the harness's string arguments (`criteria`, `declared_count`, `declared_value`) and **execute nothing at proposal time** — the harness holds the call, the Bench decodes the proposal from the model's text (FR-001, D-14)
- [x] T021 [US1] Implement production execution in `packages/mcp/src/execute.ts`: on an `allow` resolution and only then, apply the action to `fixtures/production.json` and report the count and total it computed at execution time; it must never open the replica, and never report a figure it did not compute (FR-014, [contracts/mcp-tools.md](./contracts/mcp-tools.md) § What this server must never do)

### The orchestrator — the Bench (owner A)

- [x] T022 [P] [US1] Create both agents from configuration in `apps/bench/src/sessions/agents.ts` — target and evaluator, names and models read from `TARGET_AGENT_NAME`/`EVALUATOR_AGENT_NAME`/`TARGET_MODEL`/`EVALUATOR_MODEL`; the target gets the action server (`@crossexam/mcp` at `CROSSEXAM_ACTION_SERVER_URL`, `require_approval_for_tools: ["@all"]`), the Evaluator gets the `measure` server (`@crossexam/measure` at `CROSSEXAM_MEASURE_SERVER_URL`, T017a) and its native built-ins; both are read from configuration, never hardcoded (FR-022)
- [x] T023 [US1] Implement the per-session FIFO turn queue in `apps/bench/src/sessions/queue.ts` — one turn in flight per `sessionId`, ever, since creating a turn cancels any running turn in that session; construct the SDK client with `timeoutInSeconds: 600` (FR-003, Risks R5/R6)
- [x] T024 [US1] Implement the SSE consumer in `apps/bench/src/sessions/stream.ts`, indexing every event by `id` so a later event can reach the one it references — the Bench reads what the harness held and what the tool returned from this index (FR-001, FR-004)
- [x] T025 [US1] Implement the correlation in `apps/bench/src/correlate/index.ts`: `tool.approval_required` carries only `{id, source_event_id}`, so walk back to the preceding `model.message` to recover the tool name and the message's text content; the proposal is decoded from that content (T026), never from the harness-synthesised `tool_calls[].function.arguments` (FR-002, D-14; the harness does not correlate — [research.md](./research.md) §A)
- [x] T026 [US1] Assemble the charge sheet in `apps/bench/src/correlate/chargeSheet.ts` exactly as [contracts/charge-sheet.md](./contracts/charge-sheet.md) specifies, decoding the proposal through the Phase 2 grammar and substituting `{ "parse_error": "<reason>" }` when it does not parse; the orchestrator must never construct a `Measurement` itself
- [x] T027 [P] [US1] Write the Evaluator prompt in `apps/bench/src/prompts/evaluator.ts`: it receives the charge sheet, **calls `measure` in the grammar** — one line, `📏<criteria> | <table>` — reads the `🧮` line back, and only then writes one `✅` or `⛔` line — never an escalation, which has no key and is the system's — with the three measured figures copied from the `🧮` line and a `reason` fourth field that on a `⛔` carries the measured figures; it never writes `allow` or `deny` without having measured, and when it receives a guidance turn (D-06 rules 2a/4/5) it corrects its tool use and re-issues the verdict (FR-009, FR-012, D-06, D-15)
- [x] T028 [P] [US1] Write the target agent prompt in `apps/bench/src/prompts/target.ts`: an ordinary support agent that proposes `bulk_refund` as one `🧾criteria | count | value` line with its declared figures, and on reading a denial reason narrows its own selection criteria and proposes again — the correction comes from the reason, not from a script (FR-015, US1-3). Emoji keys appear only in tool arguments and tool results; the agent's replies to the person it is chatting with are plain prose and never surface a grammar line
- [x] T029 [US1] Implement verdict resolution in `apps/bench/src/sessions/resolve.ts`: decode the Evaluator's message with `decodeVerdict`, build `observed: MeasureAttempt | null` from the `structuredContent` of the last `measure` tool-result event of its turn (`null` when there is none; never from the result's text), run `decide()` (T018); on a `Guidance` send its message as the Evaluator's next turn and repeat, passing `state = { guidances, elapsed_ms }` — the guidance count and the age of the held action since charge-sheet assembly — so `decide()` applies `CROSSEXAM_EVALUATOR_RETRIES` and `CROSSEXAM_CASE_BUDGET_MS`; on a `Verdict` map it — `allow` → resolve approval allow, `deny` → resolve with `reason` = the `⛔` line's fourth field, `escalate` → leave the approval pending; enforce the double-decision guard by compare-and-set on `case_id` in the in-memory case table ([data-model.md](./data-model.md) §10) (FR-013, FR-014, FR-015)
- [ ] T030 [US1] Wire the whole loop in `apps/bench/src/demo.ts` behind `pnpm demo` — which refuses to start when `CROSSEXAM_GRAMMAR_REGISTRY_PATH` is unset (a stock harness would end every proposal turn as plain text), starts both MCP servers itself, `packages/mcp` on `CROSSEXAM_ACTION_SERVER_URL` and `packages/measure` on `CROSSEXAM_MEASURE_SERVER_URL` — emitting the observable trace of [quickstart.md](./quickstart.md) Scenario 1 — proposal, measurement with its executor and duration, verdict with its rule label, re-proposal, second measurement, final decision, execution — and reporting a divergence rather than pretending the scripted numbers were measured if the agent leaves the seeded path (FR-016, spec § Edge Cases)
- [ ] T031 [US1] Wire `pnpm test` in `apps/bench/tests/scenario.test.ts` to run the seeded scenario three consecutive times and assert all three report identical counts and dollar amounts, alongside the three unit suites (SC-002, SC-012)
- [ ] T032 [US1] Run [quickstart.md](./quickstart.md) Scenarios 1 and 2 and paste the real output; every checkbox under "Passes when" must be ticked from that output, not from expectation (Constitution IV)

**Checkpoint**: 🎯 **The MVP is done.** The loop closes end to end. This is the 14:30 PDT gate —
if it has not closed here, everything below is cancelled outright (Constitution I).

---

## Phase 4: User Story 3 — The case the Evaluator cannot prove goes to a human (Priority: P2)

**Goal**: Every failure mode returns `escalate`, the action stays unexecuted, and a real person
decides.

**Independent Test**: The four `pnpm demo -- --scenario …` runs of [quickstart.md](./quickstart.md)
Scenario 4 each return `⚖ escalate`, none emits `allow` or `deny`, and no attempt exceeds 20 s.

> **Sequenced before User Story 2** despite sharing priority P2: [quickstart.md](./quickstart.md)
> § Cut order never cuts Scenario 4 — it carries the Constitution II invariant — while Scenario 3
> (User Story 2) is cut at the cutline. `decide()` already implements rules 1, 2b and 3 from T018; this
> phase makes them reachable and observable.

- [ ] T033 [US3] Add scenario selection in `apps/bench/src/scenarios.ts` and the `--scenario` flag in `apps/bench/src/demo.ts` for `unparseable`, `missing-declared`, `no-executor`, and `over-threshold`, each forcing exactly one failure mode without altering the production code path
- [ ] T034 [US3] Confirm and, where needed, complete the escalate path in `apps/bench/src/sessions/resolve.ts`: the approval stays pending, the case is presented with its evidence, the action stays unexecuted, and there is no timeout that auto-approves — ever (FR-013, FR-014, spec § Edge Cases)
- [ ] T035 [US3] Wire the `over-threshold` scenario in `apps/bench/src/scenarios.ts` to propose `issue_payout` against the `payouts` table, whose $418,220.00 measurement crosses `CROSSEXAM_ESCALATION_THRESHOLD_USD=250000` and returns `escalate` under rule 3 with its measured figures cited (FR-011, [D-07](./research.md))
- [ ] T036 [US3] Run all four scenario flags of [quickstart.md](./quickstart.md) Scenario 4 and paste the output: four `⚖ escalate`, zero `allow`/`deny`, action unexecuted in each, and no measurement attempt over 20 s in the `no-executor` run (SC-004, SC-011)

**Checkpoint**: The evidence rule is demonstrated, not just claimed.

---

## Phase 5: User Story 2 — The guardrails that pass while the damage goes through (Priority: P2)

**Goal**: Four conventional controls approve the damaging action; only the measurement stops it.

**Independent Test**: `pnpm demo -- --guardrails-only` prints four `PASS` lines and no block;
the full `pnpm demo` then stops the identical action ([quickstart.md](./quickstart.md) Scenario 3).

- [x] T037 [US2] Implement the four checks as a pure function in `packages/mcp/src/guardrails.ts` — $2,000 per-action ceiling, per-customer frequency cap, eligibility-policy check, and a self-reported confidence of 0.94 — over a decoded proposal and the session's prior proposals; all four pass on the damaging proposal; four hardcoded checks, no engine (FR-017, D-13)
- [ ] T038 [US2] Call the four checks from the Bench at charge-sheet assembly in `apps/bench/src/correlate/chargeSheet.ts` and attach the `GuardrailReport`, render the four pass/fail lines in the `apps/bench/src/demo.ts` trace, and add the `--guardrails-only` flag that stops after them. Nothing about the guardrails touches the harness patch or the tool handler (FR-018, D-13)
- [ ] T039 [US2] Run [quickstart.md](./quickstart.md) Scenario 3 and paste the output: four passes with no block, then the identical action denied by the measurement, with the on-screen gap $96,310.00 against $840.00 (SC-005, US2-1, US2-2)

**Checkpoint**: The informed judge's objection is answered on screen without anyone arguing it.

---

## Phase 6: User Story 4 — Three investigators working the case in parallel (Priority: P3)

**Goal**: Blast radius, policy, and precedent run concurrently and converge into one verdict.

**Independent Test**: One case shows three concurrent, individually visible investigation
angles, and the verdict cites the blast-radius numbers plus at least one other angle's finding.

> **Cancelled outright if Phase 3 has not closed by 14:30 PDT** (Constitution I). Dynamic
> subagents are on by default in the harness, so this is expected to cost prompt, not code
> ([research.md](./research.md) §A) — verify that before spending build time on it.

- [ ] T040 [US4] Extend the Evaluator prompt in `apps/bench/src/prompts/evaluator.ts` to split each case into the three angles and work them concurrently through the harness's native `create_sub_agent`, requiring the final verdict to cite the blast-radius figures and reference at least one other angle (FR-019, US4-2)
- [ ] T041 [US4] Run one case and paste the output showing three `thread.created`/`thread.done` pairs as individually visible concurrent activities, and a verdict citing more than one angle (US4-1, US4-2)

---

## Phase 7: User Story 5 — The verdict card the jury reads (Priority: P3)

**Goal**: The verdict renders as a card with charge, severity, declared beside measured, the
affected charges, and working decision controls.

**Independent Test**: One verdict renders the full card in the harness UI and a person's
selection on it reaches the run ([quickstart.md](./quickstart.md) Scenario 5).

> **Cancelled outright if Phase 3 has not closed by 14:30 PDT** (Constitution I). OpenUI is
> native, so no frontend code is written ([research.md](./research.md) §A).

- [ ] T042 [US5] Extend the Evaluator prompt in `apps/bench/src/prompts/evaluator.ts` to emit the OpenUI card — `Card` with the charge, a severity `Tag`, a bar chart putting declared beside measured, a `Table` of the affected charges, and Allow / Deny / Escalate `Action(@ToAssistant(...))` controls (FR-020, [D-11](./research.md))
- [ ] T043 [US5] Route the card's decision back through `apps/bench/src/sessions/resolve.ts` so a human's selection determines whether the action executes, subject to the same double-decision guard; run [quickstart.md](./quickstart.md) Scenario 5 at `http://localhost:8790` and record what the card showed (US5-1, US5-2)

---

## Phase 8: User Story 6 — The docket remembers (Priority: P4)

**Goal**: Charges, evidence, and verdicts survive the session that produced them.

**Independent Test**: Produce a verdict, end the session, start a new one, and retrieve the
earlier verdict with its cited evidence.

> **Built only if Phases 6 and 7 are already done before the 16:00 PDT freeze** (spec, US6).

- [x] T044 [US6] Implement the append-only docket in `packages/core/src/docket/index.ts` — write a `DocketEntry` per [data-model.md](./data-model.md) §11 as one JSON line to `.crossexam/docket.jsonl`, and query by `action` (FR-021)
- [ ] T045 [US6] Record every verdict from `apps/bench/src/sessions/resolve.ts`, then run the two-session retrieval check and paste the output showing the earlier verdict and its cited evidence returned in a new session (US6-1)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T046 [P] Write `README.md` with the pitch, the pinned versions of [D-02](./research.md), the prerequisites and commands from [quickstart.md](./quickstart.md), and the Qodo review trail (Risk R9, R8)
- [ ] T047 [P] Verify no credential value appears anywhere: grep the repository, the demo output, and the logs; confirm `.env` is untracked and `.env.example` holds names and dummy values only (FR-023, SC-010)
- [ ] T048 Record a successful `pnpm demo` run as insurance against venue wifi and model latency, before the 16:00 PDT freeze (Risk R7)
- [ ] T049 Write the three-minute demo script to `docs/demo-script.md` following [research-findings.md](../../docs/research-findings.md) §7.4, with $96,310 against $840 as the number that stays in the jury's head (SC-006, SC-007)
- [ ] T051 [P] **(cut first)** Render grammar lines as a call block in the harness frontend (`dist/_frontend`, second `pnpm patch` site) so a person reading the transcript never sees a raw emoji line; the Bench trace already renders them (T030, D-14 § Presentation)
- [ ] T050 Re-run the full [quickstart.md](./quickstart.md) — Scenarios 1 through 5 as far as they were built — and paste every output; nothing is called done that was not read (Constitution IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** — no dependencies, starts immediately
- **Phase 2 (Foundational)** — depends on Phase 1; blocks every user story task **that touches the wire format or reads a ledger**. T009 (grammar) is the hard gate — the two-agent contract, and a change to it after either builder branches breaks both sides at once. T013 (fixtures) gates only the ledger readers (T015 run, T021, T030). T014, T018 and T022 are gated by neither
- **Phase 3 (US1, P1)** — depends on Phase 2. **The 14:30 PDT cutline.**
- **Phase 4 (US3, P2)** — depends on Phase 3 (reuses `decide()` rules 1, 2b and 3 and the resolver)
- **Phase 5 (US2, P2)** — depends on Phase 3 (extends the MCP handler and the charge sheet)
- **Phase 6 (US4, P3)** and **Phase 7 (US5, P3)** — depend on Phase 3; cancelled if Phase 3 has not closed by 14:30
- **Phase 8 (US6, P4)** — built only if Phases 6 and 7 are done before the 16:00 freeze
- **Phase 9 (Polish)** — depends on whatever was actually built

### User Story Dependencies

- **US1 (P1)** — depends only on Phase 2. The MVP; nothing else ships before it closes
- **US3 (P2)** — needs US1's `decide()` and resolver; independently testable via `--scenario`
- **US2 (P2)** — needs US1's MCP handler and charge sheet; independently testable via `--guardrails-only`
- **US4 (P3)** — prompt-level extension of US1's Evaluator; independently observable
- **US5 (P3)** — prompt-level extension of US1's Evaluator plus a resolver route; independently observable
- **US6 (P4)** — needs a verdict to record; independently testable across two sessions

### Within Each User Story

- The case types (T007) precede the grammar (T009) — `decodeProposal` returns `DecodeResult<ProposedAction>` and the encoder takes a `Verdict` ([contracts/wire-grammar.md](./contracts/wire-grammar.md))
- The measurement script (T014) precedes `measure()` (T015), which precedes the `measure` server (T017a); T017a precedes the first live Evaluator turn (T029's run, T030). T014 itself depends on nothing and is written against [data-model.md](./data-model.md) §5, not against any TypeScript in this repo
- `decide()` (T018) precedes its unit suite (T019) and the resolver (T029); the resolver also needs the `measure` tool-result event, so T017a
- The harness patch (T008a) precedes every task that runs a live turn — T020's manual check, T022–T032
- The correlation (T025) precedes the charge sheet (T026), which precedes the demo wiring (T030)
- Every phase ends with a task that **runs a real command and reads its output** — T032, T036, T039, T041, T043, T045, T050

### Parallel Opportunities

> The bullets below say *which tasks* may overlap. For the **wave plan**, the standing
> lane assignments, and the multi-writer files that `[P]` does not protect, see
> [docs/parallel-implementation.md](../../docs/parallel-implementation.md) — read it before
> `/speckit.implement`.

- **Phase 1**: T003, T004, T005 in parallel after T002
- **Phase 2**: T008a runs beside everything else in the phase (needs only T001–T002). T007 and T008 in parallel with each other after T006, but T007 is the critical path — T009 waits on it. T011 and T008 run beside the T007 → T009 chain (different owners, different directories); T018 opens once T007 merges
- **Phase 3**: T014 and T018 open before Phase 2 closes (see that phase's ⚠️ note); the remaining tracks run in parallel once T009 is merged — A on measurement (T014, T015) and the verdict (T018), B on the MCP server (T020), A on the orchestrator (T022). T027 and T028 (the two prompts) are independent files
- **Phase 9**: T046, T047 and T051 in parallel

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# Three independent tracks open at once, one branch and PR each:
Owner A: "T014 Write packages/core/scripts/measure.py"
Owner A: "T018 Implement decide() in packages/core/src/verdict/decide.ts"
Owner B: "T020 Implement the MCP server in packages/mcp/src/server.ts"

# Later in the same phase, the two prompts are independent files:
Owner A: "T027 Evaluator prompt in apps/bench/src/prompts/evaluator.ts"
Owner A: "T028 Target agent prompt in apps/bench/src/prompts/target.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only) — T001 through T032

1. Phase 1 Setup — the four commands exist and were run
2. Phase 2 Foundational — grammar and fixtures merged; **this is the gate**
3. Phase 3 User Story 1 — the loop closes
4. **STOP and VALIDATE**: T032 runs [quickstart.md](./quickstart.md) Scenarios 1 and 2 and every checkbox is ticked from real output
5. This alone is a complete, demonstrable product

### Incremental Delivery

1. Setup + Foundational → both builders can work without colliding
2. + US1 → **the MVP, and the 14:30 PDT gate**
3. + US3 → the evidence rule is demonstrated, not claimed (never cut)
4. + US2 → the informed judge's objection is answered on screen
5. + US4, US5 → the investigation and the verdict become legible
6. + US6 → memory across sessions

### Cut order under the clock (Constitution I)

If 14:30 PDT arrives and Phase 3 has not closed, **Phases 6, 7, and 8 are cancelled outright**
and all remaining time goes to closing Phase 3. Phases 3, 4, and the determinism check of T031
are never cut. New scope discovered mid-implementation gets cut, not added
([AGENTS.md](../../AGENTS.md) §2).

---

## Notes

- `[P]` means different files with no dependency on an incomplete task
- `patches/` is part of the R9 pin: a bump of `@truefoundry/trueforge` without re-deriving the patch is a broken install, by design
- `packages/core/src/index.ts` is created in T006; each later core task appends its own export line, so treat that file as shared and expect to rebase
- One task = one branch = one PR = one Qodo review = merge. No commit lands on `main` directly
- A verdict path never emits `allow`/`deny` without cited execution numbers; no measurement means `escalate`. This admits no time-pressure waiver (Constitution II)
- Never report a result you did not observe: a phase-closing task is done when its command was run and its output read
