import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

import { consumeTurn, EventIndex } from '../src/sessions/stream.ts';

type Event = TrueForgeApi.TurnStreamingEvent;

const AT = '2026-08-29T00:00:00Z';

const message = (id: string, content: string): Event => ({
  type: 'model.message',
  id,
  threadId: 'th',
  createdAt: AT,
  content,
});

const delta = (id: string, content: string): Event => ({
  type: 'model.message.delta',
  id,
  threadId: 'th',
  content,
});

const approval = (id: string, sourceEventId: string): Event => ({
  type: 'tool.approval_required',
  id,
  threadId: 'th',
  createdAt: AT,
  toolCalls: [{ id: `call-${sourceEventId}`, sourceEventId }],
});

const done = (id: string): Event => ({
  type: 'turn.done',
  id,
  threadId: 'th',
  createdAt: AT,
  state: { status: 'done', completedAt: AT, output: null, requiredActions: [] },
});

async function* stream(events: Event[]): AsyncGenerator<Event> {
  for (const event of events) yield event;
}

describe('EventIndex', () => {
  it('keeps arrival order and resolves a harness reference by id', () => {
    const index = new EventIndex();
    const events = [message('m1', 'first'), approval('a1', 'm1'), message('m2', 'second')];
    for (const event of events) index.add(event);

    expect(index.events).toEqual(events);
    const held = index.get('a1');
    expect(held.type).toBe('tool.approval_required');
    if (held.type !== 'tool.approval_required') throw new Error('unreachable');
    expect(index.get(held.toolCalls[0]!.sourceEventId)).toBe(events[0]);
  });

  it('indexes the message header once; a delta that shares its id folds into it', () => {
    const index = new EventIndex();
    const header = message('m1', 'par');
    index.add(header);
    index.add(delta('m1', 'tial'));
    expect(index.get('m1')).toBe(header);
    expect(header.content).toBe('partial');
    expect(index.events).toHaveLength(2);
  });

  it('throws on an id the turn never emitted', () => {
    expect(() => new EventIndex().get('ghost')).toThrow('no event ghost in this turn');
  });

  it('returns the last event of a type, narrowed, or null', () => {
    const index = new EventIndex();
    index.add(message('m1', 'first'));
    index.add(message('m2', 'second'));
    expect(index.last('model.message')?.content).toBe('second');
    expect(index.last('turn.done')).toBeNull();
  });
});

describe('consumeTurn', () => {
  it('resolves on turn.done with every event indexed and reported in order', async () => {
    const seen: string[] = [];
    const record = await consumeTurn(
      stream([message('m1', 'hi'), delta('m1', 'hi'), approval('a1', 'm1'), done('d1')]),
      (event) => seen.push(event.type),
    );
    expect(seen).toEqual(['model.message', 'model.message.delta', 'tool.approval_required', 'turn.done']);
    expect(record.done.id).toBe('d1');
    expect(record.events.events).toHaveLength(4);
    expect(record.events.get('a1').type).toBe('tool.approval_required');
  });

  it('stops at the first turn.done', async () => {
    const record = await consumeTurn(stream([done('d1'), done('d2')]));
    expect(record.done.id).toBe('d1');
    expect(record.events.events).toHaveLength(1);
  });

  it('rejects when the stream ends without turn.done', async () => {
    await expect(consumeTurn(stream([message('m1', 'hi')]))).rejects.toThrow(
      'turn stream ended without turn.done',
    );
  });
});

describe('EventIndex folds deltas into the streamed header', () => {
  const header = (): Event => ({ type: 'model.message', id: 'm1', threadId: 'th', createdAt: AT });
  const info = { type: 'mcp', name: 'bulk_refund', serverId: 'srv', serverName: 'actions' } as const;

  it('appends text, starts a call on its name and appends its arguments, keeps the last finish reason', () => {
    const index = new EventIndex();
    index.add(header());
    index.add({ type: 'model.message.delta', id: 'm1', threadId: 'th', content: '🧾status=' });
    index.add({ type: 'model.message.delta', id: 'm1', threadId: 'th', content: 'disputed | 7 | 840.00', finishReason: 'stop' });
    index.add({
      type: 'model.message.delta',
      id: 'm1',
      threadId: 'th',
      toolCalls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'bulk_refund', arguments: '{"a":' }, toolInfo: info }],
    });
    index.add({ type: 'model.message.delta', id: 'm1', threadId: 'th', toolCalls: [{ index: 0, function: { arguments: '1}' } }], finishReason: 'tool_calls' });
    const message = index.get('m1');
    expect(message.type).toBe('model.message');
    if (message.type !== 'model.message') return;
    expect(message.content).toBe('🧾status=disputed | 7 | 840.00');
    expect(message.finishReason).toBe('tool_calls');
    expect(message.toolCalls).toEqual([{ id: 'call_1', type: 'function', function: { name: 'bulk_refund', arguments: '{"a":1}' }, toolInfo: info }]);
  });

  it('throws on a delta before its header, and on arguments before a name', () => {
    const index = new EventIndex();
    expect(() => index.add({ type: 'model.message.delta', id: 'm9', threadId: 'th', content: 'x' })).toThrow('before its model.message');
    index.add(header());
    expect(() =>
      index.add({ type: 'model.message.delta', id: 'm1', threadId: 'th', toolCalls: [{ index: 0, function: { arguments: '{' } }] }),
    ).toThrow('before its name');
  });
});
