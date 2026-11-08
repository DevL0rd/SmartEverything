import { XIAOMI_MAGNET_DW2HL_MODEL } from '@smarteverything/ble';
import { MODEL_SPEC } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { MOTION_PIR_MODEL, MULTI_SENSOR_MODEL, SENSOR_MODELS } from '../../../src/devices/sensors';

const SPECS = [MULTI_SENSOR_MODEL, MOTION_PIR_MODEL, XIAOMI_MAGNET_DW2HL_MODEL];

describe('sensor models', () => {
  it.each(SPECS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it('registers each model once', () => {
    const ids = MODEL_REGISTRY.map((spec) => spec.id);
    for (const spec of [...SENSOR_MODELS, XIAOMI_MAGNET_DW2HL_MODEL]) {
      expect(ids.filter((id) => id === spec.id)).toHaveLength(1);
    }
  });

  it.each([MULTI_SENSOR_MODEL, MOTION_PIR_MODEL])(
    '$id starts a sense shot on presence or motion and glows the lens',
    (spec) => {
      const signals = spec.shots?.[0]?.when.anyOf.flatMap((group) =>
        group.allOf.map((leaf) => leaf.signal),
      );
      expect(signals).toEqual(['presence', 'motion']);
      const lens = spec.parts.find(
        (part) => part.material === 'lens' && part.geometry.type === 'sphere',
      );
      const glow = spec.channels?.filter((channel) => channel.target === lens?.id) ?? [];
      expect(glow.map((channel) => channel.property)).toEqual(
        expect.arrayContaining(['colour', 'emissive']),
      );
    },
  );

  it('gives the sensors an effect anchor for the scan and a mount', () => {
    for (const spec of [MULTI_SENSOR_MODEL, MOTION_PIR_MODEL]) {
      expect(spec.anchors?.some((anchor) => anchor.kind === 'effect')).toBe(true);
      expect(spec.anchors?.some((anchor) => anchor.kind === 'mount')).toBe(true);
    }
  });
});
