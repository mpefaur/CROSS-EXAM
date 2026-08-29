/**
 * `pnpm seed` — writes both ledger fixtures from their own seeds, independently.
 *
 * The replica is generated, never copied from production (FR-006). Output is stable
 * `JSON.stringify(…, null, 2)` plus a trailing newline, written to a path resolved from
 * this module rather than from `process.cwd()`, so re-running produces byte-identical
 * files wherever it is run from (SC-002).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRODUCTION_SEED, REPLICA_SEED } from '../model/entities.ts';
import { generateLedger } from './generate.ts';

/** `packages/core/src/ledger` → repo root. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FIXTURES_DIR = join(REPO_ROOT, 'fixtures');

function write(fileName: string, seed: typeof REPLICA_SEED | typeof PRODUCTION_SEED): void {
  const ledger = generateLedger(seed);
  writeFileSync(join(FIXTURES_DIR, fileName), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  console.log(
    `wrote fixtures/${fileName} — seed ${seed}, ${ledger.charges.length} charges, ` +
      `${ledger.payouts.length} payouts`,
  );
}

mkdirSync(FIXTURES_DIR, { recursive: true });
write('replica.json', REPLICA_SEED);
write('production.json', PRODUCTION_SEED);
