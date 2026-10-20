import type { TreadmillGattDump, TreadmillIdentity } from '@smarteverything/domain';
import { decimal } from '../../../format/number';
import type { ReadOnlyFact } from './settings-model';

const FAMILY_NAME = {
  wilink: 'WiLink',
  ftms_odm: 'Bluetooth FTMS with the ODM greeting',
  ftms_supplement: 'Bluetooth FTMS with the supplement unlock',
  ftms: 'Plain Bluetooth FTMS',
} as const;

export function familyName(family: keyof typeof FAMILY_NAME): string {
  return FAMILY_NAME[family];
}

function text(label: string, value: string | number | null): ReadOnlyFact[] {
  return value === null ? [] : [{ label, value: String(value) }];
}

export function identityFacts(identity: TreadmillIdentity): readonly ReadOnlyFact[] {
  const range =
    identity.speedMinKmh !== null && identity.speedMaxKmh !== null
      ? [
          {
            label: 'Speed range',
            value: `${decimal(identity.speedMinKmh, 1)} to ${decimal(identity.speedMaxKmh, 1)} km/h`,
          },
        ]
      : [];
  return [
    ...text('Manufacturer', identity.manufacturer),
    ...text('Model', identity.model),
    ...text('Serial', identity.serial),
    ...text('Firmware', identity.firmware),
    ...text('Software', identity.software),
    ...text('Hardware', identity.hardware),
    ...text('Motor version', identity.motorVersion),
    ...text('Protocol', identity.protocol),
    ...range,
  ];
}

export function capabilityLines(identity: TreadmillIdentity): readonly string[] {
  const lines: string[] = [];
  if (identity.capabilityWord !== null) {
    lines.push(`Capability word 0x${identity.capabilityWord.toString(16)}`);
  }
  if (identity.functionBitmap !== null) {
    lines.push(`Function bitmap ${identity.functionBitmap}`);
  }
  if (identity.features.length > 0) {
    lines.push(`Features ${identity.features.join(', ')}`);
  }
  if (identity.targets.length > 0) {
    lines.push(`Targets ${identity.targets.join(', ')}`);
  }
  return lines;
}

export function gattLines(dump: TreadmillGattDump): readonly string[] {
  return [
    dump.name,
    ...dump.services.flatMap((service) => [
      `Service ${service.uuid}`,
      ...service.characteristics.map(
        (characteristic) =>
          `  ${characteristic.uuid} ${characteristic.properties.join(' ')}${
            characteristic.value === undefined ? '' : ` = ${characteristic.value}`
          }`,
      ),
    ]),
  ];
}

export function frameLine(frame: {
  readonly at: string;
  readonly characteristic: string;
  readonly hex: string;
}): string {
  return `${frame.at.slice(11, 19)} ${frame.characteristic} ${frame.hex}`;
}

const INCLINE_RANGE_UUID = '2ad5';

export function inclineRangeBytes(dump: TreadmillGattDump): string | null {
  for (const service of dump.services) {
    const found = service.characteristics.find((item) => item.uuid === INCLINE_RANGE_UUID);
    if (found !== undefined) {
      return found.value ?? null;
    }
  }
  return null;
}

export function inclineRangeLines(
  identity: TreadmillIdentity,
  dump: TreadmillGattDump,
): readonly string[] {
  const bytes = inclineRangeBytes(dump);
  const { inclineMinPercent, inclineMaxPercent, inclineStepPercent } = identity;
  const parsed =
    inclineMinPercent !== null && inclineMaxPercent !== null
      ? [
          `Incline range ${decimal(inclineMinPercent, 1)} to ${decimal(inclineMaxPercent, 1)}${
            inclineStepPercent === null ? '' : `, step ${decimal(inclineStepPercent, 1)}`
          }`,
        ]
      : ['Incline range not reported'];
  return [...parsed, bytes === null ? '2AD5 bytes not read' : `2AD5 bytes ${bytes}`];
}
