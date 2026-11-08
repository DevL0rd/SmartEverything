import type { ModelSpec } from '@smarteverything/domain';
import { BUILT_IN_BATH_MODEL } from './built-in-bath';
import { FREESTANDING_BATH_MODEL } from './freestanding-bath';
import { TOILET_MODEL } from './toilet';
import { VANITY_MODEL } from './vanity';
import { VESSEL_SINK_MODEL } from './vessel-sink';
import { WALL_HUNG_TOILET_MODEL } from './wall-hung';

export {
  BUILT_IN_BATH_MODEL,
  FREESTANDING_BATH_MODEL,
  TOILET_MODEL,
  VANITY_MODEL,
  VESSEL_SINK_MODEL,
  WALL_HUNG_TOILET_MODEL,
};

export const BATHROOM_FIXTURE_MODELS: readonly ModelSpec[] = [
  TOILET_MODEL,
  WALL_HUNG_TOILET_MODEL,
  VANITY_MODEL,
  VESSEL_SINK_MODEL,
  FREESTANDING_BATH_MODEL,
  BUILT_IN_BATH_MODEL,
];
