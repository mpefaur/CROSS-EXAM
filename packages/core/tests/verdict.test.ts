import { describe, expect, it } from 'vitest';

import { dollars, encodeMeasurement, type DecodeResult } from '../src/grammar/index.ts';
import type {
  EvaluatorVerdict,
  Guidance,
  MeasureAttempt,
  MeasuredTriple,
  Outcome,
  ProposedAction,
  Verdict,
  VerdictRule,
} from '../src/model/case.ts';
import type { LedgerTable } from '../src/model/entities.ts';
import { loadConfig } from '../src/model/config.ts';
import { decide, type CaseState } from '../src/verdict/decide.ts';

/**
 * `decide()`'s contract is research.md D-06 — six rules in one fixed **order** — and the
 * data-model.md §9 invariant `verdict !== 'escalate' => evidence !== null`.
 *
 * The order is the part a per-rule test cannot see: most cases below are built so that two
 * rules could fire and only the earlier one may, which is what makes this suite fail on an
 * implementation whose rules were shuffled. Every such case names the rule it beat.
 *
 * Nothing here produces a `Measurement` the system would trust — these are fixtures for a
 * pure function. The real one only ever comes from an executor (Constitution II).
 */

/** Dummy value: `loadConfig` requires the key, and no assertion below reads it. */
const config = (env: NodeJS.ProcessEnv = {}) =>
  loadConfig({
    OPENAI_API_KEY: 'dummy-openai-value',
    ...env,
  });

/** data-model §12 defaults: threshold $250,000, 3 retries, a 600,000 ms case budget. */
const CONFIG = config();
const THRESHOLD_CENTS = CONFIG.escalation_threshold_usd * 100;

/** US1's corrected proposal — the one the demo's second round allows (research D-06). */
const CRITERIA = 'status=disputed AND refundable=true';
const DECLARED_COUNT = 7;
const DECLARED_VALUE_CENTS = 84_000; // $840.00

/** What that criteria measures on the replica: exactly what was declared. */
const MATCHING: MeasuredTriple = {
  measured_count: DECLARED_COUNT,
  measured_value_cents: DECLARED_VALUE_CENTS,
  duplicate_count: 0,
};

/** US1's first proposal measured on `status=disputed` — 1,204 rows, $96,310.00, 611 dupes. */
const OVERSTATED: MeasuredTriple = {
  measured_count: 1204,
  measured_value_cents: 9_631_000,
  duplicate_count: 611,
};

/** The payouts cohort, $418,220.00 — above the threshold by D-07's own band. */
const ABOVE_THRESHOLD: MeasuredTriple = {
  measured_count: 31,
  measured_value_cents: 41_822_000,
  duplicate_count: 0,
};

/** Exactly the threshold, which rule 3 compares with `>` and so must let through. */
const AT_THRESHOLD: MeasuredTriple = {
  measured_count: 31,
  measured_value_cents: THRESHOLD_CENTS,
  duplicate_count: 0,
};

const SCRIPT_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function proposal(over: Partial<ProposedAction> = {}): DecodeResult<ProposedAction> {
  return {
    ok: true,
    value: {
      action: 'bulk_refund',
      criteria: CRITERIA,
      declared_count: DECLARED_COUNT,
      declared_value_cents: DECLARED_VALUE_CENTS,
      ...over,
    },
  };
}

const didNotDecode = <T>(error: string): DecodeResult<T> => ({ ok: false, error });

/**
 * One `measure` call as the Bench saw it. `triple === null` is the call that produced no
 * measurement; `criteria`/`table` default to the proposal's, so a case states only the ones
 * it deliberately makes differ (data-model §8).
 */
function observed(
  triple: MeasuredTriple | null,
  over: { criteria?: string; table?: LedgerTable } = {},
): MeasureAttempt {
  const criteria = over.criteria ?? CRITERIA;
  const table = over.table ?? 'charges';
  return {
    criteria,
    table,
    result:
      triple === null
        ? null
        : {
            ...triple,
            executor: 'local',
            duration_ms: 118,
            script_sha256: SCRIPT_SHA,
            criteria,
            table,
          },
  };
}

