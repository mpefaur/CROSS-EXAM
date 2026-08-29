import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/model/config.ts';

/**
 * Credential values chosen to share no substring with anything the config legitimately
 * prints — key names, URLs, model ids — so any fragment of one found in an output is a
 * real leak and not a coincidence.
 */
const creds = {
  DAYTONA_API_KEY: 'Xq7Zm2Kv9Rb4Tn6Wy8Ld3Hf5Jc1Pg0',
  OPENAI_API_KEY: 'Vt3Nk8Rz5Qw1Ym7Bd4Gs9Lp2Hj6Fx0',
  ANTHROPIC_API_KEY: 'Cw5Jd2Nq8Xr4Kt7Vb1Zm9Ph3Ls6Gy0',
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
        CROSSEXAM_GRAMMAR_REGISTRY: '{"🧾":["bulk_refund","criteria"]}',
      }),
    );
    expect(c.target_agent_name).toBe('some-other-agent');
    expect(c.evaluator_retries).toBe(5);
    expect(c.grammar_registry).toBe('{"🧾":["bulk_refund","criteria"]}');
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

describe('loadConfig never echoes a credential, truncated or whole (FR-023, SC-010)', () => {
  it('leaves no credential fragment in JSON.stringify or util.inspect', () => {
    const c = loadConfig(env());
    expectNoCredentialFragment(JSON.stringify(c));
    expectNoCredentialFragment(inspect(c, { depth: null }));
    expect(JSON.parse(JSON.stringify(c.credentials))).toEqual({
      DAYTONA_API_KEY: '[redacted]',
      OPENAI_API_KEY: '[redacted]',
      ANTHROPIC_API_KEY: '[redacted]',
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
    // A credential pasted into the wrong variable must not come back in the message.
    const bad = thrown(() => loadConfig(env({ CROSSEXAM_CASE_BUDGET_MS: creds.OPENAI_API_KEY })));
    expect(bad).toContain('CROSSEXAM_CASE_BUDGET_MS');
    expectNoCredentialFragment(bad);

    const missing = thrown(() => loadConfig({ OPENAI_API_KEY: creds.OPENAI_API_KEY }));
    expect(missing).toContain('DAYTONA_API_KEY');
    expectNoCredentialFragment(missing);
  });
});
