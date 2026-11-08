import type { ModelSpec } from '@smarteverything/domain';
import { SPLIT_AC_INDOOR_MODEL } from './ac-split-indoor';
import { DEHUMIDIFIER_MODEL } from './dehumidifier';
import { PEDESTAL_FAN_MODEL } from './fan-pedestal';
import { CERAMIC_HEATER_MODEL } from './heater-ceramic';
import { ROUND_THERMOSTAT_MODEL } from './thermostat-round';

export {
  CERAMIC_HEATER_MODEL,
  DEHUMIDIFIER_MODEL,
  PEDESTAL_FAN_MODEL,
  ROUND_THERMOSTAT_MODEL,
  SPLIT_AC_INDOOR_MODEL,
};

export const CLIMATE_MODELS: readonly ModelSpec[] = [
  DEHUMIDIFIER_MODEL,
  PEDESTAL_FAN_MODEL,
  CERAMIC_HEATER_MODEL,
  SPLIT_AC_INDOOR_MODEL,
  ROUND_THERMOSTAT_MODEL,
];
