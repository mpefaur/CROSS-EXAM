/**
 * Emoji wire grammar — encoder and decoders (FR-024, FR-025).
 *
 * Key registry: `docs/emoji-grammar.md`. Parser obligations:
 * `specs/001-cross-exam-evaluator/contracts/wire-grammar.md`. Nothing here duplicates the
 * registry's rationale; it implements it.
 *
 * The decode is strict and single-pass. Every rejection returns `{ ok: false }` with a
 * reason; there is never a second, looser attempt and no field value is ever inferred
 * (FR-025). No escaping is performed and none is needed — no ledger value contains an
 * emoji, so a key can never appear inside a value (registry § Invariant).
 */

import type {
  EvaluatorVerdict,
  MeasuredTriple,
  ProposedAction,
  Verdict,
} from '../model/case.ts';

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Keys                                                                        */
/* -------------------------------------------------------------------------- */

const ACTION = '\u{1F9FE}'; // 🧾
const CRITERIA = '\u{1F50D}'; // 🔍
const DECLARED_COUNT = '\u{1F522}'; // 🔢
const DECLARED_VALUE = '\u{1F4B5}'; // 💵
const VERDICT = '\u{2696}'; // ⚖
const MEASURED_COUNT = '\u{1F9EE}'; // 🧮
const MEASURED_VALUE = '\u{1F4B0}'; // 💰
const DUPLICATE_COUNT = '\u{267B}'; // ♻
const REASON = '\u{1F4DD}'; // 📝

/**
 * One key set per direction. A key from another direction is an unregistered key here, so
 * obligation 1 ("a verdict key in a proposal ... is a parse failure") needs no extra check.
 * `🗂` (U+1F5C2) is absent from all three on purpose: it belongs to the measurement request,
 * which the harness routes to the `measure` server and no Bench decoder accepts.
 */
const PROPOSAL_KEYS: ReadonlySet<string> = new Set([
  ACTION,
  CRITERIA,
  DECLARED_COUNT,
  DECLARED_VALUE,
]);
const VERDICT_KEYS: ReadonlySet<string> = new Set([
  VERDICT,
  MEASURED_COUNT,
  MEASURED_VALUE,
  DUPLICATE_COUNT,
  REASON,
]);
const MEASUREMENT_KEYS: ReadonlySet<string> = new Set([
  MEASURED_COUNT,
  MEASURED_VALUE,
  DUPLICATE_COUNT,
]);

/** Models add the variation selector to `⚖`, `♻`, `🗂`; every decoder drops one leading one. */
const VARIATION_SELECTOR = '\uFE0F';

/* -------------------------------------------------------------------------- */
/* Line parsing (obligations 1–5)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Split on `\n`, index by key. Line order is irrelevant (obligation 5); an unregistered
 * leading character, a repeated key, or a line with no key is terminal (obligations 2, 3).
 */
function parseLines(
  text: string,
  registered: ReadonlySet<string>,
): DecodeResult<ReadonlyMap<string, string>> {
  const fields = new Map<string, string>();

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;

    // The key is the line's first *codepoint*: most keys are surrogate pairs, so `line[0]`
    // would read half of one. The guard above leaves only non-blank lines, so the array is
    // non-empty — that invariant is stated in the type, since `noUncheckedIndexedAccess` is
    // the only reason a first element would read as `undefined` here.
    const [key] = Array.from(line) as [string, ...string[]];
    if (!registered.has(key)) {
      return { ok: false, error: `unregistered key for this direction: ${JSON.stringify(key)}` };
    }
    if (fields.has(key)) {
      return { ok: false, error: `repeated key: ${key}` };
    }

    let value = line.slice(key.length);
    if (value.startsWith(VARIATION_SELECTOR)) value = value.slice(1);
    // Trailing whitespace only — leading whitespace is part of the value, and quotes are
    // never stripped or interpreted (obligation 4).
    fields.set(key, value.replace(/\s+$/u, ''));
  }

  return { ok: true, value: fields };
}

/* -------------------------------------------------------------------------- */
/* Numbers (obligation 8)                                                      */
/* -------------------------------------------------------------------------- */

/** A bare non-negative integer. `+1`, `-1`, `1.0` and `1 ` are all parse failures. */
function parseInteger(raw: string): number | null {
  return /^\d+$/u.test(raw) ? Number(raw) : null;
}

