import {
  BRUSH_MODE_LABELS,
  stepsOf,
  type BrushActivity,
  type BrushIntensity,
  type BrushLinkPhase,
  type BrushMode,
  type BrushProfile,
  type BrushStateView,
  type ZoneCount,
} from '@smarteverything/domain';
import { relative } from '../../../format/time';
import { BRAND_TEXT } from './brand-text';

export const INTENSITY_RAMP: Readonly<Record<BrushIntensity, number>> = {
  low: 0.4,
  medium: 0.7,
  high: 1,
};

export const INTENSITY_LABEL: Readonly<Record<BrushIntensity, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const INTENSITY_BARS: Readonly<Record<BrushIntensity, number>> = {
  low: 1,
  medium: 2,
  high: 3,
};

export const ACTIVITY_LABEL: Readonly<Record<BrushActivity, string>> = {
  asleep: 'Asleep',
  standby: 'Awake',
  brushing: 'Brushing',
  paused: 'Paused',
  charging: 'Charging',
  off: 'Off',
};

export const LINK_LABEL: Readonly<Record<BrushLinkPhase, string>> = {
  asleep: 'Asleep',
  searching: 'Searching',
  connecting: 'Connecting',
  linked: 'Linked now',
  busy: 'Busy',
  needs_pairing: 'Needs pairing',
  bluetooth_off: 'Bluetooth is off',
};

const STRONG_RSSI = -60;
const GOOD_RSSI = -75;

export function signalWord(rssi: number | null): string {
  if (rssi === null) {
    return 'Not measured';
  }
  if (rssi >= STRONG_RSSI) {
    return 'Strong';
  }
  return rssi >= GOOD_RSSI ? 'Good' : 'Weak';
}

export function hourText(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function modeLabel(mode: BrushMode | null): string {
  return mode === null ? 'No mode yet' : BRUSH_MODE_LABELS[mode];
}

export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

export function secondsText(seconds: number): string {
  const whole = Math.round(seconds);
  return whole >= 60 ? clockText(whole) : `${String(whole)} s`;
}

export function isBrushingNow(activity: BrushActivity): boolean {
  return activity === 'brushing' || activity === 'paused';
}

function heardLine(view: BrushStateView, now: number): string {
  const { lastHeardAt } = view.link;
  return lastHeardAt === null
    ? 'Not heard yet. Lift the brush from its charger near your phone.'
    : `Last heard ${relative(lastHeardAt, now)}`;
}

export function linkLine(view: BrushStateView, now: number): string {
  const { link } = view;
  switch (link.phase) {
    case 'linked':
      return link.fetching > 0 ? 'Linked now, fetching earlier sessions' : 'Linked now';
    case 'busy':
      return `Another app may be using the brush. Close the ${BRAND_TEXT[view.profile.brand].appName} and lift the brush again.`;
    case 'needs_pairing':
      return 'Forget the brush in Bluetooth settings, then run the setup again.';
    case 'bluetooth_off':
      return 'Bluetooth is off on the phone that holds the brush.';
    case 'asleep':
    case 'searching':
    case 'connecting':
      return heardLine(view, now);
  }
}

export function syncedChip(view: BrushStateView, now: number): string | null {
  if (view.link.lastHeardAt === null) {
    return null;
  }
  return view.link.phase === 'linked' ? 'Live' : `Synced ${relative(view.link.lastHeardAt, now)}`;
}

export function subtitleOf(view: BrushStateView): string {
  const { frame, mine, today } = view;
  if (frame.session === 'running' || frame.session === 'paused') {
    return `${ACTIVITY_LABEL[frame.activity]} ${clockText(frame.elapsedS)}`;
  }
  if (!mine || today === null) {
    return ACTIVITY_LABEL[frame.activity];
  }
  return `${String(today.counted)} of ${String(today.goalSessions)} today`;
}

export interface Step {
  readonly zone: number | null;
  readonly state: 'done' | 'current' | 'todo';
}

export function stepBar(
  mode: BrushMode,
  zones: ZoneCount,
  routineS: number,
  elapsedS: number,
): readonly Step[] {
  const steps = stepsOf(mode, zones);
  if (steps.length === 0) {
    return [{ zone: null, state: elapsedS >= routineS ? 'done' : 'current' }];
  }
  const each = routineS / steps.length;
  const current = Math.min(steps.length - 1, Math.floor(elapsedS / each));
  return steps.map((zone, index): Step => ({
    zone,
    state:
      elapsedS >= routineS || index < current ? 'done' : index === current ? 'current' : 'todo',
  }));
}

export function summaryOf(profile: BrushProfile, view: BrushStateView): string {
  const parts = [ACTIVITY_LABEL[view.frame.activity], modeLabel(view.frame.mode)];
  if (view.battery.percent !== null) {
    parts.push(`battery ${String(Math.round(view.battery.percent))} percent`);
  }
  if (profile.head !== 'none' && view.head.wearPercent !== null) {
    parts.push(`brush head ${String(view.head.wearPercent)} percent worn`);
  }
  return parts.join(', ');
}
