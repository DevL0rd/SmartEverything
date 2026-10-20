import type { TreadmillFamily, TreadmillGattDump } from '@smarteverything/domain';
import { UnknownTreadmillFamilyError } from './errors';
import { FTMS_SERVICE } from './ftms';
import { WILINK_NOTIFY, WILINK_SERVICE, WILINK_WRITE } from './wilink';
import { ODM_CHARACTERISTIC, SUPPLEMENT_SERVICE } from './vendor';

export const SCAN_NAME_PREFIXES = [
  'KS-',
  'WalkingPad',
  'KINGSMITH',
  'ZP-ZEALR1',
  'DYNAMAX',
  'HW-KS-',
] as const;

export const SCAN_SERVICES = [WILINK_SERVICE, FTMS_SERVICE] as const;

function characteristicsOf(
  dump: TreadmillGattDump,
  service: string,
): Map<string, readonly string[]> {
  const found = dump.services.find((candidate) => candidate.uuid === service);
  return new Map(
    (found?.characteristics ?? []).map((characteristic) => [
      characteristic.uuid,
      characteristic.properties,
    ]),
  );
}

function hasWilink(dump: TreadmillGattDump): boolean {
  const characteristics = characteristicsOf(dump, WILINK_SERVICE);
  return (
    characteristics.get(WILINK_NOTIFY)?.includes('notify') === true &&
    characteristics.has(WILINK_WRITE)
  );
}

export function familyOf(dump: TreadmillGattDump): TreadmillFamily {
  const hasFtms = dump.services.some((service) => service.uuid === FTMS_SERVICE);
  if (hasFtms) {
    if (characteristicsOf(dump, FTMS_SERVICE).has(ODM_CHARACTERISTIC)) {
      return 'ftms_odm';
    }
    return dump.services.some((service) => service.uuid === SUPPLEMENT_SERVICE)
      ? 'ftms_supplement'
      : 'ftms';
  }
  if (hasWilink(dump)) {
    return 'wilink';
  }
  throw new UnknownTreadmillFamilyError(
    `Expected the Bluetooth service 1826 (fitness machine) or fe00 (WiLink with fe01 notify and fe02 write) on ${dump.name}, found ${dump.services.map((service) => service.uuid).join(', ')}.`,
  );
}

export function isTreadmillAdvert(name: string | null, serviceUuids: readonly string[]): boolean {
  const named = name !== null && SCAN_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
  return named || SCAN_SERVICES.some((service) => serviceUuids.includes(service));
}
