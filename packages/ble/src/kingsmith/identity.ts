import type { TreadmillGattDump, TreadmillIdentity } from '@smarteverything/domain';
import { hexToBytes } from '../bytes';
import {
  FTMS_FEATURE,
  FTMS_INCLINE_RANGE,
  FTMS_SERVICE,
  FTMS_SPEED_RANGE,
  parseFeatures,
  parseInclineRange,
  parseSpeedRange,
} from './ftms';

const DEVICE_INFORMATION = '180a';

const MANUFACTURER = '2a29';

const MODEL = '2a24';

const SERIAL = '2a25';

const FIRMWARE = '2a26';

const SOFTWARE = '2a28';

const HARDWARE = '2a27';

const READ_CHARACTERISTICS: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['manufacturer', [DEVICE_INFORMATION, MANUFACTURER]],
  ['model', [DEVICE_INFORMATION, MODEL]],
  ['serial', [DEVICE_INFORMATION, SERIAL]],
  ['firmware', [DEVICE_INFORMATION, FIRMWARE]],
  ['software', [DEVICE_INFORMATION, SOFTWARE]],
  ['hardware', [DEVICE_INFORMATION, HARDWARE]],
]);

function valueOf(
  dump: TreadmillGattDump,
  service: string,
  characteristic: string,
): Uint8Array | null {
  const hex = dump.services
    .find((candidate) => candidate.uuid === service)
    ?.characteristics.find((candidate) => candidate.uuid === characteristic)?.value;
  return hex === undefined ? null : hexToBytes(hex);
}

function textOf(dump: TreadmillGattDump, key: string): string | null {
  const place = READ_CHARACTERISTICS.get(key);
  const bytes = place === undefined ? null : valueOf(dump, place[0], place[1]);
  const text = bytes === null ? '' : new TextDecoder().decode(bytes).replaceAll('\0', '').trim();
  return text === '' ? null : text;
}

type SpeedFields = Pick<TreadmillIdentity, 'speedMinKmh' | 'speedMaxKmh' | 'speedStepKmh'>;

type InclineFields = Pick<
  TreadmillIdentity,
  'inclineMinPercent' | 'inclineMaxPercent' | 'inclineStepPercent'
>;

type FeatureFields = Pick<TreadmillIdentity, 'features' | 'targets'>;

function speedFields(dump: TreadmillGattDump): SpeedFields {
  const bytes = valueOf(dump, FTMS_SERVICE, FTMS_SPEED_RANGE);
  const range = bytes === null ? null : parseSpeedRange(bytes);
  return {
    speedMinKmh: range?.min ?? null,
    speedMaxKmh: range?.max ?? null,
    speedStepKmh: range?.step ?? null,
  };
}

function inclineFields(dump: TreadmillGattDump): InclineFields {
  const bytes = valueOf(dump, FTMS_SERVICE, FTMS_INCLINE_RANGE);
  const range = bytes === null ? null : parseInclineRange(bytes);
  return {
    inclineMinPercent: range?.min ?? null,
    inclineMaxPercent: range?.max ?? null,
    inclineStepPercent: range === null || range.step <= 0 ? null : range.step,
  };
}

function featureFields(dump: TreadmillGattDump): FeatureFields {
  const bytes = valueOf(dump, FTMS_SERVICE, FTMS_FEATURE);
  const parsed = bytes === null ? null : parseFeatures(bytes);
  return {
    features: [...(parsed?.machine ?? [])],
    targets: parsed === null || parsed.targetsMirrorMachine ? [] : [...parsed.targets],
  };
}

export function identityOf(dump: TreadmillGattDump): TreadmillIdentity {
  return {
    manufacturer: textOf(dump, 'manufacturer'),
    model: textOf(dump, 'model'),
    serial: textOf(dump, 'serial'),
    firmware: textOf(dump, 'firmware'),
    software: textOf(dump, 'software'),
    hardware: textOf(dump, 'hardware'),
    motorVersion: null,
    protocol: null,
    capabilityWord: null,
    modelCode: null,
    functionBitmap: null,
    ...speedFields(dump),
    ...inclineFields(dump),
    ...featureFields(dump),
  };
}
