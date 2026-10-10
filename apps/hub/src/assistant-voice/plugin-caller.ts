import { turnRoleOf, type PluginOrigin } from '@smarteverything/domain';
import type { OutreachAnswer } from './outreach';
import type { Caller, HostedCaller } from './persona';

function roleUnder(role: Caller['role'], origin: PluginOrigin): Caller['role'] {
  return turnRoleOf(origin.requester) === 'owner' ? role : 'member';
}

export function answeredCaller(caller: Caller, answer: OutreachAnswer | null): Caller {
  return answer?.kind !== 'answer' || answer.origin === null
    ? caller
    : {
        ...caller,
        role: roleUnder(caller.role, answer.origin),
        requester: answer.origin.requester,
        pluginId: answer.origin.plugin_id,
      };
}

export function hostedUnder(
  caller: Pick<HostedCaller, 'profileId' | 'role' | 'label'>,
  origin: PluginOrigin | null | undefined,
): HostedCaller {
  return origin === null || origin === undefined
    ? caller
    : {
        ...caller,
        role: roleUnder(caller.role, origin),
        requester: origin.requester,
        pluginId: origin.plugin_id,
      };
}
