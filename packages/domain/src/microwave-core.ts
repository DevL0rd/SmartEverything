import { z } from 'zod';
export const MICROWAVE_KEYS = {
  mode: 'raw:samsungce.oven_mode.oven_mode',
  supportedModes: 'raw:samsungce.oven_mode.supported_oven_modes',
  state: 'raw:samsungce.oven_operating_state.operating_state',
  job: 'raw:samsungce.oven_operating_state.oven_job_state',
  duration: 'raw:samsungce.oven_operating_state.operation_time',
  setDuration: 'raw:samsungce.oven_operating_state:set_operation_time',
  start: 'raw:samsungce.oven_operating_state:start',
  pause: 'raw:samsungce.oven_operating_state:pause',
  stop: 'raw:samsungce.oven_operating_state:stop',
  progress: 'raw:samsungce.oven_operating_state.progress',
  completion: 'raw:samsungce.oven_operating_state.completion_time',
  power: 'raw:samsungce.microwave_power.power_level',
  supportedPower: 'raw:samsungce.microwave_power.supported_power_levels',
  temperature: 'raw:oven_setpoint.oven_setpoint',
  specification: 'raw:samsungce.kitchen_mode_specification.specification',
  remote: 'raw:remote_control_status.remote_control_enabled',
  door: 'raw:samsungce.door_state.door_state',
  lock: 'raw:samsungce.kids_lock.lock_state',
  definedRecipe: 'raw:samsungce.defined_recipe.defined_recipe',
  cookDefinedRecipe: 'raw:samsungce.defined_recipe:cook_defined_recipe',
  cookRecipe: 'raw:samsungce.cook_recipe:set_cook_recipe',
  schedule: 'raw:samsungce.software_update.schedule',
  agreeUpdate: 'raw:samsungce.software_update:agree_update',
  disagreeUpdate: 'raw:samsungce.software_update:disagree_update',
  availableModules: 'raw:samsungce.software_update.available_modules',
} as const;

export const MICROWAVE_MODE_LABELS: Readonly<Record<string, string>> = {
  NoOperation: 'No program',
  Autocook: 'Automatic recipe',
  AutocookCustom: 'Custom recipe',
  Convection: 'Convection',
  AirFryer: 'Air fry',
  Grill: 'Grill',
  MicroWave: 'Microwave',
  MicroWaveGrill: 'Microwave + grill',
  MicroWaveConvection: 'Microwave + convection',
  Deodorization: 'Deodorize',
};

export const MICROWAVE_DURATION = z.string().regex(/^\d{2,}:[0-5]\d:[0-5]\d$/);
