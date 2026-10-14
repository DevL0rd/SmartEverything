import type { HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessAuthority } from '../host/server-policy';
import type { HarnessSessionOptions } from '../host/contracts';
export function sessionOpenOptions(
  input: Extract<HarnessRuntimeRequest, { kind: 'open' }>,
  authority: HarnessAuthority | undefined,
): HarnessSessionOptions {
  return {
    sessionId: input.claim.session_id,
    provider: input.route.route_id,
    model: input.route.model,
    ...(input.route.effort === null ? {} : { effort: input.route.effort }),
    directory: input.cwd,
    storageBinding: input.storage_binding,
    permission: input.permission,
    ...(authority === undefined ? {} : { authority }),
  };
}
