import {
  audioChangeFeature,
  displayChangeFeature,
  displayChangeKeepable,
  type AudioChange,
  type ComputerFeature,
  type StepV2,
} from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';

export type AudioStep = Extract<StepV2, { do: 'audio' }>;
export type DisplayStep = Extract<StepV2, { do: 'display' }>;
export type DisplayChange = DisplayStep['change'];

export const DISPLAY_SIDES = ['left', 'right', 'above', 'below'] as const;

export const NIGHT_LIGHT_MODES = ['on', 'off', 'scheduled'] as const;

export function isComputerStep(step: StepV2): step is AudioStep | DisplayStep {
  return step.do === 'audio' || step.do === 'display';
}

export function computersOf<D extends Pick<DeviceLike, 'kind'>>(devices: readonly D[]): D[] {
  return devices.filter((device) => device.kind === 'computer');
}

export function offers(
  features: readonly ComputerFeature[] | undefined,
  feature: ComputerFeature,
): boolean {
  return features === undefined || features.includes(feature);
}

export function blankAudioChange(action: AudioChange['action']): AudioChange {
  switch (action) {
    case 'volume':
      return { action, level: 50, kind: 'output' };
    case 'mute':
      return { action, muted: true, kind: 'output' };
    case 'default':
      return { action, kind: 'output', device: '' };
    case 'app_volume':
      return { action, app: '', level: 50 };
    case 'app_mute':
      return { action, app: '', muted: true };
    case 'app_output':
      return { action, app: '', output: '' };
  }
}

export function blankDisplayChange(action: DisplayChange['action']): DisplayChange {
  switch (action) {
    case 'mode':
      return { action, output: '', width: 1920, height: 1080 };
    case 'scale':
      return { action, output: '', percent: 100 };
    case 'position':
      return { action, output: '', relativeTo: '', side: 'right' };
    case 'brightness':
      return { action, level: 50 };
    case 'night_light':
      return { action, mode: 'on' };
  }
}

export const AUDIO_ACTIONS: readonly { readonly value: AudioChange['action']; label: string }[] = [
  { value: 'volume', label: 'Set the volume' },
  { value: 'mute', label: 'Mute or unmute' },
  { value: 'default', label: 'Choose the default' },
  { value: 'app_volume', label: 'Set one app’s volume' },
  { value: 'app_mute', label: 'Mute or unmute one app' },
  { value: 'app_output', label: 'Send one app to an output' },
];

export const DISPLAY_ACTIONS: readonly {
  readonly value: DisplayChange['action'];
  label: string;
}[] = [
  { value: 'mode', label: 'Resolution and refresh rate' },
  { value: 'scale', label: 'Scale' },
  { value: 'position', label: 'Position next to another screen' },
  { value: 'brightness', label: 'Brightness' },
  { value: 'night_light', label: 'Night light' },
];

export function audioActionOffered(
  features: readonly ComputerFeature[] | undefined,
  action: AudioChange['action'],
): boolean {
  return offers(features, audioChangeFeature(blankAudioChange(action)));
}

export function displayActionOffered(
  features: readonly ComputerFeature[] | undefined,
  action: DisplayChange['action'],
): boolean {
  return offers(features, displayChangeFeature(blankDisplayChange(action)));
}

export function keepable(change: DisplayChange): boolean {
  return displayChangeKeepable(change);
}

export function withoutKeep(step: DisplayStep): DisplayStep {
  const { keep: _keep, ...rest } = step;
  return rest;
}
