import { describe, expect, it } from 'vitest';
import {
  DISHWASHER_MODEL,
  INDUCTION_HOB_MODEL,
  KITCHEN_APPLIANCE_MODELS,
  RANGE_HOOD_MODEL,
  WALL_OVEN_MODEL,
} from '../../../src/devices/kitchen-2';
import {
  channelOf,
  expectStillWhenIdle,
  expectValidAndRegistered,
  tableOf,
} from './kitchen-shared';

describe('kitchen appliance models', () => {
  it.each(KITCHEN_APPLIANCE_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses, passes every authoring check and is registered once',
    (_id, spec) => {
      expectValidAndRegistered(spec);
    },
  );

  it.each(KITCHEN_APPLIANCE_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s is still while off',
    (_id, spec) => {
      expectStillWhenIdle(spec, spec.states?.['off'] ?? {});
    },
  );

  it('spins the oven fan only while heating and loops the shot on whole fan quarters', () => {
    expect(tableOf(WALL_OVEN_MODEL, 'fanSpin')).toStrictEqual({ preheating: 1, cooking: 1 });
    const [shot] = WALL_OVEN_MODEL.shots ?? [];
    expect(shot?.symmetry).toBe(90);
    expect(((shot?.loopS ?? 0) * 360) % 90).toBe(0);
  });

  it('drops the oven and dishwasher doors on their bottom hinge', () => {
    const oven = WALL_OVEN_MODEL.parts.find((part) => part.id === 'door');
    expect(oven?.poses?.['open']?.rotation).toStrictEqual([84, 0, 0]);
    const dishwasher = DISHWASHER_MODEL.parts.find((part) => part.id === 'door');
    expect(Object.keys(dishwasher?.poses ?? {})).toStrictEqual(['closed', 'open', 'ajar']);
    expect(tableOf(DISHWASHER_MODEL, 'doorDrying')['drying']).toBe('ajar');
  });

  it('lights more hob zones as the level rises', () => {
    const starts = ['zone1', 'zone2', 'zone3', 'zone4'].map((zone) => {
      const { map } = channelOf(INDUCTION_HOB_MODEL, `${zone}Show`);
      return map.type === 'linear' ? map.in[0] : Number.NaN;
    });
    expect(starts).toStrictEqual([0, 0.25, 0.5, 0.75]);
    expect(INDUCTION_HOB_MODEL.params?.['width']?.default).toBe(0.6);
  });

  it('shows hood airflow by fan speed and its lamps by the lamp signal', () => {
    expect(channelOf(RANGE_HOOD_MODEL, 'airflowShow').source).toBe('speed');
    expect(tableOf(RANGE_HOOD_MODEL, 'lampLeftShow')).toStrictEqual({ true: 1, false: 0 });
    expect(RANGE_HOOD_MODEL.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
      mount: 'wall',
    });
  });
});
