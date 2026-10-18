import { presentDevice, withRole } from './capability-presentation';
import { levelPercent, levelRangeOf } from './level-percent';
import { readPresentedColor } from './presentation/color';
import type { DeviceRow } from './api/rows-home';
import type { CapabilityRole, DevicePresentation, PresentedCapability } from './presentation/types';
import type { HsvColor, JsonValue } from './values';

export interface MemberSpread {
  readonly deviceId: string;
  readonly value: number;
}

export interface Spread {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly perMember: readonly MemberSpread[];
}

export type TargetPower = 'on' | 'off' | 'mixed' | 'none';

export interface TargetState {
  readonly members: number;
  readonly online: number;
  readonly on: number;
  readonly power: TargetPower;
  readonly level: Spread | null;
  readonly whiteTemperature: Spread | null;
  readonly colours: readonly HsvColor[];
  readonly support: Readonly<Partial<Record<CapabilityRole, number>>>;
}

export type TargetReadings = (
  deviceId: string,
) => Readonly<Record<string, { readonly value: JsonValue }>> | undefined;

export type TargetPresentations<T extends DeviceRow = DeviceRow> = (
  device: T,
) => DevicePresentation;

export interface GroupControlChoice<T extends DeviceRow = DeviceRow> {
  readonly reference: string;
  readonly presented: PresentedCapability;
  readonly device: T;
  readonly supported: number;
}

const PERCENT = 100;

function spreadOf(members: readonly MemberSpread[]): Spread | null {
  if (members.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const member of members) {
    min = Math.min(min, member.value);
    max = Math.max(max, member.value);
    sum += member.value;
  }
  return { min, max, mean: Math.round(sum / members.length), perMember: members };
}

function colourKey(colour: HsvColor): string {
  return `${String(Math.round(colour.hue))}/${String(Math.round(colour.saturation))}/${String(Math.round(colour.value))}`;
}

function distinctColours(colours: readonly HsvColor[]): readonly HsvColor[] {
  const byKey = new Map<string, HsvColor>();
  for (const colour of colours) {
    const key = colourKey(colour);
    if (!byKey.has(key)) byKey.set(key, colour);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.hue - right.hue || left.saturation - right.saturation || left.value - right.value,
  );
}

function powerOf(online: number, on: number): TargetPower {
  if (online === 0) return 'none';
  if (on === 0) return 'off';
  return on === online ? 'on' : 'mixed';
}

