import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { HarnessSkillAsset } from '@smarteverything/domain';
import type { SubagentRun } from '@deepseek-ai/dsh-subagent';

export interface PluginAgentCall {
  readonly revision: string;
  readonly asset: HarnessSkillAsset;
  readonly helper: string;
  readonly raw: unknown;
  readonly execution: ToolRunContext;
}
export interface PluginAgentPort {
  start(ctx: Context, call: PluginAgentCall): Promise<SubagentRun>;
}
