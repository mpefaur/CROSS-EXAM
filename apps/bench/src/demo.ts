/**
 * `pnpm demo` — the whole User Story 1 loop (T030, FR-016).
 *
 * Hold the bulk refund, measure its real reach against the replica, deny it with the
 * measured numbers, let the agent re-propose, measure again, allow, execute against
 * production. The trace it prints is `quickstart.md` Scenario 1.
 *
 * What this file owns, and why it is the only place that can:
 *
 * - **Both MCP servers.** Started in-process so one command is the whole demo, and closed
 *   on the way out however the run ends.
 * - **The four conventional controls.** `assembleChargeSheet` takes a `GuardrailReport` as
 *   an input (T026), so the call belongs at the site that builds the opening — here — which
 *   is also the only place holding the session's earlier proposals the frequency cap reads
 *   (T038, D-13).
 * - **The round loop.** After a `deny` the target re-proposes *inside the turn that
 *   delivers the denial* — `resolveCase` opens that turn and returns only the verdict — so
 *   round 2's held call arrives through the event hook, not as a return value.
 * - **The watcher** (`--serve`). The hold is the harness's own approval pause, which the
 *   Bench answers instead of a person; a request typed into the acting agent's chat pauses
 *   the same way, and the watcher finds that pause and runs the same loop on it.
 *
 * It decides nothing. Every `allow`/`deny` comes from `decide()` by way of `resolveCase`,
 * and every figure printed was computed by the measurement or by the production ledger
 * (Constitution II).
 */

import { readFileSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decide, decodeProposal, decodeVerdict, loadConfig } from '@crossexam/core';
import type { Config, ProposedAction } from '@crossexam/core';
import { checkGuardrails, startActionServer } from '@crossexam/mcp';
import { startMeasureServer } from '@crossexam/measure';
import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';

import { assembleChargeSheet } from './correlate/chargeSheet.ts';
import { correlate } from './correlate/index.ts';
import { EVALUATOR_INSTRUCTIONS } from './prompts/evaluator.ts';
import { TARGET_INSTRUCTIONS } from './prompts/target.ts';
import { ensureAgents } from './sessions/agents.ts';
import { createHarnessClient, TurnQueue } from './sessions/queue.ts';
import { CaseTable, resolveCase, type Bench, type HeldAction } from './sessions/resolve.ts';
import { consumeTurn, EventIndex, type TurnRecord } from './sessions/stream.ts';
import {
  executionLine,
  type Sink,
  type ExecutionOutcome,
  measurementLine,
  measuringLine,
  noMeasurementLine,
  noteLine,
  proposalBlock,
  verdictBlock,
} from './trace.ts';

/** The business request that starts the run (`contracts/charge-sheet.md`). */
const BUSINESS_REQUEST =
  "Refund this week's disputed charges. It is 7 disputes, $840.00 in total. Propose the action now; do not ask questions.";

/** One round of cross-examination, then the re-proposal (spec, Assumptions). */
const MAX_ROUNDS = 2;

/** How the run was invoked. */
interface Options {
  /**
   * `--guardrails-only`: stop once the four conventional controls have reported, before the
   * Evaluator is consulted (T038, quickstart Scenario 3).
   *
   * What the flag demonstrates is what it *cannot* do. It stops the run early, so the held
   * action is never resolved and nothing is measured or executed — which is the contrast
   * User Story 2 exists to show: four conventional controls pass the damaging proposal and,
   * left to themselves, let it stand (FR-018).
   */
  guardrailsOnly: boolean;
  /** `--serve`: send no request; watch every chat with the acting agent and answer its holds. */
  serve: boolean;
}

export function parseOptions(argv: readonly string[]): Options {
  return { guardrailsOnly: argv.includes('--guardrails-only'), serve: argv.includes('--serve') };
}

/** How often the watcher looks for a new hold. */
const WATCH_INTERVAL_MS = 2000;

const out = (line: string): void => {
  console.log(line);
};

/**
 * `apps/bench/src` → repo root. `pnpm demo` runs with `apps/bench` as its working directory,
 * so the default `fixtures/replica.json` of data-model §12 is resolved from the repository
 * rather than the cwd — the same thing `execute.ts` does for the production ledger.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function replicaPath(config: Config): string {
  return isAbsolute(config.replica_path)
    ? config.replica_path
    : join(REPO_ROOT, config.replica_path);
}

/** The replica's identity, as the charge sheet must name it. */
function replicaIdentity(config: Config): { seed: string; as_of: string; path: string } {
  const ledger = JSON.parse(readFileSync(replicaPath(config), 'utf8')) as {
    seed: string;
    as_of: string;
  };
  return { seed: ledger.seed, as_of: ledger.as_of, path: config.replica_path };
}

