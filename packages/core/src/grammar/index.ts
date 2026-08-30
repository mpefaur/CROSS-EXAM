/**
 * Emoji wire grammar — encoder and decoders (FR-024, FR-025).
 *
 * Key registry: `./registry.json` — the single source for keys, kinds and field order; the
 * harness adapter reads the same file (research D-14) and `docs/emoji-grammar.md` explains
 * it. Parser obligations: `specs/001-cross-exam-evaluator/contracts/wire-grammar.md`.
 *
 * One message is one line: one emoji names the message kind — the tool, the measurement,
 * or the verdict — and its fields follow in fixed order, separated by `|`. The decode is
 * strict and single-pass: a wrong key, a second line, or a field count other than the key's
 * arity returns `{ ok: false }`; there is never a looser second attempt and no field value
 * is ever inferred (FR-025). No escaping exists — no ledger value contains an emoji or a `|`
 * (registry § Invariant).
 */

import type {
  ActionName,
  EvaluatorVerdict,
  MeasuredTriple,
  ProposedAction,
  Verdict,
} from '../model/case.ts';
import registry from './registry.json' with { type: 'json' };

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ACTION_NAMES: readonly string[] = ['bulk_refund', 'issue_payout', 'close_account'];

/** The shape of one `registry.json` entry; JSON imports widen literals, so it is named here. */
type Entry =
  | { kind: 'tool'; tool: string; fields: string[] }
  | { kind: 'measurement'; fields: string[] }
  | { kind: 'verdict'; verdict: EvaluatorVerdict['verdict']; fields: string[] };
const entries = Object.entries(registry) as [string, Entry][];

const PROPOSAL_KEYS: ReadonlyMap<string, ActionName> = new Map(
  entries.flatMap(([key, e]) =>
    e.kind === 'tool' && ACTION_NAMES.includes(e.tool) ? [[key, e.tool as ActionName]] : [],
  ),
);
const MEASUREMENT = entries.find(([, e]) => e.kind === 'measurement')![0];
const VERDICT_KEYS: ReadonlyMap<string, EvaluatorVerdict['verdict']> = new Map(
  entries.flatMap(([key, e]) =>
    e.kind === 'verdict' ? [[key, e.verdict]] : [],
  ),
);
const arity = (key: string): number => registry[key as keyof typeof registry].fields.length;

/** Models add the variation selector to some symbols; every decoder drops one leading one. */
const VARIATION_SELECTOR = '️';

interface Line {
  key: string;
  fields: string[];
}

/** Obligations 1–2: exactly one non-blank line, an accepted key, `|`-split trimmed fields at the key's arity. */
function parseLine(text: string, accepted: ReadonlySet<string>): DecodeResult<Line> {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length !== 1) {
    return { ok: false, error: `expected one grammar line, got ${lines.length}` };
  }
  const line = lines[0]!.trim();
  // The key is the first *codepoint*: most keys are surrogate pairs, so `line[0]` would read half.
  const key = Array.from(line)[0];
  if (key === undefined || !accepted.has(key)) {
    return { ok: false, error: `unregistered key for this direction: ${JSON.stringify(key)}` };
  }
  let rest = line.slice(key.length);
  if (rest.startsWith(VARIATION_SELECTOR)) rest = rest.slice(1);
  const fields = rest.trim() === '' ? [] : rest.split('|').map((field) => field.trim());
  if (fields.length !== arity(key)) {
    return { ok: false, error: `${key} expects ${arity(key)} fields, got ${fields.length}` };
  }
  return { ok: true, value: { key, fields } };
}

/**
 * A bare non-negative integer. `+1`, `-1` and `1.0` are parse failures, and so is a digit
 * string past `Number.MAX_SAFE_INTEGER`: `Number` rounds it silently, and a rounded figure
 * presented as a measured one is the inference Constitution II forbids.
 */
