import type { JsonValue } from '@smarteverything/domain';
import type { ShellySettingAction, ShellySettingRow } from '@smarteverything/shelly';
import { recordOf, withPath, type JsonRecord } from './form-model';

export type SettingsDraft = Readonly<Record<string, JsonValue>>;

export interface SettingTarget {
  readonly component: string;
  readonly id: number | null;
}

const NUMERAL = /^-?\d+(\.\d+)?$/;
const OPAQUE_KEYS = ['ui_data', 'meta'] as const;
const INTERFACE_DEFAULTS: Readonly<Record<string, JsonValue>> = { df: 'YYYY/M/D', tf: 'default' };
const WRAPPED: ReadonlySet<ShellySettingAction> = new Set(['set_component', 'virtual_config']);
const IDENTIFIED: ReadonlySet<ShellySettingAction> = new Set([
  'set_zone',
  'set_light',
  'virtual_config',
  'bthome_device_config',
  'bthome_sensor_config',
]);

export function rowPath(row: ShellySettingRow): string {
  return row.path.join('.');
}

function typedValue(row: ShellySettingRow, written: JsonValue): JsonValue | undefined {
  if (typeof written !== 'string') return written;
  if (row.kind === 'number') {
    if (written.trim() === '') return row.nullable === true ? null : undefined;
    return Number(written);
  }
  if (row.kind === 'text') return written === '' && row.nullable === true ? null : written;
  if (row.kind === 'enum' && NUMERAL.test(written)) return Number(written);
  return written;
}

function merged(base: JsonRecord, change: JsonRecord): JsonRecord {
  const result: Record<string, JsonValue> = { ...base };
  for (const [key, value] of Object.entries(change)) {
    const current = recordOf(result[key]);
    const next = recordOf(value);
    result[key] = current !== null && next !== null ? merged(current, next) : value;
  }
  return result;
}

function withoutDefaults(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, entry]) =>
        entry !== INTERFACE_DEFAULTS[key] && !(Array.isArray(entry) && entry.length === 0),
    ),
  );
}

function withOpaque(patch: JsonRecord, accepted: unknown): JsonRecord {
  const current = recordOf(accepted) ?? {};
  let result = patch;
  for (const key of OPAQUE_KEYS) {
    const change = recordOf(patch[key]);
    if (change === null) continue;
    const whole = merged(recordOf(current[key]) ?? {}, change);
    result = { ...result, [key]: key === 'ui_data' ? withoutDefaults(whole) : whole };
  }
  return result;
}

export function settingsPatch(
  rows: readonly ShellySettingRow[],
  draft: SettingsDraft,
  accepted: unknown,
): JsonRecord {
  let patch: JsonRecord = {};
  for (const row of rows) {
    const written = draft[rowPath(row)];
    const value = written === undefined ? undefined : typedValue(row, written);
    if (value !== undefined) patch = withPath(patch, row.path, value);
  }
  return withOpaque(patch, accepted);
}

export function settingParams(
  action: ShellySettingAction,
  target: SettingTarget,
  patch: JsonRecord,
): Readonly<Record<string, JsonValue>> {
  const config = WRAPPED.has(action) ? { component: target.component, value: patch } : patch;
  return IDENTIFIED.has(action) && target.id !== null ? { id: target.id, config } : { config };
}
