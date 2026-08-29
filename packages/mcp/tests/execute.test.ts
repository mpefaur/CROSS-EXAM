/**
 * The production writer and the handler that reaches it (T030a).
 *
 * These cover the one path that actually moves money, which the seeded scenario exercises
 * end to end but only in its `allow` round: the refusals below never occur in a passing
 * demo run, so a scenario re-run cannot prove them (Constitution IV, research D-12).
 *
 * Every case writes a temporary ledger. `fixtures/production.json` is never opened here —
 * a test that mutated it would change what the demo executes against.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCTION_SEED, REPLICA_SEED } from '@crossexam/core';

import { executeApproved } from '../src/execute.ts';

/** Three disputed charges, one already refunded, and one settled charge that must not move. */
const CHARGES = [
  { id: 'chg_1', customer_id: 'cus_1', status: 'disputed', amount_cents: 10_000, opened_at: '2026-08-20', age_days: 9, refunded: false, refunded_at: null },
  { id: 'chg_2', customer_id: 'cus_2', status: 'disputed', amount_cents: 5_000, opened_at: '2026-08-21', age_days: 8, refunded: false, refunded_at: null },
  { id: 'chg_3', customer_id: 'cus_3', status: 'disputed', amount_cents: 2_500, opened_at: '2026-08-01', age_days: 28, refunded: true, refunded_at: '2026-08-10' },
  { id: 'chg_4', customer_id: 'cus_4', status: 'settled', amount_cents: 9_900, opened_at: '2026-08-22', age_days: 7, refunded: false, refunded_at: null },
];

let dir: string;
let ledgerPath: string;

function writeLedger(seed: string): void {
  writeFileSync(
    ledgerPath,
    `${JSON.stringify({ seed, as_of: '2026-08-29', charges: structuredClone(CHARGES), payouts: [] }, null, 2)}\n`,
    'utf8',
  );
}

function readCharges(): Record<string, unknown>[] {
  return (JSON.parse(readFileSync(ledgerPath, 'utf8')) as { charges: Record<string, unknown>[] }).charges;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crossexam-execute-'));
  ledgerPath = join(dir, 'production.json');
  writeLedger(PRODUCTION_SEED);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('executeApproved', () => {
  it('refunds the matched rows and reports figures it computed from them', () => {
    const result = executeApproved({ action: 'bulk_refund', criteria: 'status=disputed' }, ledgerPath);

    // chg_1 and chg_2 move; chg_3 already carries a settled refund; chg_4 is not disputed.
    expect(result).toMatchObject({ executed: true, count: 2, value_cents: 15_000, table: 'charges' });
    const charges = readCharges();
    expect(charges.map((c) => c['refunded'])).toEqual([true, true, true, false]);
    expect(charges[0]?.['refunded_at']).toBe('2026-08-29');
  });

  it('never opens a ledger that is not production', () => {
    writeLedger(REPLICA_SEED);
    const result = executeApproved({ action: 'bulk_refund', criteria: 'status=disputed' }, ledgerPath);

    expect(result).toMatchObject({ executed: false });
    expect(readCharges().map((c) => c['refunded'])).toEqual([false, false, true, false]);
  });

  it('refuses an action the seeded ledger cannot represent, and writes nothing', () => {
    const result = executeApproved({ action: 'close_account', criteria: 'status=disputed' }, ledgerPath);

    expect(result).toMatchObject({ executed: false });
    expect(readCharges().map((c) => c['refunded'])).toEqual([false, false, true, false]);
  });

  it('refuses criteria that do not parse, and writes nothing', () => {
    const result = executeApproved({ action: 'bulk_refund', criteria: 'status ~ disputed' }, ledgerPath);

    expect(result).toMatchObject({ executed: false });
    expect(readCharges().map((c) => c['refunded'])).toEqual([false, false, true, false]);
  });

  it('reports zero and leaves the ledger alone when nothing matches', () => {
    const result = executeApproved({ action: 'bulk_refund', criteria: 'status=chargeback' }, ledgerPath);

    expect(result).toMatchObject({ executed: true, count: 0, value_cents: 0 });
    expect(readCharges().map((c) => c['refunded'])).toEqual([false, false, true, false]);
  });
});
