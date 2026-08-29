/**
 * The measurement executor interface — `contracts/measurement-executor.md`.
 *
 * The only interface in this system that may produce a `Measurement` (Constitution II).
 * Both implementations run **byte-identical code** — the same `measure.py` — which is what
 * makes FR-004's "identical measurement ... behind the same interface" a fact rather than a
 * claim (research D-03). Everything either transport shares lives here: the path of the one
 * script, its digest, and the decode of its single stdout line.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { decodeMeasurement } from '../grammar/index.ts';
import type { Measurement } from '../model/case.ts';
import type { LedgerTable } from '../model/entities.ts';

/** What an executor is asked to measure. `signal` fires at `CROSSEXAM_MEASUREMENT_TIMEOUT_MS`. */
export interface MeasureInput {
  ledgerPath: string;
  table: LedgerTable;
  criteria: string;
  signal: AbortSignal;
}

/**
 * One transport for the one script. `run` resolves to `null` for every failure — a
 * criteria that did not parse (exit 2), a malformed ledger (exit 3), a timeout, an
 * unreachable sandbox — and never rejects: a measurement that did not happen is data the
 * verdict rules act on (D-06 rule 2b), not an exception to unwind (FR-004, Risk R1).
 */
export interface MeasurementExecutor {
  readonly kind: 'sandbox' | 'local';
  run(input: MeasureInput): Promise<Measurement | null>;
}

/** The one script. Both transports run these exact bytes. */
export const MEASURE_SCRIPT_PATH = fileURLToPath(
  new URL('../../scripts/measure.py', import.meta.url),
);

/**
 * The bytes of `measure.py` and their digest, read together so the digest is always of the
 * source the caller is about to run. If the sandbox copy and the local copy ever diverge,
 * the digests differ and the run says so instead of quietly comparing two different pieces
 * of arithmetic (contract § Invariant).
 */
export async function readMeasureScript(): Promise<{ source: Buffer; sha256: string }> {
  const source = await readFile(MEASURE_SCRIPT_PATH);
  return { source, sha256: createHash('sha256').update(source).digest('hex') };
}

/** The transport metadata an executor adds to the three numbers the script printed. */
export interface MeasurementContext {
  executor: Measurement['executor'];
  criteria: string;
  table: LedgerTable;
  duration_ms: number;
  script_sha256: string;
}

/**
 * The script's stdout → a `Measurement`. The line is decoded through the Phase 2 grammar,
 * strictly and once: anything else on stdout is not a measurement, and no field is ever
 * inferred (FR-025). `criteria` and `table` are copied from the call's own arguments so the
 * Bench can tell a call on the proposal's criteria from a call on other criteria (D-06).
 */
export function toMeasurement(stdout: string, context: MeasurementContext): Measurement | null {
  const decoded = decodeMeasurement(stdout);
  return decoded.ok ? { ...decoded.value, ...context } : null;
}
