/**
 * `decide()` — the guardrail over the Evaluator's verdict (research D-06, data-model §9).
 *
 * **Invariant (Constitution II, FR-008–FR-012): no code path in this file originates an
 * `allow` or a `deny`.** Rule 6 only relays the verdict the Evaluator wrote, with the
 * measurement it was written against as `evidence`; every other rule either escalates —
 * the system's decision, never the model's — or hands the Evaluator guidance and asks
 * again. The `Verdict` union in `../model/case.ts` carries the other half of the
 * invariant structurally: a non-`escalate` branch cannot compile without a `Measurement`,
 * so there is no runtime check here duplicating it.
 *
 * Pure: no clock, no I/O, no randomness. The case's age and its spent guidance count
 * arrive in `state` precisely so this stays a function of its arguments (D-06).
 */

import { tableFor } from '../model/case.ts';
import type {
  EvaluatorVerdict,
  Guidance,
  MeasureAttempt,
  Measurement,
  Outcome,
  ProposedAction,
} from '../model/case.ts';
import type { Config } from '../model/config.ts';
import { dollars, encodeMeasurement, type DecodeResult } from '../grammar/index.ts';

/** What the Bench tracks per held action so `decide()` need not (D-06, D-09). */
export interface CaseState {
  /** Guidances already spent on this held action. */
  guidances: number;
  /** Age of the held action since charge-sheet assembly. */
  elapsed_ms: number;
}

/** Display edge only — the system holds money as integer cents (data-model §1). */
function usd(cents: number): string {
  return `$${dollars(cents)}`;
}

/** The observed triple as the `🧮` line the Evaluator read, for a guidance message. */
function figures(m: Measurement): string {
  return encodeMeasurement(m);
}

/**
 * The single gate on rules 2a, 4 and 5 — the three tool-usage rules. Guidance while the
 * Evaluator still has retries; once `CROSSEXAM_EVALUATOR_RETRIES` are spent the same rule
 * escalates instead, because no valid verdict can be obtained (D-06, data-model §9).
 */
function guidance(
  rule: Guidance['rule'],
  message: string,
  observed: MeasureAttempt | null,
  state: CaseState,
  config: Config,
): Outcome {
  if (state.guidances >= config.evaluator_retries) {
    return { verdict: 'escalate', reason: message, evidence: observed?.result ?? null, rule };
  }
  return { rule, message };
}

/**
 * The six ordered rules of research D-06. Order is the whole design: 1–3 hold with no
 * verdict at all, so they precede the two rules that read one.
 */
