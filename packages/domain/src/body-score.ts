import type { CompositionInput, Compartments } from './body-types';
import { expectedBone, fatScale, muscleScale, normalBmr, normalWater } from './body-scales';

export const BODY_TYPES = [
  'obese',
  'overweight',
  'thick_set',
  'lack_exercise',
  'balanced',
  'balanced_muscular',
  'skinny',
  'balanced_skinny',
  'skinny_muscular',
] as const;

export type BodyType = (typeof BODY_TYPES)[number];

export function bodyTypeOf(input: CompositionInput, parts: Compartments): BodyType {
  const fat = fatScale(input.sex, input.age);
  const muscle = muscleScale(input.sex, input.heightCm);
  const fatFactor = parts.fatPercent > fat[2] ? 0 : parts.fatPercent < fat[1] ? 2 : 1;
  const muscleFactor = parts.muscle > muscle[1] ? 2 : parts.muscle < muscle[0] ? 0 : 1;
  const type = BODY_TYPES[muscleFactor + fatFactor * 3];
  if (type === undefined) {
    throw new RangeError('The body type index is out of range.');
  }
  return type;
}

interface Line {
  readonly from: number;
  readonly to: number;
  readonly fromPenalty: number;
  readonly toPenalty: number;
}

function malus(value: number, line: Line): number {
  if (line.from === line.to) {
    return 0;
  }
  const [low, high, lowPenalty, highPenalty] =
    line.to < line.from
      ? [line.to, line.from, line.toPenalty, line.fromPenalty]
      : [line.from, line.to, line.fromPenalty, line.toPenalty];
  const clamped = Math.min(high, Math.max(low, value));
  const penalty = lowPenalty + ((clamped - low) / (high - low)) * (highPenalty - lowPenalty);
  return Math.max(0, penalty);
}

function belowMinimum(value: number, minimum: number, normal: number): number {
  return value >= normal
    ? 0
    : malus(value, { from: minimum, to: normal, fromPenalty: 10, toPenalty: 5 });
}

function bmiPenalty(input: CompositionInput, fatPercent: number): number {
  const bmi = input.weightKg / (input.heightCm / 100) ** 2;
  const fatTop = fatScale(input.sex, input.age)[2];
  if (bmi < 15) {
    return malus(bmi, { from: 14, to: 15, fromPenalty: 30, toPenalty: 15 });
  }
  if (bmi < 18.5) {
    return fatPercent < fatTop && input.age < 18
      ? 0
      : malus(bmi, { from: 15, to: 18.5, fromPenalty: 15, toPenalty: 5 });
  }
  return bmi >= 28 && fatPercent >= fatTop
    ? malus(bmi, { from: 28, to: 32, fromPenalty: 5, toPenalty: 10 })
    : 0;
}

function fatPenalty(input: CompositionInput, fatPercent: number): number {
  const scale = fatScale(input.sex, input.age);
  const best = scale[2] - (input.sex === 'male' ? 3 : 2);
  if (fatPercent < scale[0]) {
    return malus(fatPercent, { from: 1, to: scale[0], fromPenalty: 10, toPenalty: 3 });
  }
  if (fatPercent < best) {
    return 0;
  }
  return fatPercent < scale[2]
    ? malus(fatPercent, { from: best, to: scale[2], fromPenalty: 3, toPenalty: 9 })
    : malus(fatPercent, { from: scale[2], to: scale[3], fromPenalty: 10, toPenalty: 20 });
}

function proteinPenalty(protein: number): number {
  if (protein <= 16) {
    return malus(protein, { from: 10, to: 16, fromPenalty: 10, toPenalty: 5 });
  }
  return protein <= 17 ? malus(protein, { from: 16, to: 17, fromPenalty: 5, toPenalty: 3 }) : 0;
}

function tissuePenalties(input: CompositionInput, parts: Compartments): number {
  const muscleLow = muscleScale(input.sex, input.heightCm)[0];
  const water = normalWater(input.sex);
  const bone = expectedBone(input.sex, input.weightKg);
  const bmr = normalBmr(input.sex, input.age, input.weightKg);
  return (
    (parts.skeletal > 0
      ? belowMinimum(parts.skeletal, (muscleLow - 5) * 0.77, muscleLow * 0.77)
      : 0) +
    belowMinimum(parts.waterPercent, water - 5, water) +
    belowMinimum(parts.bone, bone - 0.3, bone) +
    (parts.bmr >= bmr
      ? 0
      : malus(parts.bmr, { from: bmr - 300, to: bmr, fromPenalty: 6, toPenalty: 3 }))
  );
}

export function bodyScore(input: CompositionInput, parts: Compartments): number {
  const visceral =
    parts.visceral < 10
      ? 0
      : malus(parts.visceral, { from: 10, to: 15, fromPenalty: 10, toPenalty: 15 });
  const penalties =
    (input.heightCm < 90 ? 0 : bmiPenalty(input, parts.fatPercent)) +
    fatPenalty(input, parts.fatPercent) +
    tissuePenalties(input, parts) +
    visceral +
    proteinPenalty(parts.protein);
  return Math.min(100, Math.max(10, 100 - penalties));
}