function wrote(
  verdict: EvaluatorVerdict['verdict'],
  cited: MeasuredTriple,
  reason = 'the measured figures support this',
): DecodeResult<EvaluatorVerdict> {
  return { ok: true, value: { verdict, reason, cited } };
}

const state = (guidances = 0, elapsed_ms = 1_000): CaseState => ({ guidances, elapsed_ms });

/** The `Outcome` union has no tag of its own; only a `Verdict` carries `verdict`. */
function verdictOf(outcome: Outcome): Verdict {
  if (!('verdict' in outcome)) {
    throw new Error(`expected a Verdict, got guidance under rule ${outcome.rule}`);
  }
  return outcome;
}

function guidanceOf(outcome: Outcome): Guidance {
  if ('verdict' in outcome) {
    throw new Error(`expected a Guidance, got ${outcome.verdict} under rule ${outcome.rule}`);
  }
  return outcome;
}

describe('rule 1 — the proposal did not decode', () => {
  it('escalates with no evidence and carries the decoder error', () => {
    const v = verdictOf(
      decide(
        didNotDecode('bulk_refund expects 3 fields, got 2'),
        wrote('allow', MATCHING),
        observed(MATCHING),
        state(),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '1', evidence: null });
    expect(v.reason).toContain('bulk_refund expects 3 fields, got 2');
  });

  it('beats the expired case budget — rule 1 is first, and 2b has nothing to measure', () => {
    const v = verdictOf(
      decide(
        didNotDecode('unregistered key for this direction'),
        wrote('allow', MATCHING),
        observed(MATCHING),
        state(0, CONFIG.case_budget_ms + 1),
        CONFIG,
      ),
    );
    expect(v.rule).toBe('1');
  });
});

describe('rule 2b, budget half — the case wall clock expired, whatever else holds', () => {
  const expired = state(0, CONFIG.case_budget_ms + 1);

  it('beats a matching allow that would otherwise stand under rule 6', () => {
    const v = verdictOf(
      decide(proposal(), wrote('allow', MATCHING), observed(MATCHING), expired, CONFIG),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '2b' });
    expect(v.evidence).toMatchObject(MATCHING);
    expect(v.reason).toContain(String(CONFIG.case_budget_ms));
  });

  it('beats rule 2a — an expired case is not a tool-usage slip to guide', () => {
    const v = verdictOf(decide(proposal(), wrote('allow', MATCHING), null, expired, CONFIG));
    expect(v).toMatchObject({ verdict: 'escalate', rule: '2b', evidence: null });
  });

  it('beats rule 3 — both escalate, but the reason a person reads must be the budget', () => {
    const v = verdictOf(
      decide(
        proposal({
          action: 'issue_payout',
          declared_count: ABOVE_THRESHOLD.measured_count,
          declared_value_cents: ABOVE_THRESHOLD.measured_value_cents,
        }),
        wrote('deny', ABOVE_THRESHOLD),
        observed(ABOVE_THRESHOLD, { table: 'payouts' }),
        expired,
        CONFIG,
      ),
    );
    expect(v.rule).toBe('2b');
  });

  it('beats an exhausted rule 4, which would also have escalated', () => {
    const v = verdictOf(
      decide(
        proposal(),
        didNotDecode('expected one grammar line, got 2'),
        observed(MATCHING),
        state(CONFIG.evaluator_retries, CONFIG.case_budget_ms + 1),
        CONFIG,
      ),
    );
    expect(v.rule).toBe('2b');
  });

  it('is strictly greater-than: a case exactly at its budget still gets its verdict', () => {
    const v = verdictOf(
      decide(
        proposal(),
        wrote('allow', MATCHING),
        observed(MATCHING),
        state(0, CONFIG.case_budget_ms),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'allow', rule: '6' });
  });

  it('reads the budget from the config, not from a constant', () => {
    const tight = config({ CROSSEXAM_CASE_BUDGET_MS: '1000' });
    const v = verdictOf(
      decide(proposal(), wrote('allow', MATCHING), observed(MATCHING), state(0, 1001), tight),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '2b' });
    expect(v.reason).toContain('1000 ms');
  });
});

