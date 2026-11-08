import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { ENERGY_MODELS } from '../../../src/devices/energy';

describe('ev charger, inverter, home battery and energy meter models', () => {
  it.each(ENERGY_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );
});
