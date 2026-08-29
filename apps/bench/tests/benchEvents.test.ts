import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

import { benchEvents } from '../src/demo.ts';
import { EventIndex } from '../src/sessions/stream.ts';
import { measuringLine } from '../src/trace.ts';

const info = { type: 'mcp', name: 'measure', serverId: 's', serverName: 'measure' } as const;

describe('benchEvents', () => {
  it('announces a measure call that arrives by delta, once', () => {
    const lines: string[] = [];
    const hook = benchEvents(new EventIndex(), [], (line) => void lines.push(line));
    const events: TrueForgeApi.TurnStreamingEvent[] = [
      { type: 'model.message', id: 'm1', threadId: 'th', createdAt: 'x' },
      {
        type: 'model.message.delta',
        id: 'm1',
        threadId: 'th',
        toolCalls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'measure', arguments: '{' }, toolInfo: info }],
      },
      { type: 'model.message.delta', id: 'm1', threadId: 'th', toolCalls: [{ index: 0, function: { arguments: '}' } }], finishReason: 'tool_calls' },
    ];
    for (const event of events) hook(event);
    expect(lines).toEqual([measuringLine()]);
  });
});
