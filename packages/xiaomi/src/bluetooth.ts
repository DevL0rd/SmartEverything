import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';

export const BEACON_KEY_PATH = '/v2/device/blt_get_beaconkey';

const BEACON_KEY = z.object({ beaconkey: z.string().regex(/^[0-9a-fA-F]{32}$/) });

export class BeaconKeyMissingError extends Error {
  override readonly name = 'BeaconKeyMissingError';

  constructor(did: string, issues: string) {
    super(`The Xiaomi cloud gave no Bluetooth key for ${did}: ${issues}.`);
  }
}

export function beaconKeyData(did: string): JsonValue {
  return { did, pdid: 1 };
}

export function parseBeaconKey(did: string, result: unknown): string {
  const parsed = BEACON_KEY.safeParse(result);
  if (!parsed.success) {
    throw new BeaconKeyMissingError(
      did,
      parsed.error.issues.map((issue) => issue.message).join('; '),
    );
  }
  return parsed.data.beaconkey.toLowerCase();
}

export function isBluetoothDid(did: string): boolean {
  return did.startsWith('blt.');
}
