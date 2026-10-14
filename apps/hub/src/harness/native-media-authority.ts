import { isDeepStrictEqual } from 'node:util';
import { ApiError, harnessTargetKey, type DshWriterClaim } from '@smarteverything/domain';
import { eventAuthority, validateExecutionAuthority } from '../assistant/execution-authority';
import { validateAuthorityGraph } from '../assistant/authority-inheritance';
import { currentRequestSignal } from '../server/request-signal';
import type { HarnessService } from './service';
interface NativeMediaAuthority {
  readonly profileId: string;
  readonly chatId: string;
  readonly authorize: () => void;
}
export function nativeMediaAuthority(
  service: HarnessService,
  claim: DshWriterClaim,
): NativeMediaAuthority {
  const grant = service.storage.grant(claim.session_id);
  if (
    grant.runtime_instance !== claim.runtime_instance ||
    grant.generation !== claim.connection_generation ||
    harnessTargetKey(grant.target) !== harnessTargetKey(claim.target)
  )
    throw new ApiError(
      'forbidden',
      'Native media writer differs from its initiating execution grant.',
    );
  const metadata = service.store.dshSessions.stat(claim.session_id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('not_found', 'Native media conversation is absent.');
  const event =
    grant.event_id === null ? undefined : service.store.assistantEvents.event(grant.event_id);
  if (
    event !== undefined &&
    (event.chat_id !== metadata.chat_id || event.profile_id !== grant.profile_id)
  )
    throw new ApiError('forbidden', 'Native media initiating event differs from its conversation.');
  const authorities =
    event === undefined
      ? []
      : validateAuthorityGraph(service.store, eventAuthority(service.store, event));
  const signal = currentRequestSignal();
  const authorize = (): void => {
    signal?.throwIfAborted();
    const current = service.storage.grant(claim.session_id);
    if (!isDeepStrictEqual(current, grant))
      throw new ApiError('forbidden', 'Native media initiating execution grant changed.');
    for (const authority of authorities) validateExecutionAuthority(service.store, authority);
    service.store.aiChats.assertWorkAllowed(metadata.chat_id);
    service.store.dshSessions.verifyWriter(
      claim,
      service.hostPrincipal(grant.profile_id, service.directory.get(claim.target).host),
    );
  };
  authorize();
  return { profileId: grant.profile_id, chatId: metadata.chat_id, authorize };
}
