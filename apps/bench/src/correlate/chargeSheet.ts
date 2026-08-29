/**
 * Charge-sheet assembly — T026 (FR-002, D-13,
 * [contracts/charge-sheet.md](../../../../specs/001-cross-exam-evaluator/contracts/charge-sheet.md)).
 *
 * The hand-off from holding to investigating. The correlation (T025) recovers the text the
 * acting agent wrote; this file decodes it through the Phase 2 grammar and lays the result
 * out as the `ChargeSheet` of data-model §7 — the one artifact the Evaluator reads.
 *
 * Two obligations of the contract live here:
 * - the proposal is decoded from the **message content** the correlation handed over, never
 *   from the harness-synthesised `tool_calls[].function.arguments` (FR-002, D-14);
 * - a proposal that does not parse becomes `{ parse_error }` rather than a guess, and the
 *   Bench escalates under rule 1 before any Evaluator turn — the Evaluator is not consulted.
 *
 * And one it never breaks: nothing here constructs a `Measurement`. Its only sources are the
 * two executors (Constitution II), so the charge sheet carries the proposal's *declared*
 * figures and no measured ones.
 */

import { decodeProposal } from '@crossexam/core';
import type {
  ChargeSheet,
  DecodeResult,
  GuardrailReport,
  ProposedAction,
} from '@crossexam/core';

/**
 * Everything one case needs at the moment it opens. A pure input: the run owns case
 * identity — `case_001`, monotonic per run (data-model §7) — and the clock, so assembly
 * stays deterministic and the same opening always yields the same sheet.
 */
export interface CaseOpening {
  /** `case_001`, minted by the run that opened this case. */
  case_id: string;
  /** The acting agent's harness session. */
  session_id: string;
  /** The pending `tool.approval_required` this resolves. */
  approval_id: string;
  /** 1 on the first proposal, 2 on the re-proposal after a denial (spec, Assumptions). */
  round: 1 | 2;
  /**
   * The text content of the `model.message` the correlation walked back to — the acting
   * agent's own grammar line, and the only thing the proposal may be decoded from (D-14).
   */
  content: string;
  /**
   * The four conventional controls, computed by the Bench (D-13). They are the contrast the
   * Evaluator names, not a gate: on the demo proposal all four pass, correctly.
   */
  guardrails: GuardrailReport;
  /** The business request that led to the proposal. */
  transcript_excerpt: string;
  /** Which replica the measurement must run against — `seed` and `as_of` from the fixture. */
  replica: { seed: string; as_of: string; path: string };
}

/**
 * The assembled case: the sheet that goes to the Evaluator, and the same decode undiscarded.
 *
 * Both, because the two consumers need different shapes of one decode — the wire form of
 * the contract (`ProposedAction | { parse_error }`) for the Evaluator's message, and the
 * `DecodeResult` `decide()` reads for rule 1 (`HeldAction.proposal`, T029). Decoding once
 * is what keeps them from drifting.
 */
export interface AssembledCase {
  charge_sheet: ChargeSheet;
  proposal: DecodeResult<ProposedAction>;
}

/**
 * Assemble one charge sheet from a held call, exactly as the contract specifies.
 *
 * A failed decode is not an error here: `{ parse_error }` is a first-class value of the
 * `proposal` field, and the escalation it causes is the resolver's (rule 1), not this
 * file's.
 */
export function assembleChargeSheet(opening: CaseOpening): AssembledCase {
  const proposal = decodeProposal(opening.content);
  return {
    charge_sheet: {
      case_id: opening.case_id,
      session_id: opening.session_id,
      approval_id: opening.approval_id,
      round: opening.round,
      proposal: proposal.ok ? proposal.value : { parse_error: proposal.error },
      guardrails: opening.guardrails,
      transcript_excerpt: opening.transcript_excerpt,
      replica: opening.replica,
    },
    proposal,
  };
}
