import type { JsonValue } from '@smarteverything/domain';
import { notify } from '../components/toast-store';
import { slotOf } from './command-ledger';
import { useLedger, useStoreSelector } from './store-context';
import type { DeviceValue, LedgerEntry } from './state';

export interface Control {
  readonly value: JsonValue | undefined;
  readonly observedAt: string | null;
  readonly pending: boolean;
  readonly failure: string | null;
  readonly offline: boolean;
  readonly set: (value: JsonValue) => Promise<boolean>;
}

interface ControlState {
  readonly reported: DeviceValue | null;
  readonly entry: LedgerEntry | null;
  readonly online: boolean;
}

function sameControl(left: ControlState, right: ControlState): boolean {
  return (
    left.reported === right.reported && left.entry === right.entry && left.online === right.online
  );
}

export function useControl(deviceId: string, capability: string): Control {
  const ledger = useLedger();
  const slot = slotOf(deviceId, capability);
  const read = useStoreSelector(
    (state): ControlState => ({
      reported: state.deviceValues[deviceId]?.[capability] ?? null,
      entry: state.ledger[slot] ?? null,
      online: state.tables.devices.byId[deviceId]?.online ?? false,
    }),
    sameControl,
    [deviceId, capability, slot],
  );
  const device = useStoreSelector(
    (state) => state.tables.devices.byId[deviceId] ?? null,
    Object.is,
    [deviceId],
  );
  const pendingValue = read.entry?.value ?? null;
  return {
    value: pendingValue ?? read.reported?.value,
    observedAt: read.reported?.observedAt ?? null,
    pending: pendingValue !== null,
    failure: read.entry?.failure ?? null,
    offline: !read.online,
    set: async (value): Promise<boolean> => {
      if (device === null) {
        notify({ message: 'This device is no longer in your home', tone: 'critical' });
        return false;
      }
      return (await ledger.send(device, capability, value)).sent;
    },
  };
}
