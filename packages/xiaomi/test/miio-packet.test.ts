import { createCipheriv, createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MIIO_PORT,
  MiioPacketError,
  decodeMessage,
  encodeMessage,
  helloPacket,
  parseHandshake,
  parseProbeReply,
  parseToken,
  probePacket,
} from '../src';

const TOKEN_HEX = '00112233445566778899aabbccddeeff';

function tokenBytes(): Uint8Array {
  return parseToken(TOKEN_HEX);
}

function handshakeReply(deviceId: number, stamp: number, field: number[]): Uint8Array {
  const packet = new Uint8Array(32);
  const view = new DataView(packet.buffer);
  view.setUint16(0, 0x2131);
  view.setUint16(2, 32);
  view.setUint32(8, deviceId);
  view.setUint32(12, stamp);
  packet.set(field, 16);
  return packet;
}

function oracleEncrypt(plain: Buffer): Buffer {
  const tokenBytes = Buffer.from(TOKEN_HEX, 'hex');
  const key = createHash('md5').update(tokenBytes).digest();
  const iv = createHash('md5')
    .update(Buffer.concat([key, tokenBytes]))
    .digest();
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

describe('the miIO hello packet', () => {
  it('is the 32-byte discovery packet every miIO client sends', () => {
    expect(Buffer.from(helloPacket()).toString('hex')).toBe(`21310020${'ff'.repeat(28)}`);
    expect(MIIO_PORT).toBe(54321);
  });
});

describe('miIO tokens', () => {
  it('accept 32 hexadecimal characters in either case', () => {
    expect(Buffer.from(parseToken(TOKEN_HEX.toUpperCase())).toString('hex')).toBe(TOKEN_HEX);
  });

  it('refuse anything else and say how long it was', () => {
    expect(() => parseToken('abc')).toThrow(
      new MiioPacketError('a token of 32 hexadecimal characters', '3 characters'),
    );
    expect(() => parseToken(`${TOKEN_HEX}0`)).toThrow(MiioPacketError);
    expect(() => parseToken(`x${TOKEN_HEX.slice(1)}`)).toThrow(MiioPacketError);
    expect(() => parseToken(` ${TOKEN_HEX}`)).toThrow(MiioPacketError);
  });
});

describe('a handshake reply', () => {
  it('yields the device id and stamp and hides a provisioned token', () => {
    expect(
      parseHandshake(
        handshakeReply(
          0x01020304,
          77,
          Array.from({ length: 16 }, () => 0xff),
        ),
      ),
    ).toStrictEqual({
      deviceId: 0x01020304,
      stamp: 77,
      revealedToken: null,
    });
    expect(
      parseHandshake(
        handshakeReply(
          5,
          6,
          Array.from({ length: 16 }, () => 0),
        ),
      ).revealedToken,
    ).toBeNull();
  });

  it('reveals the token of an unprovisioned device', () => {
    const field = [...Buffer.from(TOKEN_HEX, 'hex')];
    expect(parseHandshake(handshakeReply(1, 2, field)).revealedToken).toBe(TOKEN_HEX);
    expect(
      parseHandshake(
        handshakeReply(
          1,
          2,
          Array.from({ length: 16 }, () => 0x11),
        ),
      ).revealedToken,
    ).toBe('11'.repeat(16));
    const mixed = [...Array.from({ length: 15 }, () => 0xff), 0];
    expect(parseHandshake(handshakeReply(1, 2, mixed)).revealedToken).toBe(`${'ff'.repeat(15)}00`);
  });

  it('refuses packets that are not 32-byte miIO replies', () => {
    expect(() => parseHandshake(new Uint8Array(31))).toThrow(
      new MiioPacketError('at least 32 bytes', '31 bytes'),
    );
    const wrongMagic = handshakeReply(1, 2, []);
    wrongMagic[0] = 0x22;
    expect(() => parseHandshake(wrongMagic)).toThrow(new MiioPacketError('magic 0x2131', '0x2231'));
    const wrongLength = handshakeReply(1, 2, []);
    wrongLength[3] = 0x21;
    expect(() => parseHandshake(wrongLength)).toThrow(
      new MiioPacketError('a length field of 32', '33'),
    );
    const longer = encodeMessage(tokenBytes(), { deviceId: 1, stamp: 2 }, '{}');
    expect(() => parseHandshake(longer)).toThrow(
      new MiioPacketError('a 32-byte handshake reply', `${String(longer.length)} bytes`),
    );
  });
});

describe('encoded miIO messages', () => {
  it('match an independent AES-128-CBC and MD5 implementation byte for byte', () => {
    const body = '{"id":1,"method":"get_prop","params":["power"]}';
    const packet = encodeMessage(tokenBytes(), { deviceId: 0x0a0b0c0d, stamp: 0x01020304 }, body);
    const payload = oracleEncrypt(Buffer.concat([Buffer.from(body), Buffer.from([0])]));
    const header = Buffer.alloc(16);
    header.writeUInt16BE(0x2131, 0);
    header.writeUInt16BE(32 + payload.length, 2);
    header.writeUInt32BE(0x0a0b0c0d, 8);
    header.writeUInt32BE(0x01020304, 12);
    const checksum = createHash('md5')
      .update(Buffer.concat([header, Buffer.from(TOKEN_HEX, 'hex'), payload]))
      .digest();
    expect(Buffer.from(packet).toString('hex')).toBe(
      Buffer.concat([header, checksum, payload]).toString('hex'),
    );
  });

  it('decode back to the same header and body for any text', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme' }),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (body, deviceId, stamp) => {
          const decoded = decodeMessage(
            tokenBytes(),
            encodeMessage(tokenBytes(), { deviceId, stamp }, body),
          );
          expect(decoded).toStrictEqual({
            header: { deviceId, stamp },
            body: body.replace(/\0+$/, ''),
          });
        },
      ),
    );
  });

  it('keep NUL characters inside the body', () => {
    const packet = encodeMessage(tokenBytes(), { deviceId: 1, stamp: 1 }, 'a\0b');
    expect(decodeMessage(tokenBytes(), packet).body).toBe('a\0b');
  });

  it('strip the trailing NUL bytes devices add after the JSON', () => {
    const payload = oracleEncrypt(Buffer.from('{"id":3}\0\0'));
    const header = Buffer.alloc(16);
    header.writeUInt16BE(0x2131, 0);
    header.writeUInt16BE(32 + payload.length, 2);
    const checksum = createHash('md5')
      .update(Buffer.concat([header, Buffer.from(TOKEN_HEX, 'hex'), payload]))
      .digest();
    const packet = new Uint8Array(Buffer.concat([header, checksum, payload]));
    expect(decodeMessage(tokenBytes(), packet).body).toBe('{"id":3}');
  });

  it('refuse a packet whose checksum does not match the token', () => {
    const packet = encodeMessage(tokenBytes(), { deviceId: 1, stamp: 1 }, '{"id":1}');
    const other = parseToken('ffeeddccbbaa99887766554433221100');
    const expected = Buffer.from(
      createHash('md5')
        .update(
          Buffer.concat([
            Buffer.from(packet.slice(0, 16)),
            Buffer.from(other),
            Buffer.from(packet.slice(32)),
          ]),
        )
        .digest(),
    ).toString('hex');
    expect(() => decodeMessage(other, packet)).toThrow(
      new MiioPacketError(
        `checksum ${expected}`,
        Buffer.from(packet.slice(16, 32)).toString('hex'),
      ),
    );
  });

  it('refuse a payload that does not decrypt with the token', () => {
    const header = Buffer.alloc(16);
    const payload = Buffer.alloc(16, 7);
    header.writeUInt16BE(0x2131, 0);
    header.writeUInt16BE(48, 2);
    const checksum = createHash('md5')
      .update(Buffer.concat([header, Buffer.from(TOKEN_HEX, 'hex'), payload]))
      .digest();
    const packet = new Uint8Array(Buffer.concat([header, checksum, payload]));
    expect(() => decodeMessage(tokenBytes(), packet)).toThrow(MiioPacketError);
    expect(() => decodeMessage(tokenBytes(), packet)).toThrow(
      /a payload encrypted with this token/,
    );
  });

  it('read headers from packets that sit inside a larger buffer', () => {
    const packet = encodeMessage(tokenBytes(), { deviceId: 9, stamp: 8 }, '{"id":4}');
    const container = new Uint8Array(packet.length + 5);
    container.set(packet, 5);
    expect(decodeMessage(tokenBytes(), container.subarray(5)).header).toStrictEqual({
      deviceId: 9,
      stamp: 8,
    });
  });
});

