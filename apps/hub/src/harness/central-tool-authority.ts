import { AsyncLocalStorage } from 'node:async_hooks';
import { ApiError } from '@smarteverything/domain';
import type { HarnessService } from './service';

interface CentralToolAuthority {
  readonly callId: string | undefined;
  readonly authorize: (eventId: string | null) => void;
}

const context = new AsyncLocalStorage<CentralToolAuthority>();

export function withCentralToolAuthority<T>(
  service: HarnessService,
  sessionId: string,
  writer: { readonly callId: string | undefined; readonly verify: () => void },
  work: (authority: CentralToolAuthority) => T,
): T {
  const authorize = (eventId: string | null): void => {
    writer.verify();
    if (service.storage.grant(sessionId).event_id !== eventId)
      throw new ApiError(
        'forbidden',
        'The native tool call no longer belongs to the current turn.',
      );
  };
  const authority = { callId: writer.callId, authorize };
  return context.run(authority, () => work(authority));
}

export function currentCentralToolAuthority(): CentralToolAuthority | undefined {
  return context.getStore();
}
