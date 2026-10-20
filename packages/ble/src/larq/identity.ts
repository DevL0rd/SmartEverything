import { LarqIdentityError } from './errors';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const NAME_PREFIX = 'LARQ_';

const NAME_PATTERN = /^LARQ_[0-9A-Za-z]{11}$/;

const SERIAL_DIGITS = 16;

const SERIAL_LIMIT = 1n << 64n;

const BASE = BigInt(BASE62.length);

const BLUETOOTH_BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';

export const DEVICE_INFORMATION_SERVICE = '180a';

export interface LarqAdvert {
  readonly name: string | null;
  readonly serviceUuids: readonly string[];
}

export function serialOfName(name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new LarqIdentityError(`${name} is not a LARQ cap name (LARQ_ and 11 letters or digits).`);
  }
  let value = 0n;
  for (const digit of name.slice(NAME_PREFIX.length)) {
    value = value * BASE + BigInt(BASE62.indexOf(digit));
  }
  if (value >= SERIAL_LIMIT) {
    throw new LarqIdentityError(`${name} decodes to a number larger than a 64-bit serial.`);
  }
  return value.toString(16).toUpperCase().padStart(SERIAL_DIGITS, '0');
}

function shortServiceOf(uuid: string): string {
  const lower = uuid.toLowerCase();
  return lower.length === 36 && lower.startsWith('0000') && lower.endsWith(BLUETOOTH_BASE_SUFFIX)
    ? lower.slice(4, 8)
    : lower;
}

export function isLarqAdvert(advert: LarqAdvert): boolean {
  return (
    advert.name !== null &&
    NAME_PATTERN.test(advert.name) &&
    advert.serviceUuids.some((uuid) => shortServiceOf(uuid) === DEVICE_INFORMATION_SERVICE)
  );
}
