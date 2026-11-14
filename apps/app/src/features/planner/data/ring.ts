import type { PlannerRingNotice, PlannerRingRow } from '@smarteverything/domain';
import { useEffect } from 'react';
import { ValueStore, useValue } from '../../../design/external-store';

export const incomingRing = new ValueStore<PlannerRingNotice | null>(null);

export const shownRing = new ValueStore<string | null>(null);

export type RingPhase =
  | { readonly kind: 'ringing' }
  | { readonly kind: 'snoozed'; readonly until: string }
  | { readonly kind: 'stopped' };

export interface RingWindow {
  readonly from: string;
  readonly to: string;
}

export interface RingOpenInput {
  readonly notice: PlannerRingNotice;
  readonly ring: PlannerRingRow | null;
  readonly now: number;
  readonly foreground: boolean;
  readonly shown: string | null;
}

export interface RingOpener {
  readonly foreground: () => boolean;
  readonly rings: (window: RingWindow) => Promise<readonly PlannerRingRow[]>;
  readonly now: () => number;
  readonly open: (ringId: string) => void;
}

export function receivePlannerRing(notice: PlannerRingNotice): void {
  incomingRing.set(notice);
}

export function clearPlannerRing(ringId: string): void {
  incomingRing.update((current) => (current?.ringId === ringId ? null : current));
}

export function useIncomingPlannerRing(): PlannerRingNotice | null {
  return useValue(incomingRing);
}

export function useShownRing(ringId: string, focused: boolean): void {
  useEffect(() => {
    if (!focused) return undefined;
    shownRing.set(ringId);
    return (): void => {
      shownRing.update((current) => (current === ringId ? null : current));
    };
  }, [focused, ringId]);
}

export function dueWindowOf(dueAt: string): RingWindow {
  const from = new Date(dueAt);
  return { from: from.toISOString(), to: new Date(from.getTime() + 1).toISOString() };
}

export function ringPhaseOf(ring: PlannerRingRow, now: number): RingPhase {
  if (ring.outcome === 'missed' || ring.dismissed_at !== null || ring.rang_at === null) {
    return { kind: 'stopped' };
  }
  if (Date.parse(ring.rang_at) > now) return { kind: 'snoozed', until: ring.rang_at };
  return { kind: 'ringing' };
}

export function ringOpens({ notice, ring, now, foreground, shown }: RingOpenInput): boolean {
  if (!foreground || shown === notice.ringId || ring === null) return false;
  if (ring.kind === 'reminder') return false;
  return ringPhaseOf(ring, now).kind === 'ringing';
}

export async function openRingWhenRinging(
  notice: PlannerRingNotice,
  opener: RingOpener,
): Promise<boolean> {
  if (notice.kind === 'reminder' || !opener.foreground()) return false;
  const rows = await opener.rings(dueWindowOf(notice.dueAt));
  const ring = rows.find((row) => row.id === notice.ringId) ?? null;
  const opens = ringOpens({
    notice,
    ring,
    now: opener.now(),
    foreground: opener.foreground(),
    shown: shownRing.get(),
  });
  if (opens) opener.open(notice.ringId);
  return opens;
}