describe('encoded miIO messages from the previous noble implementation', () => {
  it('stay byte-identical for a fixed header, token and body', () => {
    const packet = encodeMessage(
      tokenBytes(),
      { deviceId: 0x0a0b0c0d, stamp: 0x01020304 },
      '{"id":1,"method":"get_prop","params":["power"]}',
    );
    expect(packet.toHex()).toBe(
      '21310060000000000a0b0c0d0102030484de26b919466f1b42ce1072c6f8f687a5516ec6151955dc2bb2d43e7c84c1833ad6abd2560c09de4318b095b7713e2366d4bd383c59bdc6c2b0c6191f43f2f2caae6e8e38a8ce4e08268e608a56a78c',
    );
  });
});

function probeReply(mark: string, publish: string, state: number, wildcard: number): Uint8Array {
  const packet = handshakeReply(0x0a0b0c0d, 0x01020304, []);
  packet.set(new TextEncoder().encode(mark), 16);
  new DataView(packet.buffer).setUint32(20, 1_700_000_000);
  packet.set(new TextEncoder().encode(publish), 24);
  packet[27] = state;
  packet[28] = wildcard;
  return packet;
}

describe('the miIO push probe', () => {
  it('is the hello packet carrying the MDID mark and the virtual device id', () => {
    const packet = probePacket(0x0102030405060708n);
    expect(packet.toHex()).toBe(
      `21310020ffffffffffffffffffffffff4d4449440102030405060708${'00'.repeat(4)}`,
    );
  });

  it('reads the subscription offer of a device that publishes', () => {
    expect(parseProbeReply(probeReply('MSUB', 'PUB', 2, 0xfe))).toStrictEqual({
      deviceId: 0x0a0b0c0d,
      stamp: 0x01020304,
      offer: { wildcard: true, subscribedAt: 1_700_000_000, state: 2 },
    });
    expect(parseProbeReply(probeReply('MSUB', 'PUB', 0, 0)).offer?.wildcard).toBe(false);
  });

  it('reports no offer when the marks are missing', () => {
    expect(parseProbeReply(probeReply('MSUX', 'PUB', 2, 0)).offer).toBeNull();
    expect(parseProbeReply(probeReply('MSUB', 'PUX', 2, 0)).offer).toBeNull();
  });

  it('refuses a reply that is not 32 bytes', () => {
    const longer = new Uint8Array(40);
    const view = new DataView(longer.buffer);
    view.setUint16(0, 0x2131);
    view.setUint16(2, 40);
    expect(() => parseProbeReply(longer)).toThrow(
      new MiioPacketError('a 32-byte probe reply', '40 bytes'),
    );
  });
});