describe('rule 2a — no measurement of this proposal, whatever the Evaluator wrote', () => {
  it('guides when the turn made no measure call at all, even behind a perfect allow', () => {
    const g = guidanceOf(decide(proposal(), wrote('allow', MATCHING), null, state(), CONFIG));
    expect(g.rule).toBe('2a');
    expect(g.message).toContain('You called `measure` on nothing this turn.');
    expect(g.message).toContain(`${CRITERIA} | charges`);
  });

  it('beats rule 4 — a verdict that did not decode is not the first problem', () => {
    const g = guidanceOf(
      decide(proposal(), didNotDecode('unregistered key'), null, state(), CONFIG),
    );
    expect(g.rule).toBe('2a');
  });

  it('guides when the criteria measured are not the proposal, and quotes what was called', () => {
    const g = guidanceOf(
      decide(
        proposal(),
        wrote('allow', OVERSTATED),
        observed(OVERSTATED, { criteria: 'status=disputed' }),
        state(),
        CONFIG,
      ),
    );
    expect(g.rule).toBe('2a');
    expect(g.message).toContain('status=disputed | charges');
    expect(g.message).toContain(encodeMeasurement(OVERSTATED));
  });

  it('guides when the right criteria were measured on the wrong table', () => {
    const g = guidanceOf(
      decide(
        proposal(),
        wrote('allow', MATCHING),
        observed(MATCHING, { table: 'payouts' }),
        state(),
        CONFIG,
      ),
    );
    expect(g.rule).toBe('2a');
  });

  it('takes the expected table from tableFor(action), not from the last call', () => {
    const g = guidanceOf(
      decide(
        proposal({ action: 'issue_payout' }),
        wrote('allow', MATCHING),
        observed(MATCHING, { table: 'charges' }),
        state(),
        CONFIG,
      ),
    );
    expect(g.rule).toBe('2a');
    expect(g.message).toContain(`${CRITERIA} | payouts`);
  });

  it('guides, not escalates, when a call on other criteria produced no result either', () => {
    const g = guidanceOf(
      decide(
        proposal(),
        wrote('deny', MATCHING),
        observed(null, { criteria: 'status=disputed' }),
        state(),
        CONFIG,
      ),
    );
    expect(g.rule).toBe('2a');
    expect(g.message).toContain('produced no result');
  });

  it('escalates under rule 2a once the retries are spent, with that message as its reason', () => {
    const last = guidanceOf(
      decide(
        proposal(),
        wrote('allow', MATCHING),
        null,
        state(CONFIG.evaluator_retries - 1),
        CONFIG,
      ),
    );
    const v = verdictOf(
      decide(proposal(), wrote('allow', MATCHING), null, state(CONFIG.evaluator_retries), CONFIG),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '2a', evidence: null });
    expect(v.reason).toBe(last.message);
  });
});

describe('rule 2b, measurement half — the right call produced nothing', () => {
  it('escalates with no evidence and names the criteria and table that failed', () => {
    const v = verdictOf(decide(proposal(), wrote('deny', MATCHING), observed(null), state(), CONFIG));
    expect(v).toMatchObject({ verdict: 'escalate', rule: '2b', evidence: null });
    expect(v.reason).toContain(CRITERIA);
    expect(v.reason).toContain('charges');
  });

  it('beats rule 4 — there are no figures for a verdict to cite', () => {
    const v = verdictOf(
      decide(proposal(), didNotDecode('deny expects 4 fields, got 3'), observed(null), state(), CONFIG),
    );
    expect(v.rule).toBe('2b');
  });

  it('escalates on the first failure, with every retry still unspent', () => {
    const v = verdictOf(decide(proposal(), wrote('deny', MATCHING), observed(null), state(0), CONFIG));
    expect(v).toMatchObject({ verdict: 'escalate', rule: '2b' });
  });
});

