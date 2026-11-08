import { ApiError, targetCapability, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { DEVICE_REF } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { stampOf } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectHandlers } from './effect-run';

export interface TvEffectPorts {
  readonly store: Store;
  readonly setter: Pick<DeviceSetter, 'set'>;
}

const FIXED_ACTIONS = [
  'power_on',
  'power_off',
  'volume_up',
  'volume_down',
  'mute',
  'unmute',
  'art_mode_on',
  'art_mode_off',
] as const;

const VALUED_ACTIONS = [
  'volume_set',
  'input',
  'channel',
  'open_app',
  'press_key',
  'playback',
  'picture_mode',
  'sound_mode',
] as const;

const PLAYBACK_STATUS = {
  play: 'playing',
  pause: 'paused',
  stop: 'stopped',
  fast_forward: 'fast forwarding',
  rewind: 'rewinding',
} as const;

const PARAMS = z.object({
  tv: DEVICE_REF,
  action: z.enum([...FIXED_ACTIONS, ...VALUED_ACTIONS]),
  volume: z.number().optional(),
  input: z.string().min(1).optional(),
  channel: z.number().optional(),
  app: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  playback: z.enum(['play', 'pause', 'stop', 'fast_forward', 'rewind']).optional(),
  pictureMode: z.string().min(1).optional(),
  soundMode: z.string().min(1).optional(),
});

type Ask = z.infer<typeof PARAMS>;

interface Control {
  readonly control: string;
  readonly value: JsonValue;
}

const FIXED: Readonly<Record<(typeof FIXED_ACTIONS)[number], Control>> = {
  power_on: { control: 'power', value: true },
  power_off: { control: 'power', value: false },
  volume_up: { control: 'remote_key', value: 'vol_up' },
  volume_down: { control: 'remote_key', value: 'vol_down' },
  mute: { control: 'mute', value: true },
  unmute: { control: 'mute', value: false },
  art_mode_on: { control: 'art_mode', value: true },
  art_mode_off: { control: 'art_mode', value: false },
};

interface Valued {
  readonly control: string;
  readonly port: string;
  readonly read: (ask: Ask) => JsonValue | undefined;
}

const VALUED: Readonly<Record<(typeof VALUED_ACTIONS)[number], Valued>> = {
  volume_set: { control: 'volume', port: 'volume', read: (ask) => ask.volume },
  input: { control: 'input_source', port: 'input', read: (ask) => ask.input },
  channel: { control: 'channel', port: 'channel', read: (ask) => ask.channel },
  open_app: { control: 'app_launch', port: 'app', read: (ask) => ask.app },
  press_key: { control: 'remote_key', port: 'key', read: (ask) => ask.key },
  playback: {
    control: 'playback',
    port: 'playback',
    read: (ask) => (ask.playback === undefined ? undefined : PLAYBACK_STATUS[ask.playback]),
  },
  picture_mode: { control: 'picture_mode', port: 'pictureMode', read: (ask) => ask.pictureMode },
  sound_mode: { control: 'sound_mode', port: 'soundMode', read: (ask) => ask.soundMode },
};

function isFixed(action: Ask['action']): action is (typeof FIXED_ACTIONS)[number] {
  return FIXED_ACTIONS.some((fixed) => fixed === action);
}

function controlOf(ask: Ask): Control | string {
  if (isFixed(ask.action)) return FIXED[ask.action];
  const valued = VALUED[ask.action];
  const value = valued.read(ask);
  return value === undefined
    ? `Choose the ${valued.port} for this action.`
    : { control: valued.control, value };
}

function ensureTelevision(store: Store, deviceId: string, control: string): void {
  const device = store.devices.byId(deviceId);
  if (device.kind !== 'television')
    throw new ApiError('invalid_request', `${device.name} is not a TV.`);
  if (targetCapability(device, control)?.writable !== true)
    throw new ApiError('command_refused', `${device.name} does not support this.`);
}

function tvControl(ports: TvEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    const planned = controlOf(ask);
    if (typeof planned === 'string') return invalid(planned);
    try {
      ensureTelevision(ports.store, ask.tv, planned.control);
      await ports.setter.set(
        {
          target: { kind: 'devices', deviceIds: [ask.tv] },
          control: planned.control,
          value: () => planned.value,
          percent: false,
          serialised: false,
          requireAll: true,
          mode: modeOf(request),
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function tvEffects(ports: TvEffectPorts): EffectHandlers {
  return { 'tv.control': tvControl(ports) };
}