export function decide(
  proposal: DecodeResult<ProposedAction>,
  evaluatorVerdict: DecodeResult<EvaluatorVerdict>,
  observed: MeasureAttempt | null,
  state: CaseState,
  config: Config,
): Outcome {
  // Rule 1 — the acting agent's message did not decode; there is nothing to measure
  // (FR-002, FR-025). This is the acting agent's failure, not the Evaluator's.
  if (!proposal.ok) {
    return {
      verdict: 'escalate',
      reason: `The proposal did not decode, so no blast radius can be measured: ${proposal.error}`,
      evidence: null,
      rule: '1',
    };
  }

  const table = tableFor(proposal.value.action);

  // Rule 2b, budget half — the case wall clock expired, whatever was or was not called
  // (D-09). An infrastructure condition, so it escalates on the first failure.
  if (state.elapsed_ms > config.case_budget_ms) {
    return {
      verdict: 'escalate',
      reason:
        `The case exceeded its ${config.case_budget_ms} ms budget after ${state.elapsed_ms} ms ` +
        `without a standing verdict.`,
      evidence: observed?.result ?? null,
      rule: '2b',
    };
  }

  const matches =
    observed !== null &&
    observed.criteria === proposal.value.criteria &&
    observed.table === table;

  // Rule 2a — no measurement of *this* proposal: either none was taken, or one was taken
  // on other criteria or another table. The Evaluator can fix this itself. D-06 checks the
  // budget first within rule 2, which the block above does; the two remaining halves are
  // mutually exclusive — 2b's needs `matches`, 2a's needs `!matches` — so answering 2a
  // here is the same decision in the order that lets `observed` narrow below.
  if (!matches) {
    const asked =
      observed === null
        ? 'You called `measure` on nothing this turn.'
        : `Your last \`measure\` call was \`📏${observed.criteria} | ${observed.table}\`` +
          (observed.result === null ? ' and produced no result.' : ` → ${figures(observed.result)}.`);
    return guidance(
      '2a',
      `${asked} Measure the proposal's exact criteria on \`${table}\` — write exactly ` +
        `\`📏${proposal.value.criteria} | ${table}\` — then write your verdict from what it returns.`,
      observed,
      state,
      config,
    );
  }

  // Rule 2b, measurement half — the call was the right one and still produced nothing:
  // both executors failed or exceeded their budget (FR-004, FR-010).
  const result = observed.result;
  if (result === null) {
    return {
      verdict: 'escalate',
      reason:
        `The measurement of \`${proposal.value.criteria}\` on \`${table}\` produced no result — ` +
        `both executors failed or timed out. No execution means no verdict.`,
      evidence: null,
      rule: '2b',
    };
  }

  // Past rule 2 the proposal has its own measurement. Rules 3–6 read this and nothing else.

  // Rule 3 — too much money for a machine to be the last word, whatever either agent
  // concluded (FR-011). Deliberately ahead of rule 6, which is why D-07 pins the
  // threshold above the US1 first measurement.
  if (result.measured_value_cents > config.escalation_threshold_usd * 100) {
    return {
      verdict: 'escalate',
      reason:
        `Measured ${result.measured_count} rows worth ${usd(result.measured_value_cents)} on ` +
        `\`${table}\`, above the ${usd(config.escalation_threshold_usd * 100)} escalation ` +
        `threshold. A person decides this one.`,
      evidence: result,
      rule: '3',
    };
  }

  // Rule 4 — the Evaluator's message is not a verdict, or does not cite what it measured.
  // Any attempt at an escalation lands here too: it has no key, because escalation is the
  // system's to write (Constitution II).
  if (!evaluatorVerdict.ok) {
    return guidance(
      '4',
      `Your message did not decode as a verdict (${evaluatorVerdict.error}). Write exactly one ` +
        `line, ✅ or ⛔ then \`count | value | duplicates | reason\` — escalation is not yours to ` +
        `write — with the figures you measured: ${figures(result)}.`,
      observed,
      state,
      config,
    );
  }
  // Each figure compared exactly — a tolerance is a threshold nobody specified (D-06).
  const cited = evaluatorVerdict.value.cited;
  const mark = evaluatorVerdict.value.verdict === 'allow' ? '✅' : '⛔';
  if (
    cited.measured_count !== result.measured_count ||
    cited.measured_value_cents !== result.measured_value_cents ||
    cited.duplicate_count !== result.duplicate_count
  ) {
    return guidance(
      '4',
      `Your ${mark} does not cite the measurement it rests on. ` +
        `Re-issue it with the figures you actually measured: ${figures(result)}.`,
      observed,
      state,
      config,
    );
  }

  // Rule 5 — an `allow` its own measurement contradicts. Exact equality to the cent: a
  // tolerance is a threshold nobody specified (D-06).
  if (evaluatorVerdict.value.verdict === 'allow') {
    const mismatches: string[] = [];
    if (result.measured_count !== proposal.value.declared_count) {
      mismatches.push(
        `declared ${proposal.value.declared_count} rows, measured ${result.measured_count}`,
      );
    }
    if (result.measured_value_cents !== proposal.value.declared_value_cents) {
      mismatches.push(
        `declared ${usd(proposal.value.declared_value_cents)}, ` +
          `measured ${usd(result.measured_value_cents)}`,
      );
    }
    if (result.duplicate_count > 0) {
      mismatches.push(`${result.duplicate_count} of those rows were already acted on`);
    }
    if (mismatches.length > 0) {
      return guidance(
        '5',
        `You wrote ✅ on a proposal your own measurement contradicts:\n` +
          mismatches.map((line) => `- ${line}`).join('\n') +
          `\nMeasured: ${figures(result)}. Re-issue the verdict these figures support.`,
        observed,
        state,
        config,
      );
    }
  }

  // Rule 6 — the Evaluator's verdict stands, with its own reason and the measurement it
  // cited. The only branch that emits `allow` or `deny`, and it authors neither.
  return {
    verdict: evaluatorVerdict.value.verdict,
    reason: evaluatorVerdict.value.reason,
    evidence: result,
    rule: '6',
  };
}
