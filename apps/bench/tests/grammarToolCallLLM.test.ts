import { describe, expect, it } from 'vitest';

// The adapter ships inside the pnpm patch of the harness (research D-14), so the test
// reaches it through the installed package rather than a workspace source file.
import {
  describeGrammarRegistry,
  GrammarToolCallLLM,
  loadGrammarRegistry,
  stripGrammarFromRequest,
  synthesizeToolCall,
} from '../node_modules/@truefoundry/trueforge/dist/grammarToolCallLLM.js';

const RAW =
  '{"$tools":["bulk_refund","issue_payout","close_account","measure"],"🧾":"$tool","🔍":"criteria","🔢":"declared_count","💵":"declared_value","🗂":"table"}';

const registry = () => {
  const r = loadGrammarRegistry(RAW);
  if (r === null) throw new Error('registry must load');
  return r;
};

describe('loadGrammarRegistry', () => {
  it('is inert when the variable is unset or empty', () => {
    expect(loadGrammarRegistry(undefined)).toBeNull();
    expect(loadGrammarRegistry('')).toBeNull();
    expect(describeGrammarRegistry(null)).toBe(
      'Grammar tool-call adapter: inert (CROSSEXAM_GRAMMAR_REGISTRY unset)',
    );
  });

  it('reads the registry and describes it by key count and $tools', () => {
    const r = registry();
    expect([...r.tools]).toEqual(['bulk_refund', 'issue_payout', 'close_account', 'measure']);
    expect(r.keys.get('🧾')).toBe('$tool');
    expect(r.keys.get('🗂')).toBe('table');
    expect(describeGrammarRegistry(r)).toBe(
      'Grammar tool-call adapter: 5 keys, $tools=[bulk_refund, issue_payout, close_account, measure]',
    );
  });

  it('rejects malformed input by naming the variable, never the value (FR-023)', () => {
    const value = 'Xq7Zm2Kv9Rb4Tn6Wy8Ld3Hf5Jc1Pg0';
    const cases: Array<[string, RegExp]> = [
      [`{${value}`, /^CROSSEXAM_GRAMMAR_REGISTRY is not valid JSON$/],
      ['null', /^CROSSEXAM_GRAMMAR_REGISTRY must be a JSON object$/],
      [`["${value}"]`, /^CROSSEXAM_GRAMMAR_REGISTRY must be a JSON object$/],
      [`{"🧾":"$tool","🔍":"${value}"}`, /"\$tools" must be an array/],
      [`{"$tools":[],"🔍":"${value}"}`, /no key is mapped to "\$tool"/],
      [`{"$tools":[],"${value}":"$tool"}`, /every key must be one codepoint/],
    ];
    for (const [raw, message] of cases) {
      let thrown: unknown;
      try {
        loadGrammarRegistry(raw);
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
        content: '🧾bulk_refund\n🔍status=disputed\n🔢7\n💵840.00',
        tool_calls: [
          { id: 'call_g', type: 'function', function: { name: 'bulk_refund', arguments: '{}' } },
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

  it('drops grammar tool_calls and turns their results into user text; native ones untouched', () => {
    const out = stripGrammarFromRequest(body, registry());
    const [, , assistant, denied, native] = out.messages as Array<Record<string, unknown>>;
    expect((assistant?.tool_calls as Array<{ id: string }>).map((c) => c.id)).toEqual(['call_n']);
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
  it('maps registered lines to one tool call, drops one U+FE0F, ignores other lines', () => {
    const call = synthesizeToolCall(
      { content: 'Proposing:\n🧾measure\n🔍status=disputed AND refunded=false\n🗂️charges\n⚖ignored' },
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

  it('reads text parts when content is an array', () => {
    const call = synthesizeToolCall({ content: [{ type: 'text', text: '🧾bulk_refund' }] }, registry());
    expect(call?.function.name).toBe('bulk_refund');
  });

  it('returns null for plain prose and when a native tool call is present (R-14a)', () => {
    expect(synthesizeToolCall({ content: 'plain prose' }, registry())).toBeNull();
    expect(synthesizeToolCall({ content: '🧾bulk_refund', tool_calls: [{ id: 'a' }] }, registry())).toBeNull();
  });
});

describe('GrammarToolCallLLM', () => {
  const finalMessage = { role: 'assistant', content: '🧾bulk_refund\n🔢7' };
  const inner = {
    async *create(body: { tools?: unknown[] }) {
      expect('tools' in body).toBe(false);
      yield { choices: [{ delta: { content: '🧾' } }] };
      yield { choices: [{ delta: { content: 'bulk_refund' } }] };
      return { output: finalMessage, usage: {}, finish_reason: 'stop' };
    },
    async createNonStream() {
      return { output: { role: 'assistant', content: 'hi' }, usage: {}, finish_reason: 'stop' };
    },
  };
  // The fixture is a structural double; the harness types are far wider than the test needs.
  const llm = new GrammarToolCallLLM(inner as never, registry());

  it('re-yields every chunk and rewrites only the final message', async () => {
    const gen = llm.create({ messages: [], tools: [{ type: 'function', function: { name: 'bulk_refund' } }] } as never);
    const chunks: unknown[] = [];
    let r = await gen.next();
    while (!r.done) {
      chunks.push(r.value);
      r = await gen.next();
    }
    expect(chunks).toHaveLength(2);
    expect(r.value.finish_reason).toBe('tool_calls');
    expect(r.value.output.tool_calls?.[0]?.function.name).toBe('bulk_refund');
    expect(r.value.output.content).toBe('🧾bulk_refund\n🔢7');
  });

  it('leaves a message without grammar lines untouched', async () => {
    const r = await llm.createNonStream({ messages: [] } as never);
    expect(r.finish_reason).toBe('stop');
    expect(r.output.tool_calls).toBeUndefined();
  });
});
