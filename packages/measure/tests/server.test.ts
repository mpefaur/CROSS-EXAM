import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startMeasureServer } from '../src/server.ts';

/** Two real calls over HTTP against the committed replica (T017a). */

const URL_ = 'http://127.0.0.1:18802';
const LEDGER = resolve(import.meta.dirname, '../../../fixtures/replica.json');

let http: Awaited<ReturnType<typeof startMeasureServer>>;
let client: Client;

beforeAll(async () => {
  http = await startMeasureServer(URL_, { ledgerPath: LEDGER, timeoutMs: 20_000 });
  client = new Client({ name: 'test', version: '0.0.0' });
  // Same `exactOptionalPropertyTypes` mismatch as the server side; the object is unchanged.
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)) as Transport);
});

afterAll(async () => {
  await client.close();
  await new Promise((done) => http.close(done));
});

describe('measure tool', () => {
  it('measures status=disputed on charges', async () => {
    const result = await client.callTool({ name: 'measure', arguments: { criteria: 'status=disputed', table: 'charges' } });
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: '🧮1204 | 96310.00 | 611' }]);
    expect(result.structuredContent).toMatchObject({
      criteria: 'status=disputed',
      table: 'charges',
      measured_count: 1204,
      measured_value_cents: 9_631_000,
      duplicate_count: 611,
      executor: 'local',
    });
    expect(result.structuredContent).toHaveProperty('duration_ms');
    expect((result.structuredContent as { script_sha256: string }).script_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports a criteria string that does not parse as a failure row', async () => {
    const result = await client.callTool({ name: 'measure', arguments: { criteria: 'status=disputed OR x', table: 'charges' } });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'no measurement: status=disputed OR x on charges' }]);
    expect(result.structuredContent).toEqual({ criteria: 'status=disputed OR x', table: 'charges', executor: null });
  });

  it('reports an unknown table as a failure row', async () => {
    const result = await client.callTool({ name: 'measure', arguments: { criteria: 'status=disputed', table: 'refunds' } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ criteria: 'status=disputed', table: 'refunds', executor: null });
  });
});
