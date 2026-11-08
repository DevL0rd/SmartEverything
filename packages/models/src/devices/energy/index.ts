import type { ModelSpec } from '@smarteverything/domain';
import { HOME_BATTERY_MODEL } from './battery';
import { EV_CHARGER_MODEL } from './ev-charger';
import { SOLAR_INVERTER_MODEL } from './inverter';
import { ENERGY_METER_MODEL } from './meter';

export { ENERGY_METER_MODEL, EV_CHARGER_MODEL, HOME_BATTERY_MODEL, SOLAR_INVERTER_MODEL };

export const ENERGY_MODELS: readonly ModelSpec[] = [
  EV_CHARGER_MODEL,
  SOLAR_INVERTER_MODEL,
  HOME_BATTERY_MODEL,
  ENERGY_METER_MODEL,
];