/**
 * `#.##` dollars → integer cents. `$840.00`, `840`, `840.0` and `1,204.00` are parse
 * failures. The conversion is integer arithmetic on the two halves of the literal: a
 * float multiply of the parsed decimal loses cents at ledger-sized amounts.
 */
function parseCents(raw: string): number | null {
  if (!/^\d+\.\d{2}$/u.test(raw)) return null;
  const point = raw.length - 3;
  return Number(raw.slice(0, point)) * 100 + Number(raw.slice(point + 1));
}

function missing(key: string): string {
  return `missing required key: ${key}`;
}

function badNumber(key: string): string {
  return `malformed number for key: ${key}`;
}

/* -------------------------------------------------------------------------- */
/* Decoders                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The acting agent's proposal. All four keys are required; their absence escalates at the
 * caller (obligation 7, FR-002). `🧾measure` is rejected because `measure` is not one of the
 * three action names — it belongs to the measurement request, not to a proposal.
 */
export function decodeProposal(text: string): DecodeResult<ProposedAction> {
  const parsed = parseLines(text, PROPOSAL_KEYS);
  if (!parsed.ok) return parsed;
  const fields = parsed.value;

  const action = fields.get(ACTION);
  if (action === undefined) return { ok: false, error: missing(ACTION) };
  if (action !== 'bulk_refund' && action !== 'issue_payout' && action !== 'close_account') {
    return { ok: false, error: `unknown action for key ${ACTION}: ${JSON.stringify(action)}` };
  }

  const criteria = fields.get(CRITERIA);
  if (criteria === undefined) return { ok: false, error: missing(CRITERIA) };

  const rawCount = fields.get(DECLARED_COUNT);
  if (rawCount === undefined) return { ok: false, error: missing(DECLARED_COUNT) };
  const declared_count = parseInteger(rawCount);
  if (declared_count === null) return { ok: false, error: badNumber(DECLARED_COUNT) };

  const rawValue = fields.get(DECLARED_VALUE);
  if (rawValue === undefined) return { ok: false, error: missing(DECLARED_VALUE) };
  const declared_value_cents = parseCents(rawValue);
  if (declared_value_cents === null) return { ok: false, error: badNumber(DECLARED_VALUE) };

  return {
    ok: true,
    value: { action, criteria, declared_count, declared_value_cents },
  };
}

/**
 * The Evaluator's verdict. `⚖` is required and accepts `allow` and `deny` only:
 * `⚖escalate` is a parse failure because escalation is written by the system's `decide()`,
 * never by the Evaluator (obligation 9, research D-06). `📝` is optional.
 *
 * The `🧮`/`💰`/`♻` citation is all-or-nothing. All three present is a citation; all three
 * absent is `cited: null`, which `decide()` rule 4 then turns into an escalation. A partial
 * triple is a parse failure rather than a partial citation: one or two numbers cannot be
 * compared against `observed`, and keeping the lines the model did write while inventing
 * the rest — or silently dropping them — is exactly the inference obligation 4 forbids.
 */
export function decodeVerdict(text: string): DecodeResult<EvaluatorVerdict> {
  const parsed = parseLines(text, VERDICT_KEYS);
  if (!parsed.ok) return parsed;
  const fields = parsed.value;

  const verdict = fields.get(VERDICT);
  if (verdict === undefined) return { ok: false, error: missing(VERDICT) };
  if (verdict !== 'allow' && verdict !== 'deny') {
    return {
      ok: false,
      error: `key ${VERDICT} accepts allow or deny only: ${JSON.stringify(verdict)}`,
    };
  }

  const rawCount = fields.get(MEASURED_COUNT);
  const rawValue = fields.get(MEASURED_VALUE);
  const rawDuplicates = fields.get(DUPLICATE_COUNT);
  const present = [rawCount, rawValue, rawDuplicates].filter((raw) => raw !== undefined).length;
  if (present !== 0 && present !== 3) {
    return {
      ok: false,
      error:
        `a partial citation is not a citation: ${MEASURED_COUNT}, ${MEASURED_VALUE} and ` +
        `${DUPLICATE_COUNT} travel together or not at all`,
    };
  }

  let cited: MeasuredTriple | null = null;
  if (rawCount !== undefined && rawValue !== undefined && rawDuplicates !== undefined) {
    const measured_count = parseInteger(rawCount);
    if (measured_count === null) return { ok: false, error: badNumber(MEASURED_COUNT) };
    const measured_value_cents = parseCents(rawValue);
    if (measured_value_cents === null) return { ok: false, error: badNumber(MEASURED_VALUE) };
    const duplicate_count = parseInteger(rawDuplicates);
    if (duplicate_count === null) return { ok: false, error: badNumber(DUPLICATE_COUNT) };
    cited = { measured_count, measured_value_cents, duplicate_count };
  }

  return { ok: true, value: { verdict, reason: fields.get(REASON) ?? null, cited } };
}

