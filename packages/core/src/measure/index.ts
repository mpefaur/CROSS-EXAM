/**
 * `measure()` — the one function that may produce a `Measurement` (Constitution II, VIII;
 * `contracts/measurement-executor.md`).
 *
 * One transport: `python3 -I measure.py` in a fresh temporary directory with `env: { PATH }`,
 * handed only the replica path. Every failure — criteria that did not parse (exit 2), a
 * malformed ledger (exit 3), a timeout, a setup error — resolves to `null` and never rejects:
 * a measurement that did not happen is data the verdict rules act on (D-06 rule 2b), not an
 * exception to unwind (FR-004, FR-010).
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeMeasurement } from '../grammar/index.ts';
import type { Measurement } from '../model/case.ts';
import type { LedgerTable } from '../model/entities.ts';

/** What to measure. `signal` fires at `CROSSEXAM_MEASUREMENT_TIMEOUT_MS`. */
export interface MeasureInput {
  ledgerPath: string;
  table: LedgerTable;
  criteria: string;
  signal: AbortSignal;
}

/** The one script. */
export const MEASURE_SCRIPT_PATH = fileURLToPath(new URL('../../scripts/measure.py', import.meta.url));

/** The bytes of `measure.py` and their digest, read together so the digest is of the source about to run. */
export async function readMeasureScript(): Promise<{ source: Buffer; sha256: string }> {
  const source = await readFile(MEASURE_SCRIPT_PATH);
  return { source, sha256: createHash('sha256').update(source).digest('hex') };
}

/** The metadata added to the three numbers the script printed. */
export interface MeasurementContext {
  executor: Measurement['executor'];
  criteria: string;
  table: LedgerTable;
  duration_ms: number;
  script_sha256: string;
}

/** The script's stdout decoded strictly through the grammar; anything else is not a measurement (FR-025). */
export function toMeasurement(stdout: string, context: MeasurementContext): Measurement | null {
  const decoded = decodeMeasurement(stdout);
  return decoded.ok ? { ...decoded.value, ...context } : null;
}

function runScript(
  scriptFile: string,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const child = spawn('python3', ['-I', scriptFile, ...args], {
      cwd,
      signal,
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    let failed = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.once('error', () => {
      failed = true;
      // A spawn that never started emits no `close`.
      if (child.pid === undefined) resolvePromise(null);
    });
    child.once('close', (code) => resolvePromise(failed || code !== 0 ? null : stdout));
  });
}

/** Run `measure.py` once against the replica; `null` on any failure, never a rejection. */
export async function measure(input: MeasureInput): Promise<Measurement | null> {
  const started = Date.now();
  let dir: string | undefined;
  try {
    const { source, sha256 } = await readMeasureScript();
    const ledger = resolve(input.ledgerPath);
    dir = await mkdtemp(join(tmpdir(), 'crossexam-measure-'));
    const scriptFile = join(dir, 'measure.py');
    await writeFile(scriptFile, source);
    const stdout = await runScript(
      scriptFile,
      ['--ledger', ledger, '--table', input.table, '--criteria', input.criteria],
      dir,
      input.signal,
    );
    if (stdout === null) return null;
    return toMeasurement(stdout, {
      executor: 'local',
      criteria: input.criteria,
      table: input.table,
      duration_ms: Date.now() - started,
      script_sha256: sha256,
    });
  } catch {
    return null;
  } finally {
    if (dir !== undefined) {
      const working = dir;
      await rm(working, { recursive: true, force: true }).catch((error: unknown) => {
        console.warn(`measure: could not remove the working directory ${working}: ${String(error)}`);
      });
    }
  }
}
