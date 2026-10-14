import {
  SHELLY_PRESENCE_FIELDS,
  SHELLY_SCHEDULE_CALL,
  type JsonValue,
  type ShellyPresenceField,
  type ShellyScheduleCall,
} from '@smarteverything/domain';
import { z } from 'zod';
import {
  atPath,
  formPatch,
  withPath,
  PRESENCE_FORM_OBJECT,
  type PresenceFormObject,
} from './form-model';

export interface CallDraft {
  readonly method: string;
  readonly params: PresenceFormObject;
}
export const SCHEDULE_METHODS = SHELLY_SCHEDULE_CALL.options.map(
  (option) => option.shape.method.value,
);

export function callFields(method: string): readonly ShellyPresenceField[] {
  const component = method.split('.')[0]?.toLowerCase();
  return SHELLY_PRESENCE_FIELDS.filter(
    (field) =>
      field.component === component && field.value.kind !== 'area' && field.value.kind !== 'rgb',
  );
}

export function callDraft(call: ShellyScheduleCall): CallDraft {
  return { method: call.method, params: PRESENCE_FORM_OBJECT.parse(call.params) };
}

export function callFieldValue(call: CallDraft, field: ShellyPresenceField): JsonValue | undefined {
  const config = PRESENCE_FORM_OBJECT.safeParse(call.params['config']);
  if (!config.success) return undefined;
  return Object.hasOwn(config.data, field.path.join('.'))
    ? config.data[field.path.join('.')]
    : atPath(config.data, field.path.join('.'));
}

export function changeCallField(
  call: CallDraft,
  field: ShellyPresenceField,
  value: JsonValue,
): CallDraft {
  const draft = {
    ...PRESENCE_FORM_OBJECT.parse(call.params['config'] ?? {}),
    [field.path.join('.')]: value,
  };
  return { ...call, params: { ...call.params, config: draft } };
}

export function serializeCall(call: CallDraft): ShellyScheduleCall {
  const params = {
    ...call.params,
    ...(typeof call.params['id'] === 'string'
      ? { id: call.params['id'].trim() === '' ? undefined : Number(call.params['id']) }
      : {}),
    ...(typeof call.params['delay_ms'] === 'string'
      ? {
          delay_ms:
            call.params['delay_ms'].trim() === '' ? undefined : Number(call.params['delay_ms']),
        }
      : {}),
  };
  const configuration = PRESENCE_FORM_OBJECT.safeParse(call.params['config']);
  if (!configuration.success) return SHELLY_SCHEDULE_CALL.parse({ method: call.method, params });
  const original = Object.fromEntries(
    Object.entries(configuration.data).filter(([key]) => !key.includes('.')),
  );
  const config = callFields(call.method).reduce<PresenceFormObject>((accepted, field) => {
    const path = field.path.join('.');
    const value = callFieldValue(call, field);
    if (value === undefined) return accepted;
    const patch = formPatch([field], { [path]: value });
    const next = atPath(patch, path);
    return next === undefined ? accepted : withPath(accepted, path, next);
  }, original);
  return SHELLY_SCHEDULE_CALL.parse({ method: call.method, params: { ...params, config } });
}

export function numberParameter(value: unknown): string {
  const parsed = z.union([z.string(), z.number()]).safeParse(value);
  return parsed.success ? String(parsed.data) : '';
}
