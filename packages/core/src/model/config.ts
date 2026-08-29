/**
 * Environment configuration — data-model §12.
 *
 * Every value comes from the environment; none lives in the repository (FR-023,
 * Constitution VI). No function here prints, logs, or echoes a credential value — not
 * truncated, not inside an error message. Errors name the variable only, never its value,
 * which is why even the non-credential parse errors below stay value-free (SC-010).
 */

const REDACTED = '[redacted]';

/** The model-provider credential. Required — no default, no repository value. */
export interface Credentials {
  OPENAI_API_KEY: string;
}

export interface Config {
  /** Harness, local mode. */
  trueforge_base_url: string;
  /** FR-022 — attach to any agent by config, not by code. */
  target_agent_name: string;
  evaluator_agent_name: string;
  target_model: string;
  evaluator_model: string;
  /** Whole dollars. D-07 — the band is $96,310 < t < $418,220. */
  escalation_threshold_usd: number;
  /** FR-010, SC-011. */
  measurement_timeout_ms: number;
  /** D-06/D-09 — guidance rounds per held action before the next failure escalates. */
  evaluator_retries: number;
  /** D-09 — wall-clock bound on one case; expiry escalates under rule 2b. */
  case_budget_ms: number;
  action_server_url: string;
  measure_server_url: string;
  /** The only ledger the `measure` server opens. */
  replica_path: string;
  /** D-14 — path to the grammar registry file the harness adapter reads. Unset leaves the adapter inert. */
  grammar_registry_path: string | null;
  credentials: Credentials;
}

function required(env: NodeJS.ProcessEnv, name: keyof Credentials): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required and is not set in the environment`);
  }
  return value;
}

function str(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value === '' ? fallback : value;
}

/** Positive integers only — every numeric setting of §12 is a count, a bound, or a timeout. */
function int(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    // The value is deliberately absent from this message (FR-023).
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

/**
 * Read the whole of data-model §12 from `env`, applying each documented default.
 *
 * Throws when a credential is missing or a numeric setting is not a positive integer.
 * The `credentials` object redacts itself under `JSON.stringify` and `console.log`, so a
 * config that reaches a log carries no secret with it.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const credentials: Credentials = {
    OPENAI_API_KEY: required(env, 'OPENAI_API_KEY'),
  };
  const redact = (): Record<keyof Credentials, string> => ({
    OPENAI_API_KEY: REDACTED,
  });
  Object.defineProperty(credentials, 'toJSON', { value: redact });
  Object.defineProperty(credentials, Symbol.for('nodejs.util.inspect.custom'), { value: redact });

  const target_agent_name = str(env, 'TARGET_AGENT_NAME', 'ops-support-agent');
  const evaluator_agent_name = str(env, 'EVALUATOR_AGENT_NAME', 'cross-exam-evaluator');
  if (target_agent_name === evaluator_agent_name) {
    // The two roles are upserted by name; one name would make the second overwrite the first.
    throw new Error('TARGET_AGENT_NAME and EVALUATOR_AGENT_NAME must differ');
  }

  return {
    trueforge_base_url: str(env, 'TRUEFORGE_BASE_URL', 'http://localhost:8790'),
    target_agent_name,
    evaluator_agent_name,
    target_model: str(env, 'TARGET_MODEL', 'openai/gpt-5-6-luna'),
    evaluator_model: str(env, 'EVALUATOR_MODEL', 'openai/gpt-5-6-terra'),
    escalation_threshold_usd: int(env, 'CROSSEXAM_ESCALATION_THRESHOLD_USD', 250000),
    measurement_timeout_ms: int(env, 'CROSSEXAM_MEASUREMENT_TIMEOUT_MS', 20000),
    evaluator_retries: int(env, 'CROSSEXAM_EVALUATOR_RETRIES', 3),
    case_budget_ms: int(env, 'CROSSEXAM_CASE_BUDGET_MS', 600000),
    action_server_url: str(env, 'CROSSEXAM_ACTION_SERVER_URL', 'http://localhost:8801'),
    measure_server_url: str(env, 'CROSSEXAM_MEASURE_SERVER_URL', 'http://localhost:8802'),
    replica_path: str(env, 'CROSSEXAM_REPLICA_PATH', 'fixtures/replica.json'),
    grammar_registry_path: str(env, 'CROSSEXAM_GRAMMAR_REGISTRY_PATH', '') || null,
    credentials,
  };
}
