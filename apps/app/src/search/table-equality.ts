import { APP_PLUGINS } from '../plugins/registry';
import { rowsOf, type Device, type StoreState } from '../store/state';

type Streams = StoreState['tables']['plugin_streams'];
type Devices = StoreState['tables']['devices'];

function searchable(device: Device): [string, unknown][] {
  return Object.entries(device).filter(([key]) => key !== 'updated_at');
}

function sameDevice(left: Device, right: Device): boolean {
  if (left === right) {
    return true;
  }
  const before = searchable(left);
  const after = searchable(right);
  return (
    before.length === after.length &&
    before.every(([key, value]) => Object.is(value, Reflect.get(right, key)))
  );
}

export function sameSearchDevices(left: Devices, right: Devices): boolean {
  if (left === right) {
    return true;
  }
  const before = rowsOf(left);
  const after = rowsOf(right);
  return (
    before.length === after.length &&
    before.every((device, index) => {
      const other = after[index];
      return other !== undefined && sameDevice(device, other);
    })
  );
}

function streamSearchText(devices: Devices, streams: Streams): string {
  const items = rowsOf(devices)
    .filter((device) => !device.hidden)
    .flatMap((device) =>
      APP_PLUGINS.map((plugin) => plugin.devicePages?.search?.(device, streams) ?? []),
    );
  return JSON.stringify(items);
}

export function sameSearchStreams(devices: Devices, left: Streams, right: Streams): boolean {
  return left === right || streamSearchText(devices, left) === streamSearchText(devices, right);
}
