import { describe, expect, it } from 'vitest';
import {
  CcmTagMismatchError,
  MIBEACON_SERVICE_UUID,
  MiBeaconFormatError,
  decryptObjects,
  hexToBytes,
  parseMiBeacon,
} from '../src';
import {
  BIND_KEY_HEX,
  ENCRYPTED_V3_FRAME,
  MAGNET_ADDRESS,
  MAGNET_STATE_1_FRAME,
  MAGNET_TWO_CONTACTS_FRAME,
  SCALE_ADDRESS,
  SCALE_MEASUREMENT_FRAME,
  WRONG_BIND_KEY_HEX,
} from './frames';

const scale = { mac: SCALE_ADDRESS, bindKey: BIND_KEY_HEX };

function plainFrame(control: number, payload: readonly number[]): Uint8Array {
  return Uint8Array.from([control & 0xff, control >> 8, 0xbd, 0x78, 0x01, ...payload]);
}

describe('MiBeacon frame header', () => {
  it('names the Xiaomi service the frames arrive on', () => {
    expect(MIBEACON_SERVICE_UUID).toBe('0000fe95-0000-1000-8000-00805f9b34fb');
  });

  it('reads the version, product, counter, address and flags of an encrypted frame', () => {
    const frame = parseMiBeacon(hexToBytes(SCALE_MEASUREMENT_FRAME));
    expect(frame).toMatchObject({
      version: 5,
      productId: 0x78bd,
      counter: 7,
      mac: SCALE_ADDRESS,
      encrypted: true,
      hasObject: true,
    });
    expect(frame.header).toStrictEqual(hexToBytes('5850bd7807'));
    expect(frame.body).toStrictEqual(hexToBytes(SCALE_MEASUREMENT_FRAME.slice(22)));
  });

  it('reads a frame without an address or encryption', () => {
    const frame = parseMiBeacon(plainFrame(0x5040, [0xaa]));
    expect(frame).toMatchObject({ version: 5, mac: null, encrypted: false, hasObject: true });
    expect(frame.body).toStrictEqual(new Uint8Array([0xaa]));
  });

  it('skips one capability byte, or two when the capability asks for I/O bytes', () => {
    expect(parseMiBeacon(plainFrame(0x5060, [0x00, 0xaa])).body).toStrictEqual(
      new Uint8Array([0xaa]),
    );
    expect(parseMiBeacon(plainFrame(0x5060, [0x20, 0x00, 0xaa])).body).toStrictEqual(
      new Uint8Array([0xaa]),
    );
  });

  it('skips the address before the capability byte', () => {
    const frame = parseMiBeacon(plainFrame(0x5070, [1, 2, 3, 4, 5, 6, 0x00, 0xaa]));
    expect(frame.body).toStrictEqual(new Uint8Array([0xaa]));
    expect(frame.mac).toBe('06:05:04:03:02:01');
  });

  it('accepts the shortest and the longest frame and refuses one byte beyond either', () => {
    expect(() => parseMiBeacon(new Uint8Array(5))).not.toThrow();
    expect(() => parseMiBeacon(new Uint8Array(64))).not.toThrow();
    expect(() => parseMiBeacon(new Uint8Array(4))).toThrow(
      new MiBeaconFormatError('A MiBeacon frame is 5 to 64 bytes, received 4.'),
    );
    expect(() => parseMiBeacon(new Uint8Array(65))).toThrow(
      new MiBeaconFormatError('A MiBeacon frame is 5 to 64 bytes, received 65.'),
    );
  });

  it('names its format error', () => {
    expect(new MiBeaconFormatError('x').name).toBe('MiBeaconFormatError');
  });

  it('refuses a header that claims more bytes than the frame holds', () => {
    expect(() => parseMiBeacon(plainFrame(0x5010, [1, 2, 3, 4, 5]))).toThrow(
      new MiBeaconFormatError('The frame header needs 11 bytes, the frame has 10.'),
    );
    expect(() => parseMiBeacon(Uint8Array.from([0x20, 0x50, 0, 0, 0]))).toThrow(
      new MiBeaconFormatError('The frame header needs 6 bytes, the frame has 5.'),
    );
  });
});

