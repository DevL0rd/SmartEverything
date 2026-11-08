import { blurLayerIds, stillParts, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import {
  EXERCISE_BIKE_MODEL,
  FITNESS_MODELS,
  GENERIC_TREADMILL_MODEL,
  ROWER_MODEL,
  WALKING_PAD_MODEL,
} from '../../../src/devices/fitness';

function channel(spec: ModelSpec, id: string): NonNullable<ModelSpec['channels']>[number] {
  const found = spec.channels?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no channel ${id}`);
  return found;
}

function period(spec: ModelSpec, id: string): number {
  const { motion } = channel(spec, id);
  if (motion.type !== 'oscillate') throw new Error(`${id} does not oscillate`);
  return (2 * Math.abs(motion.limits[1] - motion.limits[0])) / motion.speed;
}

describe('fitness models', () => {
  it.each(FITNESS_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and is registered once',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
    },
  );

  it.each([GENERIC_TREADMILL_MODEL, WALKING_PAD_MODEL])(
    '$id scrolls the belt at its real speed and blurs it above the blur speed',
    (spec) => {
      const scroll = channel(spec, 'beltScroll');
      expect(scroll.blur?.part).toBe('beltBlur');
      expect(blurLayerIds(spec).has('beltBlur')).toBe(true);
      expect(stillParts(spec, 1, {}).map((part) => part.id)).not.toContain('beltBlur');
      expect(scroll.blur?.to).toBeGreaterThan(scroll.blur?.from ?? 0);
    },
  );

  it('tilts the treadmill deck by the reported incline and keeps the console still', () => {
    expect(channel(GENERIC_TREADMILL_MODEL, 'incline')).toMatchObject({
      target: 'rearFrame',
      property: 'rotate',
      source: 'incline',
    });
    const console = GENERIC_TREADMILL_MODEL.parts.find((part) => part.id === 'console');
    expect(console?.parent).toBeUndefined();
  });

  it('spins the bike crank and flywheel and blurs the flywheel above two turns a second', () => {
    expect(channel(EXERCISE_BIKE_MODEL, 'crankSpin')).toMatchObject({ target: 'crankHub' });
    const fly = channel(EXERCISE_BIKE_MODEL, 'flySpin');
    expect(fly.blur).toMatchObject({ part: 'flyBlur', from: 2 });
  });

  it('keeps seat, handle and strap in step over one stroke', () => {
    const seat = period(ROWER_MODEL, 'seatSlide');
    expect(seat).toBeCloseTo(2.5);
    for (const id of ['handleSlide', 'strapSlide', 'strapStretch']) {
      expect(period(ROWER_MODEL, id)).toBeCloseTo(seat);
    }
    const loop = ROWER_MODEL.shots?.[0]?.loopS ?? 0;
    expect(loop / seat).toBeCloseTo(Math.round(loop / seat));
  });
});
