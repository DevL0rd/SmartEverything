import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { AI_HARNESS_PERMISSION } from '@smarteverything/domain';
import type { AiHarnessPermission } from '@smarteverything/domain';

export function setSessionPermission(ctx: Context, agent: Agent, input: AiHarnessPermission): void {
  ctx.permissionPresets.set(agent.session, AI_HARNESS_PERMISSION.parse(input).sandbox);
}