/**
 * The execution report the action server put on the tool result after the `allow`.
 *
 * Read, never computed: the count and the total are the production ledger's own, accumulated
 * from the rows it changed (T030a).
 *
 * Two shapes arrive here, because the harness rewrites a failed tool result: a success is the
 * server's `structuredContent` verbatim, while `isError: true` becomes
 * `{error: <the MCP content array>}` (`executeToolCalls.mjs:107-111`). Neither is trusted —
 * a response this cannot read becomes an unreadable-result refusal rather than an execution
 * of zero rows, which would be a figure nobody computed.
 */
export function readExecution(index: EventIndex, toolCallId: string): ExecutionOutcome {
  const unreadable = { executed: false as const, reason: 'the action server reported no execution result' };

  for (let i = index.events.length - 1; i >= 0; i--) {
    const event = index.events[i];
    if (event?.type !== 'tool.response' || event.toolCallId !== toolCallId) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.content);
    } catch {
      return unreadable;
    }
    if (typeof parsed !== 'object' || parsed === null) return unreadable;
    const fields = parsed as Record<string, unknown>;

    // The refusal path: the server said why, and that reason is what the run must show.
    // `error` is the MCP content array the harness wrapped, so the text parts are the reason.
    const wrapped = fields['error'];
    if (typeof wrapped === 'string') return { executed: false, reason: wrapped };
    if (Array.isArray(wrapped)) {
      const reason = wrapped
        .flatMap((part) =>
          typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text'
            ? [String((part as { text: unknown }).text)]
            : [],
        )
        .join('\n');
      if (reason !== '') return { executed: false, reason };
    }

    if (fields['executed'] !== true) return unreadable;
    const { action, count, value_cents: value } = fields;
    if (action !== 'bulk_refund' && action !== 'issue_payout' && action !== 'close_account') return unreadable;
    if (!Number.isInteger(count) || !Number.isInteger(value)) return unreadable;
    return { executed: true, action, count: count as number, value_cents: value as number };
  }
  return unreadable;
}

async function openSession(client: TrueForge, agentName: string): Promise<string> {
  const created = await client.sessions.create({ agent: { name: agentName } });
  return created.data.id;
}

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

async function run(config: Config, options: Options): Promise<void> {
  const client = createHarnessClient(config);
  const agents = await ensureAgents(client, config, {
    target: TARGET_INSTRUCTIONS,
    evaluator: EVALUATOR_INSTRUCTIONS,
  });

  // One index for the whole run: `resolveCase` opens turns of its own, and both round 2's
  // held call and the execution result arrive inside them.
  const index = new EventIndex();
  const approvals: TrueForgeApi.ToolApprovalRequiredEvent[] = [];

  const bench: Bench = {
    client,
    queue: new TurnQueue(),
    config,
    cases: new CaseTable(),
    now: () => Date.now(),
    onEvent: benchEvents(index, approvals, out),
  };

  const run = { bench, index, approvals, replica: replicaIdentity(config), emit: out };
  if (options.serve) {
    await watch(run, options, agents.target.id);
  } else {
    await crossExamine(
      {
        ...run,
        targetSession: await openSession(client, config.target_agent_name),
        evaluatorSession: await openSession(client, config.evaluator_agent_name),
      },
      options,
    );
  }
}

/**
 * Answer the holds of chats the Bench did not open (`--serve`).
 *
 * A turn the harness paused on `tool.approval_required` is one the acting agent's chat is
 * waiting on. Its persisted events are the same events a stream would have carried, so they
 * go through the same hook, and the same loop resolves the hold. Every turn is examined once.
 */
