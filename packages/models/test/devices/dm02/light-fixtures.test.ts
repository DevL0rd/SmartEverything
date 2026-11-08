import { MODEL_SPEC, placementFacts } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import {
  CEILING_ROUND_MODEL,
  DESK_LAMP_MODEL,
  LIGHT_FIXTURE_MODELS,
  LIGHT_STRIP_MODEL,
  PENDANT_MODEL,
} from '../../../src/devices/light-fixtures';

const CASES = LIGHT_FIXTURE_MODELS.map((spec) => [spec.id, spec] as const);

describe('light fixture models', () => {
  it.each(CASES)('%s parses strictly and passes every authoring check', (_id, spec) => {
    expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
    expect(checkAuthoring(spec).problems).toStrictEqual([]);
  });

  it('registers each model once', () => {
    const ids = MODEL_REGISTRY.map((spec) => spec.id);
    for (const spec of LIGHT_FIXTURE_MODELS) {
      expect(ids.filter((id) => id === spec.id)).toHaveLength(1);
    }
  });

  it.each(CASES)('%s glows only while on and goes dark when off or offline', (_id, spec) => {
    const shot = spec.shots?.[0];
    expect(shot?.when.anyOf[0]?.allOf.map((leaf) => leaf.signal)).toStrictEqual([
      'power',
      'brightness',
    ]);
    const emissive = (spec.channels ?? []).filter((channel) => channel.property === 'emissive');
    expect(new Set(emissive.map((channel) => channel.source))).toStrictEqual(
      new Set(['brightness', 'power', 'online']),
    );
    expect(spec.anchors?.some((anchor) => anchor.kind === 'emitter')).toBe(true);
    expect(spec.states?.['off']).toStrictEqual({ power: false });
  });

  it('tints every glowing part from the device colour and colour temperature', () => {
    for (const spec of LIGHT_FIXTURE_MODELS) {
      const sources = (spec.channels ?? [])
        .filter((channel) => channel.property === 'colour')
        .map((channel) => channel.source);
      expect(sources).toEqual(expect.arrayContaining(['colour', 'colourTemperature']));
    }
  });

  it('mounts each fixture where it is used', () => {
    expect(placementFacts(CEILING_ROUND_MODEL.id, CEILING_ROUND_MODEL)?.mount).toBe('ceiling');
    expect(placementFacts(PENDANT_MODEL.id, PENDANT_MODEL)?.mount).toBe('ceiling');
    expect(placementFacts(DESK_LAMP_MODEL.id, DESK_LAMP_MODEL)?.mount).toBe('table');
    expect(placementFacts(LIGHT_STRIP_MODEL.id, LIGHT_STRIP_MODEL)?.mount).toBe('table');
  });

  it('sizes the ceiling light and the pendant drop through params', () => {
    expect(CEILING_ROUND_MODEL.size?.width?.param).toBe('diameter');
    expect(CEILING_ROUND_MODEL.size?.depth?.param).toBe('diameter');
    expect(PENDANT_MODEL.size?.height?.param).toBe('drop');
    expect(PENDANT_MODEL.params?.['drop']).toMatchObject({ min: 0.2, max: 2 });
  });
});
