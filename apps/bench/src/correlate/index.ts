/**
 * Correlation — T025.
 *
 * `tool.approval_required` carries only `{id, sourceEventId}` per held call (research §A):
 * the tool name lives on the `model.message` it points at, and the proposal is that
 * message's text — the one grammar line the model wrote. The harness-synthesised
 * `tool_calls[].function.arguments` are never read (FR-002, D-14): the Bench decodes the
 * proposal from the content, and only from the content.
 */

import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

import type { EventIndex } from '../sessions/stream.ts';

/** One held tool call, resolved to what the Bench needs to build the charge sheet (T026). */
export interface HeldCall {
  /** `tool.approval_required.id` — what the Bench resolves later. */
  approval_id: string;
  tool_call_id: string;
  tool_name: string;
  /** The `model.message` text, verbatim — the proposal line is decoded from this. */
  content: string;
}

function text(content: TrueForgeApi.ModelMessageEventContent | null | undefined): string {
  if (typeof content === 'string') return content;
  return (content ?? []).flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

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
  return { approval_id: approval.id, tool_call_id: ref.id, tool_name: call.function.name, content: text(source.content) };
}
