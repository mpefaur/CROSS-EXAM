/**
 * `@crossexam/measure` — the `measure` server's package entry and its executable entrypoint.
 *
 * Run directly (`tsx packages/measure/src/index.ts`) it listens on
 * `CROSSEXAM_MEASURE_SERVER_URL` and opens only `CROSSEXAM_REPLICA_PATH` (data-model §12).
 * Imported, it is only the module surface — importing it must not start a server.
 */

import { pathToFileURL } from 'node:url';
import { loadConfig } from '@crossexam/core';
import { startMeasureServer } from './server.ts';

export { startMeasureServer } from './server.ts';

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  const config = loadConfig();
  await startMeasureServer(config.measure_server_url, {
    ledgerPath: config.replica_path,
    timeoutMs: config.measurement_timeout_ms,
  });
  console.log(`measure server listening on ${config.measure_server_url}`);
}
