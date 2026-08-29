# Contract: charge sheet & verdict — the orchestrator ⇄ Evaluator hand-off

This is the `§7.2` integration contract of
[docs/research-findings.md](../../../docs/research-findings.md): the one artifact that has
to exist before either builder types. Field lists are in
[data-model.md](../data-model.md) §7 (charge sheet) and §9 (verdict); this file fixes the
wire form and the obligations on each side.

## Orchestrator → Evaluator

Sent as the Evaluator turn's message: a JSON object matching `ChargeSheet`
([data-model.md](../data-model.md) §7).

```json
{
  "case_id": "case_001",
  "session_id": "ses_…",
  "approval_id": "apr_…",
  "round": 1,
  "proposal": {
    "action": "bulk_refund",
    "criteria": "status=disputed",
    "declared_count": 7,
    "declared_value_cents": 84000
  },
  "guardrails": {
    "per_action_ceiling":  { "passed": true, "detail": "max single refund $145.00 < $2,000.00" },
    "frequency_cap":       { "passed": true, "detail": "no customer over 2 refunds/30d" },
    "eligibility_policy":  { "passed": true, "detail": "all matched orders policy-eligible" },
    "confidence":          { "passed": true, "score": 0.94, "detail": "above 0.80 threshold" }
  },
  "transcript_excerpt": "Please refund this week's open disputes.",
  "replica": { "seed": "crossexam-replica-v1", "as_of": "2026-08-29", "path": "fixtures/replica.json" }
}
```

When the proposal did not parse, `proposal` is `{ "parse_error": "<reason>" }` instead, and
the Evaluator returns `escalate` under rule 1 without attempting a measurement.

**Orchestrator obligations**
- Correlate `tool.approval_required` (which carries only `{id, source_event_id}`) with the
  preceding `model.message` to recover the tool name and arguments (FR-002; harness check,
  research §A).
- One turn in flight per session, ever (FR-003, Risk R5).
- Never construct a `Measurement`. Its only sources are the two executors.

## Evaluator → orchestrator

Returned in the emoji grammar, not JSON — same registry, verdict direction:

```
⚖deny
🧮1204
💰96310.00
♻611
📝You declared 7 disputes for $840.00. Measured against the replica: 1204 charges,
$96,310.00, of which 611 already carry a settled refund — those would be refunded twice
and the processor does not reverse them. Narrow the criteria or justify the amount.
```

**Evaluator obligations**
- `⚖allow` and `⚖deny` MUST carry `🧮`, `💰`, `♻` (FR-009, Constitution II).
- `⚖escalate` carries `📝` and MAY carry the measured triple (rule 3 — threshold exceeded —
  has a measurement; rules 1 and 2 do not).
- The `📝` reason on a `deny` MUST contain the measured figures, because that text is what
  the harness delivers back to the acting agent as `deny.reason` (FR-012).

## Resolution

The orchestrator maps the verdict onto the pending approval:

| Verdict | Harness action | Result |
| --- | --- | --- |
| `allow` | resolve approval `allow` | the action executes against production (FR-014) |
| `deny` | resolve approval `deny` with `reason` = the `📝` text | the acting agent reads it and re-proposes (FR-015) |
| `escalate` | **leave the approval pending**, render the verdict card | a human decides; no timeout auto-approves (FR-013, FR-014) |

A second decision on a `case_id` already resolved is rejected; the first stands
([data-model.md](../data-model.md) §10).
