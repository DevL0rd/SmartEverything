import {
  COUNTERFEIT_GRACE_SECONDS,
  SONICARE_HEAD_LIFETIME_SECONDS,
  sessionsLeftOf,
  wearPercentOf,
  type SonicareProfile,
} from '@smarteverything/domain';
import { settingFlags } from '@smarteverything/ble';
import type { BrandValues, CapabilityEntry, ValuesContext } from '../toothbrush/brand';
import type { BrushState } from './state';

const DEFAULT_ROUTINE_SECONDS = 120;

type Metrics = [string, number][];

function motorHours(seconds: number): number {
  return Math.round(seconds / 360) / 10;
}

function routine(state: BrushState, context: ValuesContext): CapabilityEntry[] {
  const { touched } = context;
  const entries: CapabilityEntry[] = [];
  if (touched.has('mode') && state.mode !== null) {
    entries.push(['brush_mode', state.mode]);
  }
  if (touched.has('intensity') && state.intensity !== null) {
    entries.push(['brush_intensity', state.intensity]);
  }
  if (touched.has('routine') && state.routineS !== null) {
    entries.push(['brush_routine_seconds', state.routineS]);
  }
  return entries;
}

function power(state: BrushState, context: ValuesContext, metrics: Metrics): CapabilityEntry[] {
  const { battery, batteryMillivolts } = state;
  if (!context.touched.has('battery') || battery === null) {
    return [];
  }
  metrics.push(['battery', battery]);
  if (batteryMillivolts !== null) {
    metrics.push(['brush_battery_mv', batteryMillivolts]);
  }
  return [['battery', battery]];
}

function head(
  state: BrushState,
  profile: SonicareProfile,
  context: ValuesContext,
  metrics: Metrics,
): CapabilityEntry[] {
  if (!context.touched.has('head') || profile.head === 'none') {
    return [];
  }
  const facts = state.head;
  const fitting = state.headState(context.brushedSeconds, COUNTERFEIT_GRACE_SECONDS);
  const entries: CapabilityEntry[] = fitting === null ? [] : [['brush_head', fitting]];
  if (facts.type !== null && profile.head === 'full') {
    entries.push(['brush_head_type', facts.type]);
  }
  if (facts.usageS !== null && fitting === 'fitted') {
    const limit = facts.limitS ?? SONICARE_HEAD_LIFETIME_SECONDS;
    const wear = wearPercentOf(facts.usageS, limit);
    metrics.push(['brush_head_wear', wear]);
    entries.push(
      ['brush_head_wear', wear],
      [
        'brush_head_sessions_left',
        sessionsLeftOf(facts.usageS, state.routineS ?? DEFAULT_ROUTINE_SECONDS, limit),
      ],
    );
  }
  return entries;
}

function settings(
  state: BrushState,
  profile: SonicareProfile,
  context: ValuesContext,
): CapabilityEntry[] {
  const bits = state.extras.settingsBits;
  if (!context.touched.has('settings') || bits === null || !profile.settingsWrite) {
    return [];
  }
  const flags = settingFlags(bits);
  return [
    ['brush_feedback_pressure', flags.pressure],
    ['brush_feedback_scrubbing', flags.scrubbing],
    ['brush_adaptive_intensity', flags.adaptive],
  ];
}

function motor(
  state: BrushState,
  profile: SonicareProfile,
  context: ValuesContext,
  metrics: Metrics,
): CapabilityEntry[] {
  const seconds = state.motorSeconds;
  if (!context.touched.has('motor') || seconds === null || !profile.motorRuntime) {
    return [];
  }
  const hours = motorHours(seconds);
  metrics.push(['brush_motor_hours', hours]);
  return [['brush_motor_hours', hours]];
}

export function sonicareValues(
  state: BrushState,
  profile: SonicareProfile,
  context: ValuesContext,
): BrandValues {
  const metrics: Metrics = [];
  return {
    entries: [
      ...routine(state, context),
      ...power(state, context, metrics),
      ...head(state, profile, context, metrics),
      ...settings(state, profile, context),
      ...motor(state, profile, context, metrics),
    ],
    metrics,
    events: [],
  };
}
