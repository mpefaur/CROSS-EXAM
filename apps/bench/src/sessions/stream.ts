/**
 * SSE turn consumer — T024.
 *
 * `tool.approval_required` carries only `{id, sourceEventId}` and a tool result carries only
 * `toolCallId`; the tool name, the text and the arguments live on earlier events (research
 * §A). So every event of a turn is kept and indexed by `id`, and a later event can reach the
 * one it references. The correlation walk itself is T025.
 */

import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

type TurnStreamingEvent = TrueForgeApi.TurnStreamingEvent;

type EventOf<T extends TurnStreamingEvent['type']> = Extract<TurnStreamingEvent, { type: T }>;

export class EventIndex {
  readonly events: TurnStreamingEvent[] = [];
  private readonly byId = new Map<string, TurnStreamingEvent>();

  add(event: TurnStreamingEvent): void {
    this.events.push(event);
    // A delta shares its id with the `model.message` it builds up; only the whole message is indexed.
    if (event.type !== 'model.message.delta') this.byId.set(event.id, event);
  }

  /** The event a harness reference points at; a reference the harness emitted always resolves. */
  get(id: string): TurnStreamingEvent {
    const event = this.byId.get(id);
    if (event === undefined) throw new Error(`no event ${id} in this turn`);
    return event;
  }

  /** The last event of `type` in arrival order, or `null` when the turn had none. */
  last<T extends TurnStreamingEvent['type']>(type: T): EventOf<T> | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event?.type === type) return event as EventOf<T>;
    }
    return null;
  }
}

export interface TurnRecord {
  events: EventIndex;
  done: TrueForgeApi.TurnDoneEvent;
}

/** Drain one turn's stream into an index; resolves on `turn.done`, rejects if the stream ends without one. */
export async function consumeTurn(
  stream: AsyncIterable<TurnStreamingEvent>,
  onEvent?: (event: TurnStreamingEvent) => void,
): Promise<TurnRecord> {
  const events = new EventIndex();
  for await (const event of stream) {
    events.add(event);
    onEvent?.(event);
    if (event.type === 'turn.done') return { events, done: event };
  }
  throw new Error('turn stream ended without turn.done');
}
