import { describe, expect, it } from 'vitest';

import {
  decodeMeasurement,
  decodeProposal,
  decodeVerdict,
  dollars,
  encodeMeasurement,
  encodeProposal,
  encodeVerdict,
  type DecodeResult,
} from '../src/grammar/index.ts';
import type { MeasuredTriple, Measurement, ProposedAction, Verdict } from '../src/model/case.ts';

/**
 * The emoji wire grammar's unit suite (FR-024, FR-025, research D-12).
 *
 * Every `describe` below names the obligation of
 * `specs/001-cross-exam-evaluator/contracts/wire-grammar.md` it covers; the keys, arities
 * and field order it decodes against are `docs/emoji-grammar.md` and
 * `packages/core/src/grammar/registry.json`. A decode bug here silently changes what the
 * system believes was proposed, which is the input to every verdict — so each obligation
 * gets at least one assertion, and every malformed class gets one asserting `ok: false`.
 *
 * Obligation 2's "never a second, looser parse" has no direct probe: it is asserted as its
 * observable consequence — every wrong-arity and malformed-number line below returns
 * `ok: false` instead of a value salvaged from the part that did parse.
 *
 * Money is written in integer cents; the `#.##` strings are wire text, never a number this
 * file computes.
 */

/** `Number.MAX_SAFE_INTEGER` — the last count `Number` represents without rounding. */
const MAX_SAFE = 9_007_199_254_740_991;

/** The variation selector models add to some symbols; one leading one is dropped. */
const VS = '\uFE0F';

/**
 * One proposal per action key, with the exact line it encodes to. These are the demo's own
 * figures (research D-05): the refundable cohort, the eligible payouts, and a single-account
 * closure whose value is `0.00` — the boundary `dollars()` has to render with both digits.
 */
const PROPOSALS: [string, ProposedAction, string][] = [
  [
    'bulk_refund',
    {
      action: 'bulk_refund',
      criteria: 'status=disputed AND age_days<=30',
      declared_count: 7,
      declared_value_cents: 84_000,
    },
    '🧾status=disputed AND age_days<=30 | 7 | 840.00',
  ],
  [
    'issue_payout',
    {
      action: 'issue_payout',
      criteria: 'payout_eligible=true',
      declared_count: 342,
      declared_value_cents: 41_822_000,
    },
    '💸payout_eligible=true | 342 | 418220.00',
  ],
  [
    'close_account',
    {
      action: 'close_account',
      criteria: 'customer_id=cus_0042',
      declared_count: 1,
      declared_value_cents: 0,
    },
    '🔒customer_id=cus_0042 | 1 | 0.00',
  ],
];

const BULK_REFUND = PROPOSALS[0]![1];

/**
 * The exact line `measure.py` writes for the demo's round-1 criteria, trailing newline
 * included: `packages/core/scripts/measure.py` prints `"%s%d | %d.%02d | %d\n"` to stdout
 * and nothing else. `decodeMeasurement` is the executors' reader of that stdout
 * (obligation 5), so the trailing newline is part of the input it must accept.
 */
const MEASURE_PY_STDOUT = '🧮1204 | 96310.00 | 611\n';
const MEASURED: MeasuredTriple = {
  measured_count: 1204,
  measured_value_cents: 9_631_000,
  duplicate_count: 611,
};

const ALLOW_LINE = '✅7 | 840.00 | 0 | Measured figures match the declaration';
const DENY_LINE = '⛔1204 | 96310.00 | 611 | You declared 7 for $840.00';

/** A `Measurement` only ever comes from an executor; this one stands in for one. */
const EVIDENCE: Measurement = {
  ...MEASURED,
  executor: 'sandbox',
  duration_ms: 1234,
  script_sha256: '0'.repeat(64),
  criteria: 'status=disputed',
  table: 'charges',
};

type WireVerdict = Extract<Verdict, { verdict: 'allow' | 'deny' }>;

const DENY: WireVerdict = {
  verdict: 'deny',
  reason: 'You declared 7 for $840.00',
  evidence: EVIDENCE,
  rule: '6',
};

const ALLOW: WireVerdict = {
  verdict: 'allow',
  reason: 'Measured figures match the declaration',
  evidence: { ...EVIDENCE, measured_count: 7, measured_value_cents: 84_000, duplicate_count: 0 },
  rule: '6',
};

