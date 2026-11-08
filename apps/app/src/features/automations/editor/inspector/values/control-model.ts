import {
  deviceFamily,
  outputLabel,
  presentDevice,
  resolveRegion,
  type DeviceRegionSource,
  type JsonValue,
  type OptionSourceId,
  type PortValue,
  type PresentedCapability,
  type RegionPref,
} from '@smarteverything/domain';
import type { Device } from '../../../../../store/state';
import type { FieldControl } from '../schema-fields';
import type { PortScope } from './literal-model';
import type { PickerOption } from './option-picker-model';
import { targetFormOf } from './target-model';

export type ControlScope = 'shown' | 'writable' | 'action';

const SCOPES: Readonly<Partial<Record<OptionSourceId, ControlScope>>> = {
  'device.controls': 'shown',
  'device.writable_controls': 'writable',
  'device.actions': 'action',
};

export function controlScopeOf(source: OptionSourceId): ControlScope | null {
  return SCOPES[source] ?? null;
}

export interface ChoiceItem {
  readonly id: string;
  readonly label: string;
}

export type ControlValueSpec =
  | { readonly t: 'switch'; readonly on: string; readonly off: string }
  | {
      readonly t: 'number';
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly unit: string | null;
      readonly kelvin: boolean;
    }
  | { readonly t: 'colour' }
  | { readonly t: 'choice'; readonly options: readonly ChoiceItem[] }
  | { readonly t: 'text'; readonly maxLength: number }
  | { readonly t: 'action' };

export interface ControlSpec {
  readonly id: string;
  readonly keys: readonly string[];
  readonly label: string;
  readonly group: string;
  readonly devices: number;
  readonly value: ControlValueSpec;
}

export interface ControlHome {
  readonly devices: readonly Device[];
  readonly groups: readonly { readonly id: string; readonly device_ids: readonly string[] }[];
}

export interface ControlReach {
  readonly ids: readonly string[];
  readonly families: readonly string[];
}

function isShown(presented: PresentedCapability): boolean {
  return presented.tier !== 'hidden' && presented.tier !== 'diagnostic';
}

function isAction(presented: PresentedCapability): boolean {
  return presented.capability.value.kind === 'action';
}

const KEEP: Readonly<Record<ControlScope, (presented: PresentedCapability) => boolean>> = {
  shown: isShown,
  writable: (p) => isShown(p) && p.writable && !isAction(p),
  action: (p) => isShown(p) && p.writable && isAction(p),
};

function isKelvin(presented: PresentedCapability): boolean {
  if (presented.unit !== null) return presented.unit === 'K';
  return presented.key === 'color_temperature' || presented.role === 'color_temperature';
}

function choicesOf(presented: PresentedCapability, ids: readonly string[]): readonly ChoiceItem[] {
  if (presented.options.length > 0) {
    return presented.options.map((option) => ({ id: option.value, label: option.label }));
  }
  return ids.map((id) => ({ id, label: outputLabel(id) }));
}

function switchOf(presented: PresentedCapability): ControlValueSpec {
  const [on, off] = presented.states ?? ['On', 'Off'];
  return { t: 'switch', on, off };
}

export function valueSpecOf(presented: PresentedCapability): ControlValueSpec {
  const value = presented.capability.value;
  switch (value.kind) {
    case 'boolean':
      return switchOf(presented);
    case 'number': {
      const { min, max, step } = value;
      return { t: 'number', min, max, step, unit: presented.unit, kelvin: isKelvin(presented) };
    }
    case 'enum':
      return { t: 'choice', options: choicesOf(presented, value.options) };
    case 'color':
      return { t: 'colour' };
    case 'text':
      return { t: 'text', maxLength: value.maxLength };
    case 'action':
      return { t: 'action' };
  }
}

function unionChoices(a: readonly ChoiceItem[], b: readonly ChoiceItem[]): readonly ChoiceItem[] {
  const known = new Set(a.map((item) => item.id));
  return [...a, ...b.filter((item) => !known.has(item.id))];
}

function joinedValue(a: ControlValueSpec, b: ControlValueSpec): ControlValueSpec {
  if (a.t === 'number' && b.t === 'number') {
    return {
      ...a,
      min: Math.min(a.min, b.min),
      max: Math.max(a.max, b.max),
      step: Math.min(a.step, b.step),
    };
  }
  if (a.t === 'choice' && b.t === 'choice') {
    return { t: 'choice', options: unionChoices(a.options, b.options) };
  }
  return a;
}

