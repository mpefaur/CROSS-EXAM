/**
 * The action server — `contracts/mcp-tools.md`.
 *
 * A streamable-HTTP MCP server exposing the three irreversible actions. TrueForge
 * registers it by URL with `require_approval_for_tools: ["@all"]`, so every call below
 * pauses at `tool.approval_required` (FR-001).
 *
 * **A handler is reached only after the Bench allowed the call.** `ToolSet.mjs:58-71` returns
 * `approvalRequired` while the call is held and answers a `deny` with a synthesised error
 * result, in both cases without calling the tool. So the handler below is the `allow` branch
 * of `contracts/mcp-tools.md` § Behavior on call item 2, and it executes the action against
 * production and reports what it computed while applying it (T021, FR-014).
 *
 * It never opens the replica: measurement belongs to the `measure` server
 * (contracts/measurement-executor.md), and this server never measures. Every figure it
 * reports is one `executeApproved` accumulated from the rows it changed — never a declared
 * figure, never the Evaluator's citation.
 *
 * **Nothing here parses.** The three arguments arrive as raw strings from the harness
 * adapter (research D-14), which validates nothing, and reach the Bench unaltered. The
 * agent's declared figures are its own belief and may be wrong; comparing them against the
 * measurement is the product (Constitution II), so this server must not coerce, reject, or
 * repair them.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';

import { executeApproved, PRODUCTION_LEDGER_PATH, type ExecutionResult } from './execute.ts';

export interface ActionServerOptions {
  /** The production ledger this server writes. Defaults to the repository's fixture. */
  ledgerPath?: string;
}

/**
 * The three tools, in the order of contracts/mcp-tools.md § Tools.
 *
 * Every one takes the same three arguments and carries the same annotations; only the
 * action differs.
 */
const TOOLS = [
  ['bulk_refund', 'Refund every charge matching the criteria.'],
  ['issue_payout', 'Issue a payout to every account matching the criteria.'],
  ['close_account', 'Close every account matching the criteria.'],
] as const;

/**
 * `criteria` | `declared_count` | `declared_value`, all three required, all three strings.
 *
 * `z.string()` is the whole schema on purpose: `declared_count` is the agent's own claim,
 * not a number this server may vet. A schema that rejected `"seven"` would destroy the
 * mis-declaration before the Bench could hold it against the measurement.
 */
const ACTION_ARGUMENTS = {
  criteria: z.string(),
  declared_count: z.string(),
  declared_value: z.string(),
};

/** What the acting agent reads back: what ran, or why nothing did. */
function report(name: string, result: ExecutionResult): string {
  if (!result.executed) {
    return `${name} was approved but did not run: ${result.reason}. The production ledger is unchanged.`;
  }
  const value = (result.value_cents / 100).toFixed(2);
  return `${name} executed against the production ledger: ${String(result.count)} rows, $${value}.`;
}

/**
 * Serve the three tools over streamable HTTP at `url`, resolving once it is listening and
 * rejecting if the bind fails.
 *
 * Stateless: each request gets its own MCP server and transport, both closed with the
 * response, so no session state outlives a call.
 */
export function startActionServer(
  url: string,
  options: ActionServerOptions = {},
): Promise<HttpServer> {
  const { hostname, port } = new URL(url);
  const ledgerPath = options.ledgerPath ?? PRODUCTION_LEDGER_PATH;

  const http = createServer((req, res) => {
    const server = new McpServer({ name: 'crossexam-actions', version: '0.0.0' });

    for (const [name, description] of TOOLS) {
      server.registerTool(
        name,
        {
          description,
          inputSchema: ACTION_ARGUMENTS,
          annotations: { destructiveHint: true, idempotentHint: false, readOnlyHint: false },
        },
        // `criteria` is the only argument read: the action comes from the tool the harness
        // dispatched, and the declared figures are the agent's belief, not this server's.
        ({ criteria }) => {
          const result = executeApproved({ action: name, criteria }, ledgerPath);
          return {
            ...(result.executed ? {} : { isError: true as const }),
            content: [{ type: 'text' as const, text: report(name, result) }],
            structuredContent: { ...result },
          };
        },
      );
    }

    // No `sessionIdGenerator` — stateless mode (SDK 1.30.0 streamableHttp.d.ts).
    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    // The SDK types `onclose` as `(() => void) | undefined` on the class and `onclose?`
    // on `Transport`, which this workspace's `exactOptionalPropertyTypes` rejects. The
    // assertion narrows nothing at runtime — it is the same object either way.
    void server.connect(transport as Transport).then(() => transport.handleRequest(req, res));
  });

  return new Promise((resolve, reject) => {
    // A bind failure — `EADDRINUSE` when something already holds the port — reaches the
    // caller as a rejection instead of an unhandled `error` event that kills the process
    // before it can say which server failed. Once listening the handler is dropped, so a
    // later server error still fails loudly rather than settling an already-settled
    // promise.
    http.once('error', reject);
    http.listen(port === '' ? 80 : Number(port), hostname, () => {
      http.removeListener('error', reject);
      resolve(http);
    });
  });
}
