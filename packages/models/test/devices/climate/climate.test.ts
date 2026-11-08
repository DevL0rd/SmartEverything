import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { CLIMATE_MODELS } from '../../../src/devices/climate';

describe('dehumidifier, pedestal fan, ceramic heater, split air conditioner and thermostat models', () => {
  it.each(CLIMATE_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check, carries its family and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.family).toBeDefined();
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );

  it('covers the five climate families with their default ids', () => {
    expect(CLIMATE_MODELS.map((spec) => [spec.family, spec.id])).toStrictEqual([
      ['dehumidifier', 'dev.dehumidifier'],
      ['fan', 'dev.fan.pedestal'],
      ['heater', 'dev.heater.ceramic'],
      ['air_conditioner', 'dev.ac.split-indoor'],
      ['thermostat', 'dev.thermostat.round'],
    ]);
  });
});