function joined(a: ControlSpec, b: ControlSpec): ControlSpec {
  return {
    ...a,
    keys: [...new Set([...a.keys, ...b.keys])],
    devices: a.devices + b.devices,
    value: joinedValue(a.value, b.value),
  };
}

function specOfPresented(presented: PresentedCapability): ControlSpec {
  return {
    id: presented.role ?? presented.key,
    keys: [presented.key],
    label: presented.label,
    group: presented.groupLabel,
    devices: 1,
    value: valueSpecOf(presented),
  };
}

function deviceSpecs(device: Device, scope: ControlScope): readonly ControlSpec[] {
  const found = new Map<string, ControlSpec>();
  for (const presented of presentDevice(device).capabilities.filter(KEEP[scope])) {
    const spec = specOfPresented(presented);
    const held = found.get(spec.id);
    found.set(spec.id, held === undefined ? spec : { ...joined(held, spec), devices: 1 });
  }
  return [...found.values()];
}

export function controlSpecs(
  devices: readonly Device[],
  scope: ControlScope,
): readonly ControlSpec[] {
  const found = new Map<string, ControlSpec>();
  for (const device of devices) {
    for (const spec of deviceSpecs(device, scope)) {
      const held = found.get(spec.id);
      found.set(spec.id, held === undefined ? spec : joined(held, spec));
    }
  }
  return [...found.values()];
}

export function specOf(specs: readonly ControlSpec[], id: string): ControlSpec | null {
  return specs.find((spec) => spec.id === id) ?? specs.find((s) => s.keys.includes(id)) ?? null;
}

function litOf(value: PortValue | undefined): JsonValue | undefined {
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

function textsOf(value: JsonValue | undefined): readonly string[] {
  if (typeof value === 'string') return value === '' ? [] : [value];
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function targetReach(value: JsonValue | undefined): ControlReach {
  const form = targetFormOf(value);
  if (form.t === 'devices') return { ids: form.ids, families: [] };
  const ids = form.id === '' ? [] : [form.id];
  return { ids, families: form.t === 'room' ? form.families : [] };
}

export function reachOfPorts(ports: Readonly<Record<string, PortValue>>): ControlReach {
  const target = targetReach(litOf(ports['target']));
  const named = ['device', 'devices', 'room', 'group'].flatMap((name) =>
    textsOf(litOf(ports[name])),
  );
  return {
    ids: [...target.ids, ...named],
    families: [...target.families, ...textsOf(litOf(ports['family']))],
  };
}

function devicesOfId(home: ControlHome, id: string): readonly Device[] {
  const device = home.devices.find((candidate) => candidate.id === id);
  if (device !== undefined) return [device];
  const group = home.groups.find((candidate) => candidate.id === id);
  if (group === undefined) return home.devices.filter((candidate) => candidate.room_id === id);
  const members = new Set(group.device_ids);
  return home.devices.filter((candidate) => members.has(candidate.id));
}

export function reachedDevices(home: ControlHome, reach: ControlReach): readonly Device[] {
  const pool =
    reach.ids.length === 0 ? home.devices : reach.ids.flatMap((id) => devicesOfId(home, id));
  const unique = [...new Map(pool.map((device) => [device.id, device])).values()];
  if (reach.families.length === 0) return unique;
  return unique.filter((device) => reach.families.includes(deviceFamily(device)));
}

export function isReachSet(reach: ControlReach): boolean {
  return reach.ids.length > 0 || reach.families.length > 0;
}

export const NEEDS_TARGET = 'Pick the device, room or group first';
export const NO_DEVICES = 'Nothing is in the picked room, group or family yet';
export const NEEDS_CONTROL = 'Pick the control first';
export const NOT_ON_TARGET = 'Not on the picked devices';
export const ACTION_TAKES_NOTHING = 'This control is an action and takes no value';

const NO_CONTROLS: Readonly<Record<ControlScope, string>> = {
  shown: 'The picked devices have no values to use here',
  writable: 'The picked devices have nothing this step can set',
  action: 'The picked devices have no actions',
};

export type ControlChoices =
  | {
      readonly status: 'ready';
      readonly specs: readonly ControlSpec[];
      readonly devices: number;
    }
  | { readonly status: 'unavailable'; readonly reason: string };

export function controlChoices(
  home: ControlHome,
  reach: ControlReach,
  scope: ControlScope,
): ControlChoices {
  if (!isReachSet(reach)) return { status: 'unavailable', reason: NEEDS_TARGET };
  const devices = reachedDevices(home, reach);
  if (devices.length === 0) return { status: 'unavailable', reason: NO_DEVICES };
  const specs = controlSpecs(devices, scope);
  if (specs.length === 0) return { status: 'unavailable', reason: NO_CONTROLS[scope] };
  return { status: 'ready', specs, devices: devices.length };
}

function detailOf(spec: ControlSpec, total: number): string {
  if (total <= 1 || spec.devices >= total) return spec.group;
  return `${spec.group} · on ${String(spec.devices)} of ${String(total)}`;
}

export function controlRows(
  specs: readonly ControlSpec[],
  total: number,
  held: readonly string[],
): readonly PickerOption[] {
  const rows = specs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    detail: detailOf(spec, total),
  }));
  const missing = held.filter((id) => specOf(specs, id) === null);
  return [
    ...rows,
    ...missing.map((id) => ({
      id,
      label: outputLabel(id),
      detail: id,
      unavailable: NOT_ON_TARGET,
    })),
  ];
}

