/**
 * Agent creation from configuration — T022 (FR-022, research D-10, D-15).
 *
 * Nothing about either agent is hardcoded: names and models come from `Config`, the
 * instructions from the caller, and both MCP servers are registered by URL from `Config`.
 * The action server is held at every call (`@all`); the `measure` server is read-only and
 * needs no approval. Creation is idempotent, so a re-run of the demo reuses both agents.
 */

import type { TrueForge, TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { Config } from '@crossexam/core';

export const ACTION_SERVER = 'crossexam-actions';
export const MEASURE_SERVER = 'crossexam-measure';

export interface Instructions {
  target: string;
  evaluator: string;
}

export interface Agents {
  target: TrueForgeApi.Agent;
  evaluator: TrueForgeApi.Agent;
}

export async function ensureAgents(
  client: TrueForge,
  config: Config,
  instructions: Instructions,
): Promise<Agents> {
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      type: 'remote',
      name: ACTION_SERVER,
      url: config.action_server_url,
      description: 'CROSS-EXAM irreversible actions (@crossexam/mcp): bulk_refund, issue_payout, close_account',
    },
  });
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      type: 'remote',
      name: MEASURE_SERVER,
      url: config.measure_server_url,
      description: 'CROSS-EXAM read-only measure tool over the replica ledger (@crossexam/measure)',
    },
  });

  const target = await upsertAgent(client, config.target_agent_name, {
    model: { name: config.target_model },
    instructions: instructions.target,
    mcpServers: [{ name: ACTION_SERVER, requireApprovalForTools: ['@all'] }],
  });
  const evaluator = await upsertAgent(client, config.evaluator_agent_name, {
    model: { name: config.evaluator_model },
    instructions: instructions.evaluator,
    mcpServers: [{ name: MEASURE_SERVER }],
  });
  return { target, evaluator };
}

/** Create the agent, or replace its manifest when one with that name already exists. */
async function upsertAgent(client: TrueForge, name: string, manifest: TrueForgeApi.AgentSpec): Promise<TrueForgeApi.Agent> {
  const existing = (await client.agents.list()).data.find((agent) => agent.name === name);
  const response = existing
    ? await client.agents.update(existing.id, { manifest })
    : await client.agents.create({ name, manifest });
  return response.data;
}
