import { MODEL_SPEC, placementFacts } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import {
  FLOOR_LAMP_MODEL,
  LIGHT_BAR_MODEL,
  LIGHT_FIXTURE_2_MODELS,
  WALL_SCONCE_MODEL,
} from '../../../src/devices/light-fixtures-2';

const CASES = LIGHT_FIXTURE_2_MODELS.map((spec) => [spec.id, spec] as const);

describe('light fixture models, second set', () => {
  it.each(CASES)('%s parses strictly and passes every authoring check', (_id, spec) => {
    expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
    expect(checkAuthoring(spec).problems).toStrictEqual([]);
  });

  it('registers each model once', () => {
    const ids = MODEL_REGISTRY.map((spec) => spec.id);
    for (const spec of LIGHT_FIXTURE_2_MODELS) {
      expect(ids.filter((id) => id === spec.id)).toHaveLength(1);
    }
  });

  it.each(CASES)('%s starts its glow shot only while on with brightness', (_id, spec) => {
    expect(spec.shots?.[0]?.when.anyOf[0]?.allOf.map((leaf) => leaf.signal)).toStrictEqual([
      'power',
      'brightness',
    ]);
    expect(spec.states?.['off']).toStrictEqual({ power: false });
  });

  it('hides the light spill on the wall when the light is off or offline', () => {
    for (const target of ['washUp', 'washDown']) {
      const fades = (WALL_SCONCE_MODEL.channels ?? []).filter(
        (channel) => channel.target === target && channel.property === 'opacity',
      );
      expect(fades.map((channel) => channel.source)).toStrictEqual([
        'brightness',
        'power',
        'online',
      ]);
    }
    expect(
      (LIGHT_BAR_MODEL.channels ?? []).some(
        (channel) => channel.target === 'halo' && channel.source === 'power',
      ),
    ).toBe(true);
  });

  it('places the floor lamp, the sconce and the bar where the registry expects', () => {
    expect(placementFacts(FLOOR_LAMP_MODEL.id, FLOOR_LAMP_MODEL)).toMatchObject({
      mount: 'floor',
    });
    expect(placementFacts(WALL_SCONCE_MODEL.id, WALL_SCONCE_MODEL)).toMatchObject({
      mount: 'wall',
      defaultHeightM: 1.6,
    });
    expect(placementFacts(LIGHT_BAR_MODEL.id, LIGHT_BAR_MODEL)?.mount).toBe('table');
    expect(FLOOR_LAMP_MODEL.size?.height?.param).toBe('height');
  });
});
