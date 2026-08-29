/**
 * Verdict resolution — T029 (FR-013, FR-014, FR-015, research D-06, D-15).
 *
 * The Bench reads the Evaluator's turn, hands `decide()` what it finds, and does what the
 * `Outcome` says: a `Guidance` becomes the Evaluator's next turn, a `Verdict` becomes the
 * answer to the held approval. Nothing here decides anything — every `allow` and `deny`
 * comes out of `decide()` rule 6, carrying the Evaluator's own words (Constitution II).
 *
 * Two things this file reads, and one it never reads:
 * - the verdict, from the text of the turn's **last** `model.message`;
 * - the measurement, from the **last** `measure` tool result of the turn, out of the
 *   `structuredContent` the harness put on the `tool.response` event;
 * - never the `🧮` text of that result. `decodeMeasurement` runs inside the executors, on
 *   `measure.py` stdout, and nowhere else (D-15).
 */

import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { decide, decodeVerdict } from '@crossexam/core';
import type {
  Config,
  DecodeResult,
  LedgerTable,
  MeasureAttempt,
  Measurement,
  ProposedAction,
  Verdict,
} from '@crossexam/core';

import { consumeTurn, type EventIndex, type TurnRecord } from './stream.ts';
import type { TurnQueue } from './queue.ts';

/** The tool the Evaluator calls; the D-14 adapter names it from the `📏` line. */
const MEASURE_TOOL = 'measure';

/** One held action as the resolver needs to see it (data-model §7, §10). */
export interface HeldAction {
  /** `case_001` — the key of the double-decision guard. */
  case_id: string;
  /** Where the guidance turns go. */
  evaluator_session_id: string;
  /** The acting agent's session, holding the call. */
  target_session_id: string;
  /** Thread that owns the pending call, from `tool.approval_required`. */
  thread_id: string;
  /** The pending tool call id this resolves. */
  approval_id: string;
  /** The acting agent's message, decoded. A parse failure escalates under rule 1. */
  proposal: DecodeResult<ProposedAction>;
  /** Clock reading at charge-sheet assembly — `elapsed_ms` counts from here (D-09). */
  opened_at_ms: number;
}

/** What the resolver needs from the run around it. */
export interface Bench {
  client: TrueForge;
  queue: TurnQueue;
  config: Config;
  cases: CaseTable;
  /** `Date.now` in the demo; injected in the tests so the budget is checkable. */
  now: () => number;
  /** The demo's trace hook, passed through to every turn this file opens. */
  onEvent?: (event: TrueForgeApi.TurnStreamingEvent) => void;
}

/**
 * The in-memory case table of data-model §10, and nothing more. The double-decision guard
 * is its only job: the first decision on a case stands, and a second one is rejected rather
 * than sent to the harness (spec, Edge Cases).
 */
export class CaseTable {
  private readonly decided = new Map<string, Verdict>();

  /**
   * Compare-and-set. Records `verdict` and returns `null` when the case was undecided;
   * returns the standing verdict — leaving it in place — when it was already decided.
   *
   * The record is taken *before* the decision is delivered, so two resolutions racing on
   * one case cannot both reach the harness. A delivery that then fails releases it.
   */
  decide(caseId: string, verdict: Verdict): Verdict | null {
    const standing = this.standing(caseId);
    if (standing !== null) return standing;
    this.decided.set(caseId, verdict);
    return null;
  }

  /** The delivered decision on a case, or `null` while it is undecided. */
  standing(caseId: string): Verdict | null {
    return this.decided.get(caseId) ?? null;
  }

  /**
   * Drop a record whose decision never reached the harness. The guard exists to stop a
   * second *delivered* decision (data-model §10); a held action whose approval was never
   * answered is still undecided, and must stay resolvable.
   */
  release(caseId: string): void {
    this.decided.delete(caseId);
  }
}

/** The text of the turn's last `model.message`; `''` when the turn produced none. */
export function evaluatorMessage(events: EventIndex): string {
  const message = events.last('model.message');
  if (message === null) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is TrueForgeApi.ChatCompletionContentPartText => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/** The two arguments of one `measure` call, as the adapter passes them. */
interface MeasureArgs {
  criteria: string;
  table: LedgerTable;
}

function measureArgs(raw: string): MeasureArgs | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { criteria, table } = parsed as Record<string, unknown>;
  if (typeof criteria !== 'string') return null;
  if (table !== 'charges' && table !== 'payouts') return null;
  return { criteria, table };
}

/**
 * The `measure` calls of a turn, by tool call id. Matched on the tool name the adapter
 * writes — the same name the harness dispatches on — not on `toolInfo`, which the
 * synthesized call does not carry until the harness resolves it (D-14).
 */
