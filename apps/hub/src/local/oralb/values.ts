import { oralbRingOf, oralbSectorsOf, type OralbProfile } from '@smarteverything/domain';
import { reminderOf } from './reminder';
import type { BrandValues, CapabilityEntry, ValuesContext } from '../toothbrush/brand';
import type { HeadTracker } from './head';
import type { OralbState } from './state';

const DEFAULT_ROUTINE_SECONDS = 120;

type Metrics = [string, number][];

function quadrantSecondsOf(pacer: readonly number[]): number | null {
  const used = oralbSectorsOf(pacer);
  const first = used[0];
  return first !== undefined && used.every((seconds) => seconds === first) ? first : null;
}

function routine(state: OralbState, context: ValuesContext): CapabilityEntry[] {
  const { touched } = context;
  const entries: CapabilityEntry[] = [];
  if (touched.has('mode') && state.mode !== null) {
    entries.push(['brush_mode', state.mode]);
  }
  if (touched.has('routine') && state.pacer !== null) {
    const quadrant = quadrantSecondsOf(state.pacer);
    entries.push(['brush_pacer', state.routineS !== null]);
    if (state.routineS !== null) {
      entries.push(['brush_routine_seconds', state.routineS]);
    }
    if (quadrant !== null) {
      entries.push(['brush_quadrant_seconds', quadrant]);
    }
  }
  if (touched.has('ring') && state.ringDrive !== null) {
    entries.push(['brush_ring_colour', oralbRingOf(state.ringDrive)]);
  }
  return entries;
}

function power(state: OralbState, context: ValuesContext, metrics: Metrics): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  if (context.touched.has('battery') && state.battery !== null) {
    metrics.push(['battery', state.battery]);
    entries.push(['battery', state.battery]);
    const readings = [
      ['brush_battery_mv', state.batteryMillivolts],
      ['brush_battery_ma', state.batteryMilliamps],
      ['brush_battery_c', state.batteryC],
    ] as const;
    readings.forEach(([series, value]) => {
      if (value !== null) {
        metrics.push([series, value]);
      }
    });
  }
  if (context.touched.has('runtime') && state.runtimeLeftS !== null) {
    metrics.push(['brush_charge_runtime', state.runtimeLeftS]);
    entries.push(['brush_charge_runtime', state.runtimeLeftS]);
  }
  return entries;
}

interface HeadInput {
  readonly state: OralbState;
  readonly profile: OralbProfile;
  readonly tracker: HeadTracker;
}

function head(input: HeadInput, context: ValuesContext, metrics: Metrics): CapabilityEntry[] {
  const { state, profile, tracker } = input;
  const reading = state.headReading;
  if (!context.touched.has('head') || reading === null || profile.head !== 'countdown') {
    return [];
  }
  const entries: CapabilityEntry[] = [['brush_head_days_left', reading.days]];
  metrics.push(['brush_head_days_left', reading.days]);
  const reminder = reminderOf(reading.state);
  if (reminder !== null) {
    entries.push(['brush_head_reminder', reminder]);
  }
  const wear = tracker.wear(reading);
  if (wear !== null) {
    metrics.push(['brush_head_wear', wear]);
    entries.push(['brush_head_wear', wear]);
  }
  if (reading.seconds > 0) {
    const routineS = state.routineS ?? DEFAULT_ROUTINE_SECONDS;
    entries.push(['brush_head_sessions_left', Math.floor(reading.seconds / routineS)]);
  }
  return entries;
}

export function oralbValues(
  input: { readonly state: OralbState; readonly profile: OralbProfile; readonly head: HeadTracker },
  context: ValuesContext,
): BrandValues {
  const metrics: Metrics = [];
  const { state, profile } = input;
  return {
    entries: [
      ...routine(state, context),
      ...power(state, context, metrics),
      ...head({ state, profile, tracker: input.head }, context, metrics),
    ],
    metrics,
    events: input.head.drain(),
  };
}
