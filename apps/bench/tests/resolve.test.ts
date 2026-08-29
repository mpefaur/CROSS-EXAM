import { describe, expect, it } from 'vitest';
import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { Config, DecodeResult, Measurement, ProposedAction } from '@crossexam/core';

import { EventIndex, type TurnRecord } from '../src/sessions/stream.ts';
import { TurnQueue } from '../src/sessions/queue.ts';
import {
  CaseTable,
  evaluatorMessage,
  observedMeasurement,
  resolveCase,
  type Bench,
  type HeldAction,
} from '../src/sessions/resolve.ts';

type Event = TrueForgeApi.TurnStreamingEvent;

const AT = '2026-08-29T00:00:00Z';

const EVALUATOR_SESSION = 'sess-evaluator';
const TARGET_SESSION = 'sess-target';

const config: Config = {
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
  grammar_registry_path: null,
  credentials: { DAYTONA_API_KEY: 'd', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' },
};

/** The seeded US1 proposal: 1,240 rows declared, $96,310.00 measured (research D-07). */
const proposal: DecodeResult<ProposedAction> = {
  ok: true,
  value: {
    action: 'bulk_refund',
    criteria: 'status=disputed',
    declared_count: 1240,
    declared_value_cents: 9_631_000,
  },
};

const measured: Measurement = {
  measured_count: 1240,
  measured_value_cents: 9_631_000,
  duplicate_count: 0,
  executor: 'local',
  duration_ms: 412,
  script_sha256: 'a'.repeat(64),
  criteria: 'status=disputed',
  table: 'charges',
};

const message = (id: string, content: string, toolCalls?: TrueForgeApi.ToolCall[]): Event => ({
  type: 'model.message',
  id,
  threadId: 'main',
  createdAt: AT,
  content,
  ...(toolCalls === undefined ? {} : { toolCalls }),
});

const measureCall = (id: string, criteria: string, table: string): TrueForgeApi.ToolCall => ({
  id,
  type: 'function',
  function: { name: 'measure', arguments: JSON.stringify({ criteria, table }) },
  toolInfo: { type: 'mcp', name: 'measure', serverId: 'srv', serverName: 'crossexam-measure' },
});

const response = (id: string, toolCallId: string, content: string): Event => ({
  type: 'tool.response',
  id,
  threadId: 'main',
  createdAt: AT,
  toolCallId,
  content,
});

const done = (id: string): Event => ({
  type: 'turn.done',
  id,
  threadId: 'main',
  createdAt: AT,
  state: { status: 'done', completedAt: AT, output: null, requiredActions: [] },
});

function turn(events: Event[]): TurnRecord {
  const index = new EventIndex();
  for (const event of events) index.add(event);
  const last = done('done');
  index.add(last);
  return { events: index, done: last as TrueForgeApi.TurnDoneEvent };
}

/** One measurement turn: the `📏` line as a synthesized call, its result, then a verdict line. */
function verdictTurn(line: string, result: unknown = measured): TurnRecord {
  return turn([
    message('m1', '📏status=disputed | charges', [
      measureCall('call-1', 'status=disputed', 'charges'),
    ]),
    response('r1', 'call-1', JSON.stringify(result)),
    message('m2', line),
  ]);
}

interface SentTurn {
  sessionId: string;
  input: TrueForgeApi.TurnInputItem[];
}

/**
 * A harness stand-in that records what the resolver sends and answers each new turn with
 * the next scripted turn. `createTurnStream` is the only method the resolver touches.
 */
function fakeBench(replies: TurnRecord[], now = () => 0): Bench & { sent: SentTurn[] } {
  const sent: SentTurn[] = [];
  const queued = [...replies];
  const client = {
    sessions: {
      createTurnStream: async (sessionId: string, request: { input: TrueForgeApi.TurnInputItem[] }) => {
        sent.push({ sessionId, input: request.input });
        const next = queued.shift();
        const events = next === undefined ? [done('done')] : [...next.events.events];
        return (async function* () {
          for (const event of events) yield event;
        })();
      },
    },
  } as unknown as TrueForge;
  return { client, queue: new TurnQueue(), config, cases: new CaseTable(), now, sent };
}

const held: HeldAction = {
  case_id: 'case_001',
  evaluator_session_id: EVALUATOR_SESSION,
  target_session_id: TARGET_SESSION,
  thread_id: 'main',
  approval_id: 'call-refund',
  proposal,
  opened_at_ms: 0,
};

describe('evaluatorMessage', () => {
  it('reads the last model.message, string content or text parts', () => {
    expect(evaluatorMessage(verdictTurn('✅1240 | 96310.00 | 0 | ok').events)).toBe(
      '✅1240 | 96310.00 | 0 | ok',
    );

    const parts = turn([
      {
        type: 'model.message',
        id: 'm1',
        threadId: 'main',
        createdAt: AT,
        content: [{ type: 'text', text: '⛔1240 | 96310.00 | 0 | no' }],
      },
    ]);
    expect(evaluatorMessage(parts.events)).toBe('⛔1240 | 96310.00 | 0 | no');
  });

  it('is empty when the turn produced no message', () => {
    expect(evaluatorMessage(turn([]).events)).toBe('');
  });
});

describe('observedMeasurement', () => {
  it('builds the attempt from structuredContent, not from the 🧮 text', () => {
    const observed = observedMeasurement(verdictTurn('✅1240 | 96310.00 | 0 | ok').events);
    expect(observed).toEqual({ criteria: 'status=disputed', table: 'charges', result: measured });
  });

  it('is null when the turn called measure on nothing', () => {
    expect(observedMeasurement(turn([message('m1', 'no tool call here')]).events)).toBeNull();
  });

  it('takes the last measure call of the turn, not the first', () => {
    const second: Measurement = { ...measured, criteria: 'status=pending', measured_count: 3 };
    const record = turn([
      message('m1', '', [measureCall('call-1', 'status=disputed', 'charges')]),
      response('r1', 'call-1', JSON.stringify(measured)),
      message('m2', '', [measureCall('call-2', 'status=pending', 'charges')]),
      response('r2', 'call-2', JSON.stringify(second)),
    ]);
    expect(observedMeasurement(record.events)).toEqual({
      criteria: 'status=pending',
      table: 'charges',
      result: second,
    });
  });

  it('keeps the call criteria and reports no result when the tool errored', () => {
    // What the harness actually delivers on `isError: true` — the failure structuredContent
    // is replaced (executeToolCalls.mjs:107-108), so only the call arguments survive.
    const record = turn([
      message('m1', '', [measureCall('call-1', 'status=disputed', 'charges')]),
      response(
        'r1',
        'call-1',
        JSON.stringify({ error: [{ type: 'text', text: 'both executors failed within 20 s' }] }),
      ),
    ]);
    expect(observedMeasurement(record.events)).toEqual({
      criteria: 'status=disputed',
      table: 'charges',
      result: null,
    });
  });

  it('reports no result when a figure is missing from structuredContent', () => {
    const partial: Omit<Measurement, 'duplicate_count'> & { duplicate_count?: number } = {
      ...measured,
    };
    delete partial.duplicate_count;
    const record = turn([
      message('m1', '', [measureCall('call-1', 'status=disputed', 'charges')]),
      response('r1', 'call-1', JSON.stringify(partial)),
    ]);
    expect(observedMeasurement(record.events)?.result).toBeNull();
  });
});

describe('resolveCase', () => {
  it('resolves the approval allow on an ✅ the measurement supports', async () => {
    const bench = fakeBench([]);
    const verdict = await resolveCase(
      bench,
      held,
      verdictTurn('✅1240 | 96310.00 | 0 | figures match'),
    );

    expect(verdict).toEqual({
      verdict: 'allow',
      reason: 'figures match',
      evidence: measured,
      rule: '6',
    });
    expect(bench.sent).toEqual([
      {
        sessionId: TARGET_SESSION,
        input: [
          {
            type: 'user.tool_approval',
            threadId: 'main',
            toolCallId: 'call-refund',
            approval: { status: 'allow' },
          },
        ],
      },
    ]);
  });

  it("denies with the ⛔ line's fourth field as the reason the agent sees", async () => {
    // Under the escalation threshold, so rule 3 does not preempt the Evaluator's own ⛔.
    const contradicted: Measurement = {
      ...measured,
      measured_count: 5382,
      measured_value_cents: 15_000_000,
      duplicate_count: 214,
    };
    const bench = fakeBench([]);
    const verdict = await resolveCase(
      bench,
      held,
      verdictTurn(
        '⛔5382 | 150000.00 | 214 | measured 5382 rows worth 150000.00, 214 already refunded',
        contradicted,
      ),
    );

    expect(verdict.verdict).toBe('deny');
    expect(bench.sent[0]?.input[0]).toEqual({
      type: 'user.tool_approval',
      threadId: 'main',
      toolCallId: 'call-refund',
      approval: {
        status: 'deny',
        reason: 'measured 5382 rows worth 150000.00, 214 already refunded',
      },
    });
  });

  it('leaves the approval pending on an escalate', async () => {
    const overThreshold: Measurement = {
      ...measured,
      measured_count: 5382,
      measured_value_cents: 41_822_000,
      criteria: 'status=disputed',
    };
    const bench = fakeBench([]);
    const verdict = await resolveCase(
      bench,
      held,
      verdictTurn('⛔5382 | 418220.00 | 0 | too much', overThreshold),
    );

    expect(verdict.verdict).toBe('escalate');
    expect(verdict.rule).toBe('3');
    expect(bench.sent).toEqual([]);
  });

  it('sends the guidance as the Evaluator next turn and resolves the re-issued verdict', async () => {
    // First turn measures other criteria — rule 2a — then the Evaluator measures the
    // proposal's own criteria and re-issues.
    const wrong: Measurement = { ...measured, criteria: 'status=pending' };
    const first = turn([
      message('m1', '', [measureCall('call-1', 'status=pending', 'charges')]),
      response('r1', 'call-1', JSON.stringify(wrong)),
      message('m2', '✅1240 | 96310.00 | 0 | looks fine'),
    ]);
    const bench = fakeBench([verdictTurn('✅1240 | 96310.00 | 0 | figures match')]);

    const verdict = await resolveCase(bench, held, first);

    expect(verdict.verdict).toBe('allow');
    expect(bench.sent).toHaveLength(2);
    expect(bench.sent[0]?.sessionId).toBe(EVALUATOR_SESSION);
    const guidance = bench.sent[0]?.input[0];
    expect(guidance?.type).toBe('user.message');
    expect(guidance).toMatchObject({ content: expect.stringContaining('📏status=disputed | charges') });
    expect(bench.sent[1]?.sessionId).toBe(TARGET_SESSION);
  });

  it('escalates once the guidance retries are spent, and answers no approval', async () => {
    const noCall = () => turn([message('m1', '✅1240 | 96310.00 | 0 | trust me')]);
    const bench = fakeBench([noCall(), noCall(), noCall()]);

    const verdict = await resolveCase(bench, held, noCall());

    expect(verdict.verdict).toBe('escalate');
    expect(verdict.rule).toBe('2a');
    // Three guidance turns to the Evaluator, and nothing to the acting agent's session.
    expect(bench.sent).toHaveLength(config.evaluator_retries);
    expect(bench.sent.every((sent) => sent.sessionId === EVALUATOR_SESSION)).toBe(true);
  });

  it('escalates on the case budget without asking the Evaluator again', async () => {
    const bench = fakeBench([], () => config.case_budget_ms + 1);
    const verdict = await resolveCase(bench, held, turn([message('m1', 'nothing measured')]));

    expect(verdict.verdict).toBe('escalate');
    expect(verdict.rule).toBe('2b');
    expect(bench.sent).toEqual([]);
  });

  it('rejects a second decision on the same case; the first stands', async () => {
    const bench = fakeBench([]);
    const first = await resolveCase(
      bench,
      held,
      verdictTurn('✅1240 | 96310.00 | 0 | figures match'),
    );
    const second = await resolveCase(
      bench,
      held,
      verdictTurn('⛔1240 | 96310.00 | 0 | changed my mind'),
    );

    expect(second).toBe(first);
    expect(bench.sent).toHaveLength(1);
    expect(bench.sent[0]?.input[0]).toMatchObject({ approval: { status: 'allow' } });
  });
});
