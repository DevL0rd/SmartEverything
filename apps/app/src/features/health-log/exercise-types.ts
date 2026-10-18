import { HC_CODES, hcEntry } from '@smarteverything/domain';
import type { IconName } from '../../components/icon';
import type { Choice } from './form-kit';
import { compareText } from '../../format/text';

interface ExerciseKind {
  readonly name: string;
  readonly icon: IconName;
}

const ICONS: Readonly<Record<number, IconName>> = {
  0: 'dumbbell',
  10: 'dumbbell',
  11: 'dumbbell',
  13: 'dumbbell',
  26: 'dumbbell',
  70: 'dumbbell',
  81: 'dumbbell',
  8: 'bike',
  9: 'bike',
  33: 'breath',
  36: 'flame',
  37: 'mountain',
  51: 'mountain',
  61: 'mountain',
  62: 'mountain',
  63: 'mountain',
  68: 'mountain',
  69: 'mountain',
  56: 'footprints',
  57: 'footprints',
  79: 'footprints',
  73: 'droplet',
  74: 'droplet',
  80: 'droplet',
};

const DISTANCE_BASED: ReadonlySet<number> = new Set([
  8, 37, 46, 53, 56, 57, 58, 60, 61, 63, 73, 74, 79, 82,
]);

export function isDistanceBased(code: number): boolean {
  return DISTANCE_BASED.has(code);
}

const SPEED_BASED: ReadonlySet<number> = new Set([8, 9, 61, 62]);

export function prefersSpeed(code: number): boolean {
  return SPEED_BASED.has(code);
}

export function exerciseKindOf(code: number): ExerciseKind {
  const entry = hcEntry(HC_CODES.exerciseType, code);
  if (entry === undefined) {
    return { name: `Exercise type ${String(code)}`, icon: 'dumbbell' };
  }
  return { name: entry.label, icon: ICONS[code] ?? 'activity' };
}

export function exerciseChoices(): readonly Choice[] {
  return HC_CODES.exerciseType
    .map(({ code, label }) => ({ value: code, label }))
    .sort((left, right) => compareText(left.label, right.label));
}
