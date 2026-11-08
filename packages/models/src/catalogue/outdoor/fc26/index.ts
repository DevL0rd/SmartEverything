import type { ModelSpec } from '@smarteverything/domain';
import { BIKE_RACK_MODEL } from './bike-rack';
import { CAR_MODEL } from './car';
import { MOTORBIKE_MODEL } from './motorbike';
import { SCOOTER_MODEL } from './scooter';

export { BIKE_RACK_MODEL, CAR_MODEL, MOTORBIKE_MODEL, SCOOTER_MODEL };

export const OUTDOOR_VEHICLE_MODELS: readonly ModelSpec[] = [
  BIKE_RACK_MODEL,
  CAR_MODEL,
  MOTORBIKE_MODEL,
  SCOOTER_MODEL,
];
