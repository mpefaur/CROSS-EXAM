import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LocalExecutor } from '../src/measure/local.ts';
import { MEASURE_SCRIPT_PATH } from '../src/measure/types.ts';
import type { LedgerTable } from '../src/model/entities.ts';

/**
 * `LocalExecutor` against the committed replica — the real `python3`, the real
 * `measure.py`, the real fixture. Nothing is mocked, because the one thing this class
 * exists to guarantee is that a `Measurement` came out of executed code (Constitution II);
 * a stubbed subprocess would assert the opposite of the property under test.
 *
 * The expected figures are the cohort table of research D-05, the same numbers the demo
 * cross-examines.
 */

const LEDGER = resolve(import.meta.dirname, '../../../fixtures/replica.json');
const TEMP_PREFIX = 'crossexam-measure-';

const executor = new LocalExecutor();

const measure = (
  table: LedgerTable,
  criteria: string,
  ledgerPath = LEDGER,
  timeoutMs = 20_000,
): ReturnType<LocalExecutor['run']> =>
  executor.run({ ledgerPath, table, criteria, signal: AbortSignal.timeout(timeoutMs) });

/** How many working directories this executor has left behind in the system temp dir. */
async function strayDirectories(): Promise<number> {
  const entries = await readdir(tmpdir());
  return entries.filter((entry) => entry.startsWith(TEMP_PREFIX)).length;
}

describe('LocalExecutor', () => {
  it('names its transport', () => {
    expect(executor.kind).toBe('local');
  });

  it('measures the disputed cohort the demo turns on', async () => {
    const result = await measure('charges', 'status=disputed');
    expect(result).toMatchObject({
      measured_count: 1204,
      measured_value_cents: 9_631_000,
      duplicate_count: 611,
      executor: 'local',
      criteria: 'status=disputed',
      table: 'charges',
    });
  });

  it('measures a multi-term criteria, so the AND is not lost between the layers', async () => {
    const result = await measure('charges', 'status=disputed AND refunded=false');
    expect(result).toMatchObject({
      measured_count: 593,
      measured_value_cents: 4_751_000,
      duplicate_count: 0,
    });
  });

  it('measures the payouts table', async () => {
    const result = await measure('payouts', 'payout_eligible=true');
    expect(result).toMatchObject({
      measured_count: 342,
      measured_value_cents: 41_822_000,
      duplicate_count: 0,
      table: 'payouts',
    });
  });

  it('records the digest of the measure.py that actually ran', async () => {
    const onDisk = createHash('sha256').update(await readFile(MEASURE_SCRIPT_PATH)).digest('hex');
    const result = await measure('charges', 'status=disputed');
    expect(result?.script_sha256).toBe(onDisk);
  });

  it('reports a duration inside the attempt budget', async () => {
    const result = await measure('charges', 'status=disputed');
    expect(result?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result?.duration_ms).toBeLessThan(20_000);
  });

  // No measurement — every one of these is `null`, never a throw, because the verdict rules
  // act on the absence of a measurement (D-06 rule 2b) and cannot act on an exception.

  it('returns null when the criteria does not parse (exit 2)', async () => {
    await expect(measure('charges', 'status ~ disputed')).resolves.toBeNull();
  });

  it('returns null when the criteria names a field outside the grammar (exit 2)', async () => {
    await expect(measure('charges', 'refunded_at=null')).resolves.toBeNull();
  });

  it('returns null when the ledger is missing (exit 3)', async () => {
    await expect(measure('charges', 'status=disputed', `${LEDGER}.nope`)).resolves.toBeNull();
  });

  it('returns null when the ledger is not a ledger (exit 3)', async () => {
    await expect(measure('charges', 'status=disputed', MEASURE_SCRIPT_PATH)).resolves.toBeNull();
  });

  it('returns null when the signal is already spent', async () => {
    await expect(measure('charges', 'status=disputed', LEDGER, 1)).resolves.toBeNull();
  });

  /**
   * The setup steps — reading `measure.py`, making the working directory — are failures to
   * measure like any other. An unusable `TMPDIR` makes `mkdtemp` fail for real, without
   * mocking a builtin.
   */
  it('returns null instead of rejecting when the temporary directory cannot be made', async () => {
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = resolve(tmpdir(), 'crossexam-no-such-directory');
    try {
      await expect(measure('charges', 'status=disputed')).resolves.toBeNull();
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
    }
  });

  /**
   * Asserts the cleanup, not the ordering: no working directory survives a measurement, an
   * abort or a parse failure. The `close`-before-settle ordering in `runScript` is what
   * makes the aborted attempt provably over before that cleanup runs, and this assertion
   * does not distinguish the two — on POSIX the deletion succeeds against a directory a
   * dying process still holds open.
   */
  it('leaves no working directory behind, measured or aborted', async () => {
    const before = await strayDirectories();
    await measure('charges', 'status=disputed');
    await measure('charges', 'status=disputed', LEDGER, 1);
    await measure('charges', 'nonsense');
    expect(await strayDirectories()).toBe(before);
  });
});
