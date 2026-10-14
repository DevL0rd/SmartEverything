import {
  MIBEACON_SERVICE_UUID,
  SCALE_MEASUREMENT_OBJECT,
  bytesToHex,
  decodeScaleObject,
  decryptObjects,
  hexToBytes,
  isXiaomiScale,
  parseMiBeacon,
} from '@smarteverything/ble';
import type { BleAdvert, DiscoveredDevice } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { DecodedAdvert, LocalDriverDefinition, Observed, WatchEntry } from './driver-types';

const OBJECT_PRESENT = 0x40;

export class UnexpectedScaleFrameError extends Error {
  override readonly name = 'UnexpectedScaleFrameError';
}

export const MANUAL_SCALE_MODEL = 'xiaomi.scales.manual';

class ScaleModelMissingError extends Error {
  override readonly name = 'ScaleModelMissingError';

  constructor(externalId: string) {
    super(`The built-in scale ${externalId} has no model in its configuration; add it again.`);
  }
}

function modelOf(entry: LocalDeviceEntry): string {
  const model = entry.config['model'];
  if (typeof model !== 'string') {
    throw new ScaleModelMissingError(entry.externalId);
  }
  return model;
}

function describe(entry: LocalDeviceEntry, observed: Observed): DiscoveredDevice {
  const room = entry.config['room'];
  return {
    provider: 'local',
    externalId: entry.externalId,
    parentExternalId: null,
    kind: 'other',
    name: entry.name,
    model: modelOf(entry),
    manufacturer: 'xiaomi',
    room: typeof room === 'string' ? room : null,
    online: true,
    capabilities: [],
    details: {
      transport: 'bluetooth',
      driver: entry.driver,
      address: entry.address,
      updates: 'Bluetooth adverts heard by your phones and sent to this hub; nothing is polled',
      readingsSource: 'Each weigh-in, decrypted on this hub with the scale’s Bluetooth key',
      lastHeardAt: observed['lastHeardAt'] ?? null,
      replaces: entry.config['replaces'] ?? null,
    },
  };
}

function watch(entry: LocalDeviceEntry): WatchEntry {
  return {
    address: entry.address,
    serviceUuid: MIBEACON_SERVICE_UUID,
    dataPrefix: bytesToHex(new Uint8Array([OBJECT_PRESENT])),
    dataMask: bytesToHex(new Uint8Array([OBJECT_PRESENT])),
  };
}

function decode(entry: LocalDeviceEntry, advert: BleAdvert, key: string): DecodedAdvert {
  const frame = parseMiBeacon(hexToBytes(advert.data));
  if (!isXiaomiScale(frame.productId)) {
    throw new UnexpectedScaleFrameError(
      `The advert from ${advert.address} is product 0x${frame.productId.toString(16)}, not a Xiaomi scale.`,
    );
  }
  const objects = decryptObjects(frame, { mac: frame.mac ?? entry.address, bindKey: key });
  const measurement = objects.find((object) => object.id === SCALE_MEASUREMENT_OBJECT);
  if (measurement === undefined) {
    if (objects.length > 0) {
      throw new UnexpectedScaleFrameError(
        `The scale sent objects ${objects.map((object) => `0x${object.id.toString(16)}`).join(', ')} and no weigh-in.`,
      );
    }
    return { kind: 'idle' };
  }
  const packet = decodeScaleObject(measurement);
  if (packet.kind === 'stepped_off') {
    return { kind: 'idle' };
  }
  return {
    kind: 'measurement',
    measurement: {
      measuredAt: new Date(packet.measuredAt * 1000).toISOString(),
      scaleUser: packet.scaleUser,
      weightKg: packet.weightKg,
      heartRate: packet.heartRate,
      impedance: packet.impedance,
    },
  };
}

export const xiaomiScaleDriver: LocalDriverDefinition = {
  id: 'xiaomi_scale',
  provider: 'local',
  describe,
  adverts: { watch, decode },
};
