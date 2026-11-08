import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { LARQ_PUREVIS_2_MODEL as BOTTLE } from '../../src/larq/model';

function enumTable(id: string): Readonly<Record<string, unknown>> {
  const map = BOTTLE.channels?.find((channel) => channel.id === id)?.map;
  return map?.type === 'enum' ? map.table : {};
}

describe('LARQ PureVis 2 model', () => {
  it('is a valid spec whose channels and states use known signals', () => {
    expect(MODEL_SPEC.safeParse(BOTTLE).success).toBe(true);
    expect(specSignalProblems(BOTTLE)).toEqual([]);
  });

  it('has a sample state for each of the thirteen flat states', () => {
    expect(Object.keys(BOTTLE.states ?? {})).toHaveLength(13);
    expect(Object.keys(BOTTLE.states ?? {})).toEqual(
      expect.arrayContaining(['charged', 'capOff', 'lowBattery', 'fault', 'stale', 'empty']),
    );
  });

  it('colours the cap ring for every light state', () => {
    expect(Object.keys(enumTable('ringColour')).sort()).toEqual(
      [
        'charged',
        'charging',
        'fault',
        'interlock',
        'locked',
        'low_battery',
        'off',
        'reminder',
        'uv',
      ].sort(),
    );
    expect(enumTable('ringColour')['low_battery']).toBe(enumTable('ringColour')['interlock']);
  });

  it('lifts and tips the cap with its ring when the cap is off', () => {
    expect(BOTTLE.parts.find((part) => part.id === 'capRing')?.parent).toBe('cap');
    expect(enumTable('capLift')).toEqual({ interlock: 0.012 });
    expect(enumTable('capTip')).toEqual({ interlock: -14 });
  });

  it('anchors the fill gauge and the status badge for the overlay', () => {
    const labels = (BOTTLE.anchors ?? []).filter((anchor) => anchor.kind === 'label');
    expect(labels.map((anchor) => anchor.id)).toEqual(['pin', 'fill', 'badge']);
  });

  it('keeps the whole body in the hero instead of cropping to the cap', () => {
    expect(BOTTLE.framing.hero.focus).toBe('body');
  });
});
