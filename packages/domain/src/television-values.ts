import { presentDevice, withRole } from './capability-presentation';
import type { CapabilityKey } from './capabilities';
import type { DeviceCapability, DeviceKind } from './devices';
import { TV_IR_WORDS, type TvKey } from './television-keys';
import type { CapabilityRole } from './presentation/types';
import type { JsonValue } from './values';

export const TV_PATHS = ['smartthings', 'direct', 'ir'] as const;

export type TvPath = (typeof TV_PATHS)[number];

export interface TvPaths {
  readonly smartthings: boolean;
  readonly direct: { readonly attached: boolean };
  readonly irRemoteId: string | null;
  readonly irButtons: readonly string[];
}

export function tvPathsFor(directAttached: boolean): TvPaths {
  return {
    smartthings: true,
    direct: { attached: directAttached },
    irRemoteId: null,
    irButtons: [],
  };
}

export interface TvDevice {
  readonly id: string;
  readonly kind: DeviceKind;
  readonly model: string;
  readonly online: boolean;
  readonly capabilities: readonly DeviceCapability[];
}

export interface TvValues {
  readonly power: boolean | null;
  readonly volume: number | null;
  readonly muted: boolean | null;
  readonly input: string | null;
  readonly channel: number | null;
  readonly playback: string | null;
  readonly app: string | null;
  readonly category: 'tv' | 'monitor';
  readonly powerOnRemote: boolean;
  readonly updating: boolean;
}

export const TV_MODES = [
  'on',
  'standby',
  'off_unreachable',
  'unreachable',
  'updating',
  'turning_on',
] as const;

export type TvMode = (typeof TV_MODES)[number];

const UPDATING_STATUS = 'AgentUpdate Started';

export type ReadCapability = (capability: CapabilityKey) => JsonValue | undefined;

function roleValue(
  device: TvDevice,
  read: ReadCapability,
  role: CapabilityRole,
): JsonValue | undefined {
  const presented = withRole(presentDevice(device), role);
  return presented === undefined ? undefined : read(presented.key);
}

function booleanOrNull(value: JsonValue | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function numberOrNull(value: JsonValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function textOrNull(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function isTrue(value: JsonValue | undefined): boolean {
  return value === true || value === 'true';
}

export function tvValuesOf(device: TvDevice, read: ReadCapability): TvValues {
  const valueOf = (role: CapabilityRole): JsonValue | undefined => roleValue(device, read, role);
  return {
    power: booleanOrNull(valueOf('power')),
    volume: numberOrNull(valueOf('volume')),
    muted: booleanOrNull(valueOf('mute')),
    input: textOrNull(valueOf('input_source')),
    channel: numberOrNull(valueOf('channel')),
    playback: textOrNull(valueOf('playback')),
    app: textOrNull(valueOf('current_app')),
    category: valueOf('tv_category') === 'monitor' ? 'monitor' : 'tv',
    powerOnRemote: isTrue(valueOf('power_on_remote')),
    updating: valueOf('tv_updating') === UPDATING_STATUS,
  };
}

function normalised(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\+/g, '_plus')
    .replace(/\s*-\s*$/, '_minus')
    .replace(/[\s-]+/g, '_');
}

export function irButtonFor(key: TvKey, buttons: readonly string[]): string | null {
  const words = TV_IR_WORDS[key] ?? [];
  return buttons.find((button) => words.includes(normalised(button))) ?? null;
}

export function powerOnPath(values: TvValues, paths: TvPaths): TvPath | null {
  if (paths.smartthings && values.powerOnRemote) {
    return 'smartthings';
  }
  if (paths.direct.attached) {
    return 'direct';
  }
  const hasButton =
    irButtonFor('power_on', paths.irButtons) !== null ||
    irButtonFor('power', paths.irButtons) !== null;
  return paths.irRemoteId !== null && hasButton ? 'ir' : null;
}

export function tvMode(device: TvDevice, values: TvValues, paths: TvPaths): TvMode {
  if (values.updating) {
    return 'updating';
  }
  const asleep = !device.online || values.power === false;
  if (!asleep) {
    return 'on';
  }
  if (powerOnPath(values, paths) !== null) {
    return 'standby';
  }
  return values.power === true ? 'unreachable' : 'off_unreachable';
}
