import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { query, record, type DocketEntry } from '../src/docket/index.ts';
import type { Measurement } from '../src/model/case.ts';

const evidence: Measurement = {
  criteria: 'status=disputed',
  table: 'charges',
  measured_count: 1204,
  measured_value_cents: 9_631_000,
  duplicate_count: 611,
  executor: 'local',
  duration_ms: 12,
  script_sha256: 'abc',
};

const entry = (case_id: string, action: DocketEntry['action']): DocketEntry => ({
  case_id,
  recorded_at: '2026-08-29T00:00:00.000Z',
  action,
  criteria: evidence.criteria,
  verdict: { verdict: 'deny', reason: 'measured 1204 / $96,310.00', evidence, rule: '6' },
});

describe('docket', () => {
  it('returns nothing when no docket exists', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'crossexam-docket-')), 'docket.jsonl');
    expect(await query('bulk_refund', path)).toEqual([]);
  });

  it('appends one JSON line per entry and queries by action across reads', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'crossexam-docket-')), 'docket.jsonl');
    await record(entry('c1', 'bulk_refund'), path);
    await record(entry('c2', 'issue_payout'), path);
    await record(entry('c3', 'bulk_refund'), path);

    const lines = (await readFile(path, 'utf8')).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toBe('');

    const found = await query('bulk_refund', path);
    expect(found.map((e) => e.case_id)).toEqual(['c1', 'c3']);
    expect(found[0]?.verdict.evidence).toEqual(evidence);
  });
});
