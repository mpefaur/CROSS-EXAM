import { describe, expect, it } from 'vitest';

import { generateLedger } from '../src/ledger/generate.ts';
import {
  PRODUCTION_SEED,
  REPLICA_SEED,
  type Charge,
  type Payout,
} from '../src/model/entities.ts';

/**
 * The generator's contract is the cohort table of research.md D-05, restated in
 * data-model.md §3. Every figure below is that table, in integer cents — the dollar form
 * in the comment is the spec's wording, never a value this file computes. No float
 * arithmetic touches an amount here (FR-006, data-model.md preamble).
 */
const DISPUTED_TOTAL_CENTS = 9_631_000; // $96,310.00
const REFUNDABLE_TOTAL_CENTS = 84_000; // $840.00
const PAYOUT_TOTAL_CENTS = 41_822_000; // $418,220.00
const CHARGE_COUNT = 1500;

/**
 * Frozen fixture date, pinned by `specs/001-cross-exam-evaluator/contracts/charge-sheet.md`
 * line 33 — the orchestrator hands the Evaluator `replica.as_of = "2026-08-29"`, so a
 * generator that drifted off that day would date every row from a different epoch than the
 * one the Evaluator is told the replica was taken on.
 */
const AS_OF = '2026-08-29';

interface Cohort<Row> {
  readonly name: string;
  readonly match: (row: Row) => boolean;
  readonly count: number;
  /** `null` where the spec table leaves the total open. */
  readonly totalCents: number | null;
}

const CHARGE_COHORTS: readonly Cohort<Charge>[] = [
  {
    name: 'status=disputed',
    match: (c) => c.status === 'disputed',
    count: 1204,
    totalCents: DISPUTED_TOTAL_CENTS,
  },
  {
    name: 'status=disputed AND refunded=true',
    match: (c) => c.status === 'disputed' && c.refunded,
    count: 611,
    totalCents: null,
  },
  {
    name: 'status=disputed AND refunded=false AND age_days>30',
    match: (c) => c.status === 'disputed' && !c.refunded && c.age_days > 30,
    count: 586,
    totalCents: null,
  },
  {
    name: 'status=disputed AND refunded=false AND age_days<=30',
    match: (c) => c.status === 'disputed' && !c.refunded && c.age_days <= 30,
    count: 7,
    totalCents: REFUNDABLE_TOTAL_CENTS,
  },
  {
    name: 'status in {settled, open}',
    match: (c) => c.status === 'settled' || c.status === 'open',
    count: 296,
    totalCents: null,
  },
];

const PAYOUT_COHORTS: readonly Cohort<Payout>[] = [
  {
    name: 'payout_eligible=true',
    match: (p) => p.payout_eligible,
    count: 342,
    totalCents: PAYOUT_TOTAL_CENTS,
  },
];

function totalCents(rows: readonly { amount_cents: number }[]): number {
  return rows.reduce((sum, row) => sum + row.amount_cents, 0);
}

/**
 * Both ledgers are held to the same table: they are equivalent for the demo scenario, which
 * is what makes the replica a usable stand-in — while still not being a copy (FR-006).
 */
describe.each([REPLICA_SEED, PRODUCTION_SEED])('generateLedger(%s)', (seed) => {
  const ledger = generateLedger(seed);

  it('echoes its own seed and the frozen as_of date', () => {
    expect(ledger.seed).toBe(seed);
    expect(ledger.as_of).toBe(AS_OF);
  });

  it('holds 1,500 charges', () => {
    expect(ledger.charges).toHaveLength(CHARGE_COUNT);
  });

  it.each(CHARGE_COHORTS)('charges — $name', ({ match, count, totalCents: expected }) => {
    const rows = ledger.charges.filter(match);
    expect(rows).toHaveLength(count);
    if (expected !== null) {
      expect(totalCents(rows)).toBe(expected);
    }
  });

  it.each(PAYOUT_COHORTS)('payouts — $name', ({ match, count, totalCents: expected }) => {
    const rows = ledger.payouts.filter(match);
    expect(rows).toHaveLength(count);
    if (expected !== null) {
      expect(totalCents(rows)).toBe(expected);
    }
  });

  // data-model.md §1 Validation. Collected rather than asserted row by row so a failure
  // names the offending rows instead of stopping at the first one.
  it('holds refunded === (refunded_at !== null) on every charge', () => {
    const offenders = ledger.charges.filter((c) => c.refunded !== (c.refunded_at !== null));
    expect(offenders).toEqual([]);
  });

  it('gives every charge and payout an integer amount_cents > 0', () => {
    const rows: readonly { amount_cents: number }[] = [...ledger.charges, ...ledger.payouts];
    const offenders = rows.filter(
      (row) => !Number.isInteger(row.amount_cents) || row.amount_cents <= 0,
    );
    expect(offenders).toEqual([]);
  });
});

describe('the replica is generated, never copied (FR-006)', () => {
  it('produces two ledgers that meet the same table without being deep-equal', () => {
    const replica = generateLedger(REPLICA_SEED);
    const production = generateLedger(PRODUCTION_SEED);

    expect(replica).not.toEqual(production);
    // Stronger than the whole-object check, which the differing `seed` field alone would
    // satisfy: the rows themselves must differ.
    expect(replica.charges).not.toEqual(production.charges);
    expect(replica.payouts).not.toEqual(production.payouts);
  });
});
