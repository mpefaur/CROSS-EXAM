/**
 * The Bench trace — T030, the observable output of `pnpm demo`.
 *
 * Pure formatting: every function here takes what the run already holds and returns lines.
 * It computes no figure of its own, and it never reformats a measured triple by hand — the
 * `🧾`/`🧮`/`✅`/`⛔` lines come from the Phase 2 encoders, so what the trace shows and what
 * crossed the wire cannot drift.
 *
 * The shape is `quickstart.md` Scenario 1's expected block, which is what T032 reads its
 * checkboxes off.
 */

import { dollars, encodeMeasurement, encodeProposal, encodeVerdict } from '@crossexam/core';
import type {
  ActionName,
  GuardrailReport,
  Measurement,
  ProposedAction,
  Verdict,
} from '@crossexam/core';

/** Where a line goes. `console.log` in the demo; an array in the tests. */
export type Sink = (line: string) => void;

/** The grammar line's column, so the `[executor=…]` note lines up under itself. */
const GRAMMAR_WIDTH = 32;

/**
 * Pad to a visible width. `padEnd` counts UTF-16 units, and the `🧮` key is two of them, so
 * padding the raw string leaves the note one column short of where the header puts it.
 */
function padVisible(text: string, width: number): string {
  const visible = [...text].length;
  return visible >= width ? text : text + ' '.repeat(width - visible);
}

const VERDICT_MARK = { allow: '✅ allow', deny: '⛔ deny', escalate: '⚖ escalate' } as const;

/** What one executed action's rows are called, for the completion line. */
const EXECUTED_NOUN: Record<ActionName, string> = {
  bulk_refund: 'refunds',
  issue_payout: 'payouts',
  close_account: 'closures',
};

function mark(passed: boolean): string {
  return passed ? 'PASS' : 'FAIL';
}

/** `guardrails: ceiling PASS · frequency PASS · eligibility PASS · confidence 0.94 PASS` (T038). */
export function guardrailLine(report: GuardrailReport): string {
  return [
    `ceiling ${mark(report.per_action_ceiling.passed)}`,
    `frequency ${mark(report.frequency_cap.passed)}`,
    `eligibility ${mark(report.eligibility_policy.passed)}`,
    `confidence ${report.confidence.score.toFixed(2)} ${mark(report.confidence.passed)}`,
  ].join(' · ');
}

/**
 * The round header and what the agent proposed, with the four controls under it.
 *
 * A proposal that did not parse has no grammar line to show — printing one would mean
 * inventing the fields the decode rejected — so the reason is shown instead and the run
 * escalates under rule 1.
 */
export function proposalBlock(
  round: number,
  proposal: ProposedAction | { parse_error: string },
  guardrails: GuardrailReport | null,
): string[] {
  const header = round === 1 ? '▸ round 1  target proposes' : `▸ round ${String(round)}  target re-proposes`;
  const line =
    'parse_error' in proposal
      ? `  ✗ proposal did not parse: ${proposal.parse_error}`
      : `  ${encodeProposal(proposal)}`;
  // Nothing parsed means nothing for the four controls to read: they check a declaration
  // and a criteria string, and a failed decode produced neither.
  if (guardrails === null) return [header, line];
  return [header, line, `  guardrails: ${guardrailLine(guardrails)}`];
}

/** Printed when the Evaluator calls `measure`, before its result is back. */
export function measuringLine(): string {
  return '▸ measuring (local) …';
}

/** `  🧮1204 | 96310.00 | 611          [executor=local  1.4s]` */
export function measurementLine(measurement: Measurement): string {
  const seconds = (measurement.duration_ms / 1000).toFixed(1);
  const grammar = padVisible(encodeMeasurement(measurement), GRAMMAR_WIDTH);
  return `  ${grammar}[executor=${measurement.executor}  ${seconds}s]`;
}

/** The measurement the Evaluator asked for produced nothing — rule 2b territory. */
export function noMeasurementLine(criteria: string): string {
  return `  ✗ no measurement for ${criteria} — nothing was measured, so nothing is cited`;
}

/**
 * The verdict, with the rule that produced it, then the Evaluator's own line.
 *
 * `escalate` has no wire form — it is the system's, not the Evaluator's — so it shows its
 * reason as prose rather than a grammar line it could not have written.
 */
export function verdictBlock(verdict: Verdict): string[] {
  const head = `▸ verdict  ${VERDICT_MARK[verdict.verdict]}  (rule ${verdict.rule})`;
  if (verdict.verdict === 'escalate') {
    return [head, `  ${verdict.reason}`, '  the action stays held — a person decides'];
  }
  return [head, `  ${encodeVerdict(verdict)}`];
}

/** What the production ledger reports back after an allow, or why it wrote nothing. */
export function executionLine(result: {
  executed: boolean;
  action?: ActionName;
  count?: number;
  value_cents?: number;
  reason?: string;
}): string {
  if (!result.executed) {
    return `▸ nothing executed — ${result.reason ?? 'no reason given'}`;
  }
  const noun = result.action === undefined ? 'rows' : EXECUTED_NOUN[result.action];
  const count = String(result.count ?? 0);
  return `▸ executed against production ledger — ${count} ${noun}, $${dollars(result.value_cents ?? 0)}`;
}

/** The run refused to start, or ended without deciding. */
export function noteLine(text: string): string {
  return `▸ ${text}`;
}
