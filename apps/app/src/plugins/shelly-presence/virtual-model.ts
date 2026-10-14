import {
  SHELLY_PRESENCE_ACTION,
  type JsonValue,
  type ShellyPresenceAction,
  type ShellyVirtualComponent,
} from '@smarteverything/domain';
import { PRESENCE_FORM_OBJECT, atPath, withPath, type PresenceFormObject } from './form-model';

export const VIRTUAL_TYPES = ['boolean', 'number', 'enum', 'text', 'button', 'group'] as const;
export type VirtualType = (typeof VIRTUAL_TYPES)[number];
const KEYS: Readonly<Record<VirtualType, readonly string[]>> = {
  number: ['persisted', 'default_value', 'min', 'max'],
  enum: ['persisted', 'default_value', 'options'],
  text: ['persisted', 'default_value', 'max_len'],
  boolean: ['persisted', 'default_value'],
  button: [],
  group: [],
};
function configValue(type: VirtualType, key: string, value: JsonValue): JsonValue {
  const numeric =
    ['min', 'max', 'max_len'].includes(key) || (type === 'number' && key === 'default_value');
  if (!numeric || typeof value !== 'string') return value;
  return value === '' ? null : Number(value);
}

export function virtualConfigAction(
  type: VirtualType,
  draft: PresenceFormObject,
  component: ShellyVirtualComponent | null,
): ShellyPresenceAction {
  let config = virtualFields(type, draft);
  if (draft['meta'] !== undefined) config = { ...config, meta: serializeMetadata(draft['meta']) };
  return SHELLY_PRESENCE_ACTION.parse({
    action: component === null ? 'virtual_add' : 'virtual_config',
    ...(component === null
      ? draft['id'] === undefined || draft['id'] === ''
        ? {}
        : { id: Number(draft['id']) }
      : { id: component.config.id }),
    config: { component: type, value: config },
  });
}
export function virtualInitial(component: ShellyVirtualComponent | null): PresenceFormObject {
  return component === null
    ? { name: '', persisted: false, options: [] }
    : PRESENCE_FORM_OBJECT.parse(component.config);
}
export function serializeMetadata(value: JsonValue): JsonValue {
  const parsed = PRESENCE_FORM_OBJECT.safeParse(value);
  if (!parsed.success) return value;
  return ['ui.order', 'ui.step'].reduce<PresenceFormObject>((meta, path) => {
    const field = atPath(meta, path);
    return typeof field === 'string' && field.trim() !== ''
      ? withPath(meta, path, Number(field))
      : meta;
  }, parsed.data);
}

function virtualFields(type: VirtualType, draft: PresenceFormObject): PresenceFormObject {
  let config: PresenceFormObject = { name: draft['name'] ?? null };
  for (const key of KEYS[type]) {
    const value = draft[key];
    if (key === 'default_value' && value === null && (type === 'number' || type === 'boolean'))
      continue;
    if (value !== undefined) config = { ...config, [key]: configValue(type, key, value) };
  }
  return config;
}
