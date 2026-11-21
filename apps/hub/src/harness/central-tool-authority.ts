import { AsyncLocalStorage } from 'node:async_hooks';
import { ApiError } from '@smarteverything/domain';
import type { HarnessService } from './service';
import { withLiveCheck } from './live-check';

interface CentralToolAuthority {
  readonly callId: string | undefined;
  readonly authorize: (eventId: string | null) => void;
}

const context = new AsyncLocalStorage<CentralToolAuthority>();

export function withCentralToolAuthority<T>(
  service: HarnessService,
  sessionId: string,
  writer: { readonly callId: string | undefined; readonly verify: () => Promise<void> },
  work: (authority: CentralToolAuthority) => Promise<T>,
): Promise<T> {
  return withLiveCheck(
    service.store,
    async () => {
      await writer.verify();
      return (await service.storage.grant(sessionId)).event_id;
    },
    (live) => {
      const authority = {
        callId: writer.callId,
        authorize: (eventId: string | null): void => {
          if (live.value() !== eventId)
            throw new ApiError(
              'forbidden',
              'The native tool call no longer belongs to the current turn.',
            );
        },
      };
      return context.run(authority, () => work(authority));
    },
  );
}

export function currentCentralToolAuthority(): CentralToolAuthority | undefined {
  return context.getStore();
}
