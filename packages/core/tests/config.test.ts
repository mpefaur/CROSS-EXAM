import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/model/config.ts';

/** The three required credentials, with values distinctive enough to grep an output for. */
const SECRET = 'SECRET-VALUE-MUST-NOT-APPEAR';
const creds = {
  DAYTONA_API_KEY: `daytona-${SECRET}`,
  OPENAI_API_KEY: `openai-${SECRET}`,
  ANTHROPIC_API_KEY: `anthropic-${SECRET}`,
} satisfies NodeJS.ProcessEnv;

const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ ...creds, ...extra });

describe('loadConfig defaults (data-model §12)', () => {
  it('applies every documented default when only the credentials are set', () => {
    const c = loadConfig(env());
    expect({ ...c, credentials: undefined }).toEqual({
      trueforge_base_url: 'http://localhost:8790',
      target_agent_name: 'ops-support-agent',
      evaluator_agent_name: 'cross-exam-evaluator',
      target_model: 'openai/gpt-5.4-mini',
      evaluator_model: 'anthropic/claude-sonnet-4-6',
      escalation_threshold_usd: 250000,
      measurement_timeout_ms: 20000,
      evaluator_retries: 3,
      case_budget_ms: 600000,
      action_server_url: 'http://localhost:8801',
      measure_server_url: 'http://localhost:8802',
      replica_path: 'fixtures/replica.json',
      grammar_registry: null,
      credentials: undefined,
    });
  });

  it('lets the environment override a string, a number and the registry', () => {
    const c = loadConfig(
      env({
        TARGET_AGENT_NAME: 'some-other-agent',
        CROSSEXAM_EVALUATOR_RETRIES: '5',
        CROSSEXAM_GRAMMAR_REGISTRY: '{"🧾":"$tool"}',
      }),
    );
    expect(c.target_agent_name).toBe('some-other-agent');
    expect(c.evaluator_retries).toBe(5);
    expect(c.grammar_registry).toBe('{"🧾":"$tool"}');
  });

  it('treats an empty variable as unset, so an empty registry leaves the adapter inert', () => {
    const c = loadConfig(env({ CROSSEXAM_GRAMMAR_REGISTRY: '', TARGET_MODEL: '' }));
    expect(c.grammar_registry).toBeNull();
    expect(c.target_model).toBe('openai/gpt-5.4-mini');
  });
});

describe('loadConfig validation', () => {
  it.each(['DAYTONA_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] as const)(
    'throws when %s is missing, and again when it is empty',
    (name) => {
      const without = env();
      delete without[name];
      expect(() => loadConfig(without)).toThrow(`${name} is required`);
      expect(() => loadConfig(env({ [name]: '' }))).toThrow(`${name} is required`);
    },
  );

  it.each([
    ['CROSSEXAM_ESCALATION_THRESHOLD_USD', 'not-a-number'],
    ['CROSSEXAM_MEASUREMENT_TIMEOUT_MS', '0'],
    ['CROSSEXAM_EVALUATOR_RETRIES', '-1'],
    ['CROSSEXAM_CASE_BUDGET_MS', '1.5'],
  ])('rejects %s = %s', (name, value) => {
    expect(() => loadConfig(env({ [name]: value }))).toThrow(`${name} must be a positive integer`);
  });
});

describe('loadConfig never echoes a credential (FR-023, SC-010)', () => {
  it('redacts the credentials under JSON.stringify and util.inspect', () => {
    const c = loadConfig(env());
    expect(JSON.stringify(c)).not.toContain(SECRET);
    expect(inspect(c, { depth: null })).not.toContain(SECRET);
    expect(JSON.parse(JSON.stringify(c.credentials))).toEqual({
      DAYTONA_API_KEY: '[redacted]',
      OPENAI_API_KEY: '[redacted]',
      ANTHROPIC_API_KEY: '[redacted]',
    });
  });

  it('still hands the real value to the code that needs it', () => {
    const c = loadConfig(env());
    expect(c.credentials.OPENAI_API_KEY).toBe(creds.OPENAI_API_KEY);
    expect(c.credentials.DAYTONA_API_KEY).toBe(creds.DAYTONA_API_KEY);
    expect(c.credentials.ANTHROPIC_API_KEY).toBe(creds.ANTHROPIC_API_KEY);
  });

  it('names the variable but not its value in a validation error', () => {
    const thrown = (fn: () => unknown): string => {
      try {
        fn();
      } catch (e) {
        return (e as Error).message;
      }
      throw new Error('expected loadConfig to throw');
    };
    const bad = thrown(() => loadConfig(env({ CROSSEXAM_CASE_BUDGET_MS: `oops-${SECRET}` })));
    expect(bad).toContain('CROSSEXAM_CASE_BUDGET_MS');
    expect(bad).not.toContain(SECRET);

    const missing = thrown(() => loadConfig({ OPENAI_API_KEY: `openai-${SECRET}` }));
    expect(missing).toContain('DAYTONA_API_KEY');
    expect(missing).not.toContain(SECRET);
  });
});
