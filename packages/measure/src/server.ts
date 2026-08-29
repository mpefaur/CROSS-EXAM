/**
 * The `measure` server — `contracts/measurement-executor.md` § The tool the Evaluator calls.
 *
 * A streamable-HTTP MCP server exposing one read-only tool, `measure`, attached only to the
 * Evaluator (research D-15). It holds one ledger path — the replica — so the production
 * ledger's path does not exist in this process (FR-004). Every call runs `measure()` once;
 * a `null` result is reported as `isError` with `executor: null` so the Bench can apply
 * D-06 rule 2a/2b from `structuredContent` alone.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import { encodeMeasurement, measure, type LedgerTable } from '@crossexam/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';

export interface MeasureServerOptions {
  /** `CROSSEXAM_REPLICA_PATH` — the only ledger this server opens. */
  ledgerPath: string;
  /** `CROSSEXAM_MEASUREMENT_TIMEOUT_MS` — one fresh `AbortSignal` per call. */
  timeoutMs: number;
}

/**
 * Both arguments are plain strings: an unknown `table` must reach the failure row with
 * `criteria` and `table` echoed, not an SDK validation error the Bench cannot read.
 */
const MEASURE_ARGUMENTS = {
  criteria: z.string(),
  table: z.string(),
};

const TABLES: ReadonlySet<string> = new Set<LedgerTable>(['charges', 'payouts']);

function failure(criteria: string, table: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `no measurement: ${criteria} on ${table}` }],
    structuredContent: { criteria, table, executor: null },
  };
}

/** Run the one measurement and shape its result as the contract's two rows. */
export async function measureTool(
  { criteria, table }: { criteria: string; table: string },
  options: MeasureServerOptions,
) {
  if (!TABLES.has(table)) return failure(criteria, table);
  const result = await measure({
    ledgerPath: options.ledgerPath,
    table: table as LedgerTable,
    criteria,
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (result === null) return failure(criteria, table);
  return {
    content: [{ type: 'text' as const, text: encodeMeasurement(result) }],
    structuredContent: { ...result },
  };
}

/** Serve `measure` over streamable HTTP at `url`; stateless, one server and transport per request. */
export function startMeasureServer(url: string, options: MeasureServerOptions): Promise<HttpServer> {
  const { hostname, port } = new URL(url);

  const http = createServer((req, res) => {
    const server = new McpServer({ name: 'crossexam-measure', version: '0.0.0' });
    server.registerTool(
      'measure',
      {
        description:
          'Execute the criteria against the replica ledger and return the measured count, value and duplicates. Read-only.',
        inputSchema: MEASURE_ARGUMENTS,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      (args) => measureTool(args, options),
    );

    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    // Same `exactOptionalPropertyTypes` mismatch as packages/mcp; the object is unchanged.
    void server.connect(transport as Transport).then(() => transport.handleRequest(req, res));
  });

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(port === '' ? 80 : Number(port), hostname, () => {
      http.removeListener('error', reject);
      resolve(http);
    });
  });
}
