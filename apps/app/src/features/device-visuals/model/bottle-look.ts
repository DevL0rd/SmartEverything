import type { BottleOrientation } from '@smarteverything/domain';

export const BOTTLE_TILT_DEGREES: Readonly<Record<BottleOrientation, number>> = {
  upright: 0,
  tilted: 24,
  side: 82,
  upside_down: 180,
};
