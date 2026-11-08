import { MODEL_SPEC } from '@smarteverything/domain';
import { TUYA_S06_PRO_MODEL as IR } from '@smarteverything/tuya';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

describe('Tuya S06 Pro IR blaster in the registry', () => {
  it('parses strictly and passes every authoring check', () => {
    expect(MODEL_SPEC.safeParse(IR).success).toBe(true);
    expect(checkAuthoring(IR).problems).toStrictEqual([]);
  });

  it('is registered once', () => {
    expect(MODEL_REGISTRY.filter((spec) => spec.id === IR.id)).toHaveLength(1);
  });
});
