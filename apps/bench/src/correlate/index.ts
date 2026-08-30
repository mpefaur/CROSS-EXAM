/**
 * Correlation — T025.
 *
 * `tool.approval_required` carries only `{id, sourceEventId}` per held call (research §A):
 * the tool name and the synthesised call live on the `model.message` it points at. The
 * harness adapter split the model's one grammar line into that call's arguments by position
 * and dropped the line from the persisted text (T051), so the proposal is rebuilt as the
 * grammar line from those raw strings — unparsed, exactly as split — and decoded from that
 * line and nothing else (FR-002, D-14).
 */

import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { proposalLine } from '@crossexam/core';
import type { ActionName } from '@crossexam/core';

import type { EventIndex } from '../sessions/stream.ts';

/** One held tool call, resolved to what the Bench needs to build the charge sheet (T026). */
export interface HeldCall {
  /** `tool.approval_required.id` — what the Bench resolves later. */
  approval_id: string;
  tool_call_id: string;
  tool_name: string;
  /** The grammar line, rebuilt from the call — the proposal is decoded from this. */
  content: string;
}

/** The adapter's argument names for every action, in the line's field order (`contracts/mcp-tools.md`). */
const FIELDS = ['criteria', 'declared_count', 'declared_value'] as const;

/** Walk one `tool.approval_required` back to its `model.message`; the harness holds one call per proposal turn. */
export function correlate(approval: TrueForgeApi.ToolApprovalRequiredEvent, events: EventIndex): HeldCall {
  const [ref, ...rest] = approval.toolCalls;
  if (ref === undefined || rest.length > 0) {
    throw new Error(`approval ${approval.id} holds ${approval.toolCalls.length} tool calls, expected one`);
  }
  const source = events.get(ref.sourceEventId);
  if (source.type !== 'model.message') {
    throw new Error(`approval ${approval.id} points at a ${source.type} event, expected model.message`);
  }
  const call = source.toolCalls?.find((c) => c.id === ref.id);
  if (call === undefined) {
    throw new Error(`model.message ${source.id} has no tool call ${ref.id}`);
  }
  const args = JSON.parse(call.function.arguments) as Record<string, string>;
  const content = proposalLine(
    call.function.name as ActionName,
    FIELDS.flatMap((field) => (field in args ? [args[field]!] : [])),
  );
  return { approval_id: approval.id, tool_call_id: ref.id, tool_name: call.function.name, content };
}
