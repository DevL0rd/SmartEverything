import { ApiError, type DshWriterClaim } from '@smarteverything/domain';
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
  const { profile_id: profileId } = service.storage.grant(claim.session_id);
  const metadata = service.store.dshSessions.stat(claim.session_id, profileId);
  if (metadata === undefined)
    throw new ApiError('not_found', 'This chat’s native conversation is gone; send a new message.');
  const signal = currentRequestSignal();
  const authorize = (): void => {
    signal?.throwIfAborted();
    service.store.aiChats.assertWorkAllowed(metadata.chat_id);
    service.store.dshSessions.verifyWriter(
      claim,
      service.hostPrincipal(profileId, service.directory.get(claim.target).host),
    );
  };
  authorize();
  return { profileId, chatId: metadata.chat_id, authorize };
}
