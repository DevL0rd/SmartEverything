import { atPath, formPatch, PRESENCE_FORM_OBJECT, type PresenceFormObject } from './form-model';
import type { PresenceField } from './presence-fields';
export function completeCorePatch(
  fields: readonly PresenceField[],
  draft: PresenceFormObject,
  accepted: unknown,
): PresenceFormObject {
  const patch = formPatch(fields, draft);
  if (!Object.keys(draft).some((path) => path.startsWith('ui_data.'))) return patch;
  const original = PRESENCE_FORM_OBJECT.safeParse(atPath(accepted, 'ui_data'));
  const written = PRESENCE_FORM_OBJECT.safeParse(patch['ui_data']);
  if (!written.success) return patch;
  const merged = { ...(original.success ? original.data : {}), ...written.data };
  return {
    ...patch,
    ui_data: Object.fromEntries(
      Object.entries(merged).filter(([key, value]) => !defaultInterfaceValue(key, value)),
    ),
  };
}
function defaultInterfaceValue(key: string, value: unknown): boolean {
  if (key === 'df') return value === 'YYYY/M/D';
  if (key === 'tf') return value === 'default';
  return key === 'dash' && Array.isArray(value) && value.length === 0;
}
