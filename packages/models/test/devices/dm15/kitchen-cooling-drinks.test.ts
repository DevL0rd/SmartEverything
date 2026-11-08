import { describe, expect, it } from 'vitest';
import {
  ESPRESSO_MACHINE_MODEL,
  FRENCH_DOOR_FRIDGE_MODEL,
  KETTLE_MODEL,
  KITCHEN_COOLING_DRINK_MODELS,
  SINGLE_DOOR_FRIDGE_MODEL,
} from '../../../src/devices/kitchen-3';
import { expectStillWhenIdle, expectValidAndRegistered, tableOf } from '../dm14/kitchen-shared';

const IDLE: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> = {
  'dev.fridge.french-door': { door: 'closed', alarm: false, online: true },
  'dev.fridge.single': { door: 'closed', alarm: false, online: true },
  'dev.coffee.espresso': { power: false, phase: 'idle', online: true },
  'dev.kettle': { power: false, phase: 'idle', waterLow: false, online: true },
};

describe('kitchen cooling and drink models', () => {
  it.each(KITCHEN_COOLING_DRINK_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses, passes every authoring check and is registered once',
    (_id, spec) => {
      expectValidAndRegistered(spec);
      expectStillWhenIdle(spec, IDLE[spec.id] ?? {});
    },
  );

  it('swings the french doors outward on opposite hinges and lights the interior', () => {
    const angles = ['doorLeft', 'doorRight'].map(
      (id) =>
        FRENCH_DOOR_FRIDGE_MODEL.parts.find((part) => part.id === id)?.poses?.['open']?.rotation,
    );
    expect(angles).toStrictEqual([
      [0, -105, 0],
      [0, 105, 0],
    ]);
    for (const spec of [FRENCH_DOOR_FRIDGE_MODEL, SINGLE_DOOR_FRIDGE_MODEL]) {
      expect(tableOf(spec, 'interiorShow')).toStrictEqual({ open: 0.95, closed: 0, locked: 0 });
      expect(spec.shots?.map((shot) => shot.id)).toStrictEqual(['alarm', 'open']);
    }
  });

  it('pours coffee only while brewing and raises the crema with progress', () => {
    expect(tableOf(ESPRESSO_MACHINE_MODEL, 'streamLeftShow')).toStrictEqual({
      idle: 0,
      heating: 0,
      brewing: 1,
      steaming: 0,
    });
    expect(ESPRESSO_MACHINE_MODEL.channels?.find((c) => c.id === 'cremaRise')?.source).toBe(
      'progress',
    );
  });

  it('lifts the kettle off its base and lists the boiling shot first', () => {
    expect(tableOf(KETTLE_MODEL, 'kettleLift')).toStrictEqual({ true: 0.035, false: 0 });
    expect(KETTLE_MODEL.shots?.map((shot) => shot.id)).toStrictEqual(['boiling', 'heating']);
  });
});
