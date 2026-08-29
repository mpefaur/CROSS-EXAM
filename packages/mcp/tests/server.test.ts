/**
 * The action server's handler, over real HTTP (T030a).
 *
 * The point of the suite: the handler the harness reaches on an `allow` writes the
 * production ledger and reports the figures it computed. Before T030a it returned "Nothing
 * has been executed" on every call and production was unreachable by any code path.
 *
 * The harness's own guard — held and denied calls never reach a handler
 * (`ToolSet.mjs:58-71`) — is harness behavior and is not restated here; these calls arrive
 * the way an approved one does.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCTION_SEED } from '@crossexam/core';

import { startActionServer } from '../src/server.ts';

const URL_ = 'http://127.0.0.1:18801';

const CHARGES = [
  { id: 'chg_1', customer_id: 'cus_1', status: 'disputed', amount_cents: 10_000, opened_at: '2026-08-20', age_days: 9, refunded: false, refunded_at: null },
  { id: 'chg_2', customer_id: 'cus_2', status: 'settled', amount_cents: 9_900, opened_at: '2026-08-22', age_days: 7, refunded: false, refunded_at: null },
];

let dir: string;
let ledgerPath: string;
let http: Awaited<ReturnType<typeof startActionServer>>;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'crossexam-actions-'));
  ledgerPath = join(dir, 'production.json');
  http = await startActionServer(URL_, { ledgerPath });
  client = new Client({ name: 'test', version: '0.0.0' });
  // Same `exactOptionalPropertyTypes` mismatch as the server side; the object is unchanged.
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)) as Transport);
});

beforeEach(() => {
  writeFileSync(
    ledgerPath,
    `${JSON.stringify({ seed: PRODUCTION_SEED, as_of: '2026-08-29', charges: structuredClone(CHARGES), payouts: [] }, null, 2)}\n`,
    'utf8',
  );
});

afterAll(async () => {
  await client.close();
  await new Promise((done) => http.close(done));
  rmSync(dir, { recursive: true, force: true });
});

function refunded(): unknown[] {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as { charges: Record<string, unknown>[] };
  return ledger.charges.map((charge) => charge['refunded']);
}

describe('bulk_refund handler', () => {
  it('executes against production and reports what it computed', async () => {
    const result = await client.callTool({
      name: 'bulk_refund',
      arguments: { criteria: 'status=disputed', declared_count: '1', declared_value: '100.00' },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: 'text', text: 'bulk_refund executed against the production ledger: 1 rows, $100.00.' },
    ]);
    expect(result.structuredContent).toMatchObject({
      executed: true,
      action: 'bulk_refund',
      criteria: 'status=disputed',
      table: 'charges',
      count: 1,
      value_cents: 10_000,
    });
    expect(refunded()).toEqual([true, false]);
  });

  it('reports the declared figures nowhere — only the rows it changed', async () => {
    // The agent declares 900 charges for $9,000.00; one row matches. The report is the row's.
    const result = await client.callTool({
      name: 'bulk_refund',
      arguments: { criteria: 'status=disputed', declared_count: '900', declared_value: '9000.00' },
    });

    expect(result.structuredContent).toMatchObject({ count: 1, value_cents: 10_000 });
    expect(JSON.stringify(result.content)).not.toContain('900');
  });

  it('surfaces a refusal as an error and leaves the ledger unchanged', async () => {
    const result = await client.callTool({
      name: 'close_account',
      arguments: { criteria: 'status=disputed', declared_count: '1', declared_value: '100.00' },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ executed: false });
    expect(refunded()).toEqual([false, false]);
  });
});
