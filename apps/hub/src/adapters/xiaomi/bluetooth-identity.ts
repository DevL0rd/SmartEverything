import {
  BEACON_KEY_PATH,
  DEVICE_LIST_PATH,
  beaconKeyData,
  deviceListData,
  parseBeaconKey,
  parseDeviceList,
} from '@smarteverything/xiaomi';
import type { XiaomiCloud } from './cloud-api';
import type { BluetoothIdentity } from '../../local/setup-types';

class BluetoothIdentityMissingError extends Error {
  override readonly name = 'BluetoothIdentityMissingError';

  constructor(did: string) {
    super(`The Xiaomi inventory has no matching Bluetooth model and address for ${did}.`);
  }
}

export async function readBluetoothIdentity(
  cloud: XiaomiCloud,
  did: string,
  accountScope: string,
  expectedModel?: string,
): Promise<BluetoothIdentity> {
  const page = parseDeviceList(await cloud.call(DEVICE_LIST_PATH, deviceListData()));
  const matches = page.devices.filter((candidate) => candidate.did === did);
  const [device] = matches;
  const mac = device?.mac ?? null;
  if (
    matches.length !== 1 ||
    mac === null ||
    (expectedModel !== undefined && device?.model !== expectedModel)
  ) {
    throw new BluetoothIdentityMissingError(did);
  }
  const bindKey = parseBeaconKey(did, await cloud.call(BEACON_KEY_PATH, beaconKeyData(did)));
  return { mac, bindKey, accountScope };
}
