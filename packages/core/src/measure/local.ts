/**
 * `LocalExecutor` — the fallback transport of research D-03.
 *
 * Runs the same `measure.py` under `python3` in a temporary directory, used only when the
 * sandbox is unreachable (FR-004). The script is *copied* into that directory and the copy
 * is what runs, so `script_sha256` is the digest of the bytes that were actually executed.
 *
 * Isolation is what a child process can be given without a supervisor: a fresh working
 * directory that is deleted afterwards, `python3 -I` (no `PYTHON*` environment, no user
 * site-packages), and an environment holding nothing but `PATH` — so no proxy or credential
 * variable reaches it. The script itself is what guarantees no socket is ever opened: it is
 * stdlib-only and reads exactly one path, the `--ledger` it was given (T014, contract § The
 * script).
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { Measurement } from '../model/case.ts';
import {
  readMeasureScript,
  toMeasurement,
  type MeasureInput,
  type MeasurementExecutor,
} from './types.ts';

/** Never rejects: a spawn failure, a non-zero exit and an aborted signal all mean no measurement. */
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
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    // `error` covers a missing python3 and the abort; either way there is no measurement.
    child.once('error', () => resolvePromise(null));
    child.once('close', (code) => resolvePromise(code === 0 ? stdout : null));
  });
}

export class LocalExecutor implements MeasurementExecutor {
  readonly kind = 'local';

  async run(input: MeasureInput): Promise<Measurement | null> {
    const { source, sha256 } = await readMeasureScript();
    // The script runs with `cwd` set to the temporary directory, so the ledger it is handed
    // must be absolute — a relative fixtures path would resolve against the wrong root.
    const ledger = resolve(input.ledgerPath);
    const dir = await mkdtemp(join(tmpdir(), 'crossexam-measure-'));
    const started = Date.now();
    try {
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
        executor: this.kind,
        criteria: input.criteria,
        table: input.table,
        duration_ms: Date.now() - started,
        script_sha256: sha256,
      });
    } catch {
      // Reading the script or writing the copy failed; still no measurement, still no throw.
      return null;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
