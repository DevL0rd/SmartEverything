import type { CapabilityKey } from './capabilities';
import type { CommandRequest } from './commands';
import {
  TV_DIRECT_CODES,
  TV_SMARTTHINGS_PAD,
  TV_TUNER_KEYS,
  type TvKey,
  type TvKeyReason,
} from './television-keys';
import {
  cloudCanWake,
  irButtonFor,
  tvMode,
  type TvDevice,
  type TvMode,
  type TvPath,
  type TvPaths,
  type TvValues,
} from './television-values';
import type { JsonValue } from './values';

export interface TvRoute {
  readonly path: TvPath;
  readonly send: CommandRequest;
}

export type TvKeyEntry =
  | {
      readonly path: TvPath;
      readonly send: CommandRequest;
      readonly fallbacks: readonly TvRoute[];
    }
  | { readonly path: null; readonly reason: TvKeyReason };

export type TvKeyMap = (key: TvKey) => TvKeyEntry;

interface KeyContext {
  readonly device: TvDevice;
  readonly values: TvValues;
  readonly paths: TvPaths;
  readonly mode: TvMode;
  readonly capabilities: ReadonlySet<string>;
}

const SMARTTHINGS_ACTIONS: Readonly<Partial<Record<TvKey, CapabilityKey>>> = {
  vol_up: 'raw:audio_volume:volume_up',
  vol_down: 'raw:audio_volume:volume_down',
  ch_up: 'raw:tv_channel:channel_up',
  ch_down: 'raw:tv_channel:channel_down',
  prev_track: 'raw:media_track_control:previous_track',
  next_track: 'raw:media_track_control:next_track',
};

const SMARTTHINGS_PLAYBACK: Readonly<Partial<Record<TvKey, string>>> = {
  play: 'playing',
  pause: 'paused',
  stop: 'stopped',
  ff: 'fast forwarding',
  rewind: 'rewinding',
};

const POWER_KEYS: ReadonlySet<TvKey> = new Set(['power', 'power_on', 'power_off']);

function request(context: KeyContext, capability: CapabilityKey, value: JsonValue): CommandRequest {
  return { deviceId: context.device.id, capability, value };
}

function playPause(values: TvValues): 'play' | 'pause' {
  return values.playback === 'playing' ? 'pause' : 'play';
}

function powerSwitch(key: TvKey, context: KeyContext): boolean | null {
  if (key === 'power_on') {
    return true;
  }
  if (key === 'power_off') {
    return false;
  }
  return key === 'power' ? context.mode !== 'on' : null;
}

function smartthingsPower(key: TvKey, context: KeyContext): CommandRequest | null {
  const on = powerSwitch(key, context);
  if (on === null || !context.capabilities.has('power')) {
    return null;
  }
  const wakes = cloudCanWake(context.values, context.paths, context.device.online);
  return on && !wakes ? null : request(context, 'power', on);
}

function smartthingsPlayback(key: TvKey, context: KeyContext): CommandRequest | null {
  if (!context.capabilities.has('playback')) {
    return null;
  }
  const status = SMARTTHINGS_PLAYBACK[key === 'play_pause' ? playPause(context.values) : key];
  return status === undefined ? null : request(context, 'playback', status);
}

function smartthingsSend(key: TvKey, context: KeyContext): CommandRequest | null {
  const pad = TV_SMARTTHINGS_PAD[key];
  if (pad !== undefined) {
    return context.capabilities.has('remote_key') ? request(context, 'remote_key', key) : null;
  }
  const action = SMARTTHINGS_ACTIONS[key];
  if (action !== undefined) {
    return context.capabilities.has(action) ? request(context, action, null) : null;
  }
  if (key === 'mute') {
    return context.capabilities.has('mute')
      ? request(context, 'mute', context.values.muted !== true)
      : null;
  }
  return POWER_KEYS.has(key) ? smartthingsPower(key, context) : smartthingsPlayback(key, context);
}

function directSend(key: TvKey, context: KeyContext): CommandRequest | null {
  if (!context.paths.direct.attached) {
    return null;
  }
  const on = powerSwitch(key, context);
  if (on !== null) {
    return request(context, 'power', on);
  }
  if (key === 'play_pause') {
    return request(context, 'remote_key', playPause(context.values));
  }
  return TV_DIRECT_CODES[key] === undefined ? null : request(context, 'remote_key', key);
}

function irSend(key: TvKey, context: KeyContext): CommandRequest | null {
  const { irRemoteId, irButtons } = context.paths;
  const button = irRemoteId === null ? null : irButtonFor(key, irButtons);
  return irRemoteId === null || button === null
    ? null
    : { deviceId: irRemoteId, capability: 'remote_key', value: button };
}

const SENDERS: Readonly<
  Record<TvPath, (key: TvKey, context: KeyContext) => CommandRequest | null>
> = {
  smartthings: smartthingsSend,
  direct: directSend,
  ir: irSend,
};

const PATH_ORDER: readonly TvPath[] = ['direct', 'smartthings', 'ir'];

function routesFor(key: TvKey, context: KeyContext): readonly TvRoute[] {
  return PATH_ORDER.flatMap((path): readonly TvRoute[] => {
    if (path === 'smartthings' && !context.paths.smartthings) {
      return [];
    }
    const send = SENDERS[path](key, context);
    return send === null ? [] : [{ path, send }];
  });
}

function blockedBy(key: TvKey, context: KeyContext): TvKeyReason | null {
  const { mode, values } = context;
  if (values.category === 'monitor' && TV_TUNER_KEYS.has(key)) {
    return 'not_on_this_tv';
  }
  if (mode === 'updating') {
    return 'updating';
  }
  if (POWER_KEYS.has(key) || mode === 'on') {
    return null;
  }
  return mode === 'unreachable' ? 'unreachable' : 'tv_off';
}

function missingReason(key: TvKey, context: KeyContext): TvKeyReason {
  if (key === 'power_on' || (key === 'power' && context.mode !== 'on')) {
    return 'cannot_wake';
  }
  return POWER_KEYS.has(key) ? 'unreachable' : 'needs_direct';
}

function entryFor(key: TvKey, context: KeyContext): TvKeyEntry {
  const blocked = blockedBy(key, context);
  if (blocked !== null) {
    return { path: null, reason: blocked };
  }
  const [first, ...fallbacks] = routesFor(key, context);
  return first === undefined
    ? { path: null, reason: missingReason(key, context) }
    : { path: first.path, send: first.send, fallbacks };
}

export function tvKeyMap(device: TvDevice, values: TvValues, paths: TvPaths): TvKeyMap {
  const context: KeyContext = {
    device,
    values,
    paths,
    mode: tvMode(device, values, paths),
    capabilities: new Set(device.capabilities.map((capability) => capability.key)),
  };
  return (key) => entryFor(key, context);
}
