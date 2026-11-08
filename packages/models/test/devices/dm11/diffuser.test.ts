import { MODEL_SPEC, shownParts, specSignalProblems } from '@smarteverything/domain';
import { XIAOMI_SMART_SCENT_DIFFUSER_MODEL as DIFFUSER } from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';

function channelsOf(target: string): readonly string[] {
  return (DIFFUSER.channels ?? [])
    .filter((channel) => channel.target === target)
    .map(
      (channel) =>
        `${typeof channel.source === 'string' ? channel.source : ''}.${channel.property}`,
    );
}

describe('Xiaomi Smart Scent Diffuser model', () => {
  it('parses strictly and passes every authoring check', () => {
    expect(MODEL_SPEC.safeParse(DIFFUSER).success).toBe(true);
    expect(specSignalProblems(DIFFUSER)).toStrictEqual([]);
    expect(checkAuthoring(DIFFUSER).problems).toStrictEqual([]);
  });

  it('is the true 74 by 74 by 75 millimetre cube', () => {
    expect(DIFFUSER.footprint).toStrictEqual({ width: 0.074, depth: 0.074, height: 0.075 });
  });

  it('tints the base light band from the device colour and lights it only with the mood light', () => {
    expect(channelsOf('lightBand')).toStrictEqual([
      'colour.colour',
      'lamp.emissive',
      'power.emissive',
      'online.emissive',
    ]);
  });

  it('diffuses scent only while on with a level above zero', () => {
    const [shot] = DIFFUSER.shots ?? [];
    expect(shot?.focus).toBe('outlet');
    expect(shot?.when.anyOf[0]?.allOf).toStrictEqual([
      { signal: 'power', op: 'eq', value: true },
      { signal: 'speed', op: 'gt', value: 0 },
    ]);
    expect(channelsOf('scent')).toStrictEqual(['speed.opacity', 'speed.scale', 'power.opacity']);
  });

  it('keeps a readable silhouette at tile size with the outlet and light band', () => {
    const tile = shownParts(DIFFUSER, 0, {}).map((part) => part.id);
    expect(tile).toEqual(expect.arrayContaining(['body', 'lightBand', 'outletRim', 'outlet']));
  });
});
