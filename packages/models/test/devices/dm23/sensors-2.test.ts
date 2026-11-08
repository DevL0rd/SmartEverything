import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { SENSOR_2_MODELS } from '../../../src/devices/sensors-2';

describe('temperature, leak, smoke and air quality models', () => {
  it.each(SENSOR_2_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );
});
