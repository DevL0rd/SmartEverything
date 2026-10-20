import type { BrushMode } from './toothbrush';

export type ZoneCount = 6 | 4 | 0;

const SEXTANT_NAMES = [
  'Upper left',
  'Upper front',
  'Upper right',
  'Lower right',
  'Lower front',
  'Lower left',
] as const;

const QUADRANT_NAMES = ['Upper left', 'Upper right', 'Lower right', 'Lower left'] as const;

const SEXTANT_SWEEP = [1, 2, 3, 4, 5, 6] as const;

const MODE_STEPS: Readonly<Partial<Record<BrushMode, readonly number[]>>> = {
  clean: SEXTANT_SWEEP,
  sensitive: SEXTANT_SWEEP,
  deep_clean_plus: SEXTANT_SWEEP,
  white_plus: [1, 2, 3, 4, 5, 6, 2, 5],
  gum_health: [1, 2, 3, 4, 5, 6, 1, 3, 4, 6],
  tongue_care: [],
};

const QUADRANT_STEPS = [1, 2, 3, 4] as const;

export function zoneNamesOf(zones: ZoneCount): readonly string[] {
  switch (zones) {
    case 6:
      return SEXTANT_NAMES;
    case 4:
      return QUADRANT_NAMES;
    case 0:
      return [];
  }
}

export function stepsOf(mode: BrushMode, zones: ZoneCount): readonly number[] {
  switch (zones) {
    case 0:
      return [];
    case 4:
      return QUADRANT_STEPS;
    case 6:
      return MODE_STEPS[mode] ?? SEXTANT_SWEEP;
  }
}

export function stepSeconds(mode: BrushMode, zones: ZoneCount, routineS: number): number {
  const count = Math.max(stepsOf(mode, zones).length, 1);
  return routineS / count;
}

export function zoneAt(
  mode: BrushMode,
  zones: ZoneCount,
  elapsedS: number,
  routineS: number,
): number | null {
  const steps = stepsOf(mode, zones);
  if (steps.length === 0 || routineS <= 0 || elapsedS < 0) {
    return null;
  }
  const index = Math.min(
    steps.length - 1,
    Math.floor(elapsedS / stepSeconds(mode, zones, routineS)),
  );
  return steps[index] ?? null;
}

export function zoneSeconds(
  mode: BrushMode,
  zones: ZoneCount,
  durationS: number,
  routineS: number,
): readonly number[] {
  const steps = stepsOf(mode, zones);
  const totals = Array.from({ length: zones }, () => 0);
  if (steps.length === 0 || routineS <= 0) {
    return totals;
  }
  const each = stepSeconds(mode, zones, routineS);
  steps.forEach((zone, index) => {
    const spent = Math.max(0, Math.min(each, durationS - index * each));
    totals[zone - 1] = (totals[zone - 1] ?? 0) + spent;
  });
  return totals;
}

export function zonesReached(
  mode: BrushMode,
  zones: ZoneCount,
  durationS: number,
  routineS: number,
): readonly number[] {
  return zoneSeconds(mode, zones, durationS, routineS).flatMap((seconds, index) =>
    seconds > 0 ? [index + 1] : [],
  );
}

export function zonesMissed(
  mode: BrushMode,
  zones: ZoneCount,
  durationS: number,
  routineS: number,
): readonly number[] {
  const reached = new Set(zonesReached(mode, zones, durationS, routineS));
  const needed = new Set(stepsOf(mode, zones));
  return [...needed].filter((zone) => !reached.has(zone));
}
