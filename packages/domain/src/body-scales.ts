import type { Sex } from './profiles';

interface AgeRow {
  readonly from: number;
  readonly to: number;
  readonly female: readonly [number, number, number, number];
  readonly male: readonly [number, number, number, number];
}

const OLDEST_FAT_SCALE: AgeRow = {
  from: 60,
  to: 200,
  female: [23, 30, 37, 42],
  male: [14, 20, 25, 30],
};

const FAT_SCALES: readonly AgeRow[] = [
  { from: 0, to: 12, female: [12, 21, 30, 34], male: [7, 16, 25, 30] },
  { from: 12, to: 14, female: [15, 24, 33, 37], male: [7, 16, 25, 30] },
  { from: 14, to: 16, female: [18, 27, 36, 40], male: [7, 16, 25, 30] },
  { from: 16, to: 18, female: [20, 28, 37, 41], male: [7, 16, 25, 30] },
  { from: 18, to: 40, female: [21, 28, 35, 40], male: [11, 17, 22, 27] },
  { from: 40, to: 60, female: [22, 29, 36, 41], male: [12, 18, 23, 28] },
  OLDEST_FAT_SCALE,
];

interface HeightRow {
  readonly female: number;
  readonly male: number;
  readonly femaleRange: readonly [number, number];
  readonly maleRange: readonly [number, number];
}

const MUSCLE_SCALES: readonly HeightRow[] = [
  { female: 160, male: 170, femaleRange: [36.5, 42.6], maleRange: [49.4, 59.5] },
  { female: 150, male: 160, femaleRange: [32.9, 37.6], maleRange: [44, 52.5] },
  { female: 0, male: 0, femaleRange: [29.1, 34.8], maleRange: [38.5, 46.6] },
];

export function fatScale(sex: Sex, age: number): readonly [number, number, number, number] {
  const row = FAT_SCALES.find((candidate) => age >= candidate.from && age < candidate.to);
  const chosen = row ?? OLDEST_FAT_SCALE;
  return sex === 'female' ? chosen.female : chosen.male;
}

export function muscleScale(sex: Sex, heightCm: number): readonly [number, number] {
  const row = MUSCLE_SCALES.find(
    (candidate) => heightCm >= (sex === 'female' ? candidate.female : candidate.male),
  );
  if (row === undefined) {
    throw new RangeError('The muscle scale table has no row for this height.');
  }
  return sex === 'female' ? row.femaleRange : row.maleRange;
}

export function expectedBone(sex: Sex, weightKg: number): number {
  if (sex === 'male') {
    return weightKg >= 75 ? 2 : weightKg >= 60 ? 1.9 : 1.6;
  }
  return weightKg >= 60 ? 1.8 : weightKg >= 45 ? 1.5 : 1.3;
}

export function normalWater(sex: Sex): number {
  return sex === 'male' ? 55 : 45;
}

const BMR_FACTORS: Readonly<
  Record<Sex, readonly { readonly below: number; readonly factor: number }[]>
> = {
  male: [
    { below: 30, factor: 21.6 },
    { below: 50, factor: 20.07 },
    { below: 200, factor: 19.35 },
  ],
  female: [
    { below: 30, factor: 21.24 },
    { below: 50, factor: 19.53 },
    { below: 200, factor: 18.63 },
  ],
};

export function normalBmr(sex: Sex, age: number, weightKg: number): number {
  const band = BMR_FACTORS[sex].find((candidate) => age < candidate.below);
  if (band === undefined) {
    throw new RangeError(`No BMR reference for age ${String(age)}.`);
  }
  return weightKg * band.factor;
}