async function watch(
  run: Omit<Cast, 'targetSession' | 'evaluatorSession'>,
  options: Options,
  targetAgentId: string,
): Promise<never> {
  const { client } = run.bench;
  const seen = new Set<string>();
  // Holds from before the watcher started are not its to answer.
  const startedAt = new Date(run.bench.now()).toISOString();
  run.emit(noteLine(`watching every chat with ${run.bench.config.target_agent_name} — Ctrl-C stops the Bench`));
  for (;;) {
    // Every list is paged; `for await` walks all pages.
    for await (const session of await client.sessions.list({ agentId: targetAgentId })) {
      let pending: TrueForgeApi.Turn | undefined;
      for await (const turn of await client.sessions.listTurns(session.id)) {
        if (
          !seen.has(turn.id) &&
          turn.createdAt >= startedAt &&
          turn.state.status === 'done' &&
          turn.state.requiredActions.some((action) => action.type === 'tool.approval_required')
        ) {
          pending = turn;
          break;
        }
      }
      if (pending === undefined) continue;
      seen.add(pending.id);
      run.emit('');
      run.emit(noteLine(`held in chat ${session.id}`));
      try {
        for await (const event of await client.sessions.listTurnEvents(session.id, pending.id)) {
          run.bench.onEvent?.(event);
        }
        await examineHeld(
          {
            ...run,
            targetSession: session.id,
            evaluatorSession: await openSession(client, run.bench.config.evaluator_agent_name),
          },
          options,
          customerRequest(pending),
        );
      } catch (error) {
        // One chat's failure does not stop the watch. The hold stays held for a person —
        // never retried, since the decision may already have been delivered (data-model §10).
        run.emit(noteLine(`chat ${session.id} left held: ${error instanceof Error ? error.message : String(error)}`));
        run.approvals.length = 0;
      }
      // The loop resolved or ended every hold it opened in this chat; none is examined twice.
      for await (const turn of await client.sessions.listTurns(session.id)) seen.add(turn.id);
    }
    await new Promise((tick) => setTimeout(tick, WATCH_INTERVAL_MS));
  }
}

