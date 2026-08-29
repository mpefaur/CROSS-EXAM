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

/**
 * Never rejects: a spawn failure, a non-zero exit and an aborted signal all mean no
 * measurement.
 *
 * `error` fires while the child may still be shutting down — the abort kills it and the
 * event arrives before it has gone — so it only records the failure. The promise settles on
 * `close`, which fires once the process has exited and its stdio is drained; only then is
 * the working directory the caller is about to delete free of a live process. The one case
 * with no `close` to wait for is a child that never started (no `pid`): a missing `python3`,
 * or a signal already spent before the spawn.
 */
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
      if (child.pid === undefined) resolvePromise(null);
    });
    child.once('close', (code) => resolvePromise(failed || code !== 0 ? null : stdout));
  });
}

export class LocalExecutor implements MeasurementExecutor {
  readonly kind = 'local';

  /**
   * Reading the script and making the temporary directory are inside the `try`: an
   * unreadable `measure.py` or an unusable temp directory is a failure to measure like any
   * other, and the contract says `null` rather than a rejection. A rejection here would
   * abort the sandbox-to-local resolution order instead of ending it in the no-measurement
   * result the verdict rules expect (D-06 rule 2b).
   */
  async run(input: MeasureInput): Promise<Measurement | null> {
    const started = Date.now();
    let dir: string | undefined;
    try {
      const { source, sha256 } = await readMeasureScript();
      // The script runs with `cwd` set to the temporary directory, so the ledger it is
      // handed must be absolute — a relative fixtures path would resolve against the wrong
      // root.
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
        executor: this.kind,
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
        // A measurement that was produced still stands: a directory that will not delete is
        // an operational anomaly, not a reason to discard a figure the script really
        // computed. It is not swallowed either — `run` may not reject, so the failure is
        // reported on stderr, naming the path and nothing else.
        await rm(working, { recursive: true, force: true }).catch((error: unknown) => {
          console.warn(
            `measure: could not remove the working directory ${working}: ${String(error)}`,
          );
        });
      }
    }
  }
}
