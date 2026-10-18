import { createDecipheriv } from 'node:crypto';
import { BIND_KEY } from '@smarteverything/domain';
import { hexToBytes, macBytes, macOf, uint8, uint16 } from './bytes';

export const MIBEACON_SERVICE_UUID = '0000fe95-0000-1000-8000-00805f9b34fb';

const MIBEACON_LIMITS = { shortest: 5, longest: 64 } as const;

const HEADER_BYTES = 5;
const MAC_BYTES = 6;
const EXT_COUNTER_BYTES = 3;
const MIC_BYTES = 4;
const ASSOCIATED_DATA = new Uint8Array([0x11]);

export class MiBeaconFormatError extends Error {
  override readonly name = 'MiBeaconFormatError';
}

export class CcmTagMismatchError extends Error {
  override readonly name = 'CcmTagMismatchError';

  constructor(cause: unknown) {
    super(
      'The message authentication code does not match; the key is wrong or the frame was altered.',
      { cause },
    );
  }
}

export interface MiBeaconFrame {
  readonly version: number;
  readonly productId: number;
  readonly counter: number;
  readonly mac: string | null;
  readonly encrypted: boolean;
  readonly hasObject: boolean;
  readonly body: Uint8Array;
  readonly header: Uint8Array;
}

export interface MiBeaconObject {
  readonly id: number;
  readonly data: Uint8Array;
}

function bodyOffset(data: Uint8Array, control: number): number {
  const hasMac = (control & 0x10) !== 0;
  const hasCapability = (control & 0x20) !== 0;
  const afterMac = HEADER_BYTES + (hasMac ? MAC_BYTES : 0);
  if (!hasCapability) {
    return afterMac;
  }
  const capability = data[afterMac] ?? 0;
  return afterMac + 1 + ((capability & 0x20) !== 0 ? 1 : 0);
}

export function parseMiBeacon(data: Uint8Array): MiBeaconFrame {
  if (data.length < MIBEACON_LIMITS.shortest || data.length > MIBEACON_LIMITS.longest) {
    throw new MiBeaconFormatError(
      `A MiBeacon frame is ${String(MIBEACON_LIMITS.shortest)} to ${String(MIBEACON_LIMITS.longest)} bytes, received ${String(data.length)}.`,
    );
  }
  const control = uint16(data, 0);
  const offset = bodyOffset(data, control);
  if (offset > data.length) {
    throw new MiBeaconFormatError(
      `The frame header needs ${String(offset)} bytes, the frame has ${String(data.length)}.`,
    );
  }
  const hasMac = (control & 0x10) !== 0;
  return {
    version: control >> 12,
    productId: uint16(data, 2),
    counter: uint8(data, 4),
    mac: hasMac
      ? macOf(Uint8Array.from(data.subarray(HEADER_BYTES, HEADER_BYTES + MAC_BYTES)).reverse())
      : null,
    encrypted: (control & 0x08) !== 0,
    hasObject: (control & 0x40) !== 0,
    body: data.subarray(offset),
    header: data.subarray(0, HEADER_BYTES),
  };
}

function readObjects(payload: Uint8Array): MiBeaconObject[] {
  const objects: MiBeaconObject[] = [];
  let offset = 0;
  while (offset + 3 <= payload.length) {
    const length = uint8(payload, offset + 2);
    const end = offset + 3 + length;
    if (end > payload.length) {
      throw new MiBeaconFormatError(
        `Object 0x${uint16(payload, offset).toString(16)} claims ${String(length)} bytes past the end of the payload.`,
      );
    }
    objects.push({ id: uint16(payload, offset), data: payload.subarray(offset + 3, end) });
    offset = end;
  }
  if (offset !== payload.length) {
    throw new MiBeaconFormatError('The MiBeacon object payload has a truncated object header.');
  }
  return objects;
}

function decryptCcm(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): Uint8Array {
  const decipher = createDecipheriv('aes-128-ccm', key, nonce, { authTagLength: MIC_BYTES });
  decipher.setAuthTag(tag);
  decipher.setAAD(ASSOCIATED_DATA, { plaintextLength: ciphertext.length });
  try {
    const plain = decipher.update(ciphertext);
    decipher.final();
    return new Uint8Array(plain.buffer, plain.byteOffset, plain.length);
  } catch (cause) {
    throw new CcmTagMismatchError(cause);
  }
}

export interface Decryption {
  readonly mac: string;
  readonly bindKey: string;
}

export function decryptObjects(frame: MiBeaconFrame, decryption: Decryption): MiBeaconObject[] {
  if (!frame.hasObject) {
    return [];
  }
  if (!frame.encrypted) {
    return readObjects(frame.body);
  }
  if (frame.version < 4) {
    throw new MiBeaconFormatError(
      `MiBeacon version ${String(frame.version)} encryption is not supported; only v4 and v5.`,
    );
  }
  if (frame.body.length <= EXT_COUNTER_BYTES + MIC_BYTES) {
    throw new MiBeaconFormatError('The encrypted frame has no payload.');
  }
  const cut = frame.body.length - EXT_COUNTER_BYTES - MIC_BYTES;
  const nonce = Uint8Array.from([
    ...macBytes(decryption.mac).reverse(),
    ...frame.header.subarray(2, 5),
    ...frame.body.subarray(cut, cut + EXT_COUNTER_BYTES),
  ]);
  const plain = decryptCcm(
    hexToBytes(BIND_KEY.parse(decryption.bindKey)),
    nonce,
    frame.body.subarray(0, cut),
    frame.body.subarray(cut + EXT_COUNTER_BYTES),
  );
  return readObjects(plain);
}