/** The request the customer typed into the held chat's turn — the charge sheet's `transcript_excerpt`. */
export function customerRequest(turn: TrueForgeApi.Turn): string {
  const message = turn.input?.find((item) => item.type === 'user.message');
  if (message === undefined) throw new Error(`held turn ${turn.id} carries no customer message`);
  const { content } = message;
  if (typeof content === 'string') return content;
  return content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

/**
 * Everything the cross-examination needs from the run around it.
 *
 * Named separately so the loop can be driven without a harness: `run` builds this from real
 * sessions, the tests build it from a scripted client. It is the same seam `Bench` already
 * uses in the resolver.
 */
export interface Cast {
  bench: Bench;
  targetSession: string;
  evaluatorSession: string;
  /** Fed by the bench's event hook — the run-wide index and the held calls, oldest first. */
  index: EventIndex;
  approvals: TrueForgeApi.ToolApprovalRequiredEvent[];
  replica: { seed: string; as_of: string; path: string };
  /** Where the trace goes: `console.log` in the demo, an array in the tests. */
  emit: Sink;
}

/**
 * The hook every turn of the run reports through: it keeps the run-wide index, collects the
 * held calls, and announces a measurement as the Evaluator asks for it.
 */
export function benchEvents(
  index: EventIndex,
  approvals: TrueForgeApi.ToolApprovalRequiredEvent[],
  emit: Sink,
): (event: TrueForgeApi.TurnStreamingEvent) => void {
  const announced = new Set<string>();
  return (event) => {
    index.add(event);
    if (event.type === 'tool.approval_required') approvals.push(event);
    // The figures are printed once the verdict names the measurement it rests on, so nothing
    // is shown here that a verdict did not use. A streamed call arrives by delta, so the
    // folded message is what is read.
    if (event.type === 'model.message' || event.type === 'model.message.delta') {
      const message = index.get(event.id);
      if (message.type !== 'model.message') return;
      for (const call of message.toolCalls ?? []) {
        if (call.function.name === 'measure' && !announced.has(call.id)) {
          announced.add(call.id);
          emit(measuringLine());
        }
      }
    }
  };
}

/**
 * The loop itself: hold, measure, decide, and on a deny let the agent re-propose once.
 *
 * `--guardrails-only` returns before the Evaluator is ever given a turn, which is what makes
 * the User Story 2 contrast observable: the four controls report, nothing is measured, and
 * the action is still held.
 */
export async function crossExamine(cast: Cast, options: Options): Promise<void> {
  // Round 1 opens with the business request; every later round's proposal arrives inside a
  // turn `resolveCase` already opened.
  await runTurn(cast.bench, cast.targetSession, [{ type: 'user.message', content: BUSINESS_REQUEST }]);
  await examineHeld(cast, options, BUSINESS_REQUEST);
}

/** The rounds over whatever is held: measure, decide, and on a deny let the agent re-propose once. */
export async function examineHeld(cast: Cast, options: Options, transcriptExcerpt: string): Promise<void> {
  const { bench, emit } = cast;
  const config = bench.config;
  const prior: ProposedAction[] = [];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const approval = cast.approvals.shift();
    if (approval === undefined) {
      emit(noteLine('the agent proposed no action — nothing is held, and nothing was decided'));
      return;
    }

    const held = correlate(approval, cast.index);
    // Keyed by the chat as well: the watcher runs this loop once per held chat, and the
    // double-decision guard must not mistake a new chat's round 1 for an old one's.
    const caseId = `case_${cast.targetSession}_${String(round).padStart(3, '0')}`;
    const openedAtMs = Date.now();

    // Decoded here as well as inside `assembleChargeSheet`, because the four controls read
    // the proposal and the sheet takes their report as an input (T026). `decodeProposal` is
    // pure, so the two decodes cannot disagree.
    const decoded = decodeProposal(held.content);

    if (!decoded.ok) {
      // Rule 1, before any Evaluator turn — the Evaluator is not consulted
      // (`contracts/charge-sheet.md`). The approval stays pending.
      emit('');
      for (const line of proposalBlock(round, { parse_error: decoded.error }, null)) emit(line);
      const outcome = decide(decoded, decodeVerdict(''), null, { guidances: 0, elapsed_ms: 0 }, config);
      if ('verdict' in outcome) for (const line of verdictBlock(outcome)) emit(line);
      return;
    }

    const guardrails = checkGuardrails(decoded.value, prior);
    prior.push(decoded.value);

    const assembled = assembleChargeSheet({
      case_id: caseId,
      session_id: cast.targetSession,
      round: round as 1 | 2,
      held,
      guardrails,
      transcript_excerpt: transcriptExcerpt,
      replica: cast.replica,
    });

    emit('');
    for (const line of proposalBlock(round, assembled.charge_sheet.proposal, guardrails)) emit(line);

    if (options.guardrailsOnly) {
      // The summary states what the four checks actually reported. On the seeded proposal
      // all of them pass and none blocks, which is the point of User Story 2 — but saying
      // so unconditionally would contradict the `FAIL` the block above just rendered.
      const blocked = Object.values(guardrails).filter((check) => !check.passed).length;
      const verdictOfControls =
        blocked === 0 ? 'all four passed, no block' : `${String(blocked)} of four blocked`;
      emit(noteLine(`guardrails only — ${verdictOfControls}. The action is still held, and unmeasured.`));
      return;
    }

    const action: HeldAction = {
      case_id: caseId,
      evaluator_session_id: cast.evaluatorSession,
      target_session_id: cast.targetSession,
      thread_id: approval.threadId,
      // The harness keys a decision on the tool call id, not on the approval event's id
      // (`executeToolCalls.mjs:54`); `HeldCall` carries both, and they are not the same.
      approval_id: held.tool_call_id,
      proposal: assembled.proposal,
      opened_at_ms: openedAtMs,
    };

    const evaluatorTurn = await runTurn(cast.bench, cast.evaluatorSession, [
      { type: 'user.message', content: JSON.stringify(assembled.charge_sheet) },
    ]);
    const verdict = await resolveCase(cast.bench, action, evaluatorTurn);

    if (verdict.evidence === null) emit(noMeasurementLine(decoded.value.criteria));
    else emit(measurementLine(verdict.evidence));
    for (const line of verdictBlock(verdict)) emit(line);

    if (verdict.verdict === 'escalate') return;
    if (verdict.verdict === 'allow') {
      emit(executionLine(readExecution(cast.index, held.tool_call_id)));
      return;
    }
    // A deny at the last round is terminal: the run ends with the action unexecuted
    // (data-model §10).
    if (round === MAX_ROUNDS) {
      emit(noteLine('denied at the final round — the action is unexecuted and the run ends'));
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const options = parseOptions(process.argv.slice(2));

  // A stock harness synthesises no tool call from a grammar line, so every proposal turn
  // would end as plain text and nothing would ever be held (D-14). Refusing here is the
  // difference between a demo that fails loudly and one that silently proves nothing.
  if (config.grammar_registry_path === null) {
    out(noteLine('refusing to start: CROSSEXAM_GRAMMAR_REGISTRY_PATH is unset in this process.'));
    out(noteLine('  the harness needs it too — export it before `pnpm exec trueforge`.'));
    process.exitCode = 1;
    return;
  }

  // Every server that actually started is closed, including when the *next* one fails to
  // bind: starting them outside the `try` would leak the first on the second's rejection.
  const started: HttpServer[] = [];
  try {
    started.push(await startActionServer(config.action_server_url));
    started.push(
      await startMeasureServer(config.measure_server_url, {
        ledgerPath: replicaPath(config),
        timeoutMs: config.measurement_timeout_ms,
      }),
    );
    await run(config, options);
  } finally {
    for (const server of started) {
      // The harness keeps its MCP connections alive; `close()` alone would wait on them.
      server.closeAllConnections();
      await new Promise((done) => {
        server.close(() => {
          done(undefined);
        });
      });
    }
  }
}

// Imported (its argument parser is unit-tested), this module is only its surface; run
// directly by `pnpm demo`, it is the demo. Same guard as the two server entrypoints.
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
