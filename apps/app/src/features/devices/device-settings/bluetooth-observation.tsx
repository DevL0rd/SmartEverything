import { useState, type ReactNode } from 'react';
import { Logger, background } from '@smarteverything/logging';
import { List } from '../../../components/section';
import { SwitchRow, ValueRow } from '../../../components/rows';
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
import { bleStatusOf } from './ble-status';

const log = new Logger('app.devices');

function useChangeObservation(
  deviceId: string,
  refresh: () => Promise<unknown>,
): { readonly busy: boolean; readonly change: (enabled: boolean) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const change = async (enabled: boolean): Promise<void> => {
    setBusy(true);
    log.info('observation.changing', { deviceId, enabled });
    try {
      if (enabled) {
        await enableDoorObservation(deviceId);
      } else {
        await disableDoorObservation(deviceId);
      }
      await refresh();
      log.info('observation.changed', { deviceId, enabled });
    } catch (error) {
      log.error('observation.change_failed', error, { deviceId, enabled });
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
  const readiness = bleStatusOf(status, query.error, now);
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
          background(change(enabled), 'bluetooth_observation.change_failed');
        }}
      />
      <ValueRow
        title="Your server"
        icon="server"
        value={readiness.value}
        {...(readiness.detail === undefined ? {} : { subtitle: readiness.detail })}
      />
      {status?.configured === true ? <PhoneListeningRows health={false} /> : null}
    </List>
  );
}