describe('rule 3 — above the escalation threshold, no machine has the last word', () => {
  const payout = proposal({
    action: 'issue_payout',
    declared_count: ABOVE_THRESHOLD.measured_count,
    declared_value_cents: ABOVE_THRESHOLD.measured_value_cents,
  });
  const measured = observed(ABOVE_THRESHOLD, { table: 'payouts' });

  it('beats rule 6 — a matching deny does not get to stand above the threshold', () => {
    const v = verdictOf(decide(payout, wrote('deny', ABOVE_THRESHOLD), measured, state(), CONFIG));
    expect(v).toMatchObject({ verdict: 'escalate', rule: '3' });
    expect(v.evidence).toMatchObject(ABOVE_THRESHOLD);
    expect(v.reason).toContain(dollars(ABOVE_THRESHOLD.measured_value_cents));
  });

  it('beats rule 4 — a cited-figures mismatch above the threshold is still an escalation', () => {
    const v = verdictOf(
      decide(
        payout,
        wrote('deny', { ...ABOVE_THRESHOLD, measured_count: 1 }),
        measured,
        state(),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '3' });
  });

  it('beats rule 5 — an allow its own measurement contradicts, above the threshold', () => {
    const contradicted = proposal({ action: 'issue_payout', declared_count: 2 });
    const v = verdictOf(
      decide(contradicted, wrote('allow', ABOVE_THRESHOLD), measured, state(), CONFIG),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '3' });
  });

  it('is strictly greater-than: a measurement exactly at the threshold gets its verdict', () => {
    const atThreshold = proposal({
      action: 'issue_payout',
      declared_count: AT_THRESHOLD.measured_count,
      declared_value_cents: AT_THRESHOLD.measured_value_cents,
    });
    const v = verdictOf(
      decide(
        atThreshold,
        wrote('deny', AT_THRESHOLD),
        observed(AT_THRESHOLD, { table: 'payouts' }),
        state(),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'deny', rule: '6' });
  });

  it('reads the threshold from the config, in whole dollars against a cents figure', () => {
    const low = config({ CROSSEXAM_ESCALATION_THRESHOLD_USD: '5' }); // $5.00 < $840.00
    const v = verdictOf(decide(proposal(), wrote('allow', MATCHING), observed(MATCHING), state(), low));
    expect(v).toMatchObject({ verdict: 'escalate', rule: '3' });
    // The setting is whole dollars; the reason prints it back through the same cents path.
    expect(v.reason).toContain('above the $5.00 escalation threshold');
  });
});

