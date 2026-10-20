import { orientationOf, signalQualityOf, type SignalQuality } from '@smarteverything/ble';
import {
  BOTTLE_LOW_BATTERY_PCT,
  bottleDaysLeft,
  bottleFaultName,
  type BottleBatteryPoint,
  type BottleCap,
  type BottleCharging,
  type BottleOrientation,
} from '@smarteverything/domain';
import type { BottleLogsRepository } from '../../store/repositories/bottle-logs';
import type { BottleReadingsRepository } from '../../store/repositories/bottle-readings';
import type { BottleEntryConfig } from './config';
import { SNAP, type Snapshots } from './snapshots';

interface SummaryDeps {
  readonly readings: Pick<BottleReadingsRepository, 'newestAccepted'>;
  readonly logs: Pick<BottleLogsRepository, 'battery' | 'newestBattery' | 'faults'>;
  readonly snapshots: Pick<Snapshots, 'get'>;
  readonly now: () => Date;
}

const MS_PER_SECOND = 1000;

const BATTERY_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

const LOCKOUT_PCT = 5;

const PCT_MAX = 110;

export function isoOfSeconds(seconds: number): string {
  return new Date(seconds * MS_PER_SECOND).toISOString();
}

export interface Level {
  readonly ml: number | null;
  readonly pct: number | null;
  readonly at: string | null;
  readonly quality: SignalQuality | null;
  readonly reliable: boolean;
}

export function levelOf(deps: SummaryDeps, deviceId: string, config: BottleEntryConfig): Level {
  const reading = deps.readings.newestAccepted(deviceId);
  if (reading?.volumeMl === undefined || reading.volumeMl === null) {
    return { ml: null, pct: null, at: null, quality: null, reliable: false };
  }
  const quality = signalQualityOf(reading.kcps);
  return {
    ml: reading.volumeMl,
    pct: Math.min(PCT_MAX, Math.round((reading.volumeMl / config.body) * 100)),
    at: isoOfSeconds(reading.at),
    quality,
    reliable: quality !== 'weak',
  };
}

export function batteryPointsOf(deps: SummaryDeps, deviceId: string): BottleBatteryPoint[] {
  const to = Math.floor(deps.now().getTime() / MS_PER_SECOND);
  const from = to - Math.floor((BATTERY_WINDOW_DAYS * DAY_MS) / MS_PER_SECOND);
  return deps.logs
    .battery(deviceId, { from, to })
    .map((point) => ({ at: isoOfSeconds(point.at), pct: point.pct }));
}

function chargingOf(state: string): BottleCharging {
  if (state === 'charging' || state === 'charged') {
    return state;
  }
  return 'not_charging';
}

export function orientationSnapshotOf(
  deps: Pick<SummaryDeps, 'snapshots'>,
  deviceId: string,
): { orientation: BottleOrientation; x: number; y: number; z: number; at: string } | null {
  const read = deps.snapshots.get(deviceId, SNAP.orientation);
  return read === undefined
    ? null
    : { orientation: orientationOf(read.value), ...read.value, at: read.at };
}

const CLEANING_STATES: ReadonlySet<string> = new Set([
  'uv_maintenance',
  'uv_normal',
  'uv_adventure',
]);

const LOCKED_STATES: ReadonlySet<string> = new Set(['all_off', 'locked']);

function stateOf(
  deps: Pick<SummaryDeps, 'snapshots'>,
  deviceId: string,
): {
  readonly state: string;
  readonly stateCode: number | null;
  readonly at: string | null;
} {
  const read = deps.snapshots.get(deviceId, SNAP.uiState);
  if (read === undefined) {
    return { state: 'unknown', stateCode: null, at: null };
  }
  const { state, stateCode } = read.value;
  return { state: state.startsWith('unknown') ? 'unknown' : state, stateCode, at: read.at };
}

function faultOf(deps: SummaryDeps, deviceId: string, state: string): string | null {
  if (state !== 'fault') {
    return null;
  }
  const newest = deps.logs.faults(deviceId, 1)[0];
  return newest === undefined ? 'The cap reports a fault' : bottleFaultName(newest.type);
}

function lowBatteryOf(
  deps: Pick<SummaryDeps, 'snapshots'>,
  deviceId: string,
  state: string,
  pct: number | null,
): boolean {
  const alert =
    deps.snapshots.get(deviceId, SNAP.lowBattery)?.value.alertPct ?? BOTTLE_LOW_BATTERY_PCT;
  return state === 'battery_low' || (pct !== null && pct <= alert);
}

export function capOf(deps: SummaryDeps, deviceId: string): BottleCap {
  const { state, stateCode, at } = stateOf(deps, deviceId);
  const pct = deps.logs.newestBattery(deviceId)?.pct ?? null;
  return {
    state,
    stateCode,
    at,
    charging: chargingOf(state),
    batteryPct: pct,
    daysLeft: bottleDaysLeft(batteryPointsOf(deps, deviceId), LOCKOUT_PCT),
    lowBattery: lowBatteryOf(deps, deviceId, state, pct),
    locked: LOCKED_STATES.has(state),
    interlock: state === 'uv_interlock',
    cleaning: CLEANING_STATES.has(state),
    fault: faultOf(deps, deviceId, state),
  };
}
