import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/model/config.ts';

/**
 * Credential values chosen to share no substring with anything the config legitimately
 * prints — key names, URLs, model ids — so any fragment of one found in an output is a
 * real leak and not a coincidence.
 */
const creds = {
  OPENAI_API_KEY: 'Vt3Nk8Rz5Qw1Ym7Bd4Gs9Lp2Hj6Fx0',
} satisfies NodeJS.ProcessEnv;

const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ ...creds, ...extra });

/** The shortest run of credential characters an output may not contain. */
const FRAGMENT_MIN = 4;

/**
 * FR-023 forbids a credential value in an output "not even truncated", so asserting on the
 * whole value is too weak: a redaction that kept a prefix or a suffix would pass it. Assert
 * instead on every fragment of `FRAGMENT_MIN` characters or more, taken from both ends —
 * the two shapes a truncation actually takes.
 */
function expectNoCredentialFragment(output: string): void {
  for (const value of Object.values(creds)) {
    for (let n = FRAGMENT_MIN; n <= value.length; n += 1) {
      expect(output).not.toContain(value.slice(0, n));
      expect(output).not.toContain(value.slice(value.length - n));
    }
  }
}

describe('loadConfig defaults (data-model §12)', () => {
  it('applies every documented default when only the credentials are set', () => {
    const c = loadConfig(env());
    expect({ ...c, credentials: undefined }).toEqual({
      trueforge_base_url: 'http://localhost:8790',
      target_agent_name: 'ops-support-agent',
      evaluator_agent_name: 'cross-exam-evaluator',
      target_model: 'openai/gpt-5-6-luna',
      evaluator_model: 'openai/gpt-5-6-terra',
      escalation_threshold_usd: 250000,
      measurement_timeout_ms: 20000,
      evaluator_retries: 3,
      case_budget_ms: 600000,
      action_server_url: 'http://localhost:8801',
      measure_server_url: 'http://localhost:8802',
      replica_path: 'fixtures/replica.json',
      grammar_registry_path: null,
      credentials: undefined,
    });
  });

  it('lets the environment override a string, a number and the registry path', () => {
    const c = loadConfig(
      env({
        TARGET_AGENT_NAME: 'some-other-agent',
        CROSSEXAM_EVALUATOR_RETRIES: '5',
        CROSSEXAM_GRAMMAR_REGISTRY_PATH: 'packages/core/src/grammar/registry.json',
      }),
    );
    expect(c.target_agent_name).toBe('some-other-agent');
    expect(c.evaluator_retries).toBe(5);
    expect(c.grammar_registry_path).toBe('packages/core/src/grammar/registry.json');
  });

  it('treats an empty variable as unset, so an empty registry path leaves the adapter inert', () => {
    const c = loadConfig(env({ CROSSEXAM_GRAMMAR_REGISTRY_PATH: '', TARGET_MODEL: '' }));
    expect(c.grammar_registry_path).toBeNull();
    expect(c.target_model).toBe('openai/gpt-5-6-luna');
  });
});

describe('loadConfig validation', () => {
  it.each(['OPENAI_API_KEY'] as const)(
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

  it('rejects one name for both agents', () => {
    const same = env({ TARGET_AGENT_NAME: 'one-agent', EVALUATOR_AGENT_NAME: 'one-agent' });
    expect(() => loadConfig(same)).toThrow('TARGET_AGENT_NAME and EVALUATOR_AGENT_NAME must differ');
    expect(() => loadConfig(env({ EVALUATOR_AGENT_NAME: 'ops-support-agent' }))).toThrow('must differ');
  });
});

describe('loadConfig never echoes a credential, truncated or whole (FR-023, SC-010)', () => {
  it('leaves no credential fragment in JSON.stringify or util.inspect', () => {
    const c = loadConfig(env());
    expectNoCredentialFragment(JSON.stringify(c));
    expectNoCredentialFragment(inspect(c, { depth: null }));
    expect(JSON.parse(JSON.stringify(c.credentials))).toEqual({
      OPENAI_API_KEY: '[redacted]',
    });
  });

  it('catches a truncated leak that a whole-value assertion would let through', () => {
    const truncated = `token=${creds.OPENAI_API_KEY.slice(0, 8)}...`;
    // The naive check passes — this is exactly the hole the fragment check closes.
    expect(truncated).not.toContain(creds.OPENAI_API_KEY);
    expect(() => expectNoCredentialFragment(truncated)).toThrow();
  });

  it('still hands the real value to the code that needs it', () => {
    const c = loadConfig(env());
    expect(c.credentials.OPENAI_API_KEY).toBe(creds.OPENAI_API_KEY);
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
    // A credential pasted into the wrong variable must not come back in the message.
    const bad = thrown(() => loadConfig(env({ CROSSEXAM_CASE_BUDGET_MS: creds.OPENAI_API_KEY })));
    expect(bad).toContain('CROSSEXAM_CASE_BUDGET_MS');
    expectNoCredentialFragment(bad);

    const missing = thrown(() => loadConfig({ CROSSEXAM_CASE_BUDGET_MS: creds.OPENAI_API_KEY }));
    expect(missing).toContain('OPENAI_API_KEY');
    expectNoCredentialFragment(missing);
  });
});
