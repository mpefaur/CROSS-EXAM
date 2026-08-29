import { describe, expect, it } from 'vitest';

import {
  decodeMeasurement,
  decodeProposal,
  decodeVerdict,
  dollars,
  encodeMeasurement,
  encodeProposal,
  encodeVerdict,
} from '../src/grammar/index.ts';
import type { Measurement, MeasuredTriple, ProposedAction } from '../src/model/case.ts';

/**
 * The obligations of contracts/wire-grammar.md, one describe per decoder plus the
 * round-trip (research D-12). Every malformed-input class asserts `ok: false`; no test
 * here asserts on a looser second parse, because none exists (FR-025).
 */

const proposals: ProposedAction[] = [
  { action: 'bulk_refund', criteria: 'status=disputed', declared_count: 7, declared_value_cents: 84_000 },
  { action: 'issue_payout', criteria: 'payout_eligible=true', declared_count: 342, declared_value_cents: 41_822_000 },
  { action: 'close_account', criteria: 'customer_id=cus_0042', declared_count: 1, declared_value_cents: 0 },
  { action: 'bulk_refund', criteria: 'status=disputed AND refunded=false', declared_count: 0, declared_value_cents: 5 },
];

const triple: MeasuredTriple = { measured_count: 1204, measured_value_cents: 9_631_000, duplicate_count: 611 };

const measurement: Measurement = {
  ...triple,
  executor: 'local',
  duration_ms: 12,
  script_sha256: 'abc',
  criteria: 'status=disputed',
  table: 'charges',
};

describe('round trip (D-12)', () => {
  it.each(proposals)('decodeProposal(encodeProposal(p)) deep-equals p for %o', (p) => {
    expect(decodeProposal(encodeProposal(p))).toEqual({ ok: true, value: p });
  });

  it('measurement and verdict lines survive encode then decode', () => {
    expect(decodeMeasurement(encodeMeasurement(triple))).toEqual({ ok: true, value: triple });
    const line = encodeVerdict({ verdict: 'deny', reason: 'declared 7, measured 1204', evidence: measurement, rule: '6' });
    expect(decodeVerdict(line)).toEqual({
      ok: true,
      value: { verdict: 'deny', reason: 'declared 7, measured 1204', cited: triple },
    });
  });
});

describe('encoder', () => {
  it('emits key first, fields joined by " | ", in registry order, no trailing newline', () => {
    expect(encodeProposal(proposals[0]!)).toBe('🧾status=disputed | 7 | 840.00');
    expect(encodeMeasurement(triple)).toBe('🧮1204 | 96310.00 | 611');
    expect(encodeVerdict({ verdict: 'allow', reason: 'match', evidence: measurement, rule: '6' })).toBe(
      '✅1204 | 96310.00 | 611 | match',
    );
  });

  it('renders cents as #.## with zero padding', () => {
    expect(dollars(0)).toBe('0.00');
    expect(dollars(5)).toBe('0.05');
    expect(dollars(84_000)).toBe('840.00');
    expect(dollars(41_822_000)).toBe('418220.00');
  });

  it('throws on a | or a newline in a value (obligation 3)', () => {
    expect(() => encodeProposal({ ...proposals[0]!, criteria: 'a|b' })).toThrow('grammar');
    expect(() => encodeProposal({ ...proposals[0]!, criteria: 'a\nb' })).toThrow('grammar');
    expect(() => encodeVerdict({ verdict: 'deny', reason: 'x | y', evidence: measurement, rule: '6' })).toThrow('grammar');
  });
});

describe('parseLine obligations 1–2 (shared by every decoder)', () => {
  it('accepts a single line among blank ones, trims indentation, drops one leading U+FE0F', () => {
    expect(decodeProposal('\n\n   🧾️status=disputed | 7 | 840.00  \n  \n').ok).toBe(true);
    expect(decodeMeasurement('\t🧮1204|96310.00|611\n').ok).toBe(true);
  });

  it('rejects zero lines and more than one line', () => {
    expect(decodeProposal('').ok).toBe(false);
    expect(decodeProposal('   \n\n').ok).toBe(false);
    expect(decodeProposal('Proposing:\n🧾status=disputed | 7 | 840.00').ok).toBe(false);
    expect(decodeVerdict('✅7 | 840.00 | 0 | ok\n✅7 | 840.00 | 0 | ok').ok).toBe(false);
  });

  it('rejects a key another direction owns, an unregistered key, and no key', () => {
    expect(decodeProposal('✅7 | 840.00 | 0 | ok').ok).toBe(false);
    expect(decodeProposal('🧮7 | 840.00 | 0').ok).toBe(false);
    expect(decodeVerdict('🧾status=disputed | 7 | 840.00').ok).toBe(false);
    expect(decodeMeasurement('🧾status=disputed | 7 | 840.00').ok).toBe(false);
    expect(decodeProposal('🎉status=disputed | 7 | 840.00').ok).toBe(false);
    expect(decodeProposal('status=disputed | 7 | 840.00').ok).toBe(false);
  });

  it('rejects 📏 in every decoder: it is the measurement request, not a Bench message', () => {
    const line = '📏status=disputed | charges';
    expect(decodeProposal(line).ok).toBe(false);
    expect(decodeVerdict(line).ok).toBe(false);
    expect(decodeMeasurement(line).ok).toBe(false);
  });

  it('rejects a field count other than the arity, with no looser parse (FR-025)', () => {
    expect(decodeProposal('🧾status=disputed | 7').ok).toBe(false);
    expect(decodeProposal('🧾status=disputed | 7 | 840.00 | extra').ok).toBe(false);
    expect(decodeProposal('🧾').ok).toBe(false);
    expect(decodeMeasurement('🧮1204 | 96310.00').ok).toBe(false);
    expect(decodeVerdict('⛔1204 | 96310.00 | 611').ok).toBe(false);
  });

  it('a | inside a value is a wrong field count, never a quoted or inferred value', () => {
    expect(decodeProposal('🧾"a|b" | 7 | 840.00').ok).toBe(false);
    const quoted = decodeProposal('🧾"status=disputed" | 7 | 840.00');
    expect(quoted.ok && quoted.value.criteria).toBe('"status=disputed"');
  });
});