export interface ControlTyping {
  readonly source: OptionSourceId;
  readonly scope: ControlScope;
  readonly control: string;
}

export function controlTypingOf(
  control: Extract<FieldControl, { t: 'typedBy' }>,
  scope: PortScope,
): ControlTyping | null {
  const typing = scope.controls[control.port];
  if (typing?.t !== 'pick') return null;
  const controlScope = controlScopeOf(typing.source);
  if (controlScope === null) return null;
  const picked = litOf(scope.ports[control.port]);
  return {
    source: typing.source,
    scope: controlScope,
    control: typeof picked === 'string' ? picked : '',
  };
}

export type TemperatureUnit = 'c' | 'f';

const UNIT_OF: Readonly<Record<string, TemperatureUnit>> = {
  '°c': 'c',
  c: 'c',
  celsius: 'c',
  '°f': 'f',
  f: 'f',
  fahrenheit: 'f',
};

const UNIT_TEXT: Readonly<Record<TemperatureUnit, string>> = { c: '°C', f: '°F' };

const FAHRENHEIT_REGIONS: ReadonlySet<string> = new Set(['US']);

export function temperatureUnitOf(unit: string | null): TemperatureUnit | null {
  return unit === null ? null : (UNIT_OF[unit.toLowerCase()] ?? null);
}

export function homeTemperatureUnit(
  pref: RegionPref,
  source: DeviceRegionSource,
): TemperatureUnit | null {
  const resolved = resolveRegion(pref, source);
  if (resolved.kind === 'undetected') return null;
  return FAHRENHEIT_REGIONS.has(resolved.region) ? 'f' : 'c';
}

type NumberSpec = Extract<ControlValueSpec, { t: 'number' }>;

export interface NumberScale {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string | null;
  readonly shown: (stored: number) => number;
  readonly stored: (shown: number) => number;
}

function tidy(value: number): number {
  return Number(value.toPrecision(12));
}

function snapped(value: number, spec: NumberSpec): number {
  const step = spec.min + Math.round((value - spec.min) / spec.step) * spec.step;
  return tidy(Math.min(spec.max, Math.max(spec.min, step)));
}

function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

function toCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

export function numberScale(spec: NumberSpec, home: TemperatureUnit | null): NumberScale {
  const from = temperatureUnitOf(spec.unit);
  const same: NumberScale = {
    min: spec.min,
    max: spec.max,
    step: spec.step,
    unit: spec.unit,
    shown: (stored) => stored,
    stored: (shown) => snapped(shown, spec),
  };
  if (from === null || home === null || from === home) return same;
  const out = home === 'f' ? toFahrenheit : toCelsius;
  const back = home === 'f' ? toCelsius : toFahrenheit;
  const ratio = home === 'f' ? 9 / 5 : 5 / 9;
  return {
    min: tidy(out(spec.min)),
    max: tidy(out(spec.max)),
    step: tidy(spec.step * ratio),
    unit: UNIT_TEXT[home],
    shown: (stored) => tidy(out(stored)),
    stored: (shown) => snapped(back(shown), spec),
  };
}
