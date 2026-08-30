/**
 * A held payout chat is examined on its own request and its own proposal.
 *
 * The watcher answers chats the Bench did not open, so the charge sheet must be built from
 * what that chat holds — never from the seeded refund request the demo starts with.
 */

import { describe, expect, it } from 'vitest';
import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { ChargeSheet, Config } from '@crossexam/core';

import { benchEvents, customerRequest, examineHeld, type Cast } from '../src/demo.ts';
import { CaseTable, type Bench } from '../src/sessions/resolve.ts';
import { EventIndex } from '../src/sessions/stream.ts';
import { TurnQueue } from '../src/sessions/queue.ts';

type Event = TrueForgeApi.TurnStreamingEvent;

const AT = '2026-08-29T00:00:00Z';
const PAYOUT_REQUEST = 'Pay out every eligible seller. It is 3 sellers, $300.00 in total.';
const PAYOUT_ARGS = '{"criteria":"payout_eligible=true","declared_count":"3","declared_value":"300.00"}';

const config = {
  trueforge_base_url: 'http://localhost:8790',
  target_agent_name: 'target',
  evaluator_agent_name: 'evaluator',
  target_model: 'model-a',
  evaluator_model: 'model-b',
  escalation_threshold_usd: 250_000,
  measurement_timeout_ms: 20_000,
  evaluator_retries: 3,
  case_budget_ms: 600_000,
  action_server_url: 'http://localhost:8791/mcp',
  measure_server_url: 'http://localhost:8792/mcp',
  replica_path: 'fixtures/replica.json',
  grammar_registry_path: 'packages/core/src/grammar/registry.json',
  credentials: { OPENAI_API_KEY: 'o' },
} satisfies Config;

/** The persisted events of a chat turn the harness paused on a payout. */
const HELD_PAYOUT: Event[] = [
  {
    type: 'model.message',
    id: 'evt-msg',
    threadId: 'main',
    createdAt: AT,
    content: '',
    toolCalls: [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'issue_payout', arguments: PAYOUT_ARGS },
        toolInfo: { type: 'mcp', name: 'issue_payout', serverId: 's', serverName: 'crossexam-actions' },
      },
    ],
  } as Event,
  {
    type: 'tool.approval_required',
    id: 'evt-approval',
    threadId: 'main',
    createdAt: AT,
    toolCalls: [{ id: 'call-1', sourceEventId: 'evt-msg' }],
  } as Event,
];

/** A harness whose every turn ends at once, recording what each session was sent. */
function heldCast(): { cast: Cast; inputs: Map<string, TrueForgeApi.TurnInputItem[][]> } {
  const inputs = new Map<string, TrueForgeApi.TurnInputItem[][]>();
  const client = {
    sessions: {
      createTurnStream: (sessionId: string, body: { input: TrueForgeApi.TurnInputItem[] }) => {
        inputs.set(sessionId, [...(inputs.get(sessionId) ?? []), body.input]);
        return Promise.resolve(
          (async function* () {
            yield {
              type: 'turn.done',
              id: 'evt-done',
              threadId: 'main',
              createdAt: AT,
              state: { status: 'done', completedAt: AT, output: null, requiredActions: [] },
            } as Event;
          })(),
        );
      },
    },
  } as unknown as TrueForge;

  const index = new EventIndex();
  const approvals: TrueForgeApi.ToolApprovalRequiredEvent[] = [];
  const bench: Bench = {
    client,
    queue: new TurnQueue(),
    config,
    cases: new CaseTable(),
    now: () => 0,
    onEvent: benchEvents(index, approvals, () => undefined),
  };
  for (const event of HELD_PAYOUT) bench.onEvent?.(event);

  return {
    cast: {
      bench,
      targetSession: 'sess-payout-chat',
      evaluatorSession: 'sess-evaluator',
      index,
      approvals,
      replica: { seed: 'crossexam-replica-v1', as_of: '2026-08-29', path: 'fixtures/replica.json' },
      emit: () => undefined,
    },
    inputs,
  };
}

describe('examineHeld on a payout chat', () => {
  it('charges the payout on its own request and proposal, with nothing of the refund', async () => {
    const { cast, inputs } = heldCast();

    await examineHeld(cast, { guardrailsOnly: false, serve: false }, PAYOUT_REQUEST);

    const [first] = inputs.get('sess-evaluator')?.[0] ?? [];
    expect(first?.type).toBe('user.message');
    const raw = (first as { content: string }).content;
    const sheet = JSON.parse(raw) as ChargeSheet;
    expect(sheet.transcript_excerpt).toBe(PAYOUT_REQUEST);
    expect(sheet.session_id).toBe('sess-payout-chat');
    expect(sheet.proposal).toEqual({
      action: 'issue_payout',
      criteria: 'payout_eligible=true',
      declared_count: 3,
      declared_value_cents: 30_000,
    });
    // The seeded refund run's request and criteria never leak into a payout chat's sheet.
    expect(raw).not.toContain("Refund this week's disputed charges");
    expect(raw).not.toContain('status=disputed');
  });
});

describe('customerRequest', () => {
  const turn = (input?: TrueForgeApi.TurnInputItem[]): TrueForgeApi.Turn =>
    ({ id: 'turn-1', input }) as TrueForgeApi.Turn;

  it('reads the typed text, plain or in parts', () => {
    expect(customerRequest(turn([{ type: 'user.message', content: PAYOUT_REQUEST }]))).toBe(PAYOUT_REQUEST);
    expect(
      customerRequest(
        turn([{ type: 'user.message', content: [{ type: 'text', text: 'Pay out' }, { type: 'text', text: 'now' }] }]),
      ),
    ).toBe('Pay out\nnow');
  });

  it('refuses a turn with no customer message rather than inventing one', () => {
    expect(() => customerRequest(turn([]))).toThrow('no customer message');
    expect(() => customerRequest(turn())).toThrow('no customer message');
  });
});
