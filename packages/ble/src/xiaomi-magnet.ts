import { uint8, uint32 } from './bytes';
import {
  decryptObjects,
  MiBeaconFormatError,
  type MiBeaconFrame,
  type MiBeaconObject,
} from './mibeacon';

export const XIAOMI_MAGNET_MODEL = 'isa.magnet.dw2hl';
export const XIAOMI_MAGNET_PRODUCT = 0x098b;
const MAGNET_CONTACT_OBJECT = 0x1019;
const COUNTER_TAIL_BYTES = 7;

export interface MagnetObservation {
  readonly counter: number;
  readonly contact: boolean | null;
}

export class MagnetPacketError extends Error {
  override readonly name = 'MagnetPacketError';
}

function contactOf(object: MiBeaconObject): boolean | null {
  if (object.data.length !== 1) {
    throw new MagnetPacketError('MiBeacon contact object 0x1019 must contain exactly one byte.');
  }
  switch (uint8(object.data, 0)) {
    case 0:
    case 2:
      return true;
    case 1:
      return false;
    case 3:
      return null;
    default:
      throw new MagnetPacketError('MiBeacon contact object 0x1019 contains an unsupported state.');
  }
}

export function decodeMagnetFrame(
  frame: MiBeaconFrame,
  address: string,
  bindKey: string,
): MagnetObservation {
  if (frame.productId !== XIAOMI_MAGNET_PRODUCT || frame.mac !== address) {
    throw new MagnetPacketError(
      'The MiBeacon product or frame MAC differs from the registered Xiaomi door.',
    );
  }
  if (!frame.encrypted || !frame.hasObject || (frame.version !== 4 && frame.version !== 5)) {
    throw new MiBeaconFormatError(
      'Xiaomi door observations require authenticated MiBeacon v4/v5 objects.',
    );
  }
  const objects = decryptObjects(frame, { mac: address, bindKey });
  const contacts = objects.filter((object) => object.id === MAGNET_CONTACT_OBJECT);
  if (contacts.length > 1) {
    throw new MagnetPacketError('A Xiaomi door frame must contain at most one contact object.');
  }
  const counter = uint32(
    Uint8Array.of(frame.counter, ...frame.body.subarray(-COUNTER_TAIL_BYTES)),
    0,
  );
  const [contact] = contacts;
  return { counter, contact: contact === undefined ? null : contactOf(contact) };
}
