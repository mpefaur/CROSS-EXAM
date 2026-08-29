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
/** Production execution, called by the tool handler the harness reaches only on `allow` (T021). */
export { executeApproved, PRODUCTION_LEDGER_PATH, type ApprovedAction } from './execute.ts';
/** The four conventional controls (T037) — called by the Bench at charge-sheet assembly. */
export { checkGuardrails, SELF_REPORTED_CONFIDENCE } from './guardrails.ts';

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  const url = loadConfig().action_server_url;
  await startActionServer(url);
  console.log(`action server listening on ${url}`);
}
