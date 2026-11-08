import { XIAOMI_S400_SCALE_MODEL as SCALE } from '@smarteverything/ble';
import { MODEL_SPEC } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

describe('Xiaomi S400 body composition scale model', () => {
  it('parses strictly and passes every authoring check', () => {
    expect(MODEL_SPEC.safeParse(SCALE).success).toBe(true);
    expect(checkAuthoring(SCALE).problems).toStrictEqual([]);
  });

  it('is registered once and matches the live model string', () => {
    expect(MODEL_REGISTRY.filter((spec) => spec.id === SCALE.id)).toHaveLength(1);
    expect(SCALE.meta?.aliases).toContain('xiaomi.scales.400pgj');
  });

  it('keeps the published 300 by 300 by 25.5 mm size', () => {
    expect(SCALE.footprint).toStrictEqual({ width: 0.3, depth: 0.3, height: 0.0255 });
  });

  it('presses the glass and lights the display while someone stands on it', () => {
    const press = SCALE.channels?.find((channel) => channel.id === 'press');
    expect(press).toMatchObject({ target: 'glass', property: 'pose', source: 'presence' });
    const glass = SCALE.parts.find((part) => part.id === 'glass');
    expect(Object.keys(glass?.poses ?? {})).toStrictEqual(['rest', 'pressed']);
    expect(SCALE.anchors?.some((anchor) => anchor.kind === 'screen')).toBe(true);
    expect(SCALE.shots?.[0]?.focus).toBe('display');
  });
});