function measureCalls(events: EventIndex): Map<string, MeasureArgs> {
  const calls = new Map<string, MeasureArgs>();
  for (const event of events.events) {
    if (event.type !== 'model.message') continue;
    for (const call of event.toolCalls ?? []) {
      if (call.function.name !== MEASURE_TOOL) continue;
      const args = measureArgs(call.function.arguments);
      if (args !== null) calls.set(call.id, args);
    }
  }
  return calls;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * The `Measurement` the `measure` server put in `structuredContent`, or `null` when this
 * call produced none.
 *
 * The harness serializes a successful tool result's `structuredContent` as the
 * `tool.response` content and replaces it with `{error: …}` on `isError: true`
 * (`trueforge-core/dist/core/mcp/executeToolCalls.mjs:107-111`) — so the failure row of
 * [contracts/measurement-executor.md](../../../../specs/001-cross-exam-evaluator/contracts/measurement-executor.md)
 * arrives here as an unreadable object, and every field short of a whole `Measurement`
 * means no measurement. The attempt's own `criteria` and `table` come from the call
 * arguments instead, which the contract has the server copying anyway and which survive
 * the error path — that is what keeps rule 2b distinguishable from rule 2a.
 */
function measurementOf(content: string): Measurement | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const fields = parsed as Record<string, unknown>;
  const { executor, script_sha256, criteria, table } = fields;
  if (!isInteger(fields.measured_count)) return null;
  if (!isInteger(fields.measured_value_cents)) return null;
  if (!isInteger(fields.duplicate_count)) return null;
  if (!isInteger(fields.duration_ms)) return null;
  // One transport since the sandbox was cut (spec Clarifications 2026-08-29), so `'local'`
  // is the only executor a measurement can name.
  if (executor !== 'local') return null;
  if (typeof script_sha256 !== 'string') return null;
  if (typeof criteria !== 'string') return null;
  if (table !== 'charges' && table !== 'payouts') return null;
  return {
    measured_count: fields.measured_count,
    measured_value_cents: fields.measured_value_cents,
    duplicate_count: fields.duplicate_count,
    executor,
    duration_ms: fields.duration_ms,
    script_sha256,
    criteria,
    table,
  };
}

/**
 * The last `measure` call of the turn as a `MeasureAttempt`, or `null` when the turn made
 * none. The last, not the first: earlier calls are the model exploring, the last one is
 * what its verdict rests on (D-06).
 */
export function observedMeasurement(events: EventIndex): MeasureAttempt | null {
  const calls = measureCalls(events);
  for (let i = events.events.length - 1; i >= 0; i--) {
    const event = events.events[i];
    if (event?.type !== 'tool.response') continue;
    const args = calls.get(event.toolCallId);
    if (args === undefined) continue;
    return { criteria: args.criteria, table: args.table, result: measurementOf(event.content) };
  }
  return null;
}

/** One turn, queued behind whatever the session is already running (FR-003). */
async function runTurn(
  bench: Bench,
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
): Promise<TurnRecord> {
  return bench.queue.run(sessionId, async () => {
    const stream = await bench.client.sessions.createTurnStream(sessionId, { input });
    return consumeTurn(stream, bench.onEvent);
  });
}

/**
 * Answer the held approval, once. `allow` and `deny` resolve it; `escalate` leaves it
 * pending and the case undecided — a human answers it later, and there is no
 * auto-approving timeout, ever (data-model §10). Any verdict, an escalate included, on a
 * case already decided is rejected and the standing verdict returned.
 *
 * The case is recorded before the turn is sent, so a race cannot deliver two decisions. A
 * failure is then read by phase: refused before the harness took it, the record is released
 * — the action is still held, and a verdict nobody received is not a decision. Anything
 * after that leaves the record standing, because the decision may already have run.
 */
async function applyVerdict(bench: Bench, held: HeldAction, verdict: Verdict): Promise<Verdict> {
  if (verdict.verdict === 'escalate') return bench.cases.standing(held.case_id) ?? verdict;
  const standing = bench.cases.decide(held.case_id, verdict);
  if (standing !== null) return standing;

  const approval: TrueForgeApi.ApprovalDecision =
    verdict.verdict === 'allow' ? { status: 'allow' } : { status: 'deny', reason: verdict.reason };
  await bench.queue.run(held.target_session_id, async () => {
    let stream;
    try {
      stream = await bench.client.sessions.createTurnStream(held.target_session_id, {
        input: [
          {
            type: 'user.tool_approval',
            threadId: held.thread_id,
            toolCallId: held.approval_id,
            approval,
          },
        ],
      });
    } catch (error) {
      // The harness never took the decision, so the action is still held and the case has
      // to stay answerable.
      bench.cases.release(held.case_id);
      throw error;
    }
    // Taken. Whatever fails from here — a dropped stream — the decision may already have
    // run against production, and a second submission on an irreversible action is the one
    // thing this guard exists to prevent (data-model §10). The record stands.
    await consumeTurn(stream, bench.onEvent);
  });
  return verdict;
}

/**
 * Resolve one held action from the Evaluator's turn: decode, measure-read, `decide()`, and
 * either guide the Evaluator and read its next turn, or answer the approval.
 *
 * The loop terminates on `decide()`'s own bounds and holds none of its own: guidance is
 * only ever returned while `guidances < CROSSEXAM_EVALUATOR_RETRIES`, and every other exit
 * from the rules is a `Verdict` (D-06, D-09).
 */
export async function resolveCase(
  bench: Bench,
  held: HeldAction,
  evaluatorTurn: TurnRecord,
): Promise<Verdict> {
  let turn = evaluatorTurn;
  let guidances = 0;

  for (;;) {
    const outcome = decide(
      held.proposal,
      decodeVerdict(evaluatorMessage(turn.events)),
      observedMeasurement(turn.events),
      { guidances, elapsed_ms: bench.now() - held.opened_at_ms },
      bench.config,
    );
    if ('verdict' in outcome) return applyVerdict(bench, held, outcome);

    guidances += 1;
    turn = await runTurn(bench, held.evaluator_session_id, [
      { type: 'user.message', content: outcome.message },
    ]);
  }
}
