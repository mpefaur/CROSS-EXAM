/**
 * Case types — data-model §4, §6–§9.
 *
 * The types the two agents' words become once decoded, and the types the system's own
 * decision produces. Nothing here constructs a `Measurement`: its only sources are the two
 * executors (Constitution II).
 */

import type { LedgerTable } from './entities.ts';

/** data-model §4 — the irreversible tools an acting agent may propose. */
export type ActionName = 'bulk_refund' | 'issue_payout' | 'close_account';

/**
 * Which table an action's blast radius is measured against. D-06 rule 2a compares the
 * `measure` attempt's own `table` against this.
 *
 * `close_account` maps to `charges` — the customer's charges are what a closure strands.
 */
export function tableFor(action: ActionName): LedgerTable {
  return action === 'issue_payout' ? 'payouts' : 'charges';
}

/** data-model §4 — what the acting agent emits, decoded from the emoji grammar. */
export interface ProposedAction {
  /** `🧾` */
  action: ActionName;
  /** `🔍` — a Criteria expression (data-model §5). */
  criteria: string;
  /** `🔢` — >= 0. Missing is a parse failure, and a parse failure escalates (FR-002). */
  declared_count: number;
  /** `💵` — >= 0, integer cents parsed from `#.##` dollars. */
  declared_value_cents: number;
}

/** One conventional control's result. */
export interface GuardrailCheck {
  passed: boolean;
  detail: string;
}

/**
 * data-model §6 — the four conventional controls, computed by the Bench at charge-sheet
 * assembly (FR-017/FR-018, D-13). On the damaging demo proposal all four pass, correctly.
 * That is the point.
 */
export interface GuardrailReport {
  per_action_ceiling: GuardrailCheck;
  frequency_cap: GuardrailCheck;
  eligibility_policy: GuardrailCheck;
  confidence: GuardrailCheck & { score: number };
}

/** data-model §7 — the hand-off from holding to investigating. */
export interface ChargeSheet {
  /** `case_001`, monotonic per run. */
  case_id: string;
  /** The acting agent's harness session. */
  session_id: string;
  /** The pending `tool.approval_required` this resolves. */
  approval_id: string;
  /** One round of cross-examination only. */
  round: 1 | 2;
  proposal: ProposedAction | { parse_error: string };
  guardrails: GuardrailReport;
  /** The business request that led to the proposal. */
  transcript_excerpt: string;
  /** Which replica the measurement must run against. */
  replica: { seed: string; as_of: string; path: string };
}

/** data-model §8 — the three numbers `measure.py` prints, and nothing else. */
export interface MeasuredTriple {
  /** Rows the action would affect (FR-005). */
  measured_count: number;
  /** Their total value, integer cents (FR-005). */
  measured_value_cents: number;
  /** Of those, already irreversibly acted on (FR-005). */
  duplicate_count: number;
}

/**
 * data-model §8 — a `MeasuredTriple` plus the transport metadata the executor adds.
 * Produced only by executed code; there is no path that builds one from reasoning
 * (Constitution II).
 */
export interface Measurement extends MeasuredTriple {
  /** Which transport produced it (FR-004). */
  executor: 'sandbox' | 'local';
  /** <= CROSSEXAM_MEASUREMENT_TIMEOUT_MS per attempt (FR-010). */
  duration_ms: number;
  /** Digest of the `measure.py` that ran — the same file on both transports. */
  script_sha256: string;
  /** Copied from the `measure` call's argument. */
  criteria: string;
  table: LedgerTable;
}

/**
 * data-model §8 — one `measure` call as the Bench sees it. `result` is `null` when the
 * call produced no measurement: both executors failed, or the criteria did not parse.
 */
export interface MeasureAttempt {
  criteria: string;
  table: LedgerTable;
  result: Measurement | null;
}

/**
 * data-model §9 — what `decodeVerdict` returns. Nothing in it is produced by code.
 * `escalate` is not in the Evaluator's grammar; a `⚖escalate` from it is a parse failure.
 */
export interface EvaluatorVerdict {
  /** The `⚖` line. */
  verdict: 'allow' | 'deny';
  /** The `📝` line. */
  reason: string | null;
  /** The `🧮`/`💰`/`♻` lines; required on `allow`/`deny`. */
  cited: MeasuredTriple | null;
}

/** data-model §9 — which rule of research D-06 produced the outcome. */
export type VerdictRule = '1' | '2a' | '2b' | '3' | '4' | '5' | '6';

/**
 * data-model §9 — a tool-usage failure the Evaluator can still fix. The Bench sends
 * `message` as the Evaluator's next turn, at most `CROSSEXAM_EVALUATOR_RETRIES` times per
 * held action; the next failure is an `escalate` `Verdict` carrying the same rule.
 */
export interface Guidance {
  rule: '2a' | '4' | '5';
  message: string;
}

/**
 * data-model §9 — the final, system-owned result.
 *
 * The union is the Constitution II invariant made structural: `allow` and `deny` carry a
 * non-null `evidence`, so `verdict !== 'escalate'` forces `evidence !== null` at compile
 * time. An approval without cited execution is as much a violation as a denial without one
 * (FR-009).
 */
export type Verdict =
  | {
      verdict: 'allow' | 'deny';
      /** The Evaluator's `📝`. */
      reason: string;
      /** `observed.result` — never null on this branch. */
      evidence: Measurement;
      rule: VerdictRule;
    }
  | {
      verdict: 'escalate';
      /** The rule 1/2b/3 reason, or the last guidance message once the retries are spent. */
      reason: string;
      evidence: Measurement | null;
      rule: VerdictRule;
    };

/** data-model §9 — what `decide()` returns. */
export type Outcome = Verdict | Guidance;
