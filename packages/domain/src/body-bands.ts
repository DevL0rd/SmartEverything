import type { CompositionInput, Compartments } from './body-types';
import { expectedBone, fatScale, muscleScale, normalBmr, normalWater } from './body-scales';

export const BAND_METRICS = [
  'bmi',
  'body_fat_percent',
  'muscle_mass_kg',
  'skeletal_muscle_kg',
  'water_percent',
  'bone_mass_kg',
  'protein_percent',
  'visceral_fat',
  'bmr_kcal',
  'ecw_ratio_percent',
] as const;

export type BandMetric = (typeof BAND_METRICS)[number];

export const BAND_LABELS: Readonly<Record<BandMetric, readonly string[]>> = {
  bmi: ['Low', 'Standard', 'High', 'Obese'],
  body_fat_percent: ['Low', 'Standard', 'High', 'Very high'],
  muscle_mass_kg: ['Low', 'Standard', 'Good'],
  skeletal_muscle_kg: ['Low', 'Standard'],
  water_percent: ['Low', 'Standard'],
  bone_mass_kg: ['Low', 'Standard'],
  protein_percent: ['Low', 'Standard', 'High'],
  visceral_fat: ['Standard', 'High', 'Very high'],
  bmr_kcal: ['Low', 'Standard'],
  ecw_ratio_percent: ['Low', 'Standard', 'High'],
};

export interface Band {
  readonly band: number;
  readonly thresholds: number[];
}

function banded(value: number, thresholds: readonly number[]): Band {
  return { band: thresholds.filter((limit) => value >= limit).length, thresholds: [...thresholds] };
}

export function bandsOf(
  input: CompositionInput,
  parts: Compartments,
  ecwRatio: number | null,
): Partial<Record<BandMetric, Band>> {
  const fat = fatScale(input.sex, input.age);
  const muscle = muscleScale(input.sex, input.heightCm);
  const bmi = input.weightKg / (input.heightCm / 100) ** 2;
  const bands: Partial<Record<BandMetric, Band>> = {
    bmi: banded(bmi, [18.5, 25, 30]),
    body_fat_percent: banded(parts.fatPercent, [fat[1], fat[2], fat[3]]),
    muscle_mass_kg: banded(parts.muscle, muscle),
    skeletal_muscle_kg: banded(parts.skeletal, [muscle[0] * 0.77]),
    water_percent: banded(parts.waterPercent, [normalWater(input.sex)]),
    bone_mass_kg: banded(parts.bone, [expectedBone(input.sex, input.weightKg)]),
    protein_percent: banded(parts.protein, [16, 20]),
    visceral_fat: banded(parts.visceral, [10, 15]),
    bmr_kcal: banded(parts.bmr, [normalBmr(input.sex, input.age, input.weightKg)]),
  };
  return ecwRatio === null ? bands : { ...bands, ecw_ratio_percent: banded(ecwRatio, [36, 40]) };
}
