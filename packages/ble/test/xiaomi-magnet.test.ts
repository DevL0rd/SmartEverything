import { describe, expect, it } from 'vitest';
import {
  MagnetPacketError,
  MiBeaconFormatError,
  XIAOMI_MAGNET_MODEL,
  XIAOMI_MAGNET_PRODUCT,
  CcmTagMismatchError,
  decodeMagnetFrame,
  hexToBytes,
  parseMiBeacon,
  type MagnetObservation,
  type MiBeaconFrame,
} from '../src';
import {
  BIND_KEY_HEX,
  MAGNET_ADDRESS,
  MAGNET_NO_CONTACT_FRAME,
  MAGNET_STATE_0_FRAME,
  MAGNET_STATE_1_FRAME,
  MAGNET_STATE_2_FRAME,
  MAGNET_STATE_3_FRAME,
  MAGNET_STATE_7_FRAME,
  MAGNET_TWO_BYTE_FRAME,
  MAGNET_TWO_CONTACTS_FRAME,
  SCALE_ADDRESS,
  SCALE_MEASUREMENT_FRAME,
  WRONG_BIND_KEY_HEX,
} from './frames';

function addressedFrame(control: number): MiBeaconFrame {
  const body = Array.from({ length: 12 }, (_, index) => index + 1);
  return parseMiBeacon(
    Uint8Array.from([
      control & 0xff,
      control >> 8,
      0x8b,
      0x09,
      0x01,
      0x01,
      0,
      0,
      0x38,
      0xc1,
      0xa4,
      ...body,
    ]),
  );
}

function decode(
  frameHex: string,
  address = MAGNET_ADDRESS,
  bindKey = BIND_KEY_HEX,
): MagnetObservation {
  return decodeMagnetFrame(parseMiBeacon(hexToBytes(frameHex)), address, bindKey);
}

describe('Xiaomi door sensor', () => {
  it('names the model and the MiBeacon product it sends', () => {
    expect(XIAOMI_MAGNET_MODEL).toBe('isa.magnet.dw2hl');
    expect(XIAOMI_MAGNET_PRODUCT).toBe(0x098b);
  });

  it('reads contact states 0 and 2 as contact and 1 as no contact', () => {
    expect(decode(MAGNET_STATE_0_FRAME).contact).toBe(true);
    expect(decode(MAGNET_STATE_2_FRAME).contact).toBe(true);
    expect(decode(MAGNET_STATE_1_FRAME).contact).toBe(false);
  });

  it('reads state 3 as unknown', () => {
    expect(decode(MAGNET_STATE_3_FRAME).contact).toBeNull();
  });

  it('reports no contact for a frame about something else, such as the battery', () => {
    expect(decode(MAGNET_NO_CONTACT_FRAME).contact).toBeNull();
  });

  it('builds the counter from the frame counter and the three extension bytes', () => {
    expect(decode(MAGNET_STATE_0_FRAME).counter).toBe(0x30201009);
    expect(decode(MAGNET_STATE_1_FRAME).counter).toBe(0x3121110a);
    expect(decode(MAGNET_STATE_2_FRAME).counter).toBe(0x3222120b);
  });

  it('names its packet error', () => {
    expect(new MagnetPacketError('x').name).toBe('MagnetPacketError');
  });

  it('refuses a contact state it does not know', () => {
    expect(() => decode(MAGNET_STATE_7_FRAME)).toThrow(
      new MagnetPacketError('MiBeacon contact object 0x1019 contains an unsupported state.'),
    );
  });

  it('refuses a contact object that is not exactly one byte', () => {
    expect(() => decode(MAGNET_TWO_BYTE_FRAME)).toThrow(
      new MagnetPacketError('MiBeacon contact object 0x1019 must contain exactly one byte.'),
    );
  });

  it('refuses a frame with more than one contact object', () => {
    expect(() => decode(MAGNET_TWO_CONTACTS_FRAME)).toThrow(
      new MagnetPacketError('A Xiaomi door frame must contain at most one contact object.'),
    );
  });

  it('refuses a frame from another product or another address', () => {
    const wrongProduct = new MagnetPacketError(
      'The MiBeacon product or frame MAC differs from the registered Xiaomi door.',
    );
    expect(() => decode(SCALE_MEASUREMENT_FRAME, SCALE_ADDRESS)).toThrow(wrongProduct);
    expect(() => decode(MAGNET_STATE_1_FRAME, 'A4:C1:38:00:00:02')).toThrow(wrongProduct);
  });

  it('refuses a frame that is not an authenticated v4 or v5 object', () => {
    const unauthenticated = new MiBeaconFormatError(
      'Xiaomi door observations require authenticated MiBeacon v4/v5 objects.',
    );
    for (const control of [0x5050, 0x5018, 0x3058, 0x6058]) {
      expect(() =>
        decodeMagnetFrame(addressedFrame(control), MAGNET_ADDRESS, BIND_KEY_HEX),
      ).toThrow(unauthenticated);
    }
  });

  it('treats version 4 as an authenticated version like 5, so only a wrong key stops it', () => {
    const frame = addressedFrame(0x4058);
    expect(() => decodeMagnetFrame(frame, MAGNET_ADDRESS, BIND_KEY_HEX)).toThrow(
      CcmTagMismatchError,
    );
  });

  it('refuses a frame encrypted with a different bind key', () => {
    expect(() => decode(MAGNET_STATE_1_FRAME, MAGNET_ADDRESS, WRONG_BIND_KEY_HEX)).toThrow(
      CcmTagMismatchError,
    );
  });
});