function parseInteger(raw: string): number | null {
  if (!/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * `#.##` dollars → integer cents. `$840.00`, `840`, `840.0` and `1,204.00` are parse
 * failures. Integer arithmetic on the two halves: a float multiply loses cents at
 * ledger-sized amounts. Cents past `Number.MAX_SAFE_INTEGER` fail as in `parseInteger`.
 */
function parseCents(raw: string): number | null {
  if (!/^\d+\.\d{2}$/u.test(raw)) return null;
  const point = raw.length - 3;
  const cents = Number(raw.slice(0, point)) * 100 + Number(raw.slice(point + 1));
  return Number.isSafeInteger(cents) ? cents : null;
}

function parseTriple(fields: readonly string[]): DecodeResult<MeasuredTriple> {
  const measured_count = parseInteger(fields[0]!);
  if (measured_count === null) return { ok: false, error: 'malformed measured_count' };
  const measured_value_cents = parseCents(fields[1]!);
  if (measured_value_cents === null) return { ok: false, error: 'malformed measured_value' };
  const duplicate_count = parseInteger(fields[2]!);
  if (duplicate_count === null) return { ok: false, error: 'malformed duplicate_count' };
  return { ok: true, value: { measured_count, measured_value_cents, duplicate_count } };
}

/** The acting agent's proposal: `🧾`/`💸`/`🔒` then `criteria | declared_count | declared_value`. */
export function decodeProposal(text: string): DecodeResult<ProposedAction> {
  const parsed = parseLine(text, new Set(PROPOSAL_KEYS.keys()));
  if (!parsed.ok) return parsed;
  const [criteria, rawCount, rawValue] = parsed.value.fields as [string, string, string];
  if (criteria === '') return { ok: false, error: 'empty criteria' };
  const declared_count = parseInteger(rawCount);
  if (declared_count === null) return { ok: false, error: 'malformed declared_count' };
  const declared_value_cents = parseCents(rawValue);
  if (declared_value_cents === null) return { ok: false, error: 'malformed declared_value' };
  return {
    ok: true,
    value: { action: PROPOSAL_KEYS.get(parsed.value.key)!, criteria, declared_count, declared_value_cents },
  };
}

/**
 * The Evaluator's verdict: `✅`/`⛔` then the measured triple and a non-empty reason. There
 * is no escalate key — escalation is written by the system's `decide()`, never by the
 * Evaluator (obligation 8, research D-06).
 */
export function decodeVerdict(text: string): DecodeResult<EvaluatorVerdict> {
  const parsed = parseLine(text, new Set(VERDICT_KEYS.keys()));
  if (!parsed.ok) return parsed;
  const cited = parseTriple(parsed.value.fields);
  if (!cited.ok) return cited;
  const reason = parsed.value.fields[3]!;
  if (reason === '') return { ok: false, error: 'empty reason' };
  return { ok: true, value: { verdict: VERDICT_KEYS.get(parsed.value.key)!, reason, cited: cited.value } };
}

/**
 * `measure.py` stdout — `🧮count | value | duplicates` (obligation 5). The executors'
 * decoder; the Bench builds `observed` from the `measure` tool's `structuredContent`.
 */
export function decodeMeasurement(text: string): DecodeResult<MeasuredTriple> {
  const parsed = parseLine(text, new Set([MEASUREMENT]));
  if (!parsed.ok) return parsed;
  return parseTriple(parsed.value.fields);
}

/** Integer cents → `#.##`. */
export function dollars(cents: number): string {
  const fraction = cents % 100;
  return `${(cents - fraction) / 100}.${String(fraction).padStart(2, '0')}`;
}

/** A value containing `\n` or `|` is a programming error: unrepresentable, so throw (encoder obligation 3). */
function encodeLine(key: string, fields: readonly string[]): string {
  if (fields.some((value) => value.includes('\n') || value.includes('|'))) {
    throw new Error('grammar: a field value contains a newline or a | and cannot be encoded');
  }
  return key + fields.join(' | ');
}

function keyOf<V>(keys: ReadonlyMap<string, V>, value: V): string {
  for (const [key, v] of keys) if (v === value) return key;
  throw new Error(`grammar: no key for ${String(value)}`);
}

export function encodeProposal(p: ProposedAction): string {
  return encodeLine(keyOf(PROPOSAL_KEYS, p.action), [
    p.criteria,
    String(p.declared_count),
    dollars(p.declared_value_cents),
  ]);
}

/** The proposal line as the adapter split it: the action's key, then its raw fields (D-14). */
export function proposalLine(action: ActionName, fields: readonly string[]): string {
  return encodeLine(keyOf(PROPOSAL_KEYS, action), fields);
}

function tripleFields(t: MeasuredTriple): string[] {
  return [String(t.measured_count), dollars(t.measured_value_cents), String(t.duplicate_count)];
}

export function encodeMeasurement(t: MeasuredTriple): string {
  return encodeLine(MEASUREMENT, tripleFields(t));
}

/**
 * Encoder obligation 2 is satisfied by the type: only the `allow`/`deny` branch of `Verdict`
 * is accepted, and it carries a non-null `Measurement`. `escalate` has no wire form.
 */
export function encodeVerdict(v: Extract<Verdict, { verdict: 'allow' | 'deny' }>): string {
  return encodeLine(keyOf(VERDICT_KEYS, v.verdict), [...tripleFields(v.evidence), v.reason]);
}
