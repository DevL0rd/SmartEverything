import {
  UNSET_FITNESS_GOALS,
  effectiveFitnessGoals,
  type BodyReadingRow,
} from '@smarteverything/domain';
import { count, decimal } from '../../../format/number';
import { counted, useActiveProfile } from '../../../store/people';
import { useDeviceValues, useSession } from '../../../store/selectors';
import type { Device, StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import type { VisualState } from '../types';
import { visualStateOf } from './visual-state';
import { useTodaySteps, type StepsReading } from './watch-steps';

interface Figure {
  readonly value: number;
  readonly at: string;
}

function sameFigure(left: Figure | null, right: Figure | null): boolean {
  return left === right || (left?.value === right?.value && left?.at === right?.at);
}

function fits(
  reading: BodyReadingRow | undefined,
  deviceId: string,
  profileId: string | null,
): reading is BodyReadingRow {
  return (
    reading?.device_id === deviceId &&
    reading.profile_id === profileId &&
    reading.weight_kg !== null &&
    counted(reading)
  );
}

function latestWeight(
  state: StoreState,
  deviceId: string,
  profileId: string | null,
): Figure | null {
  const table = state.tables.body_readings;
  let best: BodyReadingRow | null = null;
  for (const id of table.ids) {
    const reading = table.byId[id];
    if (
      fits(reading, deviceId, profileId) &&
      (best === null || reading.measured_at > best.measured_at)
    ) {
      best = reading;
    }
  }
  const weight = best?.weight_kg ?? null;
  return best === null || weight === null ? null : { value: weight, at: best.measured_at };
}

export function useDeviceVisualState(device: Device): VisualState {
  return visualStateOf(device, useDeviceValues(device.id));
}

export function useScaleVisualState(device: Device): VisualState {
  const profileId = useSession().client.profile_id;
  const weight = useStoreSelector((state) => latestWeight(state, device.id, profileId), sameFigure);
  const base = useDeviceVisualState(device);
  return weight === null
    ? base
    : { ...base, reading: { text: decimal(weight.value, 1), unit: 'kg', at: weight.at } };
}

export interface WatchLive {
  readonly steps: StepsReading | null;
  readonly heartRate: number | null;
  readonly battery: number | null;
  readonly syncing: boolean;
}

function detailNumber(device: Device, key: string): number | null {
  const value = device.details[key];
  return typeof value === 'number' ? value : null;
}

function liveFields(
  device: Device,
  live: WatchLive | null,
): Pick<VisualState, 'battery' | 'pulse' | 'syncing'> {
  if (live === null) {
    return { battery: detailNumber(device, 'battery'), pulse: null, syncing: false };
  }
  return {
    battery: live.battery ?? detailNumber(device, 'battery'),
    pulse: live.heartRate,
    syncing: live.syncing,
  };
}

export function useWatchVisualState(device: Device, live: WatchLive | null = null): VisualState {
  const steps = useTodaySteps(device, live?.steps ?? null);
  const goal = effectiveFitnessGoals(
    useActiveProfile()?.fitness_goals ?? UNSET_FITNESS_GOALS,
  ).steps;
  const watch = { ...useDeviceVisualState(device), ...liveFields(device, live) };
  if (steps === null) {
    return watch;
  }
  return {
    ...watch,
    reading: { text: count(steps.value), unit: 'steps', at: steps.at },
    progress: Math.min(1, steps.value / goal),
  };
}