describe('MiBeacon objects', () => {
  it('reads the objects of an unencrypted frame in order', () => {
    const frame = parseMiBeacon(plainFrame(0x5040, [0x16, 0x6e, 2, 9, 8, 0x19, 0x10, 1, 7]));
    expect(decryptObjects(frame, scale)).toStrictEqual([
      { id: 0x6e16, data: new Uint8Array([9, 8]) },
      { id: 0x1019, data: new Uint8Array([7]) },
    ]);
  });

  it('reads an object of no data', () => {
    const frame = parseMiBeacon(plainFrame(0x5040, [0x01, 0x10, 0]));
    expect(decryptObjects(frame, scale)).toStrictEqual([{ id: 0x1001, data: new Uint8Array(0) }]);
  });

  it('finds nothing in a frame that carries no object', () => {
    expect(decryptObjects(parseMiBeacon(plainFrame(0x5000, [1, 2, 3])), scale)).toStrictEqual([]);
  });

  it('refuses an object that claims bytes beyond the payload', () => {
    const frame = parseMiBeacon(plainFrame(0x5040, [0x16, 0x6e, 4, 1, 2]));
    expect(() => decryptObjects(frame, scale)).toThrow(
      new MiBeaconFormatError('Object 0x6e16 claims 4 bytes past the end of the payload.'),
    );
  });

  it('refuses a payload that ends inside an object header', () => {
    const frame = parseMiBeacon(plainFrame(0x5040, [0x16, 0x6e]));
    expect(() => decryptObjects(frame, scale)).toThrow(
      new MiBeaconFormatError('The MiBeacon object payload has a truncated object header.'),
    );
  });

  it('decrypts an encrypted frame with the bind key of its device', () => {
    const frame = parseMiBeacon(hexToBytes(MAGNET_STATE_1_FRAME));
    expect(decryptObjects(frame, { mac: MAGNET_ADDRESS, bindKey: BIND_KEY_HEX })).toStrictEqual([
      { id: 0x1019, data: new Uint8Array([1]) },
    ]);
  });

  it('decrypts every object an encrypted frame carries', () => {
    const frame = parseMiBeacon(hexToBytes(MAGNET_TWO_CONTACTS_FRAME));
    const objects = decryptObjects(frame, { mac: MAGNET_ADDRESS, bindKey: BIND_KEY_HEX });
    expect(objects.map((object) => [object.id, [...object.data]])).toStrictEqual([
      [0x1019, [0]],
      [0x1019, [1]],
    ]);
  });

  it('refuses a frame whose key is wrong', () => {
    const frame = parseMiBeacon(hexToBytes(MAGNET_STATE_1_FRAME));
    expect(() =>
      decryptObjects(frame, { mac: MAGNET_ADDRESS, bindKey: WRONG_BIND_KEY_HEX }),
    ).toThrow(CcmTagMismatchError);
  });

  it('refuses a frame decrypted for another address', () => {
    const frame = parseMiBeacon(hexToBytes(MAGNET_STATE_1_FRAME));
    expect(() => decryptObjects(frame, { mac: SCALE_ADDRESS, bindKey: BIND_KEY_HEX })).toThrow(
      CcmTagMismatchError,
    );
  });

  it('refuses a frame that was altered after it was sent', () => {
    const altered = hexToBytes(MAGNET_STATE_1_FRAME);
    altered[11] = (altered[11] ?? 0) ^ 1;
    expect(() =>
      decryptObjects(parseMiBeacon(altered), { mac: MAGNET_ADDRESS, bindKey: BIND_KEY_HEX }),
    ).toThrow(CcmTagMismatchError);
  });

  it('says why the code does not match', () => {
    const cause = new Error('unable to authenticate');
    const error = new CcmTagMismatchError(cause);
    expect(error.name).toBe('CcmTagMismatchError');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'The message authentication code does not match; the key is wrong or the frame was altered.',
    );
  });

  it('refuses encryption older than version 4', () => {
    expect(() => decryptObjects(parseMiBeacon(hexToBytes(ENCRYPTED_V3_FRAME)), scale)).toThrow(
      new MiBeaconFormatError('MiBeacon version 3 encryption is not supported; only v4 and v5.'),
    );
  });

  it('refuses an encrypted frame too short to hold a payload', () => {
    const tail = Array.from({ length: 7 }, () => 0);
    const frame = parseMiBeacon(plainFrame(0x5058, [1, 2, 3, 4, 5, 6, ...tail]));
    expect(() => decryptObjects(frame, scale)).toThrow(
      new MiBeaconFormatError('The encrypted frame has no payload.'),
    );
  });

  it('refuses a bind key that is not 32 hex characters', () => {
    const frame = parseMiBeacon(hexToBytes(MAGNET_STATE_1_FRAME));
    expect(() => decryptObjects(frame, { mac: MAGNET_ADDRESS, bindKey: 'abcd' })).toThrow();
  });
});
