import { z } from 'zod';

export const MAC_ADDRESS = z
  .string()
  .trim()
  .toLowerCase()
  .transform((mac) => mac.replaceAll('-', ':'))
  .pipe(z.mac());

export const BLUETOOTH_MAC = MAC_ADDRESS.transform((mac) => mac.toUpperCase());

export function macBytes(mac: string): Uint8Array {
  return Uint8Array.from(MAC_ADDRESS.parse(mac).split(':'), (pair) => Number.parseInt(pair, 16));
}
