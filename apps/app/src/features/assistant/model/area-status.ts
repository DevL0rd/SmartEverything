import type { SyncStatus } from '../../../store/selectors';

export const RECONNECT_GRACE_MS = 2000;

export interface AreaFacts {
  readonly sync: SyncStatus['status'];
  readonly assistantKnown: boolean;
  readonly chatCount: number;
  readonly graceElapsed: boolean;
}

export type AreaStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'reconnecting' }
  | { readonly kind: 'offline-cached' }
  | { readonly kind: 'offline-empty' }
  | { readonly kind: 'live' };

export type BlockedAreaStatus = Extract<AreaStatus, { kind: 'loading' | 'offline-empty' }>;

export function graceElapsed(offlineSince: number | null, now: number): boolean {
  return offlineSince !== null && now - offlineSince >= RECONNECT_GRACE_MS;
}

export function onGraceElapsed(
  offlineSince: number | null,
  now: number,
  elapsed: () => void,
): () => void {
  if (offlineSince === null || graceElapsed(offlineSince, now)) return (): void => undefined;
  const timer = setTimeout(elapsed, offlineSince + RECONNECT_GRACE_MS - now);
  return (): void => {
    clearTimeout(timer);
  };
}

export function areaBlocked(status: AreaStatus): status is BlockedAreaStatus {
  return status.kind === 'loading' || status.kind === 'offline-empty';
}

export function areaStatusOf(facts: AreaFacts): AreaStatus {
  if (facts.sync === 'live') return facts.assistantKnown ? { kind: 'live' } : { kind: 'loading' };
  if (!facts.graceElapsed && facts.sync !== 'refused')
    return facts.assistantKnown ? { kind: 'reconnecting' } : { kind: 'loading' };
  return facts.chatCount > 0 ? { kind: 'offline-cached' } : { kind: 'offline-empty' };
}
