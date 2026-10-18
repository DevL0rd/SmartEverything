import { describe, expect, it } from 'vitest';
import type { BodyComposition } from '@smarteverything/domain';
import {
  COMPOSITION_METRICS,
  type CompositionMetric,
  BODY_TYPE_LABELS,
  formatMetric,
  metricValue,
} from './composition-metrics';

function metric(key: string): CompositionMetric {
  const found = COMPOSITION_METRICS.find((item) => item.key === key);
  if (found === undefined) {
    throw new Error(key);
  }
  return found;
}

describe('formatMetric', () => {
  it('writes the number with the digits of its metric', () => {
    expect(formatMetric(18.46, metric('body_fat_percent'))).toBe('18.5');
    expect(formatMetric(2.534, metric('bone_mass_kg'))).toBe('2.53');
    expect(formatMetric(1624.4, metric('bmr_kcal'))).toBe('1,624');
  });

  it('puts a plus on a positive control target and nothing on other metrics', () => {
    expect(formatMetric(2.5, metric('weight_control_kg'))).toBe('+2.5');
    expect(formatMetric(-2.5, metric('fat_control_kg'))).toBe('-2.5');
    expect(formatMetric(0, metric('muscle_control_kg'))).toBe('0.0');
    expect(formatMetric(2.5, metric('fat_mass_kg'))).toBe('2.5');
  });
});

const COMPOSITION: BodyComposition = {
  formula: 'test',
  body_fat_percent: 21.5,
  fat_mass_kg: 15,
  lean_mass_kg: 55,
  muscle_mass_kg: 50,
  muscle_percent: 70,
  skeletal_muscle_kg: 30,
  bone_mass_kg: 2.6,
  bone_percent: 3.7,
  water_percent: 55,
  water_mass_kg: 38,
  extracellular_water_kg: null,
  intracellular_water_kg: null,
  ecw_ratio_percent: null,
  protein_percent: 17,
  protein_mass_kg: 12,
  visceral_fat: 6,
  bmr_kcal: 1600,
  body_age: 30,
  ideal_weight_kg: 68,
  weight_control_kg: -2,
  fat_control_kg: -2,
  muscle_control_kg: 0,
  body_type: 'balanced',
  body_score: 80,
  bands: {},
};

describe('metricValue', () => {
  it('reads the value of the metric from a composition, null when the scale gave none', () => {
    expect(metricValue(COMPOSITION, metric('body_fat_percent'))).toBe(21.5);
    expect(metricValue(COMPOSITION, metric('bmr_kcal'))).toBe(1600);
    expect(metricValue(COMPOSITION, metric('ecw_ratio_percent'))).toBeNull();
  });
});

describe('tables', () => {
  it('lists each metric once and names every body type', () => {
    const keys = COMPOSITION_METRICS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.values(BODY_TYPE_LABELS).every((label) => label.length > 0)).toBe(true);
  });
});
