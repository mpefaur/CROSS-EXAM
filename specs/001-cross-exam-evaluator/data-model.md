# Phase 1 Data Model: CROSS-EXAM

**Branch**: `001-cross-exam-evaluator` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Entities from `spec.md` § Key Entities, made concrete. All types are TypeScript as
implemented in `packages/core/src/model/`. Monetary values are **integer cents**
internally and formatted to `#.##` dollars only at the wire and display edges — no float
arithmetic anywhere on the money path (FR-006 determinism, SC-002).

---

## 1. Charge

A single row of a ledger. Same shape in the production ledger and the replica.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | `chg_000001` … deterministic, zero-padded, assigned in generation order |
| `customer_id` | `string` | `cus_0001` … ; a customer may hold several charges |
| `status` | `'disputed' \| 'settled' \| 'open'` | the predicate field the demo filters on |
| `amount_cents` | `integer` | > 0 |
| `opened_at` | `string` | ISO date, derived from the fixture's frozen `as_of` date |
| `age_days` | `integer` | ≥ 0; derived, materialized so the criteria grammar can compare it directly |
| `refunded` | `boolean` | `true` ⇒ a refund already settled |
| `refunded_at` | `string \| null` | ISO date when `refunded`, else `null` |

**Validation**
- `refunded === (refunded_at !== null)` — enforced by the generator, asserted in its test.
- `amount_cents > 0`.
- No field's value ever contains an emoji (the grammar's invariant,
  [docs/emoji-grammar.md](../../docs/emoji-grammar.md) § Invariant). Ids, amounts, dates,
  and statuses only — this is why no escaping is needed on the wire.

## 2. Payout

Second table in the same fixture, used only by the User Story 3 escalation scenario.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | `pay_0001` … |
| `merchant_id` | `string` | `mer_001` … |
| `amount_cents` | `integer` | > 0 |
| `payout_eligible` | `boolean` | the predicate field for the US3 proposal |

## 3. ReplicaLedger / ProductionLedger

Two files, one shape, **two independent seeds** — the replica is generated, never copied
(FR-006).

| Field | Type | Notes |
| --- | --- | --- |
| `seed` | `string` | `crossexam-replica-v1` / `crossexam-production-v1` |
| `as_of` | `string` | frozen ISO date; makes `age_days` deterministic forever |
| `charges` | `Charge[]` | 1,500 rows |
| `payouts` | `Payout[]` | 342 rows |

**Invariants asserted by the generator's unit test** (research D-05, D-12):

| Predicate | Count | Total |
| --- | --- | --- |
| `status=disputed` | 1,204 | $96,310.00 |
| `status=disputed AND refunded=true` | 611 | — |
| `status=disputed AND refunded=false AND age_days<=30` | 7 | $840.00 |
| `payout_eligible=true` | 342 | $418,220.00 |

Generation is RNG-free: amounts are drawn from a fixed repeating cycle and the last charge
of each cohort absorbs the remainder so the cohort total lands exactly on the figure above.
Same seed ⇒ byte-identical file, on every machine, forever.

## 4. ProposedAction

What the acting agent emits, decoded from the emoji grammar.

