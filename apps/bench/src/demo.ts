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
 *
 * It decides nothing. Every `allow`/`deny` comes from `decide()` by way of `resolveCase`,
 * and every figure printed was computed by the measurement or by the production ledger
 * (Constitution II).
 */

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  measurementLine,
  measuringLine,
  noMeasurementLine,
  noteLine,
  proposalBlock,
  verdictBlock,
} from './trace.ts';

/** The business request that starts the run (`contracts/charge-sheet.md`). */
const BUSINESS_REQUEST = 'Please refund this week of open disputes.';

/** One round of cross-examination, then the re-proposal (spec, Assumptions). */
const MAX_ROUNDS = 2;

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
 * from the rows it changed (T030a). A result the Bench cannot read is reported as such
 * rather than filled in from the proposal.
 */
function readExecution(index: EventIndex, toolCallId: string): Parameters<typeof executionLine>[0] {
  for (let i = index.events.length - 1; i >= 0; i--) {
    const event = index.events[i];
    if (event?.type !== 'tool.response' || event.toolCallId !== toolCallId) continue;
    try {
      const parsed: unknown = JSON.parse(event.content);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Parameters<typeof executionLine>[0];
      }
    } catch {
      break;
    }
    break;
  }
  return { executed: false, reason: 'the action server reported no execution result' };
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

async function run(config: Config): Promise<void> {
  const client = createHarnessClient(config);
  await ensureAgents(client, config, {
    target: TARGET_INSTRUCTIONS,
    evaluator: EVALUATOR_INSTRUCTIONS,
  });

  const targetSession = await openSession(client, config.target_agent_name);
  const evaluatorSession = await openSession(client, config.evaluator_agent_name);

  // One index for the whole run: `resolveCase` opens turns of its own, and both round 2's
  // held call and the execution result arrive inside them.
  const index = new EventIndex();
  const approvals: TrueForgeApi.ToolApprovalRequiredEvent[] = [];
  const announced = new Set<string>();

  const onEvent = (event: TrueForgeApi.TurnStreamingEvent): void => {
    index.add(event);
    if (event.type === 'tool.approval_required') approvals.push(event);
    // The Evaluator has asked for a measurement. Its figures are printed once the verdict
    // names the measurement it rests on, so nothing is shown here that a verdict did not use.
    if (event.type === 'model.message') {
      for (const call of event.toolCalls ?? []) {
        if (call.function.name === 'measure' && !announced.has(call.id)) {
          announced.add(call.id);
          out(measuringLine());
        }
      }
    }
  };

  const bench: Bench = {
    client,
    queue: new TurnQueue(),
    config,
    cases: new CaseTable(),
    now: () => Date.now(),
    onEvent,
  };

  const replica = replicaIdentity(config);
  const prior: ProposedAction[] = [];

  // Round 1 opens with the business request; every later round's proposal arrives inside a
  // turn `resolveCase` already opened.
  await runTurn(bench, targetSession, [{ type: 'user.message', content: BUSINESS_REQUEST }]);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const approval = approvals.shift();
    if (approval === undefined) {
      out(noteLine('the agent proposed no action — nothing is held, and nothing was decided'));
      return;
    }

    const held = correlate(approval, index);
    const caseId = `case_${String(round).padStart(3, '0')}`;
    const openedAtMs = Date.now();

    // Decoded here as well as inside `assembleChargeSheet`, because the four controls read
    // the proposal and the sheet takes their report as an input (T026). `decodeProposal` is
    // pure, so the two decodes cannot disagree.
    const decoded = decodeProposal(held.content);

    if (!decoded.ok) {
      // Rule 1, before any Evaluator turn — the Evaluator is not consulted
      // (`contracts/charge-sheet.md`). The approval stays pending.
      out('');
      for (const line of proposalBlock(round, { parse_error: decoded.error }, null)) out(line);
      const outcome = decide(decoded, decodeVerdict(''), null, { guidances: 0, elapsed_ms: 0 }, config);
      if ('verdict' in outcome) for (const line of verdictBlock(outcome)) out(line);
      return;
    }

    const guardrails = checkGuardrails(decoded.value, prior);
    prior.push(decoded.value);

    const assembled = assembleChargeSheet({
      case_id: caseId,
      session_id: targetSession,
      round: round as 1 | 2,
      held,
      guardrails,
      transcript_excerpt: BUSINESS_REQUEST,
      replica,
    });

    out('');
    for (const line of proposalBlock(round, assembled.charge_sheet.proposal, guardrails)) out(line);

    const action: HeldAction = {
      case_id: caseId,
      evaluator_session_id: evaluatorSession,
      target_session_id: targetSession,
      thread_id: approval.threadId,
      // The harness keys a decision on the tool call id, not on the approval event's id
      // (`executeToolCalls.mjs:54`); `HeldCall` carries both, and they are not the same.
      approval_id: held.tool_call_id,
      proposal: assembled.proposal,
      opened_at_ms: openedAtMs,
    };

    const evaluatorTurn = await runTurn(bench, evaluatorSession, [
      { type: 'user.message', content: JSON.stringify(assembled.charge_sheet) },
    ]);
    const verdict = await resolveCase(bench, action, evaluatorTurn);

    if (verdict.evidence === null) out(noMeasurementLine(decoded.value.criteria));
    else out(measurementLine(verdict.evidence));
    for (const line of verdictBlock(verdict)) out(line);

    if (verdict.verdict === 'escalate') return;
    if (verdict.verdict === 'allow') {
      out(executionLine(readExecution(index, held.tool_call_id)));
      return;
    }
    // A deny at the last round is terminal: the run ends with the action unexecuted
    // (data-model §10).
    if (round === MAX_ROUNDS) {
      out(noteLine('denied at the final round — the action is unexecuted and the run ends'));
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  // A stock harness synthesises no tool call from a grammar line, so every proposal turn
  // would end as plain text and nothing would ever be held (D-14). Refusing here is the
  // difference between a demo that fails loudly and one that silently proves nothing.
  if (config.grammar_registry_path === null) {
    out(noteLine('refusing to start: CROSSEXAM_GRAMMAR_REGISTRY_PATH is unset in this process.'));
    out(noteLine('  the harness needs it too — export it before `pnpm exec trueforge`.'));
    process.exitCode = 1;
    return;
  }

  const actionServer = await startActionServer(config.action_server_url);
  const measureServer = await startMeasureServer(config.measure_server_url, {
    ledgerPath: replicaPath(config),
    timeoutMs: config.measurement_timeout_ms,
  });

  try {
    await run(config);
  } finally {
    await new Promise((done) => {
      actionServer.close(() => {
        done(undefined);
      });
    });
    await new Promise((done) => {
      measureServer.close(() => {
        done(undefined);
      });
    });
  }
}

void main();
