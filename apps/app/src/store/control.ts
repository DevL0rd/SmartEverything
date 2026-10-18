import { deviceValuesRecord, ledgerEntry } from './subscriptions';
import type { JsonValue } from '@smarteverything/domain';
import { notify } from '../components/toast-store';
import { slotOf } from './command-ledger';
import { useEntityStore, useLedger, useStoreSelector } from './store-context';
import { sameJson } from './same-json';
import type { LedgerEntry, StoreState } from './state';

export interface Control {
  readonly value: JsonValue | undefined;
  readonly pending: boolean;
  readonly failure: string | null;
  readonly offline: boolean;
  readonly set: (value: JsonValue) => Promise<boolean>;
}

export interface ControlState {
  readonly reported: JsonValue | undefined;
  readonly entry: LedgerEntry | null;
  readonly online: boolean;
}

export function sameControl(left: ControlState, right: ControlState): boolean {
  return (
    sameJson(left.reported, right.reported) &&
    left.entry === right.entry &&
    left.online === right.online
  );
}

export function readControl(state: StoreState, deviceId: string, capability: string): ControlState {
  return {
    reported: deviceValuesRecord(state, deviceId)?.[capability]?.value,
    entry: ledgerEntry(state, slotOf(deviceId, capability)) ?? null,
    online: state.tables.devices.byId[deviceId]?.online ?? false,
  };
}

export function useControlOf(deviceId: string, capability: string, read: ControlState): Control {
  const ledger = useLedger();
  const store = useEntityStore();
  const pendingValue = read.entry?.value ?? null;
  return {
    value: pendingValue ?? read.reported,
    pending: read.entry !== null && read.entry.failure === null,
    failure: read.entry?.failure ?? null,
    offline: !read.online,
    set: async (value): Promise<boolean> => {
      const device = store.get().tables.devices.byId[deviceId] ?? null;
      if (device === null) {
        notify({ message: 'This device is no longer in your home', tone: 'critical' });
        return false;
      }
      return (await ledger.send(device, capability, value)).sent;
    },
  };
}

export function useControl(deviceId: string, capability: string): Control {
  const read = useStoreSelector((state) => readControl(state, deviceId, capability), sameControl, [
    deviceId,
    capability,
  ]);
  return useControlOf(deviceId, capability, read);
}
