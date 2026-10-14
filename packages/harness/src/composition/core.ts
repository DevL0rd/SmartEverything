import type { Context } from '@deepseek-ai/cordis';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import SessionStore from '@deepseek-ai/dsh-session';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import SessionProjection from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import ApprovalService from '@deepseek-ai/dsh-user-approval';
import UserQuestions from '@deepseek-ai/dsh-user-questions';
import PermissionPresets from '@deepseek-ai/dsh-permission-presets';
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy';
import { ConfiguredCompaction } from './compaction-policy';
import TokenMeter from '@deepseek-ai/dsh-token-meter';
import { mountServerProductSkills } from './product-skills';
import Commands from '@deepseek-ai/dsh-commands';
import * as HumanCommands from './human-commands';
import ToolResultPruner from '@deepseek-ai/dsh-compaction-tool-result-pruner';
import * as CheckpointPolicy from '@deepseek-ai/dsh-session-checkpoint-policy';
import * as LlmRetry from '@deepseek-ai/dsh-llm-retry';
import { HubSessionPersistence } from '../persistence/service';
import type { NativeSessionPersistencePort } from '../persistence/port';

export async function mountCore(
  ctx: Context,
  port: NativeSessionPersistencePort,
  cwd: string,
  server: boolean,
): Promise<void> {
  await ctx.plugin(LlmRuntime);
  await ctx.plugin(SessionStore);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(SessionProjection);
  await ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(HubSessionPersistence, port);
  await ctx.plugin(Commands);
  await ctx.plugin(ApprovalService, { policy: server ? 'ask' : 'never' });
  await ctx.plugin(UserQuestions);
  await ctx.plugin(SandboxPolicy, {
    mode: server ? 'read-only' : 'danger-full-access',
    workspaceRoot: cwd,
  });
  await ctx.plugin(PermissionPresets, {
    defaultPreset: server ? 'read-only' : 'danger-full-access',
    presets: {
      'read-only': { sandbox: 'read-only', approval: 'ask' },
      'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
      'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
    },
  });
  await ctx.plugin(LlmRetry);
  await ctx.plugin(TokenMeter);
  await ctx.plugin(ToolResultPruner);
  await ctx.plugin(ConfiguredCompaction);
  await ctx.plugin(HumanCommands);
  await ctx.plugin(CheckpointPolicy);
  await ctx.plugin(AgentLoop, { agents: [] });
  if (server) await mountServerProductSkills(ctx);
}
