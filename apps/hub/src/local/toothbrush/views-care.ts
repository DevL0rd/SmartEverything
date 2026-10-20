import {
  batteryRun,
  windowOf,
  type BrushView,
  type BrushingSession,
  type DeviceRow,
} from '@smarteverything/domain';
import { entrySettingsOf } from './config';
import type { HandleView, HeadView, ViewContext } from './brand';
import type { DeviceState } from './fleet';
import type { ViewDeps } from './view-deps';

type StateView = Extract<BrushView, { readonly view: 'state' }>;

type BatteryView = StateView['battery'];

export function viewContextOf(deps: ViewDeps, device: DeviceRow, state: DeviceState): ViewContext {
  return {
    deps,
    device,
    entry: state.entry,
    brushedSeconds: state.runtime.machine.brushedSeconds,
    faulty: state.sent.get('brush_fault') === true,
  };
}

export function headViewOf(deps: ViewDeps, device: DeviceRow, state: DeviceState): HeadView {
  return state.runtime.brand.headView(viewContextOf(deps, device, state));
}

export function handleViewOf(deps: ViewDeps, device: DeviceRow, state: DeviceState): HandleView {
  return state.runtime.brand.handleView(viewContextOf(deps, device, state));
}

export function batteryViewOf(deps: ViewDeps, device: DeviceRow, state: DeviceState): BatteryView {
  const settings = entrySettingsOf(state.entry);
  const { battery, batteryMillivolts, activity } = state.runtime.state;
  const levels = deps.series(device.id, 'battery').points;
  const run = batteryRun(levels.map((point) => ({ at: point.at, percent: point.value })));
  return {
    percent: battery,
    millivolts: batteryMillivolts,
    daysLeft: run.daysLeft,
    low: battery !== null && battery <= settings.alerts.batteryLowPercent,
    charging: activity === 'charging',
  };
}

export function headTimeline(
  deps: ViewDeps,
  device: DeviceRow,
  state: DeviceState,
): Extract<BrushView, { readonly view: 'head' }> {
  const context = viewContextOf(deps, device, state);
  return {
    view: 'head',
    head: state.runtime.brand.headView(context),
    ...state.runtime.brand.headTimeline(context),
  };
}

export function batteryView(
  deps: ViewDeps,
  device: DeviceRow,
  state: DeviceState,
): Extract<BrushView, { readonly view: 'battery' }> {
  const levels = deps.series(device.id, 'battery').points;
  const volts = deps.series(device.id, 'brush_battery_mv').points;
  const run = batteryRun(levels.map((point) => ({ at: point.at, percent: point.value })));
  const levelAt = new Map(levels.map((point) => [point.at, point.value]));
  return {
    view: 'battery',
    battery: batteryViewOf(deps, device, state),
    levels: levels.map((point) => ({ at: point.at, value: point.value })),
    millivolts: volts.flatMap((point) => {
      const percent = levelAt.get(point.at);
      return percent === undefined ? [] : [{ at: point.at, millivolts: point.value, percent }];
    }),
    charges: [...run.charges],
    daysPerCharge: [...run.daysPerCharge],
  };
}

export function handleView(
  deps: ViewDeps,
  device: DeviceRow,
  state: DeviceState,
  sessions: readonly BrushingSession[],
): Extract<BrushView, { readonly view: 'handle' }> {
  const weeks = new Map<string, number>();
  for (const session of sessions) {
    const week = windowOf('week', session.startedAt.slice(0, 10)).from;
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }
  return {
    view: 'handle',
    handle: handleViewOf(deps, device, state),
    motorHours: deps.series(device.id, 'brush_motor_hours').points.map((point) => ({
      at: point.at,
      value: point.value,
    })),
    sessionsByWeek: [...weeks].map(([weekStart, count]) => ({ weekStart, sessions: count })),
  };
}