describe('rule 4 — not a verdict, or not the figures it measured', () => {
  it('guides when the message did not decode, with the error and the observed figures', () => {
    const g = guidanceOf(
      decide(
        proposal(),
        didNotDecode('unregistered key for this direction'),
        observed(MATCHING),
        state(),
        CONFIG,
      ),
    );
    expect(g.rule).toBe('4');
    expect(g.message).toContain('unregistered key for this direction');
    expect(g.message).toContain(encodeMeasurement(MATCHING));
  });

  it.each([
    ['count', { measured_count: MATCHING.measured_count + 1 }],
    ['value', { measured_value_cents: MATCHING.measured_value_cents + 1 }],
    ['duplicates', { duplicate_count: MATCHING.duplicate_count + 1 }],
  ])('guides on a deny whose cited %s differs from the measurement', (_field, drift) => {
    const g = guidanceOf(
      decide(proposal(), wrote('deny', { ...MATCHING, ...drift }), observed(MATCHING), state(), CONFIG),
    );
    expect(g.rule).toBe('4');
    expect(g.message).toContain('does not cite the measurement it rests on');
    expect(g.message).toContain(encodeMeasurement(MATCHING));
  });

  it('beats rule 5 — figures that were never cited cannot be argued with', () => {
    const g = guidanceOf(
      decide(
        proposal({ declared_count: 2 }),
        wrote('allow', { ...MATCHING, measured_count: 2 }),
        observed(MATCHING),
        state(),
        CONFIG,
      ),
    );
    expect(g.rule).toBe('4');
  });

  it('still guides on the last retry, and escalates on the one after', () => {
    const stillGuiding = guidanceOf(
      decide(
        proposal(),
        didNotDecode('expected one grammar line, got 0'),
        observed(MATCHING),
        state(CONFIG.evaluator_retries - 1),
        CONFIG,
      ),
    );
    expect(stillGuiding.rule).toBe('4');

    const v = verdictOf(
      decide(
        proposal(),
        didNotDecode('expected one grammar line, got 0'),
        observed(MATCHING),
        state(CONFIG.evaluator_retries),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '4' });
    expect(v.evidence).toMatchObject(MATCHING);
    expect(v.reason).toBe(stillGuiding.message);
  });

  it('escalates past the cap too, not only exactly at it', () => {
    const v = verdictOf(
      decide(
        proposal(),
        didNotDecode('expected one grammar line, got 0'),
        observed(MATCHING),
        state(CONFIG.evaluator_retries + 1),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '4' });
  });
});

describe('rule 5 — an allow its own measurement contradicts', () => {
  it('guides an allow measured on rows already acted on', () => {
    const withDuplicates: MeasuredTriple = { ...MATCHING, duplicate_count: 2 };
    const g = guidanceOf(
      decide(proposal(), wrote('allow', withDuplicates), observed(withDuplicates), state(), CONFIG),
    );
    expect(g.rule).toBe('5');
    expect(g.message).toContain('2 of those rows were already acted on');
    expect(g.message).toContain(encodeMeasurement(withDuplicates));
  });

  it('guides an allow whose measured count is not the declared one, line by line', () => {
    const g = guidanceOf(
      decide(proposal(), wrote('allow', OVERSTATED), observed(OVERSTATED), state(), CONFIG),
    );
    expect(g.rule).toBe('5');
    expect(g.message).toContain(`declared ${DECLARED_COUNT} rows, measured 1204`);
    expect(g.message).toContain(`declared $${dollars(DECLARED_VALUE_CENTS)}`);
    expect(g.message).toContain('611 of those rows were already acted on');
  });

  it('guides an allow whose measured value is off by a single cent', () => {
    const offByOne: MeasuredTriple = { ...MATCHING, measured_value_cents: DECLARED_VALUE_CENTS + 1 };
    const g = guidanceOf(
      decide(proposal(), wrote('allow', offByOne), observed(offByOne), state(), CONFIG),
    );
    expect(g.rule).toBe('5');
    expect(g.message).toContain('$840.01');
  });

  it('does not fire on a deny — rule 5 is about approving what the numbers refuse', () => {
    const v = verdictOf(
      decide(proposal(), wrote('deny', OVERSTATED), observed(OVERSTATED), state(), CONFIG),
    );
    expect(v).toMatchObject({ verdict: 'deny', rule: '6' });
  });

  it('escalates under rule 5 once the retries are spent, carrying the measurement', () => {
    const v = verdictOf(
      decide(
        proposal(),
        wrote('allow', OVERSTATED),
        observed(OVERSTATED),
        state(CONFIG.evaluator_retries),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'escalate', rule: '5' });
    expect(v.evidence).toMatchObject(OVERSTATED);
  });
});

