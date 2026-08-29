/**
 * Production execution — the only code in this repository that writes to the production
 * ledger (T021, FR-014, `contracts/mcp-tools.md` § Behavior on call).
 *
 * Three invariants, each a Constitution II concern rather than a style preference:
 *
 * 1. **Only on `allow`.** `executeOnAllow` takes the system's own `Verdict`, not a boolean a
 *    caller can get wrong. On `deny` and on an unanswered `escalate` it writes nothing.
 * 2. **It never opens the other ledger.** The measurement server owns the generated copy the
 *    blast radius is measured against; this module owns production, and refuses any file
 *    whose `seed` is not `PRODUCTION_SEED`. No path or variable naming that other ledger
 *    appears anywhere in this file.
 * 3. **It never reports a figure it did not compute.** The count and the total below are
 *    accumulated from the rows this call actually changed, as it changed them. The
 *    proposal's `declared_count` / `declared_value_cents` are never read here, and neither is
 *    the measurement or the Evaluator's citation — this module re-derives them
 *    (`contracts/mcp-tools.md` § What this server must never do).
 *
 * Money is integer cents throughout; no float arithmetic touches an amount. Predicates
 * follow the criteria grammar of `data-model.md` §5 — `term (' AND ' term)*`, no `OR`, no
 * parentheses, no `eval`. The only other implementation of that grammar is
 * `packages/core/scripts/measure.py`, the measurement executor's script: Python, read-only
 * by contract, and it never writes. There is no TypeScript parser to reuse, so the terms
 * below mirror its `CRITERIA_FIELDS`, `TERM` and `OPS` exactly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRODUCTION_SEED,
  tableFor,
  type ActionName,
  type LedgerTable,
  type ProposedAction,
  type Verdict,
} from '@crossexam/core';

/** `packages/mcp/src` → repo root, so the default path does not depend on `process.cwd()`. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The one ledger an allowed action is applied to (T021). */
export const PRODUCTION_LEDGER_PATH = join(REPO_ROOT, 'fixtures', 'production.json');

/** What an executed action reports back. `value_cents` is integer cents. */
export interface ExecutionReport {
  executed: true;
  action: ActionName;
  criteria: string;
  table: LedgerTable;
  /** Rows this execution changed — computed here, from those rows. */
  count: number;
  /** Their total, in integer cents — likewise. */
  value_cents: number;
  ledger_path: string;
}

/** Nothing ran and nothing was written; `reason` says why. */
export interface ExecutionRefusal {
  executed: false;
  reason: string;
}

export type ExecutionResult = ExecutionReport | ExecutionRefusal;

/** A ledger column's type — what types the bare literal a term compares against. */
type ColumnType = 'string' | 'integer' | 'boolean';

/** data-model §5 — the only fields a predicate may name, per table, and their types. */
const CRITERIA_FIELDS: Record<LedgerTable, Readonly<Record<string, ColumnType>>> = {
  charges: {
    status: 'string',
    refunded: 'boolean',
    age_days: 'integer',
    amount_cents: 'integer',
    customer_id: 'string',
  },
  payouts: {
    payout_eligible: 'boolean',
    merchant_id: 'string',
    amount_cents: 'integer',
  },
};

/** `field op value`, one bare literal, no quotes — data-model §5. */
const TERM = /^([a-z_]+)\s*(=|!=|>=|<=|>|<)\s*([A-Za-z0-9_-]+)$/u;

type Operator = '=' | '!=' | '>' | '>=' | '<' | '<=';
const ORDERING: ReadonlySet<string> = new Set(['>', '>=', '<', '<=']);

interface Term {
  field: string;
  op: Operator;
  /** Typed like its column: `integer` terms hold a number, `boolean` a boolean, else a string. */
  value: string | number | boolean;
  type: ColumnType;
}

/**
 * Parse `term (' AND ' term)*` for `table`, or return the reason it is outside the grammar.
 *
 * A term is data, never code: the result is a list of structural comparisons, and nothing
 * here evaluates a string.
 */
function parseCriteria(text: string, table: LedgerTable): Term[] | string {
  const columns = CRITERIA_FIELDS[table];
  const terms: Term[] = [];
  for (const part of text.split(' AND ')) {
    const match = TERM.exec(part.trim());
    if (match === null) return `term does not parse: ${part}`;
    const field = match[1]!;
    const op = match[2]! as Operator;
    const raw = match[3]!;
    const type = columns[field];
    if (type === undefined) return `field not in the criteria grammar for ${table}: ${field}`;
    if (type !== 'integer' && ORDERING.has(op)) {
      return `ordering operator on a non-integer column: ${part}`;
    }
    if (type === 'integer') {
      if (!/^-?\d+$/u.test(raw)) return `integer column needs an integer literal: ${raw}`;
      terms.push({ field, op, value: Number(raw), type });
    } else if (type === 'boolean') {
      if (raw !== 'true' && raw !== 'false') return `boolean column needs true/false: ${raw}`;
      terms.push({ field, op, value: raw === 'true', type });
    } else {
      terms.push({ field, op, value: raw, type });
    }
  }
  return terms;
}

function compareNumbers(op: Operator, actual: number, expected: number): boolean {
  switch (op) {
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
  }
}

/**
 * `true` when the row satisfies every term, `false` when it does not, and the reason as a
 * string when the row is not the shape data-model §1/§2 documents — a malformed row aborts
 * the execution rather than quietly failing to match.
 */
