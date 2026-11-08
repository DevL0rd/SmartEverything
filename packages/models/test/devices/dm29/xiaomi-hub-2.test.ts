import { MODEL_SPEC } from '@smarteverything/domain';
import { XIAOMI_SMART_HOME_HUB_2_MODEL as HUB } from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

describe('Xiaomi Smart Home Hub 2 model', () => {
  it('parses strictly and passes every authoring check', () => {
    expect(MODEL_SPEC.safeParse(HUB).success).toBe(true);
    expect(checkAuthoring(HUB).problems).toStrictEqual([]);
  });

  it('is registered once and matches the live model string', () => {
    expect(MODEL_REGISTRY.filter((spec) => spec.id === HUB.id)).toHaveLength(1);
    expect(HUB.meta?.aliases).toContain('lumi.gateway.mgl001');
  });

  it('keeps the published 95 by 95 by 26 mm size', () => {
    expect(HUB.footprint).toStrictEqual({ width: 0.095, depth: 0.095, height: 0.026 });
  });

  it('breathes the status light only while pairing', () => {
    const shot = HUB.shots?.[0];
    expect(shot?.focus).toBe('led');
    expect(shot?.when.anyOf[0]?.allOf[0]).toStrictEqual({
      signal: 'mode',
      op: 'eq',
      value: 'pairing',
    });
    const pulses = (HUB.channels ?? []).filter((channel) => channel.motion.type === 'pulse');
    expect(pulses.map((channel) => channel.source)).toStrictEqual(['mode', 'fault']);
  });
});
