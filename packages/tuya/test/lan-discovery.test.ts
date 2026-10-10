import { createCipheriv, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DISCOVERY_PORTS, LanAnnouncementError, UDP_KEY, readLanAnnouncement } from '../src';

const KEY = createHash('md5').update('yGAdlopoPVldABfn').digest();

const ANNOUNCEMENT = {
  ip: '192.168.1.20',
  gwId: 'bf0123',
  active: 2,
  encrypt: true,
  productKey: 'p',
  version: '3.3',
};

function frame55aa(payload: Buffer, command = 0x13): Uint8Array {
  const frame = Buffer.alloc(payload.length + 24);
  frame.writeUInt32BE(0x000055aa, 0);
  frame.writeUInt32BE(command, 8);
  frame.writeUInt32BE(payload.length + 8, 12);
  payload.copy(frame, 16);
  frame.writeUInt32BE(0x0000aa55, payload.length + 20);
  return new Uint8Array(frame);
}

function ecb(text: string | Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', KEY, null);
  return Buffer.concat([cipher.update(text), cipher.final()]);
}

function frame6699(plain: Buffer): Uint8Array {
  const header = Buffer.alloc(18);
  header.writeUInt32BE(0x00006699, 0);
  header.writeUInt32BE(1, 6);
  header.writeUInt32BE(0x13, 10);
  header.writeUInt32BE(plain.length + 28, 14);
  const nonce = Buffer.from('0123456789ab');
  const cipher = createCipheriv('aes-128-gcm', KEY, nonce);
  cipher.setAAD(header.subarray(4, 18));
  const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
  return new Uint8Array(
    Buffer.concat([header, nonce, sealed, cipher.getAuthTag(), Buffer.from([0, 0, 0x99, 0x66])]),
  );
}

const RETURN_CODE = Buffer.alloc(4);

describe('LAN broadcasts', () => {
  it('listens on both Tuya broadcast ports with the well-known key', () => {
    expect(DISCOVERY_PORTS).toStrictEqual([6666, 6667]);
    expect(Buffer.from(UDP_KEY).equals(KEY)).toBe(true);
  });

  it('reads a protocol 3.1 plain broadcast', () => {
    const json = Buffer.from(JSON.stringify({ ...ANNOUNCEMENT, version: '3.1' }));
    expect(readLanAnnouncement(frame55aa(json, 0))).toStrictEqual({
      deviceId: 'bf0123',
      ip: '192.168.1.20',
      version: '3.1',
    });
    expect(readLanAnnouncement(frame55aa(Buffer.concat([RETURN_CODE, json]), 0)).version).toBe(
      '3.1',
    );
  });

  it('reads a protocol 3.3 encrypted broadcast with or without a return code', () => {
    const sealed = ecb(JSON.stringify(ANNOUNCEMENT));
    expect(readLanAnnouncement(frame55aa(Buffer.concat([RETURN_CODE, sealed])))).toStrictEqual({
      deviceId: 'bf0123',
      ip: '192.168.1.20',
      version: '3.3',
    });
    expect(readLanAnnouncement(frame55aa(sealed)).deviceId).toBe('bf0123');
  });

  it('reads a protocol 3.5 sealed broadcast', () => {
    const plain = Buffer.concat([
      RETURN_CODE,
      Buffer.from(JSON.stringify({ ...ANNOUNCEMENT, version: '3.5' })),
      Buffer.from([0]),
    ]);
    expect(readLanAnnouncement(frame6699(plain))).toStrictEqual({
      deviceId: 'bf0123',
      ip: '192.168.1.20',
      version: '3.5',
    });
  });

  it('refuses frames that are not Tuya broadcasts, saying why', () => {
    expect(() => readLanAnnouncement(new Uint8Array(10))).toThrow(
      new LanAnnouncementError('a frame needs at least 24 bytes, received 10'),
    );
    expect(() => readLanAnnouncement(new Uint8Array(24))).toThrow(
      'the frame prefix 0 is not a Tuya prefix',
    );
    const truncated = frame55aa(Buffer.from('{"a":1}'));
    new DataView(truncated.buffer).setUint32(12, 400);
    expect(() => readLanAnnouncement(truncated)).toThrow(
      'the frame declares 400 bytes but carries fewer',
    );
    const sealed = frame6699(Buffer.from('{}'));
    new DataView(sealed.buffer).setUint32(14, 400);
    expect(() => readLanAnnouncement(sealed)).toThrow(
      'the frame declares 400 bytes but carries fewer',
    );
  });

  it('describes its error', () => {
    expect(new LanAnnouncementError('x')).toMatchObject({
      name: 'LanAnnouncementError',
      reason: 'x',
    });
  });

  it('reads the sealed length exactly and refuses a frame whose tag is cut', () => {
    const sealed = frame6699(Buffer.from(JSON.stringify(ANNOUNCEMENT)));
    new DataView(sealed.buffer).setUint32(14, sealed.length - 18);
    expect(() => readLanAnnouncement(sealed)).toThrow(
      /its payload could not be decrypted or parsed/,
    );
  });

  it('refuses bytes that are not UTF-8 even around a JSON object', () => {
    const plain = Buffer.concat([Buffer.from([0xff]), Buffer.from(JSON.stringify(ANNOUNCEMENT))]);
    expect(() => readLanAnnouncement(frame55aa(ecb(plain)))).toThrow(
      /could not be decrypted or parsed \(TypeError/,
    );
  });

  it('accepts only protocol versions 3.1 to 3.5', () => {
    for (const version of ['3.15', '13.3', '3.0']) {
      expect(() =>
        readLanAnnouncement(frame55aa(ecb(JSON.stringify({ ...ANNOUNCEMENT, version })))),
      ).toThrow(LanAnnouncementError);
    }
  });

  it('refuses a payload that decrypts to no announcement', () => {
    expect(() => readLanAnnouncement(frame55aa(ecb('no json here')))).toThrow(
      'A Tuya LAN broadcast could not be read: the decrypted payload holds no JSON object.',
    );
    expect(() => readLanAnnouncement(frame55aa(ecb('} then {')))).toThrow('holds no JSON object');
    expect(() => readLanAnnouncement(frame55aa(Buffer.from('{"a":}')))).toThrow(
      /its payload could not be decrypted or parsed \(/,
    );
    expect(() => readLanAnnouncement(frame55aa(Buffer.alloc(16, 1)))).toThrow(
      /could not be decrypted or parsed/,
    );
    expect(() =>
      readLanAnnouncement(frame55aa(ecb(JSON.stringify({ ...ANNOUNCEMENT, ip: 'nowhere' })))),
    ).toThrow('A Tuya LAN broadcast could not be read: ip: Invalid IPv4 address.');
    expect(() =>
      readLanAnnouncement(frame55aa(ecb(JSON.stringify({ ...ANNOUNCEMENT, version: '3.6' })))),
    ).toThrow(LanAnnouncementError);
  });
});
