/**
 * Reading the production ledger's own report off the tool result (T030, Qodo #44).
 *
 * The harness rewrites a failed tool result: a success arrives as the server's
 * `structuredContent` verbatim, a refusal as `{error: <MCP content array>}`
 * (`executeToolCalls.mjs:107-111`). Casting the second shape to the first silently turned a
 * refusal — which carries the reason nothing ran — into an execution of zero rows.
 */

import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

import { readExecution } from '../src/demo.ts';
import { EventIndex } from '../src/sessions/stream.ts';

function indexWith(content: string, toolCallId = 'call_1'): EventIndex {
  const index = new EventIndex();
  index.add({
    type: 'tool.response',
    id: 'evt_1',
    createdAt: '2026-08-29T00:00:00Z',
    threadId: 'thr_1',
    toolCallId,
    content,
  } as TrueForgeApi.TurnStreamingEvent);
  return index;
}

const UNREADABLE = 'the action server reported no execution result';

describe('readExecution', () => {
  it('reads the figures the ledger computed', () => {
    const index = indexWith(
      JSON.stringify({ executed: true, action: 'bulk_refund', criteria: 'status=disputed', table: 'charges', count: 7, value_cents: 84_000 }),
    );
    expect(readExecution(index, 'call_1')).toEqual({
      executed: true,
      action: 'bulk_refund',
      count: 7,
      value_cents: 84_000,
    });
  });

  it('recovers the reason from the harness error wrapper', () => {
    const index = indexWith(
      JSON.stringify({
        error: [{ type: 'text', text: 'close_account was approved but did not run: close_account has no effect the seeded ledger represents.' }],
      }),
    );
    const outcome = readExecution(index, 'call_1');
    expect(outcome.executed).toBe(false);
    // The point of the fix: the server's own reason survives, rather than being dropped.
    expect(outcome).toMatchObject({ reason: expect.stringContaining('no effect the seeded ledger represents') as unknown as string });
  });

  it('refuses to invent an execution from a shape it cannot read', () => {
    for (const content of ['not json', '"a string"', JSON.stringify({ executed: true }), JSON.stringify({ executed: true, action: 'bulk_refund', count: 1.5, value_cents: 1 }), JSON.stringify({ executed: true, action: 'wire_transfer', count: 1, value_cents: 1 })]) {
      expect(readExecution(indexWith(content), 'call_1')).toEqual({ executed: false, reason: UNREADABLE });
    }
  });

  it('ignores a response belonging to another tool call', () => {
    const index = indexWith(JSON.stringify({ executed: true, action: 'bulk_refund', count: 7, value_cents: 84_000 }), 'call_other');
    expect(readExecution(index, 'call_1')).toEqual({ executed: false, reason: UNREADABLE });
  });
});
