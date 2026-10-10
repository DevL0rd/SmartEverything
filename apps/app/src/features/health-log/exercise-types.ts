import type { IconName } from '../../components/icon';

interface ExerciseKind {
  readonly name: string;
  readonly icon: IconName;
}

const KINDS: Readonly<Record<number, ExerciseKind>> = {
  0: { name: 'Workout', icon: 'dumbbell' },
  2: { name: 'Badminton', icon: 'activity' },
  4: { name: 'Baseball', icon: 'activity' },
  5: { name: 'Basketball', icon: 'activity' },
  8: { name: 'Cycling', icon: 'bike' },
  9: { name: 'Stationary bike', icon: 'bike' },
  10: { name: 'Boot camp', icon: 'dumbbell' },
  11: { name: 'Boxing', icon: 'dumbbell' },
  13: { name: 'Calisthenics', icon: 'dumbbell' },
  14: { name: 'Cricket', icon: 'activity' },
  16: { name: 'Dancing', icon: 'activity' },
  25: { name: 'Elliptical', icon: 'activity' },
  26: { name: 'Exercise class', icon: 'dumbbell' },
  27: { name: 'Fencing', icon: 'activity' },
  28: { name: 'American football', icon: 'activity' },
  29: { name: 'Australian football', icon: 'activity' },
  31: { name: 'Frisbee', icon: 'activity' },
  32: { name: 'Golf', icon: 'activity' },
  33: { name: 'Guided breathing', icon: 'breath' },
  34: { name: 'Gymnastics', icon: 'activity' },
  35: { name: 'Handball', icon: 'activity' },
  36: { name: 'HIIT', icon: 'flame' },
  37: { name: 'Hiking', icon: 'mountain' },
  38: { name: 'Ice hockey', icon: 'activity' },
  39: { name: 'Ice skating', icon: 'activity' },
  44: { name: 'Martial arts', icon: 'activity' },
  46: { name: 'Paddling', icon: 'activity' },
  47: { name: 'Paragliding', icon: 'activity' },
  48: { name: 'Pilates', icon: 'activity' },
  50: { name: 'Racquetball', icon: 'activity' },
  51: { name: 'Rock climbing', icon: 'mountain' },
  52: { name: 'Roller hockey', icon: 'activity' },
  53: { name: 'Rowing', icon: 'activity' },
  54: { name: 'Rowing machine', icon: 'activity' },
  55: { name: 'Rugby', icon: 'activity' },
  56: { name: 'Running', icon: 'footprints' },
  57: { name: 'Treadmill', icon: 'footprints' },
  58: { name: 'Sailing', icon: 'activity' },
  59: { name: 'Scuba diving', icon: 'activity' },
  60: { name: 'Skating', icon: 'activity' },
  61: { name: 'Skiing', icon: 'mountain' },
  62: { name: 'Snowboarding', icon: 'mountain' },
  63: { name: 'Snowshoeing', icon: 'mountain' },
  64: { name: 'Football', icon: 'activity' },
  65: { name: 'Softball', icon: 'activity' },
  66: { name: 'Squash', icon: 'activity' },
  68: { name: 'Stair climbing', icon: 'mountain' },
  69: { name: 'Stair machine', icon: 'mountain' },
  70: { name: 'Strength training', icon: 'dumbbell' },
  71: { name: 'Stretching', icon: 'activity' },
  72: { name: 'Surfing', icon: 'activity' },
  73: { name: 'Open water swim', icon: 'droplet' },
  74: { name: 'Pool swim', icon: 'droplet' },
  75: { name: 'Table tennis', icon: 'activity' },
  76: { name: 'Tennis', icon: 'activity' },
  78: { name: 'Volleyball', icon: 'activity' },
  79: { name: 'Walking', icon: 'footprints' },
  80: { name: 'Water polo', icon: 'droplet' },
  81: { name: 'Weightlifting', icon: 'dumbbell' },
  82: { name: 'Wheelchair', icon: 'activity' },
  83: { name: 'Yoga', icon: 'activity' },
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
  return KINDS[code] ?? { name: `Exercise type ${String(code)}`, icon: 'dumbbell' };
}

export interface ExerciseChoice {
  readonly code: number;
  readonly name: string;
}

export function exerciseChoices(): readonly ExerciseChoice[] {
  return Object.entries(KINDS)
    .map(([code, kind]) => ({ code: Number(code), name: kind.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
