import { z } from 'zod';
import { BAND_METRICS, bandsOf } from './body-bands';
import { bodyScore, bodyTypeOf, BODY_TYPES } from './body-score';
import { fatScale, muscleScale } from './body-scales';
import type { BodyFacts } from './profiles';
import type { Compartments, CompositionInput } from './body-types';

export type { CompositionInput } from './body-types';

export const COMPOSITION_FORMULA = 'mi-dual-1';

const KG = z.number();

export const BODY_COMPOSITION = z.strictObject({
  formula: z.string().min(1),
  body_fat_percent: z.number(),
  fat_mass_kg: KG,
  lean_mass_kg: KG,
  muscle_mass_kg: KG,
  muscle_percent: z.number(),
  skeletal_muscle_kg: KG,
  bone_mass_kg: KG,
  bone_percent: z.number(),
  water_percent: z.number(),
  water_mass_kg: KG,
  extracellular_water_kg: KG.nullable(),
  intracellular_water_kg: KG.nullable(),
  ecw_ratio_percent: z.number().nullable(),
  protein_percent: z.number(),
  protein_mass_kg: KG,
  visceral_fat: z.number(),
  bmr_kcal: z.number(),
  body_age: z.number(),
  ideal_weight_kg: KG,
  weight_control_kg: KG,
  fat_control_kg: KG,
  muscle_control_kg: KG,
  body_type: z.enum(BODY_TYPES),
  body_score: z.number(),
  bands: z.partialRecord(
    z.enum(BAND_METRICS),
    z.strictObject({ band: z.int().min(0), thresholds: z.array(z.number()) }),
  ),
});

export type BodyComposition = z.infer<typeof BODY_COMPOSITION>;

