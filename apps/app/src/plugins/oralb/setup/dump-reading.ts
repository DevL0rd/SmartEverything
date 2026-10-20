import {
  ORALB_CHARACTERISTICS,
  ORALB_IDENTITY,
  ORALB_MODE_LABELS,
  ORALB_PROTOCOLS,
  oralbModeOf,
  oralbRingDisplayOf,
  oralbRingOf,
  type BrushGattDump,
  type OralbIdentity,
} from '@smarteverything/domain';
import { clockText } from '../../toothbrush/model/brush-model';
import { RING_NAME, ringHex } from '../model/care-model';

const HEAD = 'a0f0';

const FORCE_PROTOCOL = 8;

const UNKNOWN_RUNTIME = 0xffff;

const EMPTY_SLOT = 0xff;

export interface Heard {
  readonly address: string;
  readonly advert: string | null;
}

export type Found =
  { readonly present: false } | { readonly present: true; readonly bytes: readonly number[] };

export function bytesOf(hex: string): readonly number[] {
  return Array.from(hex.matchAll(/../g), (pair) => Number.parseInt(pair[0], 16));
}

export function findKey(dump: BrushGattDump, key: string): Found {
  const wanted = `${HEAD}${key.toLowerCase()}`;
  const found = dump.services
    .flatMap((service) => service.characteristics)
    .find((characteristic) => characteristic.uuid.toLowerCase().startsWith(wanted));
  if (found === undefined) {
    return { present: false };
  }
  return { present: true, bytes: found.value === undefined ? [] : bytesOf(found.value) };
}

function littleEndian(bytes: readonly number[], at: number, width: 2 | 4): number | null {
  const slice = bytes.slice(at, at + width);
  if (slice.length < width) {
    return null;
  }
  return slice.reduce((sum, byte, index) => sum + byte * 256 ** index, 0);
}

function lengthOf(found: Found): number | null {
  return found.present && found.bytes.length > 0 ? found.bytes.length : null;
}

function bytesIn(found: Found): readonly number[] {
  return found.present ? found.bytes : [];
}

export function addressOf(found: Found): string | null {
  const bytes = bytesIn(found);
  if (bytes.length !== 6) {
    return null;
  }
  return [...bytes]
    .reverse()
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
}

function sameAddress(left: string, right: string): boolean {
  return left.toUpperCase() === right.toUpperCase();
}

export type IdentityResult =
  | { readonly ok: true; readonly identity: OralbIdentity }
  | { readonly ok: false; readonly reason: string };

function advertBytes(heard: Heard): readonly number[] {
  return heard.advert === null ? [] : bytesOf(heard.advert);
}

function versionOf(info: Found, advert: readonly number[]): readonly [number, number, number] {
  const bytes = bytesIn(info);
  return bytes.length === 3
    ? [bytes[1] ?? 0, bytes[0] ?? 0, bytes[2] ?? 0]
    : [advert[0] ?? 0, advert[1] ?? 0, advert[2] ?? 0];
}

function forceLength(dump: BrushGattDump, protocol: number): number | null {
  if (!findKey(dump, 'ff0b').present) {
    return null;
  }
  return protocol >= FORCE_PROTOCOL ? 10 : 1;
}

function runtimeOf(battery: Found): number | null {
  const raw = littleEndian(bytesIn(battery), 1, 2);
  return raw === null || raw === UNKNOWN_RUNTIME ? null : raw;
}

export function identityOf(heard: Heard, dump: BrushGattDump): IdentityResult {
  const address = addressOf(findKey(dump, 'ff01'));
  if (address === null) {
    return { ok: false, reason: 'The brush did not report its Bluetooth address.' };
  }
  if (!sameAddress(address, heard.address)) {
    return {
      ok: false,
      reason:
        'The Bluetooth address the brush reports does not match the address it broadcasts, so it cannot be followed between uses.',
    };
  }
  const [protocol, modelId, firmware] = versionOf(findKey(dump, 'ff02'), advertBytes(heard));
  const battery = findKey(dump, 'ff05');
  const parsed = ORALB_IDENTITY.safeParse({
    address,
    advertAddress: heard.address.toUpperCase(),
    protocol,
    modelId,
    firmware,
    gapName: dump.name,
    services: dump.services.map((service) => service.uuid),
    present: ORALB_CHARACTERISTICS.filter((key) => findKey(dump, key).present),
    ff05Length: lengthOf(battery),
    ff05Runtime: runtimeOf(battery),
    ff0bLength: forceLength(dump, protocol),
    ff2bLength: lengthOf(findKey(dump, 'ff2b')),
    ff2dLength: lengthOf(findKey(dump, 'ff2d')),
    advertHex: (heard.advert ?? '').toLowerCase(),
    clock: littleEndian(bytesIn(findKey(dump, 'ff22')), 0, 4),
  });
  return parsed.success
    ? { ok: true, identity: parsed.data }
    : { ok: false, reason: 'The brush reported values this app does not understand.' };
}

