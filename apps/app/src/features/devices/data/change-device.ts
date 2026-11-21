import { updateDevice, type DeviceChange } from '../../../api/devices';
import { notifyFailure } from '../../../components/toast-store';
import type { EntityStore } from '../../../store/entity-store';
import { deviceEdit, writeOptimistically } from '../../../store/optimistic';
import type { Device } from '../../../store/state';

function deviceAfter(device: Device, patch: DeviceChange): Device {
  return {
    ...device,
    ...(patch.display_name === undefined ? {} : { display_name: patch.display_name }),
    ...(patch.room_id === undefined ? {} : { room_id: patch.room_id }),
    ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
    ...(patch.favourite === undefined ? {} : { favourite: patch.favourite }),
    ...(patch.position === undefined ? {} : { position: patch.position }),
    ...(patch.input_names === undefined ? {} : { input_names: { ...patch.input_names } }),
  };
}

export function writeDevice(
  store: EntityStore,
  deviceId: string,
  patch: DeviceChange,
): Promise<void> {
  const previous = store.get().tables.devices.byId[deviceId] ?? null;
  return writeOptimistically(store, {
    event: 'device.change',
    edits: previous === null ? [] : [deviceEdit(previous, deviceAfter(previous, patch))],
    send: () => updateDevice(deviceId, patch),
    fields: { deviceId, fields: Object.keys(patch).join(',') },
  });
}

export function changeDevice(
  store: EntityStore,
  device: Pick<Device, 'id'>,
  name: string,
  patch: DeviceChange,
): void {
  writeDevice(store, device.id, patch).catch(notifyFailure(`${name} was not changed`));
}
