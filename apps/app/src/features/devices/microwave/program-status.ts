import { ledgerEntry } from '../../../store/subscriptions';
import { MICROWAVE_KEYS, type JsonValue } from '@smarteverything/domain';
import type { DeviceValues, StoreState } from '../../../store/state';
import { slotOf } from '../../../store/command-ledger';

export function confirmedValue(values: DeviceValues, key: string, value: JsonValue): boolean {
  const reported = values[key];
  return reported !== undefined && reported.optimistic !== true && reported.value === value;
}
export function programPending(state: StoreState, deviceId: string): boolean {
  return [
    MICROWAVE_KEYS.mode,
    MICROWAVE_KEYS.setDuration,
    MICROWAVE_KEYS.power,
    MICROWAVE_KEYS.temperature,
    MICROWAVE_KEYS.start,
  ].some((key) => {
    const entry = ledgerEntry(state, slotOf(deviceId, key));
    return entry?.failure === null;
  });
}