| Field | Emoji key | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `action` | `🧾` | `'bulk_refund' \| 'issue_payout' \| 'close_account'` | yes | must be a known irreversible tool. `tableFor(action)`: `bulk_refund` → `charges`, `issue_payout` → `payouts`, `close_account` → `charges` (the customer's charges are what a closure strands). D-06 rule 2 compares the `measure` result's echoed `table` against it |
| `criteria` | `🔍` | `string` | yes | a Criteria expression (§5) |
| `declared_count` | `🔢` | `integer` | yes | missing ⇒ `escalate` (FR-002) |
| `declared_value_cents` | `💵` | `integer` | yes | parsed from `#.##` dollars; missing ⇒ `escalate` |

**Validation**
- All four keys present exactly once. A repeated key is a parse failure.
- `declared_count >= 0`, `declared_value_cents >= 0`.
- A parse failure is terminal: never re-parsed under a looser grammar (FR-025), yields no
  measurement, therefore `escalate` (FR-010).

## 5. Criteria (predicate grammar)

Not free text. `term (' AND ' term)*`, where `term` is `field op value` (research D-04).

- `field` ∈ the ledger column names of §1/§2 (`status`, `refunded`, `age_days`,
  `amount_cents`, `customer_id`, `payout_eligible`, `merchant_id`).
- `op` ∈ `=` `!=` `>` `>=` `<` `<=`.
- `value` is a bare literal: bare word, integer, or `true`/`false`. No quotes, no `OR`, no
  parentheses, no functions.

Anything outside this grammar does not parse → no measurement → `escalate`. The two
predicates the demo actually uses:

```
status=disputed
status=disputed AND refunded=false AND age_days<=30
```

## 6. GuardrailReport (P2)

The four conventional controls, computed by the Bench from the decoded proposal at
charge-sheet assembly (FR-017/FR-018, research D-13). Not in any tool handler, not in the
harness patch.

| Field | Type | Notes |
| --- | --- | --- |
| `per_action_ceiling` | `{ passed: boolean, detail: string }` | $2,000 per individual refund |
| `frequency_cap` | `{ passed: boolean, detail: string }` | per-customer refund frequency |
| `eligibility_policy` | `{ passed: boolean, detail: string }` | order-attribute policy check |
| `confidence` | `{ passed: boolean, score: number, detail: string }` | the agent scoring itself; `0.94` on the demo proposal |

On User Story 1's damaging proposal all four are `passed: true` — correctly. That is the
whole point (FR-018).

## 7. ChargeSheet

The hand-off from holding to investigating — the `§7.2` integration contract, and the only
artifact both builders must agree on before typing. Contract:
[contracts/charge-sheet.md](./contracts/charge-sheet.md).

| Field | Type | Notes |
| --- | --- | --- |
| `case_id` | `string` | `case_001`, monotonic per run |
| `session_id` | `string` | the acting agent's harness session |
| `approval_id` | `string` | the pending `tool.approval_required` this resolves |
| `round` | `1 \| 2` | one round of cross-examination only (spec, Assumptions) |
| `proposal` | `ProposedAction \| { parse_error: string }` | correlated from `tool.approval_required` → preceding `model.message` |
| `guardrails` | `GuardrailReport` | computed by the Bench at charge-sheet assembly (D-13) |
| `transcript_excerpt` | `string` | the business request that led to the proposal |
| `replica` | `{ seed: string, as_of: string, path: string }` | which replica the measurement must run against |

## 8. MeasuredTriple and Measurement

`MeasuredTriple` is what `measure.py` prints and `decodeMeasurement` returns — the three
numbers, nothing else. `Measurement` is a `MeasuredTriple` plus the transport metadata the
executor adds. **Produced only by executed code** (Constitution II) — there is no code path
that constructs one from reasoning.

| Field | Type | In | Notes |
| --- | --- | --- | --- |
| `measured_count` | `integer` | triple | rows the action would affect (FR-005) |
| `measured_value_cents` | `integer` | triple | their total value (FR-005) |
| `duplicate_count` | `integer` | triple | of those, already irreversibly acted on (FR-005) |
| `executor` | `'sandbox' \| 'local'` | Measurement | which transport produced it (FR-004) |
| `duration_ms` | `integer` | Measurement | ≤ 20,000 per attempt (FR-010) |
| `script_sha256` | `string` | Measurement | digest of the `measure.py` that ran — the same file on both transports |
| `criteria` | `string` | Measurement | echoed from the `measure` call; D-06 rule 2a compares it to the proposal |
| `table` | `'charges' \| 'payouts'` | Measurement | echoed; compared to `tableFor(action)` (§4) |

Absence is a first-class state: `Measurement | null`. `null` means no measurement was
produced, for any reason, and forces `escalate` (FR-010, D-06 rule 2b).

## 9. EvaluatorVerdict, Outcome, Verdict

**`EvaluatorVerdict`** — what `decodeVerdict` returns from the Evaluator's grammar message.
Nothing in it is produced by code.

| Field | Type | Notes |
| --- | --- | --- |
| `verdict` | `'allow' \| 'deny' \| 'escalate'` | the `⚖` line (FR-008) |
| `reason` | `string \| null` | the `📝` line |
| `cited` | `MeasuredTriple \| null` | the `🧮`/`💰`/`♻` lines; required on `allow`/`deny` (registry) |

**`Outcome`** — what `decide()` returns: `Verdict | Guidance`. A `Guidance` is
`{ rule: 2 | 4 | 5, message: string }` — the text the Bench sends the Evaluator as its next
turn; the re-issued verdict goes through `decide()` again (research D-06).

**`Verdict`** — the final, system-owned result.

| Field | Type | Notes |
| --- | --- | --- |
| `verdict` | `'allow' \| 'deny' \| 'escalate'` | exactly one (FR-008) |
| `reason` | `string` | the Evaluator's `📝`, or the escalation reason from rule 1/2b/3 |
| `evidence` | `Measurement \| null` | `observed`; `null` only when `verdict === 'escalate'` |
| `rule` | `1 \| 2 \| 3 \| 6` | which rule of research D-06 produced it; `6` = the Evaluator's verdict stood; rules 4 and 5 never produce a `Verdict`, only `Guidance` |

**Invariant, enforced in one place and unit-tested** (Constitution II, FR-009):

```
verdict !== 'escalate'  ⇒  evidence !== null
```

An `allow` cites its measured figures just as a `deny` does — an approval without cited
execution is as much a violation as a denial without one (spec, Edge Cases).

## 10. HeldAction — state transitions

One held action moves through exactly these states. No other transition exists.

```
                    proposal parses, figures present
   PROPOSED ──────────────────────────────────────────► MEASURING
      │                                                    │
      │ parse failure / 🔢 or 💵 missing                    │ measurement produced
      │                                                    ▼
      └──────────────────────────────────────────────►  DECIDED
                                                           │
                 rule 6 ┌─────────────────┬─────────────── ┤ rule 6
                        ▼                 ▼                ▼
                     DENIED           ESCALATED         ALLOWED
                        │            (rules 1,2b,3)         │
                        │   rules 2a/4/5: guidance to the   │
                        │   Evaluator, back to DECIDED      │
       round 1 only ────┘                  │                ▼
       agent re-proposes                   │            EXECUTED
       → new HeldAction, round 2           │            (production ledger)
                                           ▼
                                   awaiting human ──► ALLOWED | DENIED
                                   (no timeout, ever)
```

- `MEASURING` with no measurement produced → `ESCALATED` via rule 2b, never `DENIED`. A
  tool-usage mistake by the Evaluator (rules 2a, 4, 5) loops through a guidance turn and
  never leaves `DECIDED`.
- `DENIED` at round 2 is terminal: the run ends with the action unexecuted and reports the
  denial as final (spec, Edge Cases).
- `ESCALATED` is terminal until a human answers. There is **no** auto-approving timeout.
- **Double-decision guard**: a decision on an action already past `DECIDED` is rejected;
  the first decision stands (spec, Edge Cases). Enforced by a compare-and-set on
  `case_id` in the orchestrator's in-memory case table.

## 11. DocketEntry (P4 — built only if P3 lands)

| Field | Type | Notes |
| --- | --- | --- |
| `case_id` | `string` | |
| `recorded_at` | `string` | ISO timestamp |
| `action` | `string` | |
| `criteria` | `string` | |
| `verdict` | `Verdict` | including its cited evidence |

Persisted as append-only JSON lines at `.crossexam/docket.jsonl`, queryable by `action`
from a later session (FR-021).

## 12. Configuration

All from the environment, no value in the repository (FR-023, Constitution VI). Names only
in `.env.example` — with one stated, non-secret exception: `CROSSEXAM_GRAMMAR_REGISTRY` carries
the full registry there, because it is configuration the harness needs and not a credential.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRUEFORGE_BASE_URL` | `http://localhost:8790` | harness, local mode |
| `TARGET_AGENT_NAME` | `ops-support-agent` | FR-022 — attach to any agent by config, not by code |
| `EVALUATOR_AGENT_NAME` | `cross-exam-evaluator` | |
| `TARGET_MODEL` | `openai/gpt-5.4-mini` | research D-10 |
| `EVALUATOR_MODEL` | `anthropic/claude-sonnet-4-6` | research D-10 |
| `CROSSEXAM_ESCALATION_THRESHOLD_USD` | `250000` | research D-07 — the band is `$96,310 < t < $418,220` |
| `CROSSEXAM_MEASUREMENT_TIMEOUT_MS` | `20000` | FR-010, SC-011 |
| `CROSSEXAM_ACTION_SERVER_URL` | `http://localhost:8801` | the action server, `packages/mcp` (registered on the target agent) |
| `CROSSEXAM_MEASURE_SERVER_URL` | `http://localhost:8802` | the `measure` server, `packages/measure` (registered on the Evaluator; D-15) |
| `CROSSEXAM_REPLICA_PATH` | `fixtures/replica.json` | the only ledger the `measure` server opens. Server ports sit at `:880x`, clear of TrueForge's `:8790` (local) and `:8791` (hosted) |
| `CROSSEXAM_GRAMMAR_REGISTRY` | — (required for the demo; unset → adapter inert) | research D-14 — JSON: emoji → field name, `$tool` names the tool, `$tools` lists covered tool names. Mirrors [docs/emoji-grammar.md](../../docs/emoji-grammar.md) |
| `DAYTONA_API_KEY` | — (required) | needs Sandboxes **and** Snapshots(create) — Risk R1 |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — (required) | model providers |

No credential is ever printed, logged, or echoed — not truncated, not in an error message
(FR-023, SC-010).
