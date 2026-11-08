import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { SENSOR_3_MODELS } from '../../../src/devices/sensors-3';

describe('vibration, light and plant models', () => {
  it.each(SENSOR_3_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );
});
