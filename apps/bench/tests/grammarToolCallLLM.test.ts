import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

// The adapter ships inside the pnpm patch of the harness (research D-14), so the test
// reaches it through the installed package rather than a workspace source file.
import {
  describeGrammarRegistry,
  GrammarToolCallLLM,
  loadGrammarRegistry,
  parseGrammarRegistry,
  stripGrammarFromRequest,
  synthesizeToolCall,
} from '../node_modules/@truefoundry/trueforge/dist/grammarToolCallLLM.js';

// The one registry file: the decoders import it, the harness reads it by path (D-14).
const REGISTRY_PATH = fileURLToPath(
  new URL('../../../packages/core/src/grammar/registry.json', import.meta.url),
);

const registry = () => {
  const r = loadGrammarRegistry(REGISTRY_PATH);
  if (r === null) throw new Error('registry must load');
  return r;
};

describe('loadGrammarRegistry', () => {
  it('is inert when the variable is unset or empty', () => {
    expect(loadGrammarRegistry(undefined)).toBeNull();
    expect(loadGrammarRegistry('')).toBeNull();
    expect(describeGrammarRegistry(null)).toBe(
      'Grammar tool-call adapter: inert (CROSSEXAM_GRAMMAR_REGISTRY_PATH unset)',
    );
  });

  it('reads the real registry file: one tool per emoji, field names in order, non-tool kinds skipped', () => {
    const r = registry();
    expect(r.tools.get('🧾')).toEqual({
      name: 'bulk_refund',
      args: ['criteria', 'declared_count', 'declared_value'],
    });
    expect(r.tools.get('📏')).toEqual({ name: 'measure', args: ['criteria', 'table'] });
    expect(r.tools.has('🧮')).toBe(false);
    expect(r.tools.has('✅')).toBe(false);
    expect([...r.names]).toEqual(['bulk_refund', 'issue_payout', 'close_account', 'measure']);
    expect(describeGrammarRegistry(r)).toBe(
      'Grammar tool-call adapter: 4 tool keys, tools=[bulk_refund, issue_payout, close_account, measure]',
    );
  });

  it('names the variable and the path, never the file contents, on a bad file (FR-023)', () => {
    expect(() => loadGrammarRegistry('/nonexistent/registry.json')).toThrow(
      'CROSSEXAM_GRAMMAR_REGISTRY_PATH: cannot read /nonexistent/registry.json',
    );
    const value = 'Xq7Zm2Kv9Rb4Tn6Wy8Ld3Hf5Jc1Pg0';
    const cases: Array<[string, RegExp]> = [
      [`{${value}`, /^CROSSEXAM_GRAMMAR_REGISTRY_PATH: the registry file is not valid JSON$/],
      ['null', /the registry must be a JSON object/],
      [`["${value}"]`, /the registry must be a JSON object/],
      [`{"🧾":"${value}"}`, /every entry must be an object with a "kind"/],
      [`{"🧾":{"kind":"tool","tool":"${value}"}}`, /a tool entry needs a "tool" name and string "fields"/],
      [`{"🧾":{"kind":"tool","tool":"${value}","fields":[3]}}`, /a tool entry needs a "tool" name and string "fields"/],
      [`{"${value}":{"kind":"tool","tool":"bulk_refund","fields":[]}}`, /every key must be one codepoint/],
      ['{}', /no tool entry/],
      [`{"🧮":{"kind":"measurement","fields":["a"]}}`, /no tool entry/],
    ];
    for (const [raw, message] of cases) {
      let thrown: unknown;
      try {
        parseGrammarRegistry(raw);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(message);
      expect((thrown as Error).message).not.toContain(value.slice(0, 4));
    }
  });
});

describe('stripGrammarFromRequest (inbound)', () => {
  const body = {
    stream: true,
    tools: [
      { type: 'function', function: { name: 'bulk_refund', parameters: {} } },
      { type: 'function', function: { name: 'create_sub_agent', parameters: {} } },
    ],
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'refund disputed' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_g',
            type: 'function',
            function: {
              name: 'bulk_refund',
              arguments: '{"criteria":"status=disputed","declared_count":"7","declared_value":"840.00"}',
            },
          },
          { id: 'call_n', type: 'function', function: { name: 'create_sub_agent', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_g', content: '{"error":"User denied tool call: too many"}' },
      { role: 'tool', tool_call_id: 'call_n', content: 'ok' },
    ],
  };

  it('removes grammar tool schemas and keeps native ones', () => {
    const out = stripGrammarFromRequest(body, registry());
    expect(out.tools?.map((t) => (t as { function: { name: string } }).function.name)).toEqual([
      'create_sub_agent',
    ]);
  });

  it('drops grammar tool_calls, writes their line back into the text, and turns their results into user text', () => {
    const out = stripGrammarFromRequest(body, registry());
    const [, , assistant, denied, native] = out.messages as Array<Record<string, unknown>>;
    expect((assistant?.tool_calls as Array<{ id: string }>).map((c) => c.id)).toEqual(['call_n']);
    expect(assistant?.content).toBe('🧾status=disputed | 7 | 840.00');
    expect(denied).toEqual({ role: 'user', content: '{"error":"User denied tool call: too many"}' });
    expect(native?.role).toBe('tool');
  });

  it('omits the tools key when every tool was a grammar tool and does not mutate the input', () => {
    const only = stripGrammarFromRequest({ messages: [], tools: [body.tools[0]] }, registry());
    expect('tools' in only).toBe(false);
    expect((body.messages[3] as { role: string }).role).toBe('tool');
    expect(body.tools).toHaveLength(2);
  });
});

describe('synthesizeToolCall (outbound)', () => {
  it('maps the tool line to one call, fields by position, trimmed, one U+FE0F dropped', () => {
    const call = synthesizeToolCall(
      { content: 'Measuring:\n📏️status=disputed AND refunded=false |charges\n⛔ignored' },
      registry(),
    );
    expect(call?.function.name).toBe('measure');
    expect(JSON.parse(call?.function.arguments ?? '')).toEqual({
      criteria: 'status=disputed AND refunded=false',
      table: 'charges',
    });
    expect(call?.id).toMatch(/^call_[0-9a-f]{32}$/);
    expect(call?.type).toBe('function');
  });

  it('names the tool from the emoji alone; spacing around | is free', () => {
    const spaced = synthesizeToolCall({ content: '💸payout_eligible=true | 342 | 418220.00' }, registry());
    const tight = synthesizeToolCall({ content: '💸payout_eligible=true|342|418220.00' }, registry());
    expect(spaced?.function.name).toBe('issue_payout');
    expect(spaced?.function.arguments).toBe(tight?.function.arguments);
    expect(JSON.parse(spaced?.function.arguments ?? '')).toEqual({
      criteria: 'payout_eligible=true',
      declared_count: '342',
      declared_value: '418220.00',
    });
  });

  it('validates nothing: a missing field is an absent argument, an extra field is dropped', () => {
    const short = synthesizeToolCall({ content: '🔒customer_id=cus_1 | 1' }, registry());
    expect(JSON.parse(short?.function.arguments ?? '')).toEqual({ criteria: 'customer_id=cus_1', declared_count: '1' });
    const long = synthesizeToolCall({ content: '🧾a=1 | 1 | 1.00 | extra' }, registry());
    expect(JSON.parse(long?.function.arguments ?? '')).toEqual({ criteria: 'a=1', declared_count: '1', declared_value: '1.00' });
    expect(JSON.parse(synthesizeToolCall({ content: '🧾' }, registry())?.function.arguments ?? '')).toEqual({});
  });

  it('trims an indented line, as the Bench decoders do (wire-grammar obligation 1)', () => {
    const call = synthesizeToolCall({ content: 'Proposal:\n    \t🧾status=disputed | 7 | 840.00  ' }, registry());
    expect(call?.function.name).toBe('bulk_refund');
    expect(JSON.parse(call?.function.arguments ?? '')).toEqual({
      criteria: 'status=disputed',
      declared_count: '7',
      declared_value: '840.00',
    });
  });

  it('reads text parts when content is an array', () => {
    const call = synthesizeToolCall({ content: [{ type: 'text', text: '🧾status=disputed | 7 | 840.00' }] }, registry());
    expect(call?.function.name).toBe('bulk_refund');
  });

  it('returns null for plain prose, unregistered keys, and when a native tool call is present (R-14a)', () => {
    expect(synthesizeToolCall({ content: 'plain prose' }, registry())).toBeNull();
    expect(synthesizeToolCall({ content: '🧮1204 | 96310.00 | 611' }, registry())).toBeNull();
    expect(synthesizeToolCall({ content: '🧾a=1 | 1 | 1.00', tool_calls: [{ id: 'a' }] }, registry())).toBeNull();
  });
});

describe('GrammarToolCallLLM', () => {
  const finalMessage = { role: 'assistant', content: '🧾status=disputed | 7 | 840.00' };
  const inner = {
    async *create(body: { tools?: unknown[] }) {
      expect('tools' in body).toBe(false);
      yield { choices: [{ delta: { content: '🧾' } }] };
      yield { choices: [{ delta: { content: 'status=disputed | 7 | 840.00' } }] };
      return { output: finalMessage, usage: {}, finish_reason: 'stop' };
    },
    async createNonStream() {
      return { output: { role: 'assistant', content: 'hi' }, usage: {}, finish_reason: 'stop' };
    },
  };
  // The fixture is a structural double; the harness types are far wider than the test needs.
  const llm = new GrammarToolCallLLM(inner as never, registry());

  it('holds back the grammar line, strips it from the message, and yields the call as the last chunk', async () => {
    const gen = llm.create({ messages: [], tools: [{ type: 'function', function: { name: 'bulk_refund' } }] } as never);
    const chunks: unknown[] = [];
    let r = await gen.next();
    while (!r.done) {
      chunks.push(r.value);
      r = await gen.next();
    }
    expect(chunks).toHaveLength(1);
    expect(r.value.finish_reason).toBe('tool_calls');
    const call = r.value.output.tool_calls?.[0];
    expect(call?.function.name).toBe('bulk_refund');
    expect(call?.function.arguments).toBe('{"criteria":"status=disputed","declared_count":"7","declared_value":"840.00"}');
    expect(r.value.output.content).toBe('');
    // The SSE deltas come from the chunks, so the synthesized call goes out as the last one too.
    const last = chunks[0] as { choices: { delta: { tool_calls: unknown[] }; finish_reason: string }[] };
    expect(last.choices[0]?.finish_reason).toBe('tool_calls');
    expect(last.choices[0]?.delta.tool_calls).toEqual([{ index: 0, ...call }]);
  });

  it('yields no extra chunk when the message has no grammar line', async () => {
    const prose = {
      async *create() {
        yield { choices: [{ delta: { content: 'hi' } }] };
        return { output: { role: 'assistant', content: 'hi' }, usage: {}, finish_reason: 'stop' };
      },
      createNonStream: inner.createNonStream,
    };
    const gen = new GrammarToolCallLLM(prose as never, registry()).create({ messages: [] } as never);
    let n = 0;
    let r = await gen.next();
    while (!r.done) {
      n++;
      r = await gen.next();
    }
    expect(n).toBe(1);
    expect(r.value.finish_reason).toBe('stop');
  });

  /** Drain `create` into its chunks and its return value. */
  async function drain(llm: GrammarToolCallLLM): Promise<{ contents: unknown[]; result: { output: { content?: unknown } } }> {
    const gen = llm.create({ messages: [] } as never);
    const contents: unknown[] = [];
    let r = await gen.next();
    while (!r.done) {
      contents.push((r.value as { choices: { delta: { content?: unknown } }[] }).choices[0]?.delta.content);
      r = await gen.next();
    }
    return { contents, result: r.value as never };
  }

  it('drops the grammar line from the stream once its newline confirms it, and streams the rest', async () => {
    const twoLines = {
      async *create() {
        yield { choices: [{ delta: { content: '🧾status=disputed | 7 | 840.00' } }] };
        yield { choices: [{ delta: { content: '\nDone.' } }] };
        return { output: { role: 'assistant', content: '🧾status=disputed | 7 | 840.00\nDone.' }, usage: {}, finish_reason: 'stop' };
      },
      createNonStream: inner.createNonStream,
    };
    const { contents, result } = await drain(new GrammarToolCallLLM(twoLines as never, registry()));
    expect(contents).toEqual(['Done.', undefined]);
    expect(result.output.content).toBe('Done.');
  });

  it('holds a grammar line that follows prose, so it never streams (Qodo #51 finding 6)', async () => {
    const prosed = {
      async *create() {
        yield { choices: [{ delta: { content: 'Proposing:\n🧾status' } }] };
        yield { choices: [{ delta: { content: '=disputed | 7 | 840.00' } }] };
        return { output: { role: 'assistant', content: 'Proposing:\n🧾status=disputed | 7 | 840.00' }, usage: {}, finish_reason: 'stop' };
      },
      createNonStream: inner.createNonStream,
    };
    const { contents, result } = await drain(new GrammarToolCallLLM(prosed as never, registry()));
    expect(contents).toEqual(['Proposing:\n', undefined]);
    expect(result.output.content).toBe('Proposing:');
  });

  it('releases a held line when no call is synthesised after all', async () => {
    const native = {
      async *create() {
        yield { choices: [{ delta: { content: '🧾status=disputed | 7 | 840.00' } }] };
        return {
          output: { role: 'assistant', content: '🧾status=disputed | 7 | 840.00', tool_calls: [{ id: 'n' }] },
          usage: {},
          finish_reason: 'tool_calls',
        };
      },
      createNonStream: inner.createNonStream,
    };
    const { contents, result } = await drain(new GrammarToolCallLLM(native as never, registry()));
    expect(contents).toEqual(['🧾status=disputed | 7 | 840.00']);
    expect(result.output.content).toBe('🧾status=disputed | 7 | 840.00');
  });

  it('leaves a message without a grammar line untouched', async () => {
    const r = await llm.createNonStream({ messages: [] } as never);
    expect(r.finish_reason).toBe('stop');
    expect(r.output.tool_calls).toBeUndefined();
  });
});
