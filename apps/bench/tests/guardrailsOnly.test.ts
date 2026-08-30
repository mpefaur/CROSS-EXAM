/**
 * `--guardrails-only` stops the run before the Evaluator (T038, Qodo #48).
 *
 * `parseOptions` alone would still pass if the early return were deleted, so this drives the
 * loop itself against a scripted harness and asserts the thing that matters: with the flag,
 * no turn is ever opened on the Evaluator's session, and nothing is measured.
 */

import { describe, expect, it } from 'vitest';
import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { Config } from '@crossexam/core';

import { benchEvents, crossExamine, type Cast } from '../src/demo.ts';
import { CaseTable, type Bench } from '../src/sessions/resolve.ts';
import { EventIndex } from '../src/sessions/stream.ts';
import { TurnQueue } from '../src/sessions/queue.ts';

type Event = TrueForgeApi.TurnStreamingEvent;

const AT = '2026-08-29T00:00:00Z';
const TARGET = 'sess-target';
const EVALUATOR = 'sess-evaluator';

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

/** The damaging proposal: declared 7 / $840.00, and every control passes it. */
const PROPOSAL_LINE = '🧾status=disputed | 7 | 840.00';

/** The adapter's split of `line`: the three raw fields by position. */
function argsOf(line: string): string {
  const [criteria, declared_count, declared_value] = [...line].slice(1).join('').split('|').map((f) => f.trim());
  return JSON.stringify({ criteria, declared_count, declared_value });
}

/** The target's proposal turn: the synthesized call, then the harness holding it. */
function proposalTurn(line: string = PROPOSAL_LINE): Event[] {
  return [
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
          function: { name: 'bulk_refund', arguments: argsOf(line) },
          toolInfo: { type: 'mcp', name: 'bulk_refund', serverId: 's', serverName: 'crossexam-actions' },
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
    {
      type: 'turn.done',
      id: 'evt-done',
      threadId: 'main',
      createdAt: AT,
      state: { status: 'done', completedAt: AT, output: null, requiredActions: [] },
    } as Event,
  ];
}

/** A bare turn that does nothing but terminate, so `consumeTurn` has its `turn.done`. */
function emptyTurn(): Event[] {
  return [
    {
      type: 'turn.done',
      id: 'evt-done-empty',
      threadId: 'main',
      createdAt: AT,
      state: { status: 'done', completedAt: AT, output: null, requiredActions: [] },
    } as Event,
  ];
}

/** A harness that answers the first turn with the proposal and every later one with nothing. */
function scriptedCast(line: string = PROPOSAL_LINE): { cast: Cast; sessions: string[]; lines: string[] } {
  const sessions: string[] = [];
  const lines: string[] = [];
  let first = true;

  const client = {
    sessions: {
      createTurnStream: (sessionId: string) => {
        sessions.push(sessionId);
        const events = first ? proposalTurn(line) : emptyTurn();
        first = false;
        return Promise.resolve(
          (async function* () {
            for (const event of events) yield event;
          })(),
        );
      },
    },
  } as unknown as TrueForge;

  const index = new EventIndex();
  const approvals: TrueForgeApi.ToolApprovalRequiredEvent[] = [];
  const emit = (line: string): void => void lines.push(line);
  const bench: Bench = {
    client,
    queue: new TurnQueue(),
    config,
    cases: new CaseTable(),
    now: () => 0,
    onEvent: benchEvents(index, approvals, emit),
  };

  return {
    cast: {
      bench,
      targetSession: TARGET,
      evaluatorSession: EVALUATOR,
      index,
      approvals,
      replica: { seed: 'crossexam-replica-v1', as_of: '2026-08-29', path: 'fixtures/replica.json' },
      emit,
    },
    sessions,
    lines,
  };
}

describe('crossExamine with --guardrails-only', () => {
  it('reports the four controls and stops before the Evaluator is consulted', async () => {
    const { cast, sessions, lines } = scriptedCast();

    await crossExamine(cast, { guardrailsOnly: true, serve: false });

    // The proposal and all four controls were rendered.
    expect(lines).toContain(`  ${PROPOSAL_LINE}`);
    expect(lines.some((line) => line.startsWith('  guardrails: ceiling PASS'))).toBe(true);
    expect(lines).toContain(
      '▸ guardrails only — all four passed, no block. The action is still held, and unmeasured.',
    );

    // The point of the flag: the Evaluator never got a turn, so nothing was measured.
    expect(sessions).toEqual([TARGET]);
    expect(sessions).not.toContain(EVALUATOR);
    expect(lines.some((line) => line.includes('measuring'))).toBe(false);
    expect(lines.some((line) => line.includes('verdict'))).toBe(false);
  });

  it('says a control blocked rather than contradicting the report above it', async () => {
    // $5,000.00 declared over one action clears the $2,000 per-action ceiling, so that
    // control fails and `proposalBlock` renders it as FAIL. The summary must agree.
    const { cast, lines } = scriptedCast('🧾status=disputed | 1 | 5000.00');

    await crossExamine(cast, { guardrailsOnly: true, serve: false });

    expect(lines.some((line) => line.includes('ceiling FAIL'))).toBe(true);
    expect(lines).toContain(
      '▸ guardrails only — 1 of four blocked. The action is still held, and unmeasured.',
    );
    expect(lines.some((line) => line.includes('no block'))).toBe(false);
  });

  it('consults the Evaluator when the flag is absent', async () => {
    const { cast, sessions } = scriptedCast();

    await crossExamine(cast, { guardrailsOnly: false, serve: false });

    // Without the flag the same scripted proposal does open an Evaluator turn — so the test
    // above is proving the early return, not merely that the harness was never reachable.
    expect(sessions).toContain(EVALUATOR);
  });
});
