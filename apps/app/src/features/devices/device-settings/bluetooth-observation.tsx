import { useState, type ReactNode } from 'react';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { notify } from '../../../components/toast-store';
import {
  disableDoorObservation,
  enableDoorObservation,
  useBleObservation,
} from '../../../api/ble-observations';
import { useIsOwner } from '../../../store/selectors';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { PhoneListeningRows } from '../../profiles';

function useChangeObservation(
  deviceId: string,
  refresh: () => Promise<unknown>,
): { readonly busy: boolean; readonly change: (enabled: boolean) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const change = async (enabled: boolean): Promise<void> => {
    setBusy(true);
    try {
      if (enabled) {
        await enableDoorObservation(deviceId);
      } else {
        await disableDoorObservation(deviceId);
      }
      await refresh();
    } catch (error) {
      notify({ message: 'Bluetooth observation was not changed', error, tone: 'critical' });
    } finally {
      setBusy(false);
    }
  };
  return { busy, change };
}

export function BluetoothObservation({ device }: { readonly device: Device }): ReactNode {
  const owner = useIsOwner();
  const now = useMinute();
  const query = useBleObservation(device.id, device.details['bleObserverFreshUntil']);
  const status = query.data;
  const { busy, change } = useChangeObservation(device.id, query.refetch);
  return (
    <List
      title="Bluetooth updates"
      footer="Nearby Android phones can hear encrypted broadcasts and send them to your server. Cloud updates continue when no recent broadcast is received."
    >
      <SwitchRow
        title="Listen for this door"
        icon="bluetooth"
        subtitle={
          owner
            ? 'Your server reads its Bluetooth key from your Xiaomi account'
            : 'The owner sets up Bluetooth observation'
        }
        disabled={!owner || busy || status === undefined}
        value={status?.configured ?? false}
        onChange={(enabled) => {
          void change(enabled);
        }}
      />
      <ListRow
        title="Your server"
        icon="server"
        subtitle={query.error !== null ? query.error.message : readiness(status, now)}
        onPress={() => {
          void query.refetch();
        }}
      />
      {status?.configured === true ? <PhoneListeningRows health={false} /> : null}
    </List>
  );
}

function readiness(status: ReturnType<typeof useBleObservation>['data'], now: number): string {
  if (status === undefined) {
    return 'Reading receiver status…';
  }
  if (!status.configured) {
    return 'Bluetooth observation is off';
  }
  if (status.blockedReason !== null) {
    return status.blockedReason;
  }
  if (status.freshUntil !== null && Date.parse(status.freshUntil) <= now) {
    return 'No recent authenticated broadcast · Cloud updates active';
  }
  return 'Authenticated Bluetooth broadcasts received recently';
}
