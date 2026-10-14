import { ApiError, type DshWriterClaim } from '@smarteverything/domain';
import { systemClock, type Clock } from '../clock';

const MAX_LEASE_WAIT_MS = 125_000;

export function waitForWriterExpiry(
  claim: DshWriterClaim,
  signal?: AbortSignal,
  clock: Clock = systemClock,
): Promise<boolean> {
  const expiry = new Date(claim.expires_at);
  if (expiry.getTime() - clock.now().getTime() > MAX_LEASE_WAIT_MS)
    throw new ApiError('conflict', 'The existing writer lease exceeds the safe recovery window.');
  if (signal?.aborted === true) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (expired: boolean): void => {
      cancel();
      signal?.removeEventListener('abort', abort);
      resolve(expired);
    };
    const abort = (): void => {
      finish(false);
    };
    const cancel = clock.at(expiry, () => {
      finish(true);
    });
    signal?.addEventListener('abort', abort, { once: true });
  });
}
