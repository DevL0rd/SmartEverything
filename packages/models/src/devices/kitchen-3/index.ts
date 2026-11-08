import type { ModelSpec } from '@smarteverything/domain';
import { ESPRESSO_MACHINE_MODEL } from './espresso';
import { FRENCH_DOOR_FRIDGE_MODEL } from './fridge-french-door';
import { SINGLE_DOOR_FRIDGE_MODEL } from './fridge-single';
import { KETTLE_MODEL } from './kettle';

export { ESPRESSO_MACHINE_MODEL, FRENCH_DOOR_FRIDGE_MODEL, KETTLE_MODEL, SINGLE_DOOR_FRIDGE_MODEL };

export const KITCHEN_COOLING_DRINK_MODELS: readonly ModelSpec[] = [
  FRENCH_DOOR_FRIDGE_MODEL,
  SINGLE_DOOR_FRIDGE_MODEL,
  ESPRESSO_MACHINE_MODEL,
  KETTLE_MODEL,
];
