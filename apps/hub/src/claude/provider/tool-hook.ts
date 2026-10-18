import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeMcpServers, ProviderTurn } from '@smarteverything/domain';
import type { JobLog } from './job-log';
import type { ProviderServers } from './servers';
import { OUTSIDE_SCOPE, permitsProviderTool } from './tool-scope';

export interface ToolHookJob {
  readonly turn: ProviderTurn;
  readonly externalServers: ClaudeMcpServers;
  readonly servers: ProviderServers;
  readonly trace: JobLog;
  readonly refreshMcpServers: () => Promise<void>;
}

export async function preToolUse(
  job: ToolHookJob,
  input: HookInput,
  allowed: ReadonlySet<string>,
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PreToolUse') return {};
  if (input.mcp_server !== undefined) await job.refreshMcpServers();
  const scope = {
    turn: job.turn,
    allowed,
    externalServers: job.externalServers,
    blocked: job.servers.blocked,
    native: job.servers.native,
    builtin: job.servers.builtin,
  };
  if (permitsProviderTool(scope, input.tool_name, input.mcp_server)) return {};
  job.trace.toolDenied(input.tool_name, input.mcp_server?.name);
  return OUTSIDE_SCOPE;
}
