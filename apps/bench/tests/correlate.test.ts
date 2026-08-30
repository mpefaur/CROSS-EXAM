import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

import { correlate } from '../src/correlate/index.ts';
import { EventIndex } from '../src/sessions/stream.ts';

type Event = TrueForgeApi.TurnStreamingEvent;
type Message = TrueForgeApi.ModelMessageEvent;

const AT = '2026-08-29T00:00:00Z';
const LINE = '🧾status=disputed | 7 | 840.00';
const ARGS = '{"criteria":"status=disputed","declared_count":"7","declared_value":"840.00"}';

const toolCall = (id: string, name: string, args: string): TrueForgeApi.ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: args },
  toolInfo: { type: 'mcp', name, serverId: 'srv', serverName: 'actions' },
});

const message = (id: string, content: NonNullable<Message['content']>, calls: TrueForgeApi.ToolCall[]): Event => ({
  type: 'model.message',
  id,
  threadId: 'th',
  createdAt: AT,
  content,
  toolCalls: calls,
});

const approval = (id: string, refs: { id: string; sourceEventId: string }[]): TrueForgeApi.ToolApprovalRequiredEvent => ({
  type: 'tool.approval_required',
  id,
  threadId: 'th',
  createdAt: AT,
  toolCalls: refs,
});

const index = (...events: Event[]): EventIndex => {
  const events_ = new EventIndex();
  for (const e of events) events_.add(e);
  return events_;
};

describe('correlate', () => {
  it('walks approval_required back to the model.message and rebuilds the line from the call', () => {
    // The adapter dropped the line from the text (T051); the raw split fields are the arguments.
    const call = toolCall('call-1', 'bulk_refund', ARGS);
    const events = index(message('m1', '', [call]), approval('a1', [{ id: 'call-1', sourceEventId: 'm1' }]));
    expect(correlate(events.last('tool.approval_required')!, events)).toEqual({
      approval_id: 'a1',
      tool_call_id: 'call-1',
      tool_name: 'bulk_refund',
      content: LINE,
    });
  });

  it('keeps the fields as the adapter split them: unparsed, and absent when the model left them out', () => {
    const call = toolCall('call-1', 'issue_payout', '{"criteria":"payout_eligible=true","declared_count":"many"}');
    const content: NonNullable<Message['content']> = [{ type: 'text', text: 'Proposing:' }];
    const events = index(message('m1', content, [call]), approval('a1', [{ id: 'call-1', sourceEventId: 'm1' }]));
    expect(correlate(approval('a1', [{ id: 'call-1', sourceEventId: 'm1' }]), events).content).toBe(
      '💸payout_eligible=true | many',
    );
  });

  it('picks the referenced message, not the last one', () => {
    const first = message('m1', '', [toolCall('call-1', 'bulk_refund', ARGS)]);
    const later = message('m2', 'thinking aloud', [toolCall('call-2', 'bulk_refund', '{"criteria":"other"}')]);
    const events = index(first, later, approval('a1', [{ id: 'call-1', sourceEventId: 'm1' }]));
    expect(correlate(events.last('tool.approval_required')!, events).content).toBe(LINE);
  });

  it('throws when the approval holds zero or several calls', () => {
    const events = index(message('m1', LINE, [toolCall('call-1', 'bulk_refund', '{}')]));
    expect(() => correlate(approval('a1', []), events)).toThrow('expected one');
    expect(() =>
      correlate(approval('a1', [{ id: 'call-1', sourceEventId: 'm1' }, { id: 'call-2', sourceEventId: 'm1' }]), events),
    ).toThrow('expected one');
  });

  it('throws when the reference does not resolve to a model.message holding that call', () => {
    const events = index(message('m1', LINE, [toolCall('call-1', 'bulk_refund', '{}')]));
    expect(() => correlate(approval('a1', [{ id: 'call-1', sourceEventId: 'missing' }]), events)).toThrow('no event missing');
    expect(() => correlate(approval('a1', [{ id: 'call-9', sourceEventId: 'm1' }]), events)).toThrow('no tool call call-9');
    const notMessage = approval('a0', [{ id: 'x', sourceEventId: 'm1' }]);
    const events2 = index(notMessage, approval('a1', [{ id: 'call-1', sourceEventId: 'a0' }]));
    expect(() => correlate(events2.last('tool.approval_required')!, events2)).toThrow('expected model.message');
  });
});

describe('correlate against a folded stream', () => {
  it('finds the call the adapter synthesized after the text deltas', () => {
    const events = index(
      { type: 'model.message', id: 'm1', threadId: 'th', createdAt: AT },
      { type: 'model.message.delta', id: 'm1', threadId: 'th', content: '', finishReason: 'stop' },
      {
        type: 'model.message.delta',
        id: 'm1',
        threadId: 'th',
        toolCalls: [{ index: 0, ...toolCall('call_1', 'bulk_refund', ARGS) }],
        finishReason: 'tool_calls',
      },
      approval('a1', [{ id: 'call_1', sourceEventId: 'm1' }]),
    );
    const held = correlate(approval('a1', [{ id: 'call_1', sourceEventId: 'm1' }]), events);
    expect(held).toEqual({ approval_id: 'a1', tool_call_id: 'call_1', tool_name: 'bulk_refund', content: LINE });
  });
});
