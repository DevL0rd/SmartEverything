import { presentValue, withRole, type CapabilityRole } from '@smarteverything/domain';
import { joinParts } from '../../../format/text';
import { deviceValuesOf, type DeviceValues } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { powerStateOf, valueOf, type DeviceModel } from './device-model';
import { heroReadingOf } from './readings';

const MODE_ROLES: readonly CapabilityRole[] = ['purifier_mode', 'mode', 'hvac_mode', 'cleaning'];

const SLEEPY_LINE: Readonly<Partial<Record<DeviceModel['family'], string>>> = {
  scale: 'Wakes when used',
  wearable: 'Syncs through your phone',
};

function modeText(model: DeviceModel, values: DeviceValues): string | null {
  for (const role of MODE_ROLES) {
    const presented = withRole(model.presentation, role);
    const value = valueOf(values, presented);
    if (presented !== undefined && value !== undefined) {
      return presentValue(presented, value);
    }
  }
  return null;
}

function readingText(model: DeviceModel, values: DeviceValues): string | null {
  const hero = heroReadingOf(model, values);
  const value = valueOf(values, hero);
  if (hero === null || value === undefined) {
    return null;
  }
  const shown = presentValue(hero, value);
  return hero.role === 'pm25' ? `${hero.label} ${shown}` : shown;
}

export function stateLine(model: DeviceModel, values: DeviceValues, withReading = true): string {
  const sleepy = SLEEPY_LINE[model.family];
  if (model.sleepy && sleepy !== undefined) {
    return sleepy;
  }
  if (!model.device.online) {
    return 'Offline';
  }
  const power = powerStateOf(model, values);
  if (power === 'off') {
    return 'Off';
  }
  const line = joinParts([modeText(model, values), withReading && readingText(model, values)]);
  if (line !== '') {
    return line;
  }
  return power === 'on' ? 'On' : 'Online';
}

export function useStateLine(model: DeviceModel, withReading: boolean): string {
  return useStoreSelector(
    (state) => stateLine(model, deviceValuesOf(state, model.device.id), withReading),
    Object.is,
    [model, withReading],
  );
}