function matches(row: Record<string, unknown>, terms: readonly Term[]): boolean | string {
  for (const term of terms) {
    const actual = row[term.field];
    if (term.type === 'integer') {
      if (typeof actual !== 'number' || !Number.isInteger(actual)) {
        return `row ${String(row['id'])}: bad or missing ${term.field}`;
      }
      if (!compareNumbers(term.op, actual, term.value as number)) return false;
      continue;
    }
    const wellTyped = term.type === 'boolean' ? typeof actual === 'boolean' : typeof actual === 'string';
    if (!wellTyped) return `row ${String(row['id'])}: bad or missing ${term.field}`;
    // Only `=` and `!=` reach here — `parseCriteria` rejects ordering on a non-integer column.
    if (term.op === '=' ? actual !== term.value : actual === term.value) return false;
  }
  return true;
}

/**
 * Settle a refund on one charge: `refunded` becomes `true` and `refunded_at` the ledger's
 * frozen `as_of`, which keeps the write deterministic (FR-006) and preserves data-model §1's
 * `refunded === (refunded_at !== null)`.
 *
 * Returns whether this call changed the row. A charge that already carries a settled refund
 * is matched but not changed, so it is neither counted nor valued — that is the difference
 * `duplicate_count` exists to warn about (data-model §8), and reporting it as refunded here
 * would be reporting an effect this execution did not have.
 */
function settleRefund(row: Record<string, unknown>, asOf: string): boolean {
  if (row['refunded'] !== false) return false;
  row['refunded'] = true;
  row['refunded_at'] = asOf;
  return true;
}

/** What an action does to one matched row. */
type Effect = (row: Record<string, unknown>, asOf: string) => boolean;

/**
 * The effect of each action, or `null` where the seeded ledger has no column that
 * represents it.
 *
 * `bulk_refund` is the only action the seeded scenarios can execute: `issue_payout`'s
 * measurement crosses the escalation threshold, and `close_account` is "not exercised by the
 * seeded scenario" (`contracts/mcp-tools.md` § Tools). Neither `payouts` nor `charges` has a
 * column meaning "payout issued" or "account closed" — data-model §1/§2 define none, and
 * `measure.py`'s `ACTED_ON` says the same — so instead of inventing a schema and reporting a
 * figure the data model cannot back, those two refuse and leave the ledger untouched.
 */
const EFFECTS: Record<ActionName, Effect | null> = {
  bulk_refund: settleRefund,
  issue_payout: null,
  close_account: null,
};

function refuse(reason: string): ExecutionRefusal {
  return { executed: false, reason };
}

/**
 * Apply `proposal` to the production ledger — on an `allow` resolution and only then
 * (FR-014) — and report the count and total this call computed while applying it.
 *
 * `proposal.declared_count` and `proposal.declared_value_cents` are deliberately unread: the
 * agent's belief is what the run holds against the measurement, never a figure this module
 * may repeat as its own.
 *
 * Never throws. An unreadable or malformed ledger comes back as a refusal, so the caller
 * (T029) can never mistake a failure to execute for a silent success.
 */
export function executeOnAllow(
  verdict: Verdict,
  proposal: ProposedAction,
  ledgerPath: string = PRODUCTION_LEDGER_PATH,
): ExecutionResult {
  if (verdict.verdict !== 'allow') {
    return refuse(`verdict is ${verdict.verdict}, not allow — the production ledger is untouched`);
  }
  const apply = EFFECTS[proposal.action];
  if (apply === null) {
    return refuse(`${proposal.action} has no effect the seeded ledger represents — nothing was written`);
  }
  const table = tableFor(proposal.action);
  const terms = parseCriteria(proposal.criteria, table);
  if (!Array.isArray(terms)) return refuse(`criteria did not parse: ${terms}`);

  let ledger: unknown;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    return refuse(`ledger could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof ledger !== 'object' || ledger === null) return refuse('ledger is not an object');
  const { seed, as_of: asOf } = ledger as { seed?: unknown; as_of?: unknown };
  // The guard that makes invariant 2 structural: only the production seed is writable here.
  if (seed !== PRODUCTION_SEED) return refuse(`not the production ledger: seed ${String(seed)}`);
  if (typeof asOf !== 'string') return refuse('ledger has no as_of date');
  const rows = (ledger as Record<string, unknown>)[table];
  if (!Array.isArray(rows)) return refuse(`ledger has no ${table} table`);

  let count = 0;
  let value_cents = 0;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) return refuse('row is not an object');
    const record = row as Record<string, unknown>;
    const matched = matches(record, terms);
    if (typeof matched === 'string') return refuse(matched);
    if (!matched) continue;
    const amount = record['amount_cents'];
    if (typeof amount !== 'number' || !Number.isInteger(amount)) {
      return refuse(`row ${String(record['id'])}: bad or missing amount_cents`);
    }
    if (!apply(record, asOf)) continue;
    // Both figures come from the row this call has just changed. Integer cents, no float.
    count += 1;
    value_cents += amount;
  }

  // Written only when a row changed, in the fixture's own stable form (`pnpm seed`).
  if (count > 0) writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

  return {
    executed: true,
    action: proposal.action,
    criteria: proposal.criteria,
    table,
    count,
    value_cents,
    ledger_path: ledgerPath,
  };
}
