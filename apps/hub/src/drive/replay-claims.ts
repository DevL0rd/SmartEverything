import { AsyncLocalStorage } from 'node:async_hooks';

export interface ReplayClaim {
  readonly placementId: string;
  readonly opId: string;
  readonly action: string;
}

const claims = new AsyncLocalStorage<ReplayClaim>();

export function claimed<T>(claim: ReplayClaim, work: () => T): T {
  return claims.run(claim, work);
}

export function currentClaim(): ReplayClaim | undefined {
  return claims.getStore();
}

export function unclaimed<T>(work: () => T): T {
  return claims.exit(work);
}
