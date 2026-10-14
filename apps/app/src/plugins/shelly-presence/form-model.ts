import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import type { PresenceField } from './presence-fields';

export const PRESENCE_FORM_OBJECT = z.record(z.string(), z.json());
export type PresenceFormObject = Readonly<Record<string, JsonValue>>;

export function atPath(value: unknown, path: string): JsonValue | undefined {
  const parts = path.split('.');
  const first = parts[0];
  if (first === undefined) return undefined;
  const parsed = PRESENCE_FORM_OBJECT.safeParse(value);
  if (!parsed.success) return undefined;
  const found = parsed.data[first];
  return parts.length === 1 ? found : atPath(found, parts.slice(1).join('.'));
}

export function withPath(
  value: PresenceFormObject,
  path: string,
  next: JsonValue,
): PresenceFormObject {
  const [first, ...rest] = path.split('.');
  if (first === undefined) throw new Error('A setting path must have a name.');
  if (rest.length === 0) return { ...value, [first]: next };
  const parsed = PRESENCE_FORM_OBJECT.safeParse(value[first]);
  return { ...value, [first]: withPath(parsed.success ? parsed.data : {}, rest.join('.'), next) };
}

function typedFieldValue(field: PresenceField, written: JsonValue): JsonValue {
  if (typeof written !== 'string') return written;
  if (field.id === 'sys.ui_data.tf' && written !== 'default') return Number(written);
  if (field.value.kind === 'number') return written.trim() === '' ? null : Number(written);
  if (field.value.kind === 'text' && field.value.nullable === true && written === '') return null;
  return written;
}

export function formPatch(
  fields: readonly PresenceField[],
  draft: PresenceFormObject,
): PresenceFormObject {
  return fields.reduce((patch, field) => {
    const written = draft[field.path.join('.')];
    return written === undefined
      ? patch
      : withPath(patch, field.path.join('.'), typedFieldValue(field, written));
  }, {});
}
