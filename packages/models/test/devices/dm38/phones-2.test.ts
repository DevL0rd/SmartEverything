import { MODEL_SPEC } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { GENERIC_PHONE_MODEL, GENERIC_PHONE_MODELS } from '../../../src/devices/phones-2';

describe('generic phone model', () => {
  it.each(GENERIC_PHONE_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it('registers each model once', () => {
    const ids = MODEL_REGISTRY.map((spec) => spec.id);
    for (const spec of GENERIC_PHONE_MODELS) {
      expect(ids.filter((id) => id === spec.id)).toHaveLength(1);
    }
  });

  it('scales the whole phone with one size param', () => {
    const body = GENERIC_PHONE_MODEL.parts.find((part) => part.id === 'body');
    expect(body?.transform?.scale).toEqual([
      { param: 'size' },
      { param: 'size' },
      { param: 'size' },
    ]);
  });
});
