import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import {
  SHELLY_ACTIONS,
  SHELLY_SETTING_ROWS,
  shellyActionAvailable,
  shellyOperation,
  type ShellyDevice,
  type ShellySettingRow,
} from '@smarteverything/shelly';
import { z } from 'zod';
import type { ShellyInventory } from './component-inventory';

type Feature = ShellyDevice['features'][number];

const OBJECT = z.record(z.string(), JSON_VALUE);
const ALIASED: Readonly<Record<string, string>> = {
  presence_delay: 'presence_thr',
  absence_delay: 'absence_thr',
};

function valueAt(value: JsonValue, path: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const key of path) {
    const next = OBJECT.safeParse(current);
    if (!next.success) return undefined;
    current = next.data[key];
  }
  return current;
}

function configsOf(inventory: ShellyInventory, component: string): readonly JsonValue[] {
  return Object.entries(inventory.config)
    .filter(([key]) => key.split(':')[0] === component)
    .map(([, value]) => value);
}

function supported(row: ShellySettingRow, inventory: ShellyInventory): boolean {
  const configs = configsOf(inventory, row.component);
  if (row.secret === true) return configs.length > 0;
  if (row.path[0] === 'ui_data')
    return configs.length > 0 && inventory.methods.includes('Sys.SetConfig');
  const aliased = row.path.map((key) => ALIASED[key] ?? key);
  return configs.some(
    (config) => valueAt(config, row.path) !== undefined || valueAt(config, aliased) !== undefined,
  );
}

export function shellyFeatures(inventory: ShellyInventory): ShellyDevice['features'] {
  const fields: Feature[] = SHELLY_SETTING_ROWS.filter((row) => supported(row, inventory)).map(
    (row) => ({ id: row.id, page: row.page, available: true, reason: null }),
  );
  const actions: Feature[] = SHELLY_ACTIONS.filter((action) =>
    shellyActionAvailable(action, inventory.methods),
  ).map((action) => ({
    id: action,
    page: shellyOperation(action).page,
    available: true,
    reason: null,
  }));
  return [...fields, ...actions];
}
