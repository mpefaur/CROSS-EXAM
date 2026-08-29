/**
 * `@crossexam/mcp` — the action server's package entry and its executable entrypoint.
 *
 * Run directly (`tsx packages/mcp/src/index.ts`, and `pnpm demo` from T030) it listens on
 * `CROSSEXAM_ACTION_SERVER_URL` (data-model §12). Imported, it is only the module surface —
 * `apps/bench` depends on this package, and importing it must not start a server.
 */

import { pathToFileURL } from 'node:url';
import { loadConfig } from '@crossexam/core';
import { startActionServer } from './server.ts';

export { startActionServer } from './server.ts';
/** Production execution on an `allow` resolution (T021) — never at proposal time. */
export { executeOnAllow, PRODUCTION_LEDGER_PATH } from './execute.ts';

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  const url = loadConfig().action_server_url;
  await startActionServer(url);
  console.log(`action server listening on ${url}`);
}