const DECODERS: [string, (text: string) => DecodeResult<unknown>][] = [
  ['decodeProposal', decodeProposal],
  ['decodeVerdict', decodeVerdict],
  ['decodeMeasurement', decodeMeasurement],
];

/**
 * A parse failure is `{ ok: false }` with a stated reason. Asserting on `error` too keeps a
 * decoder from "failing" with an empty string the caller cannot report.
 */
function expectRejected(result: DecodeResult<unknown>): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
}

/** Unwraps a decode that must have succeeded, so the assertion below reads on the value. */
function expectDecoded<T>(result: DecodeResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected a decode, got: ${result.error}`);
  return result.value;
}

describe('round trip — decodeProposal(encodeProposal(p)) deep-equals p', () => {
  it.each(PROPOSALS)('round-trips a %s proposal through the encoder', (_name, proposal) => {
    expect(expectDecoded(decodeProposal(encodeProposal(proposal)))).toEqual(proposal);
  });

  it.each(PROPOSALS)('maps the %s key to its action name (obligation 6)', (_name, proposal, line) => {
    expect(expectDecoded(decodeProposal(line))).toEqual(proposal);
  });

  it('round-trips a measurement', () => {
    expect(expectDecoded(decodeMeasurement(encodeMeasurement(MEASURED)))).toEqual(MEASURED);
  });

  it.each<[string, WireVerdict]>([
    ['allow', ALLOW],
    ['deny', DENY],
  ])('round-trips the %s verdict with its measured triple', (_name, verdict) => {
    expect(expectDecoded(decodeVerdict(encodeVerdict(verdict)))).toEqual({
      verdict: verdict.verdict,
      reason: verdict.reason,
      cited: {
        measured_count: verdict.evidence.measured_count,
        measured_value_cents: verdict.evidence.measured_value_cents,
        duplicate_count: verdict.evidence.duplicate_count,
      },
    });
  });
});

describe('obligation 5 — decodeMeasurement reads measure.py stdout and nothing else', () => {
  it("accepts measure.py's one line, trailing newline included", () => {
    expect(expectDecoded(decodeMeasurement(MEASURE_PY_STDOUT))).toEqual(MEASURED);
  });

  it.each([
    ['an allow verdict', ALLOW_LINE],
    ['a deny verdict', DENY_LINE],
    ['a proposal', '🧾status=disputed | 7 | 840.00'],
  ])('rejects %s', (_name, line) => {
    expectRejected(decodeMeasurement(line));
  });
});

describe('obligation 1 — a key from another direction is a parse failure', () => {
  it.each([
    ['an allow verdict', ALLOW_LINE],
    ['a deny verdict', DENY_LINE],
    ['a measurement', '🧮1204 | 96310.00 | 611'],
  ])('decodeProposal rejects %s', (_name, line) => {
    expectRejected(decodeProposal(line));
  });

  it.each([
    ['a bulk_refund proposal', '🧾status=disputed | 7 | 840.00'],
    ['an issue_payout proposal', '💸payout_eligible=true | 342 | 418220.00'],
    ['a close_account proposal', '🔒customer_id=cus_0042 | 1 | 0.00'],
    ['a measurement', '🧮1204 | 96310.00 | 611'],
  ])('decodeVerdict rejects %s', (_name, line) => {
    expectRejected(decodeVerdict(line));
  });

  /**
   * Escalation has no key: it is the system's decision in `decide()` (research D-06), never
   * a message the Evaluator writes. `⚖` is the Bench's trace glyph, not grammar.
   */
  it('decodeVerdict rejects the ⚖ escalation glyph (obligation 8)', () => {
    expectRejected(decodeVerdict('⚖1204 | 96310.00 | 611 | no measurement'));
  });

  it.each(DECODERS)('%s rejects 📏, the measure request no Bench decoder accepts', (_name, decode) => {
    expectRejected(decode('📏status=disputed | charges'));
  });

  it.each(DECODERS)('%s rejects an unregistered key', (_name, decode) => {
    expectRejected(decode('🎉status=disputed | 7 | 840.00'));
  });

  it.each(DECODERS)('%s rejects a keyless line', (_name, decode) => {
    expectRejected(decode('status=disputed | 7 | 840.00'));
  });

  /** The key is the *first* codepoint of the trimmed line, not a key found anywhere in it. */
  it.each(DECODERS)('%s rejects a line whose key is not first', (_name, decode) => {
    expectRejected(decode('tool: 🧾status=disputed | 7 | 840.00'));
  });
});

describe('obligation 1 — exactly one non-blank line', () => {
  it('ignores blank and whitespace-only lines around the message', () => {
    expect(expectDecoded(decodeProposal('\n   \n\t\n🧾status=disputed | 7 | 840.00\n \n\n'))).toEqual({
      ...BULK_REFUND,
      criteria: 'status=disputed',
    });
  });

  it('accepts an indented line, trimming its surrounding whitespace', () => {
    expect(expectDecoded(decodeProposal('      🧾status=disputed | 7 | 840.00   ')).criteria).toBe(
      'status=disputed',
    );
  });

  it.each([
    ['empty text', ''],
    ['whitespace only', '   \n\t\n  '],
  ])('rejects %s — zero lines remain', (_name, text) => {
    expectRejected(decodeProposal(text));
  });

  /**
   * A newline inside a value is not escapable: it becomes a second non-blank line and the
   * whole message fails, rather than decoding as a truncated first line.
   */
  it.each([
    ['two proposals', '🧾status=disputed | 7 | 840.00\n💸payout_eligible=true | 342 | 418220.00'],
    ['a value with an embedded newline', '🧾status=disputed\nAND age_days<=30 | 7 | 840.00'],
    ['a proposal followed by prose', '🧾status=disputed | 7 | 840.00\nI will refund them now.'],
  ])('rejects %s — two non-blank lines', (_name, text) => {
    expectRejected(decodeProposal(text));
  });
});

describe('obligation 1 — one leading U+FE0F after the key is dropped', () => {
  it('decodeProposal drops the variation selector after 🧾', () => {
    expect(expectDecoded(decodeProposal(`🧾${VS}status=disputed AND age_days<=30 | 7 | 840.00`))).toEqual(
      BULK_REFUND,
    );
  });

  it('decodeMeasurement drops the variation selector after 🧮', () => {
    expect(expectDecoded(decodeMeasurement(`🧮${VS}1204 | 96310.00 | 611`))).toEqual(MEASURED);
  });

  it.each([
    ['✅', `✅${VS}7 | 840.00 | 0 | Measured figures match the declaration`, 'allow'],
    ['⛔', `⛔${VS}1204 | 96310.00 | 611 | You declared 7 for $840.00`, 'deny'],
  ])('decodeVerdict drops the variation selector after %s', (_key, line, verdict) => {
    expect(expectDecoded(decodeVerdict(line)).verdict).toBe(verdict);
  });

  /** Exactly one is dropped: a second survives into field 1 and fails it as a number. */
  it('rejects a second variation selector rather than dropping it too', () => {
    expectRejected(decodeVerdict(`✅${VS}${VS}7 | 840.00 | 0 | ok`));
  });
});

describe('obligation 2 — the field count must equal the key arity', () => {
  it.each([
    ['🧾 with no fields', '🧾'],
    ['🧾 with one field', '🧾status=disputed'],
    ['🧾 with two fields — a declared figure missing', '🧾status=disputed | 7'],
    ['🧾 with four fields', '🧾status=disputed | 7 | 840.00 | urgent'],
  ])('decodeProposal rejects %s', (_name, line) => {
    expectRejected(decodeProposal(line));
  });

  it.each([
    ['✅ with three fields — the reason missing', '✅7 | 840.00 | 0'],
    ['⛔ with five fields', '⛔1204 | 96310.00 | 611 | too many | fields'],
  ])('decodeVerdict rejects %s', (_name, line) => {
    expectRejected(decodeVerdict(line));
  });

  it.each([
    ['🧮 with two fields', '🧮1204 | 96310.00'],
    ['🧮 with four fields', '🧮1204 | 96310.00 | 611 | charges'],
  ])('decodeMeasurement rejects %s', (_name, line) => {
    expectRejected(decodeMeasurement(line));
  });
});

describe('obligation 3 — no field value is inferred, unquoted, or unescaped', () => {
  /**
   * A `|` inside a value is unrepresentable by design: it splits, so the message arrives at
   * the wrong arity and fails. It is never re-joined or guessed back together (FR-025).
   */
  it('rejects a | inside a criteria as a wrong field count, not as a value', () => {
    expectRejected(decodeProposal('🧾status=disputed | age_days<=30 | 7 | 840.00'));
  });

  it('rejects a | inside a verdict reason as a wrong field count', () => {
    expectRejected(decodeVerdict('⛔1204 | 96310.00 | 611 | declared 7 | measured 1204'));
  });

  /** Quotes are neither stripped nor interpreted: the criteria is the literal text. */
  it('keeps quotes in a criteria verbatim', () => {
    expect(expectDecoded(decodeProposal('🧾"status=disputed" | 7 | 840.00')).criteria).toBe(
      '"status=disputed"',
    );
  });
});

describe('obligation 2 — every field is trimmed of surrounding whitespace', () => {
  it('decodes the spaced and unspaced forms identically', () => {
    const spaced = expectDecoded(decodeProposal('🧾a | 7 | 8.00'));
    expect(spaced).toEqual(expectDecoded(decodeProposal('🧾a|7|8.00')));
    expect(spaced).toEqual({
      action: 'bulk_refund',
      criteria: 'a',
      declared_count: 7,
      declared_value_cents: 800,
    });
  });

  it('trims irregular whitespace around every field', () => {
    expect(
      expectDecoded(decodeProposal('🧾   status=disputed AND age_days<=30   |   7   |   840.00   ')),
    ).toEqual(BULK_REFUND);
  });
});

describe('obligation 4 — fields are positional and none is optional', () => {
  it('reads the criteria from position 1 and the figures from 2 and 3', () => {
    const decoded = expectDecoded(decodeProposal('🧾age_days<=30 | 342 | 418220.00'));
    expect(decoded.criteria).toBe('age_days<=30');
    expect(decoded.declared_count).toBe(342);
    expect(decoded.declared_value_cents).toBe(41_822_000);
  });

  it('rejects an empty criteria field even at the right arity', () => {
    expectRejected(decodeProposal('🧾 | 7 | 840.00'));
  });
});

describe('obligation 7 — counts are bare non-negative integers', () => {
  it.each([
    ['zero', '🧮0 | 0.00 | 0', 0],
    ['the Number.MAX_SAFE_INTEGER boundary', `🧮${MAX_SAFE} | 0.00 | 0`, MAX_SAFE],
  ])('accepts %s', (_name, line, expected) => {
    expect(expectDecoded(decodeMeasurement(line)).measured_count).toBe(expected);
  });

  it.each([
    ['a leading +', '🧮+1 | 0.00 | 0'],
    ['a negative count', '🧮-1 | 0.00 | 0'],
    ['a decimal count', '🧮1.0 | 0.00 | 0'],
    ['a thousands separator', '🧮1,204 | 0.00 | 0'],
    ['whitespace inside the digits', '🧮1 204 | 0.00 | 0'],
    ['an empty count', '🧮 | 0.00 | 0'],
    ['a non-numeric count', '🧮many | 0.00 | 0'],
  ])('rejects %s', (_name, line) => {
    expectRejected(decodeMeasurement(line));
  });

  /**
   * `Number` rounds a digit string past `MAX_SAFE_INTEGER` silently, and a rounded figure
   * presented as a measured one is exactly the inference Constitution II forbids.
   */
  it.each([
    ['measured_count', '🧮9007199254740993 | 0.00 | 0'],
    ['duplicate_count', '🧮0 | 0.00 | 9007199254740993'],
  ])('rejects an unsafe integer in %s rather than rounding it', (_name, line) => {
    expectRejected(decodeMeasurement(line));
  });

  it('rejects a malformed declared_count in a proposal', () => {
    expectRejected(decodeProposal('🧾status=disputed | seven | 840.00'));
  });
});

describe('obligation 7 — money is `#.##` dollars parsed to integer cents', () => {
  it.each([
    ['840.00', '🧮0 | 840.00 | 0', 84_000],
    ['0.00', '🧮0 | 0.00 | 0', 0],
    ['0.05', '🧮0 | 0.05 | 0', 5],
    ['96310.00', '🧮0 | 96310.00 | 0', 9_631_000],
    // 90071992547409 * 100 + 91 === Number.MAX_SAFE_INTEGER: the last exact cent value.
    ['90071992547409.91', '🧮0 | 90071992547409.91 | 0', MAX_SAFE],
  ])('parses %s to cents', (_name, line, cents) => {
    expect(expectDecoded(decodeMeasurement(line)).measured_value_cents).toBe(cents);
  });

  it.each([
    ['a currency symbol', '🧮0 | $840.00 | 0'],
    ['no decimal part', '🧮0 | 840 | 0'],
    ['one decimal place', '🧮0 | 840.0 | 0'],
    ['three decimal places', '🧮0 | 840.000 | 0'],
    ['a thousands separator', '🧮0 | 1,204.00 | 0'],
    ['a leading +', '🧮0 | +840.00 | 0'],
    ['a negative amount', '🧮0 | -840.00 | 0'],
    ['no integer part', '🧮0 | .00 | 0'],
    ['an empty amount', '🧮0 |  | 0'],
    // 90071992547409 * 100 + 92 is one cent past MAX_SAFE_INTEGER.
    ['cents past MAX_SAFE_INTEGER', '🧮0 | 90071992547409.92 | 0'],
  ])('rejects %s', (_name, line) => {
    expectRejected(decodeMeasurement(line));
  });

  it.each([
    ['$840.00', '🧾status=disputed | 7 | $840.00'],
    ['840', '🧾status=disputed | 7 | 840'],
    ['840.0', '🧾status=disputed | 7 | 840.0'],
    ['1,204.00', '🧾status=disputed | 7 | 1,204.00'],
  ])('rejects %s as a declared_value', (_name, line) => {
    expectRejected(decodeProposal(line));
  });
});

