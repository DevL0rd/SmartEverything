import {
  LISTENING_POWER_MODES,
  LISTENING_POWER_MODE_LABELS,
  type ListeningPowerMode,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { BadgeTone } from '../../../components/badge';
import type { ListeningNativeState } from '../../../../modules/health-connect';

export type Drain = 0 | 1 | 2 | 3;

export interface PowerModeInfo {
  readonly mode: ListeningPowerMode;
  readonly icon: IconName;
  readonly label: string;
  readonly summary: string;
  readonly drain: Drain;
  readonly drainText: string;
}

const SUMMARY: Readonly<Record<ListeningPowerMode, string>> = {
  always: 'Listens all day, with the screen on or off.',
  screen_on: 'Listens while the screen is on or the phone is unlocked, and sleeps with it.',
  charging: 'Listens only while the phone is plugged in.',
  away_from_home:
    'Your cameras and computers already hear you at home. The phone listens when it is away from your home network.',
};

const DRAIN: Readonly<
  Record<ListeningPowerMode, { readonly level: Drain; readonly text: string }>
> = {
  always: { level: 3, text: 'Highest' },
  screen_on: { level: 1, text: 'Low' },
  charging: { level: 0, text: 'None from the battery' },
  away_from_home: { level: 2, text: 'Only while out' },
};

const ICON: Readonly<Record<ListeningPowerMode, IconName>> = {
  always: 'mic',
  screen_on: 'sun',
  charging: 'plug',
  away_from_home: 'away',
};

export const POWER_MODES: readonly PowerModeInfo[] = LISTENING_POWER_MODES.map((mode) => ({
  mode,
  icon: ICON[mode],
  label: LISTENING_POWER_MODE_LABELS[mode],
  summary: SUMMARY[mode],
  drain: DRAIN[mode].level,
  drainText: DRAIN[mode].text,
}));

export const BATTERY_ESTIMATE = 'About 1 to 3 percent an hour with the screen off while listening.';

export const BATTERY_ESTIMATE_NOTE = 'An estimate. It has not been measured on this phone yet.';

export const MEASURE_HINT =
  'To measure it, turn the listener on, leave the phone idle with the screen off for an hour, then open Settings, Battery, Battery usage and read SmartEverything.';

export function powerModeInfo(mode: ListeningPowerMode): PowerModeInfo {
  const found = POWER_MODES.find((info) => info.mode === mode);
  if (found === undefined) throw new UnknownPowerModeError(mode);
  return found;
}

class UnknownPowerModeError extends Error {
  override readonly name = 'UnknownPowerModeError';

  constructor(mode: string) {
    super(`No power mode ${mode}.`);
  }
}

export function batteryNote(mode: ListeningPowerMode): string {
  switch (mode) {
    case 'always':
      return BATTERY_ESTIMATE;
    case 'away_from_home':
      return `${BATTERY_ESTIMATE} Only while you are away from home.`;
    case 'screen_on':
      return 'The extra cost is small, because the phone is awake anyway.';
    case 'charging':
      return 'It does not use the battery, because it only listens while charging.';
  }
}

export interface EarFacts {
  readonly wake: boolean;
  readonly mode: ListeningPowerMode;
  readonly native: ListeningNativeState;
  readonly microphone: 'unknown' | 'granted' | 'denied';
  readonly offline: boolean;
}

export interface EarStatus {
  readonly tone: BadgeTone;
  readonly label: string;
  readonly detail: string;
}

const WAITING: Readonly<Record<ListeningPowerMode, string>> = {
  always: 'It is not running yet. Open SmartEverything once so Android lets it start.',
  screen_on: 'Starts when the screen turns on.',
  charging: 'Starts when you plug the phone in.',
  away_from_home: 'Starts when the phone leaves your home network.',
};

export function earStatus(facts: EarFacts): EarStatus {
  const { wake, native } = facts;
  if (!wake) {
    return {
      tone: 'neutral',
      label: 'Off',
      detail: 'This phone does not listen for the AI’s name.',
    };
  }
  if (facts.offline) {
    return {
      tone: 'neutral',
      label: 'Hub not reachable',
      detail: 'Changes need a connection to your hub.',
    };
  }
  if (facts.microphone === 'denied') {
    return {
      tone: 'warning',
      label: 'Needs the microphone',
      detail: 'Allow the microphone to start listening.',
    };
  }
  switch (native.status) {
    case 'listening':
      return {
        tone: 'positive',
        label: 'Listening now',
        detail: 'Say the AI’s name anywhere in a sentence.',
      };
    case 'resting':
      return {
        tone: 'info',
        label: 'Resting',
        detail: native.detail ?? 'It listens again when the call ends.',
      };
    case 'unavailable':
      return {
        tone: 'critical',
        label: 'Could not start',
        detail: native.detail ?? 'Android did not allow it.',
      };
    case 'off':
      return { tone: 'neutral', label: 'Waiting', detail: WAITING[facts.mode] };
  }
}
