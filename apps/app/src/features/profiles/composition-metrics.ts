import type { BandMetric, BodyComposition, BodyType } from '@smarteverything/domain';
import { decimal } from '../../format/number';

type NumericKey = {
  readonly [K in keyof BodyComposition]: BodyComposition[K] extends number | null ? K : never;
}[keyof BodyComposition];

export interface CompositionMetric {
  readonly key: NumericKey;
  readonly label: string;
  readonly unit: string;
  readonly digits: number;
  readonly band: BandMetric | null;
}

export const COMPOSITION_METRICS: readonly CompositionMetric[] = [
  { key: 'body_fat_percent', label: 'Body fat', unit: '%', digits: 1, band: 'body_fat_percent' },
  { key: 'fat_mass_kg', label: 'Fat mass', unit: 'kg', digits: 1, band: null },
  { key: 'muscle_mass_kg', label: 'Muscle', unit: 'kg', digits: 1, band: 'muscle_mass_kg' },
  {
    key: 'skeletal_muscle_kg',
    label: 'Skeletal muscle',
    unit: 'kg',
    digits: 1,
    band: 'skeletal_muscle_kg',
  },
  { key: 'lean_mass_kg', label: 'Fat-free mass', unit: 'kg', digits: 1, band: null },
  { key: 'water_percent', label: 'Body water', unit: '%', digits: 1, band: 'water_percent' },
  { key: 'protein_percent', label: 'Protein', unit: '%', digits: 1, band: 'protein_percent' },
  { key: 'bone_mass_kg', label: 'Bone mineral', unit: 'kg', digits: 2, band: 'bone_mass_kg' },
  { key: 'visceral_fat', label: 'Visceral fat', unit: '', digits: 0, band: 'visceral_fat' },
  { key: 'bmr_kcal', label: 'Basal metabolism', unit: 'kcal', digits: 0, band: 'bmr_kcal' },
  {
    key: 'ecw_ratio_percent',
    label: 'ECW ratio',
    unit: '%',
    digits: 1,
    band: 'ecw_ratio_percent',
  },
  { key: 'body_age', label: 'Body age', unit: 'yrs', digits: 0, band: null },
  { key: 'ideal_weight_kg', label: 'Standard weight', unit: 'kg', digits: 1, band: null },
  { key: 'weight_control_kg', label: 'Weight control', unit: 'kg', digits: 1, band: null },
  { key: 'fat_control_kg', label: 'Fat control', unit: 'kg', digits: 1, band: null },
  { key: 'muscle_control_kg', label: 'Muscle control', unit: 'kg', digits: 1, band: null },
];

export const BODY_TYPE_LABELS: Readonly<Record<BodyType, string>> = {
  obese: 'Obese',
  overweight: 'Overweight',
  thick_set: 'Thick-set',
  lack_exercise: 'Lacks exercise',
  balanced: 'Balanced',
  balanced_muscular: 'Balanced, muscular',
  skinny: 'Skinny',
  balanced_skinny: 'Balanced, lean',
  skinny_muscular: 'Lean and muscular',
};

export function metricValue(
  composition: BodyComposition,
  metric: CompositionMetric,
): number | null {
  return composition[metric.key];
}

export function formatMetric(value: number, metric: CompositionMetric): string {
  const signed = metric.key.endsWith('_control_kg') && value > 0 ? '+' : '';
  return `${signed}${decimal(value, metric.digits)}`;
}
