import {
  MICROWAVE_MODE_LABELS,
  microwaveDuration,
  microwaveProgramError,
  microwaveRemoteState,
  microwaveSeconds,
  type DeviceLogEntry,
  type JsonValue,
  type MicrowaveMode,
  type MicrowaveProgram,
} from '@smarteverything/domain';
import { duration } from '../../../format/time';
import type { DeviceValues } from '../../../store/state';
import {
  microwaveValues,
  initialProgram,
  programPowerOptions,
  type MicrowaveConfiguration,
} from './model';
import { powerWords } from './run-model';

export const QUICK_SECONDS: readonly number[] = [30, 60, 120, 300];

export interface QuickChoice {
  readonly label: string;
  readonly mode: MicrowaveMode;
  readonly program: MicrowaveProgram;
  readonly start: boolean;
  readonly unit: string;
  readonly applied: string | undefined;
}

export type QuickState =
  | { readonly kind: 'blocked'; readonly reason: string }
  | {
      readonly kind: 'ready';
      readonly primary: QuickChoice;
      readonly chips: readonly QuickChoice[];
      readonly note: string | null;
    };

function usable(mode: MicrowaveMode): boolean {
  return mode.supportedOperations.includes('set') || mode.supportedOperations.includes('start');
}

function targetMode(
  config: MicrowaveConfiguration,
  lastMode: JsonValue | undefined,
): MicrowaveMode | undefined {
  const modes = config.modes.filter(usable);
  return (
    modes.find((mode) => mode.mode === lastMode) ??
    modes.find((mode) => mode.mode === config.applied) ??
    modes.find((mode) => mode.supportedOperations.includes('start')) ??
    modes[0]
  );
}

function remembered(
  mode: MicrowaveMode,
  config: MicrowaveConfiguration,
  settings: DeviceLogEntry['settings'],
): MicrowaveProgram {
  const base = initialProgram(mode, config);
  const seconds = settings?.['seconds'];
  const temperature = settings?.['temperature'];
  const power = settings?.['power'];
  const candidate: MicrowaveProgram = {
    ...base,
    duration: typeof seconds === 'number' ? microwaveDuration(seconds) : base.duration,
    temperature: typeof temperature === 'number' ? temperature : base.temperature,
    power: typeof power === 'string' ? power : base.power,
  };
  return microwaveProgramError(candidate, mode, programPowerOptions(mode, config), config.unit) ===
    null
    ? candidate
    : base;
}

export function choiceLabel(
  mode: MicrowaveMode,
  program: MicrowaveProgram,
  start: boolean,
): string {
  const time =
    mode.supportedOptions.operationTime === undefined
      ? ''
      : duration(microwaveSeconds(program.duration));
  const power = mode.supportedOptions.powerLevel === undefined ? '' : powerWords(program.power);
  if (start) {
    return [MICROWAVE_MODE_LABELS[mode.mode] ?? mode.mode, time]
      .filter((part) => part !== '')
      .join(' ');
  }
  return ['Set', [time, power].filter((part) => part !== '').join(' · ')]
    .filter((part) => part !== '')
    .join(' ');
}

function choiceOf(
  config: MicrowaveConfiguration,
  mode: MicrowaveMode,
  program: MicrowaveProgram,
  start: boolean,
): QuickChoice {
  return {
    label: choiceLabel(mode, program, start),
    mode,
    program,
    start,
    unit: config.unit,
    applied: config.applied,
  };
}

function chipChoices(
  config: MicrowaveConfiguration,
  mode: MicrowaveMode,
  program: MicrowaveProgram,
  start: boolean,
): readonly QuickChoice[] {
  const time = mode.supportedOptions.operationTime;
  if (time === undefined) {
    return [];
  }
  const min = microwaveSeconds(time.min);
  const max = microwaveSeconds(time.max);
  const step = microwaveSeconds(time.resolution);
  return QUICK_SECONDS.filter(
    (seconds) => seconds >= min && seconds <= max && (seconds - min) % step === 0,
  ).map((seconds) => ({
    ...choiceOf(config, mode, { ...program, duration: microwaveDuration(seconds) }, start),
    label: duration(seconds),
  }));
}

export function quickState(
  config: MicrowaveConfiguration,
  values: DeviceValues,
  last: DeviceLogEntry | undefined,
): QuickState {
  const mode = targetMode(config, last?.settings?.['mode']);
  if (mode === undefined) {
    return { kind: 'blocked', reason: config.problem ?? 'No cooking modes reported yet.' };
  }
  const remote = microwaveRemoteState(microwaveValues(values), mode);
  if (remote.actions === 'none') {
    return { kind: 'blocked', reason: remote.reason };
  }
  const start = remote.actions === 'start';
  const program = remembered(mode, config, last?.settings);
  return {
    kind: 'ready',
    primary: choiceOf(config, mode, program, start),
    chips: chipChoices(config, mode, program, start),
    note: remote.reason,
  };
}
