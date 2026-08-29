/**
 * The trace renders `quickstart.md` Scenario 1's expected block (T030, T038).
 *
 * The figures below are the seeded ones — 1,204 / $96,310.00 / 611 and 7 / $840.00 / 0 —
 * so a change to the trace that stopped showing them fails here rather than at the demo.
 */

import { describe, expect, it } from 'vitest';
import type { GuardrailReport, Measurement, ProposedAction, Verdict } from '@crossexam/core';

import {
  executionLine,
  measurementLine,
  measuringLine,
  proposalBlock,
  verdictBlock,
} from '../src/trace.ts';

const PROPOSAL: ProposedAction = {
  action: 'bulk_refund',
  criteria: 'status=disputed',
  declared_count: 7,
  declared_value_cents: 84_000,
};

const PASSING: GuardrailReport = {
  per_action_ceiling: { passed: true, detail: 'max declared $120.00 per action < $2,000.00' },
  frequency_cap: { passed: true, detail: 'no customer over 2 refunds/30d' },
  eligibility_policy: { passed: true, detail: 'all matched orders policy-eligible' },
  confidence: { passed: true, score: 0.94, detail: 'above 0.80 threshold' },
};

const MEASURED: Measurement = {
  measured_count: 1204,
  measured_value_cents: 9_631_000,
  duplicate_count: 611,
  executor: 'local',
  duration_ms: 1400,
  script_sha256: 'a'.repeat(64),
  criteria: 'status=disputed',
  table: 'charges',
};

describe('the Scenario 1 trace', () => {
  it('renders the round-1 proposal with the four controls passing', () => {
    expect(proposalBlock(1, PROPOSAL, PASSING)).toEqual([
      '▸ round 1  target proposes',
      '  🧾status=disputed | 7 | 840.00',
      '  guardrails: ceiling PASS · frequency PASS · eligibility PASS · confidence 0.94 PASS',
    ]);
  });

  it('names round 2 a re-proposal', () => {
    expect(proposalBlock(2, PROPOSAL, PASSING)[0]).toBe('▸ round 2  target re-proposes');
  });

  it('shows a parse failure instead of inventing a grammar line', () => {
    const block = proposalBlock(1, { parse_error: 'missing field 3' }, null);
    expect(block).toEqual(['▸ round 1  target proposes', '  ✗ proposal did not parse: missing field 3']);
    expect(block.every((line) => !line.includes('🧾'))).toBe(true);
  });

  it('renders the measurement with its executor and duration', () => {
    expect(measuringLine()).toBe('▸ measuring (local) …');
    expect(measurementLine(MEASURED)).toBe(
      '  🧮1204 | 96310.00 | 611          [executor=local  1.4s]',
    );
  });

  it('renders a deny carrying the measured figures', () => {
    const verdict: Verdict = {
      verdict: 'deny',
      reason: 'You declared 7 disputes for $840.00.',
      evidence: MEASURED,
      rule: '6',
    };
    expect(verdictBlock(verdict)).toEqual([
      '▸ verdict  ⛔ deny  (rule 6)',
      '  ⛔1204 | 96310.00 | 611 | You declared 7 disputes for $840.00.',
    ]);
  });

  it('renders an escalate as prose, never as a grammar line the Evaluator could not write', () => {
    const verdict: Verdict = {
      verdict: 'escalate',
      reason: 'no measurement was produced',
      evidence: null,
      rule: '2b',
    };
    const block = verdictBlock(verdict);
    expect(block[0]).toBe('▸ verdict  ⚖ escalate  (rule 2b)');
    expect(block.join('\n')).not.toMatch(/[✅⛔]/u);
    expect(block[2]).toBe('  the action stays held — a person decides');
  });

  it('reports the execution with the figures the ledger computed', () => {
    expect(
      executionLine({ executed: true, action: 'bulk_refund', count: 7, value_cents: 84_000 }),
    ).toBe('▸ executed against production ledger — 7 refunds, $840.00');
  });

  it('says plainly when nothing was written', () => {
    expect(executionLine({ executed: false, reason: 'criteria did not parse' })).toBe(
      '▸ nothing executed — criteria did not parse',
    );
  });
});
