import { describe, expect, it } from 'vitest';
import {
  AIR_FRYER_MODEL,
  KITCHEN_COUNTER_MODELS,
  PET_FEEDER_MODEL,
  RICE_COOKER_MODEL,
} from '../../../src/devices/kitchen-4';
import {
  channelOf,
  expectStillWhenIdle,
  expectValidAndRegistered,
  tableOf,
} from '../dm14/kitchen-shared';

describe('kitchen counter models', () => {
  it.each(KITCHEN_COUNTER_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses, passes every authoring check and is still while idle',
    (_id, spec) => {
      expectValidAndRegistered(spec);
      expectStillWhenIdle(spec, { phase: 'idle', alarm: false, online: true });
    },
  );

  it('opens the rice cooker lid backwards and steams while cooking', () => {
    const lid = RICE_COOKER_MODEL.parts.find((part) => part.id === 'lid');
    expect(lid?.poses?.['open']?.rotation).toStrictEqual([-72, 0, 0]);
    expect(tableOf(RICE_COOKER_MODEL, 'steamShow')['cooking']).toBe(0.75);
  });

  it('slides the air fryer drawer out and glows its window while cooking', () => {
    const drawer = AIR_FRYER_MODEL.parts.find((part) => part.id === 'drawer');
    const [closed, open] = [drawer?.poses?.['closed'], drawer?.poses?.['open']];
    expect(Number(open?.position?.[2]) - Number(closed?.position?.[2])).toBeCloseTo(0.17);
    expect(tableOf(AIR_FRYER_MODEL, 'windowCook')).toStrictEqual({ cooking: 1.4 });
  });

  it('drops pellets in a loop that matches the dispensing shot', () => {
    const fall = channelOf(PET_FEEDER_MODEL, 'pellet1Fall');
    expect(fall.motion.type).toBe('step');
    const cycle =
      fall.motion.type === 'step'
        ? (fall.motion.keyframes.length * fall.motion.intervalMs) / 1000
        : 0;
    expect(PET_FEEDER_MODEL.shots?.[0]?.loopS).toBeCloseTo(cycle);
    expect(channelOf(PET_FEEDER_MODEL, 'storeLevel').source).toBe('fill');
  });
});
