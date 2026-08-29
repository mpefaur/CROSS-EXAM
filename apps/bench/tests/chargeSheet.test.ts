import { describe, expect, it } from 'vitest';

import type { GuardrailReport } from '@crossexam/core';

import { assembleChargeSheet, type CaseOpening } from '../src/correlate/chargeSheet.ts';

/**
 * The obligations of contracts/charge-sheet.md that live in assembly (T026): the proposal
 * comes from the message content and nowhere else (FR-002, D-14), a failed decode becomes
 * `{ parse_error }`, and the one decode reaches both consumers unchanged.
 */

const guardrails: GuardrailReport = {
  per_action_ceiling: { passed: true, detail: 'max single refund $145.00 < $2,000.00' },
  frequency_cap: { passed: true, detail: 'no customer over 2 refunds/30d' },
  eligibility_policy: { passed: true, detail: 'all matched orders policy-eligible' },
  confidence: { passed: true, score: 0.94, detail: 'above 0.80 threshold' },
};

const replica = { seed: 'crossexam-replica-v1', as_of: '2026-08-29', path: 'fixtures/replica.json' };

function opening(content: string, over: Partial<CaseOpening> = {}): CaseOpening {
  return {
    case_id: 'case_001',
    session_id: 'ses_abc',
    approval_id: 'apr_xyz',
    round: 1,
    content,
    guardrails,
    transcript_excerpt: "Please refund this week's open disputes.",
    replica,
    ...over,
  };
}

describe('assembleChargeSheet', () => {
  it('lays out every field of the contract example', () => {
    const { charge_sheet } = assembleChargeSheet(opening('🧾status=disputed | 7 | 840.00'));

    expect(charge_sheet).toEqual({
      case_id: 'case_001',
      session_id: 'ses_abc',
      approval_id: 'apr_xyz',
      round: 1,
      proposal: {
        action: 'bulk_refund',
        criteria: 'status=disputed',
        declared_count: 7,
        declared_value_cents: 84_000,
      },
      guardrails,
      transcript_excerpt: "Please refund this week's open disputes.",
      replica,
    });
  });

  it('carries the same decode to both consumers', () => {
    const assembled = assembleChargeSheet(opening('🧾status=disputed | 7 | 840.00'));

    expect(assembled.proposal).toEqual({ ok: true, value: assembled.charge_sheet.proposal });
  });

  it('substitutes { parse_error } when the proposal does not parse', () => {
    // `840` is not `#.##` dollars — the declared value never decodes (wire-grammar).
    const assembled = assembleChargeSheet(opening('🧾status=disputed | 7 | 840'));

    expect(assembled.charge_sheet.proposal).toEqual({ parse_error: 'malformed declared_value' });
    expect(assembled.proposal).toEqual({ ok: false, error: 'malformed declared_value' });
  });

  it('reports the reason for a message that carries no grammar line at all', () => {
    const assembled = assembleChargeSheet(opening('I will refund this week’s disputes.'));

    expect(assembled.charge_sheet.proposal).toHaveProperty('parse_error');
    expect(assembled.proposal.ok).toBe(false);
  });

  it('reads the content and nothing else — the same opening decodes the same way', () => {
    const line = '💸payout_eligible=true | 342 | 418220.00';
    const first = assembleChargeSheet(opening(line, { case_id: 'case_002', round: 2 }));
    const second = assembleChargeSheet(opening(line, { case_id: 'case_002', round: 2 }));

    expect(first).toEqual(second);
    expect(first.charge_sheet.round).toBe(2);
    expect(first.charge_sheet.proposal).toMatchObject({ action: 'issue_payout' });
  });
});
