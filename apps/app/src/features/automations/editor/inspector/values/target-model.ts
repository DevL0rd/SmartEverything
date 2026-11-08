import type { JsonValue, OptionSourceId } from '@smarteverything/domain';
import type { PortScope } from './literal-model';
import type { PickerOption } from './option-picker-model';

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

export interface ChosenControl {
  readonly id: string;
  readonly source: OptionSourceId;
}

export function chosenControlOf(scope: PortScope): ChosenControl | null {
  const field = scope.controls['control'];
  const port = scope.ports['control'];
  if (field?.t !== 'pick' || port === undefined || !('lit' in port)) return null;
  return typeof port.lit === 'string' && port.lit !== ''
    ? { id: port.lit, source: field.source }
    : null;
}

export const LACKS_CONTROL = 'Cannot do what this step needs';

export function devicesForControl(
  devices: readonly PickerOption[],
  held: readonly string[],
  has: ((id: string) => boolean) | null,
): readonly PickerOption[] {
  if (has === null) return devices;
  return devices.flatMap((device): readonly PickerOption[] => {
    if (has(device.id)) return [device];
    return held.includes(device.id) ? [{ ...device, unavailable: LACKS_CONTROL }] : [];
  });
}

export function reachableOf(
  options: readonly PickerOption[],
  reach: ReadonlySet<string> | null,
): readonly PickerOption[] {
  return reach === null ? options : options.filter((option) => reach.has(option.id));
}
