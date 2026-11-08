import type { PlannerRingNotice } from '@smarteverything/domain';
import { ValueStore, useValue } from '../../../design/external-store';

export const incomingRing = new ValueStore<PlannerRingNotice | null>(null);

export function receivePlannerRing(notice: PlannerRingNotice): void {
  incomingRing.set(notice);
}

export function clearPlannerRing(ringId: string): void {
  incomingRing.update((current) => (current?.ringId === ringId ? null : current));
}

export function useIncomingPlannerRing(): PlannerRingNotice | null {
  return useValue(incomingRing);
}
