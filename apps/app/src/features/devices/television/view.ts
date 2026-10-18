import {
  currentApp,
  tvPathsFor,
  tvState,
  tvValuesOf,
  withRole,
  type CurrentApp,
  type JsonValue,
  type TvContext,
  type TvDevice,
  type TvInput,
  type TvKey,
  type TvKeyReason,
  type TvMode,
  type TvValues,
  type TvVolume,
  type TelevisionSettingsRow,
  type TvWatching,
} from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';
import { REPEAT_MS } from './hold-repeat';
import { REPEATING_KEYS, SHOWN_KEYS } from './keys';

export interface TvView {
  readonly mode: TvMode;
  readonly category: 'tv' | 'monitor';
  readonly watching: TvWatching;
  readonly app: CurrentApp | null;
  readonly input: string | null;
  readonly volume: TvVolume;
  readonly inputs: readonly TvInput[];
  readonly playing: boolean;
  readonly canSetChannel: boolean;
  readonly channelRange: ChannelRange | null;
  readonly locks: Readonly<Partial<Record<TvKey, TvKeyReason>>>;
  readonly rates: Readonly<Partial<Record<TvKey, number>>>;
}

interface ChannelRange {
  readonly min: number;
  readonly max: number;
}

export interface ViewContext {
  readonly turningOn: boolean;
  readonly settings: TelevisionSettingsRow | null;
}

function tvOf(device: Device): TvDevice {
  return {
    id: device.id,
    kind: device.kind,
    model: device.model,
    online: device.online,
    capabilities: device.capabilities,
  };
}

function observedAt(device: Device, values: DeviceValues, role: 'volume' | 'power'): string | null {
  const key = withRole(deviceModelOf(device).presentation, role)?.key;
  return key === undefined ? null : (values[key]?.observedAt ?? null);
}

function stateContextOf(
  device: Device,
  values: DeviceValues,
  reported: TvValues,
  context: ViewContext,
): TvContext {
  const volumeAt = observedAt(device, values, 'volume');
  const powerAt = observedAt(device, values, 'power');
  return {
    turningOn: context.turningOn,
    ...(context.settings === null ? {} : { inputNames: context.settings.input_names }),
    ...(volumeAt === null ? {} : { volumeObservedAt: volumeAt }),
    ...(powerAt === null || reported.power !== true ? {} : { poweredOnAt: powerAt }),
  };
}

export function televisionView(device: Device, values: DeviceValues, context: ViewContext): TvView {
  const tv = tvOf(device);
  const read = (capability: string): JsonValue | undefined => values[capability]?.value;
  const reported = tvValuesOf(tv, read);
  const state = tvState(
    reported,
    tv,
    tvPathsFor(context.settings?.direct_link === true),
    stateContextOf(device, values, reported, context),
  );
  const channel = device.capabilities.find((capability) => capability.key === 'channel');
  const locks: Partial<Record<TvKey, TvKeyReason>> = {};
  const rates: Partial<Record<TvKey, number>> = {};
  for (const key of SHOWN_KEYS) {
    const entry = state.keys(key);
    if (entry.path === null) {
      locks[key] = entry.reason;
    } else if (REPEATING_KEYS.has(key)) {
      rates[key] = REPEAT_MS[entry.path];
    }
  }
  return {
    mode: state.mode,
    category: state.category,
    watching: state.watching,
    app: currentApp(reported.app),
    input: reported.input,
    volume: state.volume,
    inputs: state.inputs,
    playing: reported.playback === 'playing',
    canSetChannel: channel !== undefined && channel.access !== 'read',
    channelRange:
      channel?.value.kind === 'number' ? { min: channel.value.min, max: channel.value.max } : null,
    locks,
    rates,
  };
}
