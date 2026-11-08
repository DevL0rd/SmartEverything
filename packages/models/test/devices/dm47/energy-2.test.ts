import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { ENERGY_2_MODELS } from '../../../src/devices/energy-2';

describe('water heater, heat pump, water valve and sprinkler models', () => {
  it.each(ENERGY_2_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );
});
