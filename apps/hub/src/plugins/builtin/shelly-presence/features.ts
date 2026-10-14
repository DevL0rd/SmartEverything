import {
  JSON_VALUE,
  SHELLY_PRESENCE_FIELDS,
  SHELLY_PRESENCE_OPERATIONS,
  type JsonValue,
  type ShellyPresenceConfig,
  type ShellyPresenceDevice,
  type ShellyPresenceField,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ShellyInventory } from './component-inventory';

const JSON_OBJECT = z.record(z.string(), JSON_VALUE);
export function fieldValue(value: JsonValue, path: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const key of path) {
    const parsed = JSON_OBJECT.safeParse(current);
    if (!parsed.success) return undefined;
    current = parsed.data[key];
  }
  return current;
}
function supportedField(field: ShellyPresenceField, inventory: ShellyInventory): boolean {
  const candidates = Object.entries(inventory.config).filter(
    ([key]) => key === field.component || key.startsWith(`${field.component}:`),
  );
  if (['sys.ui_data.df', 'sys.ui_data.tf', 'sys.ui_data.dash'].includes(field.id))
    return (
      candidates.length > 0 &&
      inventory.methods.some((method) => method.toLowerCase() === 'sys.setconfig')
    );
  if (field.path[0] === 'meta')
    return candidates.some(([, value]) => fieldValue(value, ['meta']) !== undefined);
  if (field.value.kind === 'text' && field.value.secret === true) return candidates.length > 0;
  const path = field.path.map((key) =>
    key === 'presence_delay' ? 'presence_thr' : key === 'absence_delay' ? 'absence_thr' : key,
  );
  return candidates.some(
    ([, value]) =>
      fieldValue(value, field.path) !== undefined || fieldValue(value, path) !== undefined,
  );
}
function fieldFeature(
  field: ShellyPresenceField,
  presence: ShellyPresenceConfig | null,
): ShellyPresenceDevice['features'][number] {
  const locked =
    field.component === 'presence' &&
    presence?.sensor?.room_preset === 'small_room' &&
    field.path[0] === 'sensor' &&
    field.path[1] !== 'room_preset';
  return {
    id: field.id,
    page: field.page,
    focus: field.focus,
    available: !locked,
    reason: locked ? 'The small-room preset controls this setting.' : null,
  };
}
export function shellyFeatures(
  inventory: ShellyInventory,
  presence: ShellyPresenceConfig | null,
): ShellyPresenceDevice['features'] {
  const methods = new Set(inventory.methods.map((method) => method.toLowerCase()));
  const fields = SHELLY_PRESENCE_FIELDS.filter((field) => supportedField(field, inventory)).map(
    (field) => fieldFeature(field, presence),
  );
  const operations = SHELLY_PRESENCE_OPERATIONS.filter((operation) =>
    operationAvailable(operation.action, operation.method, methods, inventory),
  ).map((operation) => ({
    id: operation.action,
    page: operation.page,
    focus: operation.focus,
    available: true,
    reason: null,
  }));
  return [...fields, ...operations];
}

function operationAvailable(
  action: string,
  method: string,
  methods: ReadonlySet<string>,
  inventory: ShellyInventory,
): boolean {
  if (action === 'http_request')
    return ['http.request', 'http.get', 'http.post'].some((method) => methods.has(method));
  if (action === 'virtual_config')
    return ['boolean', 'number', 'enum', 'text', 'button', 'group'].some((type) =>
      methods.has(`${type}.setconfig`),
    );
  if (action === 'virtual_set')
    return ['boolean', 'number', 'enum', 'text', 'group'].some((type) =>
      methods.has(`${type}.set`),
    );
  if (action === 'bthome_set_config')
    return (
      methods.has(method.toLowerCase()) &&
      fieldValue(inventory.config['bthome'] ?? null, ['enable']) !== undefined
    );
  return methods.has(method.toLowerCase());
}