describe('obligation 8 — decodeVerdict wants the triple and a non-empty reason', () => {
  it.each([
    ['allow', ALLOW_LINE, 'allow'],
    ['deny', DENY_LINE, 'deny'],
  ])('maps the %s key to its verdict', (_name, line, verdict) => {
    expect(expectDecoded(decodeVerdict(line)).verdict).toBe(verdict);
  });

  it('carries the measured triple through as `cited`', () => {
    expect(expectDecoded(decodeVerdict(DENY_LINE)).cited).toEqual(MEASURED);
  });

  it('rejects an empty reason', () => {
    expectRejected(decodeVerdict('⛔1204 | 96310.00 | 611 | '));
  });

  it('rejects a malformed figure beside a good reason', () => {
    expectRejected(decodeVerdict('⛔1204 | 96310 | 611 | You declared 7 for $840.00'));
  });
});

describe('encoder obligation 1 — one line, key first, fields joined by " | "', () => {
  it.each(PROPOSALS)('encodes a %s proposal in registry order', (_name, proposal, line) => {
    expect(encodeProposal(proposal)).toBe(line);
  });

  it.each(PROPOSALS)('emits no newline for %s', (_name, proposal) => {
    expect(encodeProposal(proposal)).not.toContain('\n');
  });

  it('encodes a measurement', () => {
    expect(encodeMeasurement(MEASURED)).toBe('🧮1204 | 96310.00 | 611');
  });

  it.each<[string, WireVerdict, string]>([
    ['allow', ALLOW, ALLOW_LINE],
    ['deny', DENY, DENY_LINE],
  ])('encodes the %s verdict with its measured triple (encoder obligation 2)', (_name, verdict, line) => {
    expect(encodeVerdict(verdict)).toBe(line);
  });
});

describe('encoder obligation 3 — a value containing a newline or a | throws', () => {
  it.each([
    ['a newline in the criteria', 'status=disputed\nAND age_days<=30'],
    ['a | in the criteria', 'status=disputed | age_days<=30'],
  ])('encodeProposal throws on %s', (_name, criteria) => {
    expect(() => encodeProposal({ ...BULK_REFUND, criteria })).toThrow(/newline or a \|/u);
  });

  it.each([
    ['a newline in the reason', 'declared 7\nmeasured 1204'],
    ['a | in the reason', 'declared 7 | measured 1204'],
  ])('encodeVerdict throws on %s', (_name, reason) => {
    expect(() => encodeVerdict({ ...DENY, reason })).toThrow(/newline or a \|/u);
  });
});

describe('dollars — integer cents rendered as `#.##`', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [50, '0.50'],
    [100, '1.00'],
    [84_000, '840.00'],
    [9_631_000, '96310.00'],
    [MAX_SAFE, '90071992547409.91'],
  ])('renders %i cents as %s', (cents, text) => {
    expect(dollars(cents)).toBe(text);
  });
});
