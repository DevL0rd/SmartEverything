import {
  MICROWAVE_KEYS,
  MICROWAVE_MODE_LABELS,
  microwaveReadiness,
  microwaveReadyAt,
  microwaveSecondsLeft,
  microwaveSeconds,
  MICROWAVE_DURATION,
  type MicrowaveMode,
} from '@smarteverything/domain';
import { clock, MINUTE_MS, playTime } from '../../../format/time';
import type { DeviceValues } from '../../../store/state';
import { microwaveValues } from './model';

export type RunPhase = 'offline' | 'door_open' | 'paused' | 'running' | 'ready' | 'idle';

const READY_WINDOW_MINUTES = 10;

export interface MicrowaveRun {
  readonly phase: RunPhase;
  readonly left: number | null;
  readonly total: number | null;
  readonly progress: number | null;
  readonly readyAt: string | null;
  readonly leftMinutes: number | null;
  readonly settings: string | null;
  readonly blocked: string | null;
  readonly lamp: boolean;
  readonly locked: boolean;
  readonly ago: number | null;
  readonly watts: number | null;
  readonly mode: string | null;
}

export interface RunInput {
  readonly online: boolean;
  readonly values: DeviceValues;
  readonly spec: MicrowaveMode | undefined;
  readonly ago: number | null;
  readonly minutesLeft: number | null;
  readonly drawKey: string | null;
}

const PERCENT = 100;
const KILO = 1000;
const SECONDS_PER_MINUTE = 60;

export function finishedAgo(finishedAt: number | null, now: number): number | null {
  if (finishedAt === null) {
    return null;
  }
  const minutes = Math.max(0, Math.floor((now - finishedAt) / MINUTE_MS));
  return minutes < READY_WINDOW_MINUTES ? minutes : null;
}

export function finishedMoment(values: DeviceValues): number | null {
  const job = values[MICROWAVE_KEYS.job];
  return job?.value === 'finished' ? Date.parse(job.observedAt) : null;
}

export function powerWords(power: string): string {
  return power.endsWith('W') ? `${power.slice(0, -1)} W` : power;
}

function temperatureText(values: DeviceValues, spec: MicrowaveMode | undefined): string | null {
  const temperature = values[MICROWAVE_KEYS.temperature]?.value;
  return spec?.supportedOptions.temperature !== undefined && typeof temperature === 'number'
    ? `${String(temperature)} °C`
    : null;
}

function powerText(values: DeviceValues, spec: MicrowaveMode | undefined): string | null {
  const power = values[MICROWAVE_KEYS.power]?.value;
  return spec?.supportedOptions.powerLevel !== undefined && typeof power === 'string'
    ? powerWords(power)
    : null;
}

function settingsOf(
  values: DeviceValues,
  spec: MicrowaveMode | undefined,
  mode: string | null,
): string | null {
  if (mode === null || mode === 'NoOperation') {
    return null;
  }
  return [
    MICROWAVE_MODE_LABELS[mode] ?? mode,
    temperatureText(values, spec),
    powerText(values, spec),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function totalOf(values: DeviceValues): number | null {
  const duration = MICROWAVE_DURATION.safeParse(values[MICROWAVE_KEYS.duration]?.value);
  return duration.success ? microwaveSeconds(duration.data) : null;
}

function progressOf(
  values: DeviceValues,
  left: number | null,
  total: number | null,
): number | null {
  const reported = values[MICROWAVE_KEYS.progress]?.value;
  if (typeof reported === 'number') {
    return Math.min(1, Math.max(0, reported / PERCENT));
  }
  return left !== null && total !== null && total > 0
    ? Math.min(1, Math.max(0, 1 - left / total))
    : null;
}

function phaseOf(input: RunInput): RunPhase {
  const { online, values } = input;
  const state = values[MICROWAVE_KEYS.state]?.value;
  if (!online) {
    return 'offline';
  }
  if (values[MICROWAVE_KEYS.door]?.value === 'open') {
    return 'door_open';
  }
  if (state === 'paused' || state === 'running') {
    return state;
  }
  return input.ago === null ? 'idle' : 'ready';
}

export function readyMoment(values: DeviceValues): number | null {
  const flat = microwaveValues(values);
  return values[MICROWAVE_KEYS.state]?.value === 'running' && microwaveSecondsLeft(flat) !== null
    ? microwaveReadyAt(flat)
    : null;
}

export function minutesUntil(moment: number | null, now: number): number | null {
  return moment === null ? null : Math.max(0, Math.floor((moment - now) / MINUTE_MS));
}

function leftMinutesOf(ticking: number | null, left: number | null): number | null {
  if (ticking !== null || left === null) {
    return ticking;
  }
  return Math.floor(left / SECONDS_PER_MINUTE);
}

function timingOf(
  input: RunInput,
  phase: RunPhase,
): Pick<MicrowaveRun, 'left' | 'total' | 'progress' | 'readyAt' | 'leftMinutes'> {
  const { values } = input;
  const left = microwaveSecondsLeft(microwaveValues(values));
  const total = totalOf(values);
  const cooking = phase === 'running' || phase === 'paused';
  const ready = phase === 'running' ? readyMoment(values) : null;
  return {
    left,
    total,
    progress: cooking ? progressOf(values, left, total) : null,
    readyAt: ready === null ? null : clock(ready),
    leftMinutes: leftMinutesOf(phase === 'running' ? input.minutesLeft : null, left),
  };
}

function wattsOf(values: DeviceValues, key: string | null): number | null {
  const draw = key === null ? undefined : values[key]?.value;
  return typeof draw === 'number' ? draw : null;
}

export function drawParts(watts: number): { readonly value: string; readonly unit: string } {
  return watts >= KILO
    ? { value: (watts / KILO).toFixed(1), unit: 'kW' }
    : { value: String(Math.round(watts)), unit: 'W' };
}

function modeOf(values: DeviceValues): string | null {
  const mode = values[MICROWAVE_KEYS.mode]?.value;
  return typeof mode === 'string' ? mode : null;
}

export function microwaveRun(input: RunInput): MicrowaveRun {
  const { values, spec } = input;
  const phase = phaseOf(input);
  const lamp = values[MICROWAVE_KEYS.lamp]?.value;
  const mode = modeOf(values);
  return {
    ...timingOf(input, phase),
    phase,
    settings: settingsOf(values, spec, mode),
    blocked: input.online ? microwaveReadiness(microwaveValues(values)) : null,
    lamp: lamp !== undefined && lamp !== 'off',
    locked: values[MICROWAVE_KEYS.lock]?.value === 'locked',
    ago: input.ago,
    watts: wattsOf(values, input.drawKey),
    mode,
  };
}

export function minutesLeftParts(
  minutes: number | null,
): { readonly value: string; readonly unit: string } | null {
  return minutes === null
    ? null
    : { value: minutes < 1 ? '<1' : String(minutes), unit: 'min left' };
}

export function leftText(run: Pick<MicrowaveRun, 'left'>): string | null {
  return run.left === null ? null : playTime(run.left);
}

export const PHASE_WORDS: Readonly<Record<RunPhase, string>> = {
  offline: 'Offline',
  door_open: 'Door open',
  paused: 'Paused',
  running: 'Cooking',
  ready: 'Ready',
  idle: 'Ready',
};
