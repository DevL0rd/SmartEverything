export { macBytes } from '@smarteverything/domain';

export function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.fromHex(hex);
}

export function bytesToHex(bytes: Uint8Array): string {
  return bytes.toHex();
}

export function macOf(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function uint8(bytes: Uint8Array, offset: number): number {
  return viewOf(bytes).getUint8(offset);
}

export function uint16(bytes: Uint8Array, offset: number): number {
  return viewOf(bytes).getUint16(offset, true);
}

export function uint32(bytes: Uint8Array, offset: number): number {
  return viewOf(bytes).getUint32(offset, true);
}
