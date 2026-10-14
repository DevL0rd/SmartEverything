import { HarnessRuntimeError } from './errors';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { AI_HARNESS_PERMISSION } from '@smarteverything/domain';
import type { AiHarnessPermission } from '@smarteverything/domain';

export function initializeSessionPermission(
  ctx: Context,
  agent: Agent,
  policy: AiHarnessPermission | undefined,
  resume: boolean,
): void {
  if (policy === undefined) return;
  const state = ctx.sessionProjections.stateOf(agent.session, 'permissions');
  if (state === undefined)
    throw new HarnessRuntimeError('composition_incompatible', 'Permission projection is absent.');
  const recorded = state.preset !== null || state.sandbox !== null || state.approval !== null;
  if (!resume || !recorded) {
    setSessionPermission(ctx, agent, policy);
    return;
  }
  const effective = ctx.permissionPresets.resolve(ctx.permissionPresets.current(agent.session));
  const approval = effective.approval === 'never' ? 'never' : 'on-request';
  if (effective.sandbox !== policy.sandbox || approval !== policy.approval)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Resume permission differs from the recorded session policy. Change it explicitly after reopening.',
    );
}

export function setSessionPermission(ctx: Context, agent: Agent, input: AiHarnessPermission): void {
  const policy = AI_HARNESS_PERMISSION.parse(input);
  if (policy.approval !== 'never' && policy.approval !== 'on-request')
    throw new HarnessRuntimeError(
      'operation_failed',
      `DSH does not implement approval policy ${policy.approval}.`,
    );
  if ((policy.sandbox === 'danger-full-access') !== (policy.approval === 'never'))
    throw new HarnessRuntimeError(
      'operation_failed',
      'The requested sandbox/approval combination has no composed permission preset.',
    );
  ctx.permissionPresets.set(agent.session, policy.sandbox);
}
