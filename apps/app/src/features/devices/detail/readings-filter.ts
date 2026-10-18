import { presentValue, type PresentedCapability } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { valueOf, type DeviceModel } from '../model/device-model';
import { heroReadingOf, readingsOf } from '../model/readings';

const STATE_SEPARATOR = ' · ';

function squashed(text: string): string {
  return text.replaceAll(/\s+/g, '').toLowerCase();
}

export function shownReadings(
  model: DeviceModel,
  values: DeviceValues,
  stateLine: string,
): readonly PresentedCapability[] {
  const stated = new Set(stateLine.split(STATE_SEPARATOR).map(squashed));
  return readingsOf(model, values, heroReadingOf(model, values)).filter((presented) => {
    const value = valueOf(values, presented);
    return value === undefined || !stated.has(squashed(presentValue(presented, value)));
  });
}