export type RowState = 'read' | 'missing';

export interface VerifyRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly state: RowState;
}

const NOT_ON_FIRMWARE = 'Not on this firmware';

function row(key: string, label: string, value: string | null): VerifyRow {
  return value === null
    ? { key, label, value: NOT_ON_FIRMWARE, state: 'missing' }
    : { key, label, value, state: 'read' };
}

function batteryText(found: Found): string | null {
  const [percent] = bytesIn(found);
  return percent === undefined ? null : `${String(percent)} percent`;
}

function modesText(found: Found): string | null {
  const bytes = bytesIn(found);
  if (bytes.length === 0) {
    return null;
  }
  const names = bytes
    .filter((id) => id !== EMPTY_SLOT)
    .flatMap((id) => {
      const mode = oralbModeOf(id);
      return mode === null ? [] : [ORALB_MODE_LABELS[mode]];
    });
  return names.length === 0 ? 'None set' : names.join(', ');
}

function pacerText(found: Found): string | null {
  const bytes = bytesIn(found);
  if (bytes.length === 0) {
    return null;
  }
  const used = bytes.filter((seconds) => seconds > 0);
  const total = used.reduce((sum, seconds) => sum + seconds, 0);
  return used.length === 0
    ? 'Pacer off'
    : `${String(used.length)} × ${used.join(' + ')} s, ${clockText(total)} target`;
}

function ringText(found: Found): string | null {
  const bytes = bytesIn(found);
  return bytes.length === 4 ? RING_NAME[oralbRingOf(bytes.slice(0, 3))] : null;
}

function headText(found: Found): string | null {
  const days = littleEndian(bytesIn(found), 1, 2);
  if (days === null) {
    return null;
  }
  return days === 0 ? 'Due now' : `${String(days)} ${days === 1 ? 'day' : 'days'} left`;
}

function recordText(found: Found, protocol: number): string | null {
  if (!found.present || found.bytes.length === 0) {
    return null;
  }
  return protocol >= 7 ? 'Read and decoded' : 'Read, header only';
}

function clockRead(found: Found): string | null {
  return littleEndian(bytesIn(found), 0, 4) === null ? null : 'Read';
}

export function verifyRows(heard: Heard, dump: BrushGattDump): readonly VerifyRow[] {
  const identity = identityOf(heard, dump);
  const protocol = identity.ok ? identity.identity.protocol : 0;
  return [
    row('address', 'Brush address', identity.ok ? 'Matches the one it broadcasts' : null),
    row('battery', 'Battery', batteryText(findKey(dump, 'ff05'))),
    row('modes', 'Modes on the handle', modesText(findKey(dump, 'ff25'))),
    row('pacer', 'Quarter pacer', pacerText(findKey(dump, 'ff26'))),
    row('ring', 'SmartRing colour', ringText(findKey(dump, 'ff2b'))),
    row('head', 'Brush head', headText(findKey(dump, 'ff2d'))),
    row('record', 'Latest session record', recordText(findKey(dump, 'ff29'), protocol)),
    row('clock', 'Handle clock', clockRead(findKey(dump, 'ff22'))),
  ];
}

export function variantLine(protocol: number): string {
  if (protocol >= FORCE_PROTOCOL) {
    return 'Force, battery details and the brush’s own session record are available.';
  }
  if (protocol === 7) {
    return 'Sessions are recorded live while your phone is near, and the brush’s own record is read after brushing.';
  }
  if (ORALB_PROTOCOLS.some((known) => known === protocol)) {
    return 'Sessions are recorded live from the brush while your phone is near. The brush’s own record on this firmware is not decoded yet.';
  }
  return `This brush speaks protocol ${String(protocol)}, which is not an iO protocol (6 to 9) and is not supported.`;
}

export function isSupported(protocol: number): boolean {
  return ORALB_PROTOCOLS.some((known) => known === protocol);
}

export function ringHexOf(dump: BrushGattDump): string | null {
  const bytes = bytesIn(findKey(dump, 'ff2b'));
  return bytes.length === 4 ? ringHex(oralbRingDisplayOf(bytes.slice(0, 3))) : null;
}
