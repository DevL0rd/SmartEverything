import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { BLUETOOTH_ADDRESS } from '@smarteverything/domain';

export { bytesToHex, hexToBytes };

export function macBytes(mac: string): Uint8Array {
  return hexToBytes(BLUETOOTH_ADDRESS.parse(mac).replaceAll(':', ''));
}

export function macOf(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

export function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

export function uint32(bytes: Uint8Array, offset: number): number {
  return (uint16(bytes, offset) | (uint16(bytes, offset + 2) << 16)) >>> 0;
}
