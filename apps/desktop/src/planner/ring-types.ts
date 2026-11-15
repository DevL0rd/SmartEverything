import {
  PLANNER_CHALLENGE,
  PLANNER_RESOLVED_SOUND,
  PLANNER_RING_KINDS,
  type PlannerMissedReason,
} from '@smarteverything/domain';
import { z } from 'zod';

export const DESKTOP_RING = z
  .strictObject({
    ringKey: z.string().min(1),
    kind: z.enum(PLANNER_RING_KINDS),
    refId: z.uuid(),
    dueAt: z.iso.datetime({ offset: true }),
    label: z.string().min(1).nullable(),
    rampSeconds: z.int().nonnegative(),
    sound: PLANNER_RESOLVED_SOUND,
    snoozeLimit: z.int().positive().nullable(),
    snoozes: z.int().nonnegative(),
    challenge: PLANNER_CHALLENGE,
  })
  .readonly();

export const DESKTOP_RING_SET = z.array(DESKTOP_RING).readonly();

export type DesktopRing = z.infer<typeof DESKTOP_RING>;

export type RingChoice = 'dismiss' | 'snooze';

export type Cancel = () => void;

export type RingElsewhere =
  | { readonly kind: 'ringing' }
  | { readonly kind: 'dismissed' }
  | { readonly kind: 'snoozed'; readonly until: string; readonly snoozes: number };

export interface RingClock {
  readonly now: () => Date;
  readonly at: (moment: Date, action: () => void) => Cancel;
}

export interface RingSurface {
  readonly show: (
    ring: DesktopRing,
    failed: RingChoice | null,
    onChoice: (choice: RingChoice) => void,
  ) => void;
  readonly focus: (ringKey: string) => void;
  readonly close: (ringKey: string) => void;
}

export interface RingNotifier {
  readonly ringing: (ring: DesktopRing, onClick: () => void) => void;
  readonly missed: (ring: DesktopRing) => void;
}

export interface RingOutcomes {
  readonly dismissed: (ring: DesktopRing) => Promise<void>;
  readonly snoozed: (ring: DesktopRing) => Promise<void>;
  readonly missed: (ring: DesktopRing, reason: PlannerMissedReason) => Promise<void>;
}

export function snoozesLeft(ring: DesktopRing): number | null {
  if (ring.kind !== 'alarm') return 0;
  return ring.snoozeLimit === null ? null : Math.max(ring.snoozeLimit - ring.snoozes, 0);
}

export function stopsHere(ring: DesktopRing): boolean {
  return ring.challenge.kind === 'none' || ring.challenge.kind === 'maths';
}
