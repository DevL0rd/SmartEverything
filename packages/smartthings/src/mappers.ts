import type { CapabilityMapper } from './mapper-kit';
import { climateMappers } from './mappers-climate';
import { homeMappers } from './mappers-home';
import { lightingMappers } from './mappers-lighting';
import { mediaMappers } from './mappers-media';
import { sensorMappers } from './mappers-sensors';

export function allMappers(): readonly CapabilityMapper[] {
  return [
    ...lightingMappers(),
    ...climateMappers(),
    ...mediaMappers(),
    ...homeMappers(),
    ...sensorMappers(),
  ];
}
