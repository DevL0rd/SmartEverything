import { createCipheriv, createDecipheriv, type Cipheriv, type Decipheriv } from 'node:crypto';
import { bytesToUtf8, digest, utf8ToBytes } from './bytes';
import { MiioPacketError } from './errors';

export const MIIO_PORT = 54321;

const CIPHER = 'aes-128-cbc';
const MAGIC = 0x2131;
const HEADER_LENGTH = 32;
const CHECKSUM_OFFSET = 16;
const HELLO_FILL = 0xff;
const PROBE_MARK = 'MDID';
const OFFER_MARK = 'MSUB';
const PUBLISH_MARK = 'PUB';
const WILDCARD = 0xfe;
const MARK_OFFSET = 16;
const VIRTUAL_DID_OFFSET = 20;
const OFFER_STAMP_OFFSET = 20;
const PUBLISH_OFFSET = 24;
const OFFER_STATE_OFFSET = 27;
const WILDCARD_OFFSET = 28;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

export interface MiioHeader {
  readonly deviceId: number;
  readonly stamp: number;
}

export interface Handshake extends MiioHeader {
  readonly revealedToken: string | null;
}

export interface PushOffer {
  readonly wildcard: boolean;
  readonly subscribedAt: number;
  readonly state: number;
}

export interface ProbeReply extends MiioHeader {
  readonly offer: PushOffer | null;
}

export interface MiioMessage {
  readonly header: MiioHeader;
  readonly body: string;
}

export function helloPacket(): Uint8Array {
  const packet = new Uint8Array(HEADER_LENGTH).fill(HELLO_FILL);
  const view = new DataView(packet.buffer);
  view.setUint16(0, MAGIC);
  view.setUint16(2, HEADER_LENGTH);
  return packet;
}

export function parseToken(token: string): Uint8Array {
  if (!TOKEN_PATTERN.test(token)) {
    throw new MiioPacketError(
      'a token of 32 hexadecimal characters',
      `${String(token.length)} characters`,
    );
  }
  return Uint8Array.fromHex(token);
}

function keyAndIv(token: Uint8Array): { readonly key: Uint8Array; readonly iv: Uint8Array } {
  const key = digest('md5', token);
  return { key, iv: digest('md5', key, token) };
}

function readHeader(packet: Uint8Array): DataView {
  if (packet.length < HEADER_LENGTH) {
    throw new MiioPacketError(
      `at least ${String(HEADER_LENGTH)} bytes`,
      `${String(packet.length)} bytes`,
    );
  }
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const magic = view.getUint16(0);
  if (magic !== MAGIC) {
    throw new MiioPacketError('magic 0x2131', `0x${magic.toString(16)}`);
  }
  const length = view.getUint16(2);
  if (length !== packet.length) {
    throw new MiioPacketError(`a length field of ${String(packet.length)}`, String(length));
  }
  return view;
}

function headerOf(view: DataView): MiioHeader {
  return { deviceId: view.getUint32(8), stamp: view.getUint32(12) };
}

function isFilled(bytes: Uint8Array, value: number): boolean {
  return bytes.every((byte) => byte === value);
}

export function parseHandshake(packet: Uint8Array): Handshake {
  const view = readHeader(packet);
  if (packet.length !== HEADER_LENGTH) {
    throw new MiioPacketError('a 32-byte handshake reply', `${String(packet.length)} bytes`);
  }
  const field = packet.slice(CHECKSUM_OFFSET);
  const hidden = isFilled(field, 0) || isFilled(field, HELLO_FILL);
  return { ...headerOf(view), revealedToken: hidden ? null : field.toHex() };
}

export function probePacket(virtualDid: bigint): Uint8Array {
  const packet = helloPacket();
  packet.set(utf8ToBytes(PROBE_MARK), MARK_OFFSET);
  new DataView(packet.buffer).setBigUint64(VIRTUAL_DID_OFFSET, virtualDid);
  packet.fill(0, WILDCARD_OFFSET);
  return packet;
}

function textAt(packet: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...packet.slice(offset, offset + length));
}

export function parseProbeReply(packet: Uint8Array): ProbeReply {
  const view = readHeader(packet);
  if (packet.length !== HEADER_LENGTH) {
    throw new MiioPacketError('a 32-byte probe reply', `${String(packet.length)} bytes`);
  }
  const offered =
    textAt(packet, MARK_OFFSET, OFFER_MARK.length) === OFFER_MARK &&
    textAt(packet, PUBLISH_OFFSET, PUBLISH_MARK.length) === PUBLISH_MARK;
  const offer = offered
    ? {
        wildcard: packet[WILDCARD_OFFSET] === WILDCARD,
        subscribedAt: view.getUint32(OFFER_STAMP_OFFSET),
        state: view.getUint8(OFFER_STATE_OFFSET),
      }
    : null;
  return { ...headerOf(view), offer };
}

function checksum(header: Uint8Array, token: Uint8Array, payload: Uint8Array): Uint8Array {
  return digest('md5', header.subarray(0, CHECKSUM_OFFSET), token, payload);
}

function transform(cipher: Cipheriv | Decipheriv, input: Uint8Array): Uint8Array {
  return Uint8Array.from(Buffer.concat([cipher.update(input), cipher.final()]));
}

export function encodeMessage(token: Uint8Array, header: MiioHeader, body: string): Uint8Array {
  const { key, iv } = keyAndIv(token);
  const payload = transform(createCipheriv(CIPHER, key, iv), utf8ToBytes(`${body}\0`));
  const packet = new Uint8Array(HEADER_LENGTH + payload.length);
  const view = new DataView(packet.buffer);
  view.setUint16(0, MAGIC);
  view.setUint16(2, packet.length);
  view.setUint32(8, header.deviceId);
  view.setUint32(12, header.stamp);
  packet.set(payload, HEADER_LENGTH);
  packet.set(checksum(packet, token, payload), CHECKSUM_OFFSET);
  return packet;
}

function decrypt(token: Uint8Array, payload: Uint8Array): Uint8Array {
  const { key, iv } = keyAndIv(token);
  try {
    return transform(createDecipheriv(CIPHER, key, iv), payload);
  } catch (cause) {
    throw new MiioPacketError('a payload encrypted with this token', String(cause));
  }
}

export function decodeMessage(token: Uint8Array, packet: Uint8Array): MiioMessage {
  const view = readHeader(packet);
  const payload = packet.slice(HEADER_LENGTH);
  const expected = checksum(packet, token, payload).toHex();
  const received = packet.subarray(CHECKSUM_OFFSET, HEADER_LENGTH).toHex();
  if (expected !== received) {
    throw new MiioPacketError(`checksum ${expected}`, received);
  }
  const body = bytesToUtf8(decrypt(token, payload)).replace(/\0+$/, '');
  return { header: headerOf(view), body };
}
