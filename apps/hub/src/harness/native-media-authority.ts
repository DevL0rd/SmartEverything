import type { DshWriterClaim } from '@smarteverything/domain';
import { currentRequestSignal } from '../server/request-signal';
import type { HarnessService } from './service';
import { withLiveCheck } from './live-check';

interface NativeMediaAuthority {
  readonly profileId: string;
  readonly chatId: string;
  readonly authorize: () => void;
}

async function checkedMedia(
  service: HarnessService,
  claim: DshWriterClaim,
): Promise<{ readonly profileId: string; readonly chatId: string }> {
  const host = service.directory.get(claim.target).host;
  const media = await service.store.host.read('harnessMediaAuthority', {
    claim,
    host: { target: host.target, platform: host.platform },
    runtime_instance: host.runtime_instance,
    connection_generation: host.connection_generation,
  });
  service.store.live.chatWork.assertWorkAllowed(media.chatId);
  return media;
}

export async function verifyNativeMedia(
  service: HarnessService,
  claim: DshWriterClaim,
): Promise<void> {
  currentRequestSignal()?.throwIfAborted();
  await checkedMedia(service, claim);
}

export function withNativeMediaAuthority<T>(
  service: HarnessService,
  claim: DshWriterClaim,
  work: (authority: NativeMediaAuthority) => Promise<T>,
): Promise<T> {
  const signal = currentRequestSignal();
  signal?.throwIfAborted();
  return withLiveCheck(
    service.store,
    () => checkedMedia(service, claim),
    (live) => {
      const { profileId, chatId } = live.value();
      const authorize = (): void => {
        signal?.throwIfAborted();
        live.value();
        service.store.live.chatWork.assertWorkAllowed(chatId);
      };
      return work({ profileId, chatId, authorize });
    },
  );
}
