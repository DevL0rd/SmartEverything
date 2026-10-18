import { inputLabel } from './television-inputs';
import { currentApp } from './television-apps';
import { tvKeyMap, type TvKeyMap } from './television-routes';
import {
  tvMode,
  type TvDevice,
  type TvMode,
  type TvPaths,
  type TvValues,
} from './television-values';

export interface TvInput {
  readonly id: string;
  readonly label: string;
  readonly name: string | null;
}

export interface TvWatching {
  readonly kind: 'app' | 'channel' | 'input' | 'none';
  readonly label: string;
}

export interface TvVolume {
  readonly level: number | null;
  readonly muted: boolean;
  readonly stale: boolean;
}

export interface TvContext {
  readonly inputsSeen?: readonly string[];
  readonly inputNames?: Readonly<Record<string, string>>;
  readonly turningOn?: boolean;
  readonly volumeObservedAt?: string;
  readonly poweredOnAt?: string;
}

export interface TvState {
  readonly mode: TvMode;
  readonly category: TvValues['category'];
  readonly watching: TvWatching;
  readonly volume: TvVolume;
  readonly inputs: readonly TvInput[];
  readonly keys: TvKeyMap;
}

function inputName(id: string, context: TvContext): string {
  return context.inputNames?.[id] ?? inputLabel(id);
}

const TUNER_INPUTS: ReadonlySet<string> = new Set(['dtv', 'digitalTv']);

function inputsOf(device: TvDevice, values: TvValues, context: TvContext): readonly TvInput[] {
  const offered = device.capabilities.flatMap((capability) =>
    capability.key === 'input_source' && capability.value.kind === 'enum'
      ? capability.value.options
      : [],
  );
  const ids = new Set([
    ...offered,
    ...(values.input === null ? [] : [values.input]),
    ...(context.inputsSeen ?? []),
  ]);
  return [...ids].map((id) => ({
    id,
    label: inputName(id, context),
    name: context.inputNames?.[id] ?? null,
  }));
}

function watchingOf(values: TvValues, mode: TvMode, context: TvContext): TvWatching {
  if (mode !== 'on') {
    return { kind: 'none', label: '' };
  }
  const app = currentApp(values.app);
  if (app !== null) {
    return { kind: 'app', label: app.name };
  }
  if (values.input !== null && TUNER_INPUTS.has(values.input) && values.channel !== null) {
    return { kind: 'channel', label: `Channel ${String(values.channel)}` };
  }
  return values.input === null
    ? { kind: 'none', label: '' }
    : { kind: 'input', label: inputName(values.input, context) };
}

function volumeOf(values: TvValues, context: TvContext): TvVolume {
  const { volumeObservedAt, poweredOnAt } = context;
  const stale =
    volumeObservedAt !== undefined &&
    poweredOnAt !== undefined &&
    Date.parse(volumeObservedAt) < Date.parse(poweredOnAt);
  return { level: values.volume, muted: values.muted === true, stale };
}

export function tvState(
  values: TvValues,
  device: TvDevice,
  paths: TvPaths,
  context: TvContext = {},
): TvState {
  const base = tvMode(device, values, paths);
  const mode = context.turningOn === true && base === 'standby' ? 'turning_on' : base;
  return {
    mode,
    category: values.category,
    watching: watchingOf(values, mode, context),
    volume: volumeOf(values, context),
    inputs: inputsOf(device, values, context),
    keys: tvKeyMap(device, values, paths),
  };
}