export const IMPEDANCE_RANGE = { min: 200, max: 1500 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function leanMass(input: CompositionInput): number {
  const { heightCm: h, weightKg: w, impedanceLow: z, age } = input;
  const lean = ((h * 9.058) / 100) * (h / 100) + w * 0.32 + 12.226 - z * 0.0068 - age * 0.0542;
  return Math.min(input.sex === 'female' ? lean * 0.84 : lean, w * 0.98);
}

function boneMass(input: CompositionInput, lean: number): number {
  const base = input.sex === 'female' ? 0.245691014 : 0.18016894;
  const raw = lean * 0.05158 - base;
  const bone = raw > 2.2 ? raw + 0.1 : raw - 0.1;
  return clamp(bone > (input.sex === 'female' ? 5.1 : 5.2) ? 8 : bone, 0.5, 8);
}

function skeletalMuscle(input: CompositionInput): number {
  const index = (input.heightCm * input.heightCm) / input.impedanceLow;
  return Math.max(
    0,
    index * 0.401 + (input.sex === 'male' ? 3.825 : 0) - input.age * 0.071 + 5.102,
  );
}

function visceralFat(
  input: Pick<CompositionInput, 'sex' | 'weightKg' | 'heightCm' | 'age'>,
): number {
  const { weightKg: w, heightCm: h, age } = input;
  if (input.sex === 'male') {
    const value =
      h < w * 1.6 + 63
        ? age * 0.15 + ((w * 305) / (h * 0.0826 * h - h * 0.4 + 48) - 2.9)
        : age * 0.15 + (w * (h * -0.0015 + 0.765) - h * 0.143) - 5;
    return clamp(value, 1, 50);
  }
  const value =
    w <= h * 0.5 - 13
      ? age * 0.07 + (w * (h * -0.0024 + 0.691) - h * 0.027) - 10.5
      : age * 0.07 + ((w * 500) / (h * 1.45 + h * 0.1158 * h - 120) - 6);
  return clamp(value, 1, 50);
}

function compartments(input: CompositionInput): Compartments {
  const w = input.weightKg;
  const lean = leanMass(input);
  const fatPercent = clamp(((w - lean) / w) * 100, input.sex === 'female' ? 10 : 5, 75);
  const fatMass = (w * fatPercent) / 100;
  const bone = boneMass(input, lean);
  const muscleRaw = w - fatMass - bone;
  const muscleCeiling = input.sex === 'female' ? 84 : 93.5;
  return {
    lean,
    fatPercent,
    fatMass,
    waterPercent: clamp((100 - fatPercent) * 0.73, 35, 73),
    bone,
    muscle: clamp(muscleRaw >= muscleCeiling ? 120 : muscleRaw, 10, 120),
    skeletal: skeletalMuscle(input),
    protein: clamp(((lean * 0.195) / w) * 100, 5, 32),
    visceral: visceralFat(input),
    bmr: clamp(370 + 21.6 * lean, 500, 5000),
  };
}

interface Waters {
  readonly extracellular: number | null;
  readonly intracellular: number | null;
  readonly ratio: number | null;
}

function waters(input: CompositionInput, parts: Compartments): Waters {
  if (input.impedanceHigh === null) {
    return { extracellular: null, intracellular: null, ratio: null };
  }
  const total = (1 - parts.fatPercent / 100) * 0.73 * input.weightKg;
  const extracellular = total * (0.32 + 0.08 * (input.impedanceHigh / input.impedanceLow));
  return {
    extracellular,
    intracellular: Math.max(0, total - extracellular),
    ratio: (extracellular / total) * 100,
  };
}

function bodyAge(input: CompositionInput, lean: number): number {
  const { weightKg: w, heightCm: h, age } = input;
  const expected =
    input.sex === 'male'
      ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * age
      : 447.593 + 9.247 * w + 3.098 * h - 4.33 * age;
  return clamp(age * (expected / (370 + 21.6 * lean)), 12, Math.min(95, age + 25));
}

export function idealWeight(sex: BodyFacts['sex'], heightCm: number): number {
  return sex === 'female' ? (heightCm - 70) * 0.6 : (heightCm - 80) * 0.7;
}

function controls(
  input: CompositionInput,
  parts: Compartments,
): Pick<
  BodyComposition,
  'ideal_weight_kg' | 'weight_control_kg' | 'fat_control_kg' | 'muscle_control_kg'
> {
  const ideal = idealWeight(input.sex, input.heightCm);
  const fatTop = fatScale(input.sex, input.age)[2];
  const muscleLow = muscleScale(input.sex, input.heightCm)[0];
  return {
    ideal_weight_kg: round(ideal, 1),
    weight_control_kg: round(ideal - input.weightKg, 1),
    fat_control_kg: round(Math.min(0, (input.weightKg * fatTop) / 100 - parts.fatMass), 1),
    muscle_control_kg: round(Math.max(0, muscleLow - parts.muscle), 1),
  };
}

export function bmiOf(weightKg: number, heightCm: number): number {
  return round(clamp(weightKg / (heightCm / 100) ** 2, 10, 90), 1);
}

export function bodyComposition(input: CompositionInput): BodyComposition {
  const parts = compartments(input);
  const water = waters(input, parts);
  const w = input.weightKg;
  return {
    formula: COMPOSITION_FORMULA,
    body_fat_percent: round(parts.fatPercent, 1),
    fat_mass_kg: round(parts.fatMass, 2),
    lean_mass_kg: round(parts.lean, 2),
    muscle_mass_kg: round(parts.muscle, 2),
    muscle_percent: round((parts.muscle / w) * 100, 1),
    skeletal_muscle_kg: round(parts.skeletal, 2),
    bone_mass_kg: round(parts.bone, 2),
    bone_percent: round((parts.bone / w) * 100, 1),
    water_percent: round(parts.waterPercent, 1),
    water_mass_kg: round((w * parts.waterPercent) / 100, 2),
    extracellular_water_kg: water.extracellular === null ? null : round(water.extracellular, 2),
    intracellular_water_kg: water.intracellular === null ? null : round(water.intracellular, 2),
    ecw_ratio_percent: water.ratio === null ? null : round(water.ratio, 1),
    protein_percent: round(parts.protein, 1),
    protein_mass_kg: round((w * parts.protein) / 100, 2),
    visceral_fat: round(parts.visceral, 1),
    bmr_kcal: Math.round(parts.bmr),
    body_age: Math.round(bodyAge(input, parts.lean)),
    ...controls(input, parts),
    body_type: bodyTypeOf(input, parts),
    body_score: Math.round(bodyScore(input, parts)),
    bands: bandsOf(input, parts, water.ratio),
  };
}

export function impedancePair(
  readings: readonly (number | null)[],
): { readonly low: number; readonly high: number | null } | null {
  const usable = readings
    .filter(
      (value): value is number =>
        value !== null && value >= IMPEDANCE_RANGE.min && value <= IMPEDANCE_RANGE.max,
    )
    .sort((left, right) => right - left);
  const [low, high] = usable;
  return low === undefined ? null : { low, high: high ?? null };
}
