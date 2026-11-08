import { PLANNER_RING_KINDS, type PlannerMissedReason } from '@smarteverything/domain';
import { z } from 'zod';

export const DESKTOP_RING = z
  .strictObject({
    ringKey: z.string().min(1),
    kind: z.enum(PLANNER_RING_KINDS),
    refId: z.uuid(),
    dueAt: z.iso.datetime({ offset: true }),
    label: z.string().min(1).nullable(),
    rampSeconds: z.int().nonnegative(),
  })
  .readonly();

export const DESKTOP_RING_SET = z.array(DESKTOP_RING).readonly();

export type DesktopRing = z.infer<typeof DESKTOP_RING>;

export type RingChoice = 'dismiss' | 'snooze';

export type Cancel = () => void;

export interface RingClock {
  readonly now: () => Date;
  readonly at: (moment: Date, action: () => void) => Cancel;
}

export interface RingSurface {
  readonly show: (ring: DesktopRing, onChoice: (choice: RingChoice) => void) => void;
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