/**
 * `measure.py` stdout — exactly `🧮`, `💰`, `♻`, all three required (obligation 6). This is
 * the executors' decoder and runs nowhere else: the Bench builds `observed` from the
 * `measure` tool's `structuredContent`, never from its text.
 */
export function decodeMeasurement(text: string): DecodeResult<MeasuredTriple> {
  const parsed = parseLines(text, MEASUREMENT_KEYS);
  if (!parsed.ok) return parsed;
  const fields = parsed.value;

  const rawCount = fields.get(MEASURED_COUNT);
  if (rawCount === undefined) return { ok: false, error: missing(MEASURED_COUNT) };
  const measured_count = parseInteger(rawCount);
  if (measured_count === null) return { ok: false, error: badNumber(MEASURED_COUNT) };

  const rawValue = fields.get(MEASURED_VALUE);
  if (rawValue === undefined) return { ok: false, error: missing(MEASURED_VALUE) };
  const measured_value_cents = parseCents(rawValue);
  if (measured_value_cents === null) return { ok: false, error: badNumber(MEASURED_VALUE) };

  const rawDuplicates = fields.get(DUPLICATE_COUNT);
  if (rawDuplicates === undefined) return { ok: false, error: missing(DUPLICATE_COUNT) };
  const duplicate_count = parseInteger(rawDuplicates);
  if (duplicate_count === null) return { ok: false, error: badNumber(DUPLICATE_COUNT) };

  return { ok: true, value: { measured_count, measured_value_cents, duplicate_count } };
}

/* -------------------------------------------------------------------------- */
/* Encoder                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One line per field, key first, no padding (encoder obligation 1). A value containing a
 * newline is a programming error, not an escapable case: multi-line values are
 * unrepresentable by design, so this throws rather than truncating or escaping
 * (obligation 3). The message names the key, never the value.
 */
function line(key: string, value: string): string {
  if (value.includes('\n')) {
    throw new Error(`grammar: the value for key ${key} contains a newline and cannot be encoded`);
  }
  return key + value;
}

/** Integer cents → `#.##`. The dividend is a multiple of 100 by construction, so no float. */
function dollars(cents: number): string {
  const fraction = cents % 100;
  const whole = (cents - fraction) / 100;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function encodeProposal(p: ProposedAction): string {
  return [
    line(ACTION, p.action),
    line(CRITERIA, p.criteria),
    line(DECLARED_COUNT, String(p.declared_count)),
    line(DECLARED_VALUE, dollars(p.declared_value_cents)),
  ].join('\n');
}

export function encodeMeasurement(t: MeasuredTriple): string {
  return [
    line(MEASURED_COUNT, String(t.measured_count)),
    line(MEASURED_VALUE, dollars(t.measured_value_cents)),
    line(DUPLICATE_COUNT, String(t.duplicate_count)),
  ].join('\n');
}

/**
 * Encoder obligation 2 is satisfied by the type, not by a runtime check: `Verdict`'s
 * `allow`/`deny` branch carries a non-null `Measurement`, so `⚖allow`/`⚖deny` cannot be
 * encoded without `🧮`, `💰` and `♻`. Only `escalate` may have no evidence, and it is the
 * system's own rendering of a verdict — never something the Evaluator wrote.
 */
export function encodeVerdict(v: Verdict): string {
  const lines = [line(VERDICT, v.verdict)];
  if (v.evidence !== null) lines.push(encodeMeasurement(v.evidence));
  lines.push(line(REASON, v.reason));
  return lines.join('\n');
}
