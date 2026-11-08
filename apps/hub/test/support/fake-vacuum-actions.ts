import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import {
  vacuumProperty,
  vacuumStatusTable,
  type VacuumAction,
  type VacuumProperty,
} from '@smarteverything/xiaomi';
import { z } from 'zod';

export interface VacuumChange {
  readonly siid: number;
  readonly piid: number;
  readonly value: JsonValue;
}

const ROOM_INPUT_PIID = 15;
const ZONE_INPUT_PIID = 12;
const ROOM_CLEAN_MODE = 3;
const ZONE_CLEAN_MODE = 2;
const ROOM_LIST = /^\[?\s*\d+(?:\s*,\s*\d+)*\s*\]?$/;

const TAGGED_INPUT = z.object({ piid: z.number().int(), value: JSON_VALUE });
const ZONES = z
  .array(z.object({ blocks_region: z.array(z.number()).length(8), blocks_attr: z.number().int() }))
  .min(1);

const ROOM_CLEAN_ACTION = '2.16';
const ZONE_CLEAN_ACTION = '2.37';

const STATUS_AFTER_ACTION: Readonly<Record<string, string>> = {
  '2.1': 'Sweeping',
  '2.3': 'Go Charging',
  '2.4': 'Sweeping',
  '2.6': 'Sweeping',
  '2.7': 'Paused',
  '2.8': 'Sweeping',
  '2.28': 'Remote',
  '2.29': 'Charged',
};

const JSON_TEXT = z.string().transform((text, context) => {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    context.issues.push({
      code: 'custom',
      message: error instanceof Error ? error.message : 'not JSON',
      input: text,
    });
    return z.NEVER;
  }
});

function taggedValue(inputs: readonly JsonValue[], piid: number): string | null {
  for (const input of inputs) {
    const parsed = TAGGED_INPUT.safeParse(input);
    if (parsed.success && parsed.data.piid === piid && typeof parsed.data.value === 'string') {
      return parsed.data.value;
    }
  }
  return null;
}

function optionValue(property: VacuumProperty, label: string): number {
  const option = property.values.find((entry) => entry.spec === label);
  if (option === undefined) {
    throw new Error(`The pv11gl catalog has no ${label} option on ${property.name}.`);
  }
  return option.value;
}

function statusChange(label: string): VacuumChange {
  const status = vacuumProperty('vacuum', 'status');
  const entry = vacuumStatusTable().find((candidate) => candidate.spec === label);
  if (entry === undefined) {
    throw new Error(`The pv11gl catalog has no status ${label}.`);
  }
  return { siid: status.siid, piid: status.piid, value: entry.value };
}

function cleaningChanges(
  sweepType: string,
  configuration: Readonly<Record<string, JsonValue>>,
): readonly VacuumChange[] {
  const type = vacuumProperty('vacuum', 'sweep-type');
  const config = vacuumProperty('vacuum', 'current-cleaning-config');
  return [
    { siid: type.siid, piid: type.piid, value: optionValue(type, sweepType) },
    {
      siid: config.siid,
      piid: config.piid,
      value: JSON.stringify({
        ...configuration,
        is_ai_cleaning: false,
        dirty_cleaning: false,
      }),
    },
    statusChange('Sweeping'),
  ];
}

function roomClean(inputs: readonly JsonValue[]): readonly VacuumChange[] {
  const text = taggedValue(inputs, ROOM_INPUT_PIID);
  if (text === null || !ROOM_LIST.test(text)) {
    return [];
  }
  const rooms = text
    .replace(/[[\]\s]/g, '')
    .split(',')
    .map(Number);
  return cleaningChanges('Area', { rooms, clean_mode: ROOM_CLEAN_MODE });
}

function zoneClean(inputs: readonly JsonValue[]): readonly VacuumChange[] {
  const text = taggedValue(inputs, ZONE_INPUT_PIID);
  if (text === null) {
    return [];
  }
  const zones = JSON_TEXT.pipe(ZONES).safeParse(text);
  if (!zones.success) {
    return [];
  }
  return cleaningChanges('Zone', {
    zones: zones.data.map((zone) => zone.blocks_region),
    clean_mode: ZONE_CLEAN_MODE,
  });
}

export function actionChanges(
  action: VacuumAction,
  inputs: readonly JsonValue[],
): readonly VacuumChange[] {
  const address = `${String(action.siid)}.${String(action.aiid)}`;
  if (address === ROOM_CLEAN_ACTION) {
    return roomClean(inputs);
  }
  if (address === ZONE_CLEAN_ACTION) {
    return zoneClean(inputs);
  }
  const label = STATUS_AFTER_ACTION[address];
  return label === undefined ? [] : [statusChange(label)];
}
