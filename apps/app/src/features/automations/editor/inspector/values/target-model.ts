import type { JsonValue } from '@smarteverything/domain';

export type TargetKind = 'device' | 'devices' | 'room' | 'group';

export type TargetForm =
  | { readonly t: 'device'; readonly id: string }
  | { readonly t: 'devices'; readonly ids: readonly string[] }
  | { readonly t: 'room'; readonly id: string; readonly families: readonly string[] }
  | { readonly t: 'group'; readonly id: string };

type JsonObject = Readonly<Record<string, JsonValue>>;

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function texts(value: JsonValue | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export function emptyForm(kind: TargetKind): TargetForm {
  if (kind === 'devices') return { t: 'devices', ids: [] };
  if (kind === 'room') return { t: 'room', id: '', families: [] };
  return { t: kind, id: '' };
}

export function targetFormOf(value: JsonValue | undefined): TargetForm {
  if (!isObject(value)) return emptyForm('device');
  const { device, devices, room, group, families } = value;
  if (typeof room === 'string') return { t: 'room', id: room, families: texts(families) };
  if (Array.isArray(devices)) return { t: 'devices', ids: texts(devices) };
  if (typeof group === 'string') return { t: 'group', id: group };
  return { t: 'device', id: typeof device === 'string' ? device : '' };
}

export function isComplete(form: TargetForm): boolean {
  return form.t === 'devices' ? form.ids.length > 0 : form.id !== '';
}

export function targetValue(form: TargetForm): JsonValue {
  if (form.t === 'devices') return { devices: [...form.ids] };
  if (form.t === 'room') {
    return form.families.length === 0
      ? { room: form.id }
      : { room: form.id, families: [...form.families] };
  }
  return form.t === 'group' ? { group: form.id } : { device: form.id };
}