describe("rule 6 — the Evaluator's verdict stands, and only the Evaluator's", () => {
  it("relays a matching deny with the Evaluator's own reason and the evidence it cited", () => {
    const v = verdictOf(
      decide(
        proposal(),
        wrote('deny', OVERSTATED, '1,204 rows is not the 7 you declared'),
        observed(OVERSTATED),
        state(),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({
      verdict: 'deny',
      reason: '1,204 rows is not the 7 you declared',
      rule: '6',
    });
    expect(v.evidence).toMatchObject({
      ...OVERSTATED,
      executor: 'local',
      script_sha256: SCRIPT_SHA,
    });
  });

  it('relays a matching allow the same way', () => {
    const v = verdictOf(
      decide(
        proposal(),
        wrote('allow', MATCHING, '7 rows, $840.00, no duplicates — exactly as declared'),
        observed(MATCHING),
        state(),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'allow', rule: '6' });
    expect(v.evidence).toMatchObject(MATCHING);
  });

  it('is unaffected by guidances already spent — the cap gates failures, not verdicts', () => {
    const v = verdictOf(
      decide(
        proposal(),
        wrote('allow', MATCHING),
        observed(MATCHING),
        state(CONFIG.evaluator_retries + 5),
        CONFIG,
      ),
    );
    expect(v).toMatchObject({ verdict: 'allow', rule: '6' });
  });
});

/**
 * data-model §9 / Constitution II. The `Verdict` union already makes this structural — an
 * `allow` branch does not compile without a `Measurement` — so what follows asserts it holds
 * at runtime across every rule that can produce a `Verdict`, which is what an `as` cast or a
 * new branch would break first.
 */
const VERDICT_CASES: readonly [name: string, rule: VerdictRule, run: () => Outcome][] = [
  [
    'rule 1, an undecodable proposal',
    '1',
    () =>
      decide(didNotDecode('no key'), wrote('allow', MATCHING), observed(MATCHING), state(), CONFIG),
  ],
  [
    'rule 2a, no measure call with the retries spent',
    '2a',
    () => decide(proposal(), wrote('allow', MATCHING), null, state(CONFIG.evaluator_retries), CONFIG),
  ],
  [
    'rule 2b, the matching call produced no result',
    '2b',
    () => decide(proposal(), wrote('deny', MATCHING), observed(null), state(), CONFIG),
  ],
  [
    'rule 3, above the escalation threshold',
    '3',
    () =>
      decide(
        proposal({
          action: 'issue_payout',
          declared_count: ABOVE_THRESHOLD.measured_count,
          declared_value_cents: ABOVE_THRESHOLD.measured_value_cents,
        }),
        wrote('deny', ABOVE_THRESHOLD),
        observed(ABOVE_THRESHOLD, { table: 'payouts' }),
        state(),
        CONFIG,
      ),
  ],
  [
    'rule 4, an undecodable verdict with the retries spent',
    '4',
    () =>
      decide(
        proposal(),
        didNotDecode('unregistered key'),
        observed(MATCHING),
        state(CONFIG.evaluator_retries),
        CONFIG,
      ),
  ],
  [
    'rule 5, a contradicted allow with the retries spent',
    '5',
    () =>
      decide(
        proposal(),
        wrote('allow', OVERSTATED),
        observed(OVERSTATED),
        state(CONFIG.evaluator_retries),
        CONFIG,
      ),
  ],
  [
    'rule 6, a deny that stands',
    '6',
    () => decide(proposal(), wrote('deny', OVERSTATED), observed(OVERSTATED), state(), CONFIG),
  ],
  [
    'rule 6, an allow that stands',
    '6',
    () => decide(proposal(), wrote('allow', MATCHING), observed(MATCHING), state(), CONFIG),
  ],
];

describe('the invariant — a non-escalate verdict always carries its evidence', () => {
  it.each(VERDICT_CASES)('holds for %s, under rule %s', (_name, rule, run) => {
    const v = verdictOf(run());
    expect(v.rule).toBe(rule);
    expect(v.verdict === 'escalate' || v.evidence !== null).toBe(true);
  });

  it('exercises all seven rules of D-06', () => {
    expect(new Set(VERDICT_CASES.map(([, rule]) => rule))).toEqual(
      new Set<VerdictRule>(['1', '2a', '2b', '3', '4', '5', '6']),
    );
  });
});