function levelOf(
  presented: PresentedCapability | undefined,
  value: JsonValue | undefined,
): number | null {
  const range = presented === undefined ? null : levelRangeOf(presented);
  return range === null || typeof value !== 'number' ? null : levelPercent(range, value);
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function supportOf(
  presentations: readonly DevicePresentation[],
): Readonly<Partial<Record<CapabilityRole, number>>> {
  const support: Partial<Record<CapabilityRole, number>> = {};
  for (const presentation of presentations) {
    const roles = new Set<CapabilityRole>();
    for (const presented of presentation.capabilities)
      if (presented.writable && presented.role !== null) roles.add(presented.role);
    for (const role of roles) support[role] = (support[role] ?? 0) + 1;
  }
  return support;
}

interface LitReading {
  readonly level: number | null;
  readonly white: number | null;
  readonly colour: HsvColor | null;
}

function valueOf(
  presented: PresentedCapability | undefined,
  values: Readonly<Record<string, { readonly value: JsonValue }>>,
): JsonValue | undefined {
  return presented === undefined ? undefined : values[presented.key]?.value;
}

function litReading(
  presentation: DevicePresentation,
  values: Readonly<Record<string, { readonly value: JsonValue }>>,
): LitReading | null {
  const power = withRole(presentation, 'power');
  if (valueOf(power, values) !== true) return null;
  const brightness = withRole(presentation, 'brightness');
  const colour = withRole(presentation, 'color');
  return {
    level: levelOf(brightness, valueOf(brightness, values)),
    white: numberOf(valueOf(withRole(presentation, 'color_temperature'), values)),
    colour: colour === undefined ? null : readPresentedColor(colour, valueOf(colour, values)),
  };
}

export function targetState<T extends DeviceRow>(
  devices: readonly T[],
  readings: TargetReadings,
  presentations: TargetPresentations<T>,
): TargetState {
  const present: DevicePresentation[] = [];
  const capable: DevicePresentation[] = [];
  const levels: MemberSpread[] = [];
  const whites: MemberSpread[] = [];
  const colours: HsvColor[] = [];
  let on = 0;
  for (const device of devices) {
    const presentation = presentations(device);
    capable.push(presentation);
    if (!device.online) continue;
    present.push(presentation);
    const lit = litReading(presentation, readings(device.id) ?? {});
    if (lit === null) continue;
    on += 1;
    if (lit.level !== null) levels.push({ deviceId: device.id, value: lit.level });
    if (lit.white !== null) whites.push({ deviceId: device.id, value: lit.white });
    if (lit.colour !== null) colours.push(lit.colour);
  }
  return {
    members: devices.length,
    online: present.length,
    on,
    power: powerOf(present.length, on),
    level: spreadOf(levels),
    whiteTemperature: spreadOf(whites),
    colours: distinctColours(colours),
    support: supportOf(capable),
  };
}

function safeControl(presented: PresentedCapability): boolean {
  return (
    presented.writable &&
    presented.danger.tier === 'none' &&
    (presented.tier === 'primary' || presented.tier === 'control') &&
    presented.capability.value.kind !== 'action' &&
    presented.capability.value.kind !== 'text'
  );
}

function unified(
  presented: PresentedCapability,
  peers: readonly PresentedCapability[],
): PresentedCapability {
  const descriptor = presented.capability.value;
  if (descriptor.kind === 'enum') {
    const options = [
      ...new Map(
        peers.flatMap((peer) => peer.options).map((option) => [option.value, option]),
      ).values(),
    ];
    return {
      ...presented,
      options,
      capability: {
        ...presented.capability,
        value: { ...descriptor, options: options.map((option) => option.value) },
      },
    };
  }
  if (descriptor.kind !== 'number') return presented;
  const ranges = peers
    .map((peer) => peer.capability.value)
    .filter((value) => value.kind === 'number');
  const value =
    presented.role === 'brightness'
      ? {
          ...descriptor,
          min: Math.max(...ranges.map((range) => Math.ceil((range.min / range.max) * PERCENT))),
          max: PERCENT,
          step: 1,
        }
      : {
          ...descriptor,
          min: Math.max(...ranges.map((range) => range.min)),
          max: Math.min(...ranges.map((range) => range.max)),
          step: Math.max(...ranges.map((range) => range.step)),
        };
  return { ...presented, capability: { ...presented.capability, value } };
}

interface ControlEntry<T extends DeviceRow> {
  readonly device: T;
  readonly presented: PresentedCapability;
  readonly reference: string;
}

function choiceOf<T extends DeviceRow>(
  first: ControlEntry<T>,
  peers: readonly ControlEntry<T>[],
): readonly GroupControlChoice<T>[] {
  const presented = unified(
    first.presented,
    peers.map((entry) => entry.presented),
  );
  const descriptor = presented.capability.value;
  if (descriptor.kind === 'number' && descriptor.min > descriptor.max) return [];
  return [{ ...first, presented, supported: peers.length }];
}

export function groupControlChoices<T extends DeviceRow>(
  devices: readonly T[],
): readonly GroupControlChoice<T>[] {
  const groups = new Map<string, { first: ControlEntry<T>; peers: ControlEntry<T>[] }>();
  for (const device of devices) {
    for (const presented of presentDevice(device).capabilities.filter(safeControl)) {
      const entry = { device, presented, reference: presented.role ?? presented.key };
      const group = groups.get(entry.reference);
      if (group === undefined) groups.set(entry.reference, { first: entry, peers: [entry] });
      else group.peers.push(entry);
    }
  }
  return [...groups.values()].flatMap(({ first, peers }) => choiceOf(first, peers));
}

export function sharedControls(devices: readonly DeviceRow[]): readonly CapabilityRole[] {
  return groupControlChoices(devices).flatMap((choice) =>
    choice.presented.role === null ? [] : [choice.presented.role],
  );
}
