import {
  BELT_STEP_KMH,
  zoneOf,
  RUN_ABOVE_KMH,
  WALK_BELOW_KMH,
  type BeltLinkPhase,
  type BeltState,
  type SpeedZone,
  type TreadmillStateView,
} from '@smarteverything/domain';
import type { GaugeBand } from '../../../components/charts/gauge';
import { TREADMILL_ZONE_COLOUR } from '../../../features/device-visuals/model/treadmill-look';
import { decimal } from '../../../format/number';

export const ZONE_LABEL: Readonly<Record<SpeedZone, string>> = {
  walk: 'Walk',
  jog: 'Jog',
  run: 'Run',
};

export const ZONE_DOT: Readonly<Record<SpeedZone, string>> = {
  walk: 'bg-positive',
  jog: 'bg-caution',
  run: 'bg-viz-magenta',
};

const SPEED_CHIPS: readonly number[] = [3, 4.5, 6, 8];

export const HOLD_TO_START_MS = 1000;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const KM = 1000;
const STRONG_DBM = -60;
const GOOD_DBM = -75;

export const STATE_LABEL: Readonly<Record<BeltState, string>> = {
  idle: 'Ready',
  countdown: 'Starting',
  running: 'Running',
  paused: 'Paused',
  stopped: 'Stopped',
  standby: 'Standby',
  safety_stop: 'Safety stop',
  fault: 'Fault',
};

export const LINK_LABEL: Readonly<Record<BeltLinkPhase, string>> = {
  not_linked: 'Not linked',
  searching: 'Looking for the treadmill',
  connecting: 'Connecting',
  linked: 'Linked',
  busy: 'Held by another app',
  lost: 'Link lost',
};

export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / SECONDS_PER_HOUR);
  const minutes = Math.floor((whole % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = whole % SECONDS_PER_MINUTE;
  const two = (value: number): string => String(value).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${two(minutes)}:${two(rest)}`
    : `${two(minutes)}:${two(rest)}`;
}

export function distanceFigure(metres: number): { readonly value: string; readonly unit: string } {
  return { value: decimal(metres / KM, 2), unit: 'km' };
}

export function paceText(speedKmh: number): string {
  if (speedKmh <= 0) {
    return '–';
  }
  const seconds = Math.round(SECONDS_PER_HOUR / speedKmh);
  return `${clockText(seconds)} /km`;
}

export function speedText(kmh: number): string {
  return decimal(kmh, 1);
}

export function signalWord(rssi: number | null): string {
  if (rssi === null) {
    return 'Unknown';
  }
  if (rssi >= STRONG_DBM) {
    return 'Strong';
  }
  return rssi >= GOOD_DBM ? 'Good' : 'Weak';
}

export function movingZone(speedKmh: number): SpeedZone | null {
  return speedKmh > 0 ? zoneOf(speedKmh) : null;
}

const CHART_STEP_KMH = 3;
const CHART_MIN_TOP_KMH = 6;

export function chartTopKmh(peakKmh: number, maxKmh: number): number {
  const rounded = Math.ceil((peakKmh + 1) / CHART_STEP_KMH) * CHART_STEP_KMH;
  return Math.min(maxKmh, Math.max(CHART_MIN_TOP_KMH, rounded));
}

export function zoneBands(max: number): readonly GaugeBand[] {
  return [
    { upTo: WALK_BELOW_KMH, colour: TREADMILL_ZONE_COLOUR.walk },
    { upTo: RUN_ABOVE_KMH, colour: TREADMILL_ZONE_COLOUR.jog },
    { upTo: max, colour: TREADMILL_ZONE_COLOUR.run },
  ];
}

export function speedCeiling(view: Pick<TreadmillStateView, 'limits'>, remote: boolean): number {
  const { maxKmh, capKmh, remoteCapKmh } = view.limits;
  const own = capKmh ?? maxKmh;
  return remote && remoteCapKmh !== null ? Math.min(own, remoteCapKmh) : own;
}

export function steppedSpeed(
  current: number,
  direction: 1 | -1,
  limits: { readonly min: number; readonly ceiling: number },
): number {
  const next = Math.round((current + direction * BELT_STEP_KMH) * 10) / 10;
  return Math.min(limits.ceiling, Math.max(limits.min, next));
}

export function usableChips(limits: {
  readonly min: number;
  readonly ceiling: number;
}): readonly number[] {
  return SPEED_CHIPS.filter((chip) => chip >= limits.min && chip <= limits.ceiling);
}

export type Moving = 'moving' | 'still';

export function motionOf(state: BeltState): Moving {
  return state === 'running' || state === 'countdown' || state === 'paused' ? 'moving' : 'still';
}

export interface Controls {
  readonly start: { readonly enabled: boolean; readonly reason: string | null };
  readonly pause: boolean;
  readonly resume: boolean;
  readonly stop: boolean;
  readonly speed: boolean;
  readonly mode: { readonly enabled: boolean; readonly reason: string | null };
}

const LINK_REASON = 'The treadmill is not linked to a phone yet.';

const CHILD_LOCK_REASON = 'Child lock is on; turn it off in the settings.';

const MODE_REASON = 'Change mode after stopping.';

function isResting(state: BeltState): boolean {
  return state === 'idle' || state === 'stopped' || state === 'standby';
}

function startReasonOf(view: TreadmillStateView): string | null {
  if (view.link.phase !== 'linked') {
    return LINK_REASON;
  }
  if (view.pad.childLock === true) {
    return CHILD_LOCK_REASON;
  }
  return view.start.allowed ? null : view.start.reason;
}

function motionControls(
  view: TreadmillStateView,
  state: BeltState,
): Omit<Controls, 'start' | 'mode'> {
  const linked = view.link.phase === 'linked';
  const live = state === 'running' || state === 'paused' || state === 'countdown';
  return {
    pause: linked && state === 'running' && view.start.allowed,
    resume: linked && state === 'paused' && view.start.allowed,
    stop: linked && live,
    speed: linked && state === 'running',
  };
}

export function controlsOf(view: TreadmillStateView, state: BeltState): Controls {
  const resting = isResting(state);
  const reason = resting ? startReasonOf(view) : null;
  return {
    ...motionControls(view, state),
    start: { enabled: resting && reason === null, reason },
    mode: {
      enabled: view.link.phase === 'linked' && resting,
      reason: resting ? null : MODE_REASON,
    },
  };
}

export type StateTone = 'positive' | 'warning' | 'critical' | 'neutral';

const STATE_TONE: Readonly<Record<BeltState, StateTone>> = {
  idle: 'neutral',
  countdown: 'warning',
  running: 'positive',
  paused: 'warning',
  stopped: 'neutral',
  standby: 'neutral',
  safety_stop: 'critical',
  fault: 'critical',
};

export function stateTone(state: BeltState): StateTone {
  return STATE_TONE[state];
}

export function linkLine(link: TreadmillStateView['link']): string {
  const holder = link.holderIsYou ? 'this phone' : (link.holderName ?? 'another phone');
  if (link.phase === 'busy' || link.holderName === null) {
    return link.phase === 'linked'
      ? `Linked through ${holder} · ${signalWord(link.rssi)} signal`
      : LINK_LABEL[link.phase];
  }
  if (link.phase !== 'linked') {
    return `${LINK_LABEL[link.phase]} · held by ${holder}`;
  }
  return `Linked through ${holder} · ${signalWord(link.rssi)} signal`;
}
