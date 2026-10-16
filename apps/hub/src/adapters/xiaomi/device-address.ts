import {
  DEVICE_LIST_PATH,
  deviceListData,
  parseDeviceList,
  chooseTransport,
} from '@smarteverything/xiaomi';
import type { XiaomiCloud } from './cloud-api';
import type { CloudLookup } from './reachability';

class DeviceUnlistedError extends Error {
  override readonly name = 'DeviceUnlistedError';

  constructor(did: string) {
    super(`The Xiaomi device list no longer holds the device ${did}.`);
  }
}

export async function lookupDeviceAddress(
  cloud: XiaomiCloud,
  did: string,
): Promise<CloudLookup & { readonly ip: string | null }> {
  const page = parseDeviceList(await cloud.call(DEVICE_LIST_PATH, deviceListData()));
  const device = page.devices.find((candidate) => candidate.did === did);
  if (device === undefined) throw new DeviceUnlistedError(did);
  return {
    host: chooseTransport(device).transport === 'cloud' ? null : device.ip,
    online: device.online,
    ip: device.ip,
  };
}