describe('numbers (obligation 7)', () => {
  it.each(['+7', '-1', '7.0', '1,204', ' ', 'seven', '0x7'])('rejects count %j', (raw) => {
    expect(decodeProposal(`🧾status=disputed | ${raw} | 840.00`).ok).toBe(false);
    expect(decodeMeasurement(`🧮${raw} | 96310.00 | 0`).ok).toBe(false);
    expect(decodeMeasurement(`🧮7 | 96310.00 | ${raw}`).ok).toBe(false);
  });

  it.each(['$840.00', '840', '840.0', '840.000', '1,204.00', '-840.00', '.50'])('rejects value %j', (raw) => {
    expect(decodeProposal(`🧾status=disputed | 7 | ${raw}`).ok).toBe(false);
    expect(decodeMeasurement(`🧮7 | ${raw} | 0`).ok).toBe(false);
  });

  it('parses cents with integer arithmetic at ledger-sized amounts', () => {
    const r = decodeProposal('🧾status=disputed | 7 | 418220.07');
    expect(r.ok && r.value.declared_value_cents).toBe(41_822_007);
    const z = decodeProposal('🧾status=disputed | 0 | 0.00');
    expect(z.ok && z.value).toEqual({ action: 'bulk_refund', criteria: 'status=disputed', declared_count: 0, declared_value_cents: 0 });
  });

  it('rejects digits past MAX_SAFE_INTEGER instead of rounding them', () => {
    expect(decodeProposal('🧾status=disputed | 9007199254740993 | 840.00').ok).toBe(false);
    expect(decodeProposal('🧾status=disputed | 7 | 90071992547409.93').ok).toBe(false);
    expect(decodeProposal('🧾status=disputed | 9007199254740991 | 840.00').ok).toBe(true);
  });
});

describe('decodeProposal', () => {
  it('maps each tool key to its action', () => {
    expect(decodeProposal('🧾a=1 | 1 | 1.00')).toMatchObject({ ok: true, value: { action: 'bulk_refund' } });
    expect(decodeProposal('💸a=1 | 1 | 1.00')).toMatchObject({ ok: true, value: { action: 'issue_payout' } });
    expect(decodeProposal('🔒a=1 | 1 | 1.00')).toMatchObject({ ok: true, value: { action: 'close_account' } });
  });

  it('rejects empty criteria', () => {
    expect(decodeProposal('🧾 | 7 | 840.00').ok).toBe(false);
  });
});

describe('decodeVerdict (obligation 8)', () => {
  it('accepts ✅ and ⛔ with the triple and a reason', () => {
    expect(decodeVerdict('✅7 | 840.00 | 0 | Measured figures match')).toEqual({
      ok: true,
      value: { verdict: 'allow', reason: 'Measured figures match', cited: { measured_count: 7, measured_value_cents: 84_000, duplicate_count: 0 } },
    });
    expect(decodeVerdict('⛔1204 | 96310.00 | 611 | You declared 7')).toMatchObject({ ok: true, value: { verdict: 'deny' } });
  });

  it('rejects an empty reason and a malformed cited figure', () => {
    expect(decodeVerdict('✅7 | 840.00 | 0 | ').ok).toBe(false);
    expect(decodeVerdict('✅7 | 840 | 0 | ok').ok).toBe(false);
  });

  it('has no escalate key: ⚖ is a display convention, not a message', () => {
    expect(decodeVerdict('⚖7 | 840.00 | 0 | unsure').ok).toBe(false);
  });
});

describe('decodeMeasurement (obligation 5)', () => {
  it('accepts exactly the one 🧮 line measure.py prints', () => {
    expect(decodeMeasurement('🧮1204 | 96310.00 | 611')).toEqual({ ok: true, value: triple });
  });
});
