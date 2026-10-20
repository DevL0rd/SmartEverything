import {
  gradeOf,
  metOf,
  openSummary,
  type BeltState,
  type HeartRateSource,
  type InclineScale,
  type SessionSummary,
  type ClientRow,
  type DeviceRow,
  type TreadmillLiveFrame,
  type TreadmillLiveNotice,
  type TreadmillReading,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DeviceState } from './fleet';

const HEART_RATE_FRESH_MS = 120_000;

export interface WalkerFacts {
  readonly profileId: string | null;
  readonly weightKg: number | null;
}

export function weightOf(
  store: Pick<Store, 'bodyReadings'>,
  profileId: string | null,
): number | null {
  if (profileId === null) {
    return null;
  }
  return store.bodyReadings
    .ofProfile(profileId)
    .reduce<number | null>((latest, reading) => reading.weight_kg ?? latest, null);
}

export function watchHeartRate(
  store: Pick<Store, 'devices'>,
  profileId: string | null,
  now: Date,
): number | null {
  if (profileId === null) {
    return null;
  }
  const watch = store.devices
    .list()
    .find(
      (device) =>
        device.provider === 'local' &&
        device.external_id.startsWith('xiaomi_watch:') &&
        device.details['profileId'] === profileId,
    );
  const rate = watch?.details['heartRate'];
  const reported = watch?.details['reportedAt'];
  const fresh =
    typeof reported === 'string' && now.getTime() - Date.parse(reported) < HEART_RATE_FRESH_MS;
  return typeof rate === 'number' && rate > 0 && fresh ? rate : null;
}

export function mayShowBody(
  client: Pick<ClientRow, 'role'>,
  profileId: string,
  walker: string | null,
): boolean {
  return client.role === 'owner' || (walker !== null && profileId === walker);
}

export type LiveState = Pick<DeviceState, 'runtime' | 'cadence' | 'link'> & {
  readonly keeper: Pick<DeviceState['keeper'], 'figures'>;
};

export interface FrameFacts {
  readonly state: LiveState;
  readonly at: string;
  readonly walker: WalkerFacts;
  readonly heartRate: number | null;
  readonly scale: InclineScale;
}

export function shownState(state: BeltState, runtime: DeviceState['runtime']): BeltState {
  const quiet = state === 'idle' || state === 'stopped';
  return runtime.supplement.mode === 'sleep' && quiet ? 'standby' : state;
}

export function heartSourceOf(
  store: Pick<Store, 'devices'>,
  state: Pick<DeviceState, 'runtime'>,
  profileId: string | null,
  now: Date,
): HeartRateSource | null {
  if (positive(state.runtime.machine.live.heartRate) !== null) {
    return 'grips';
  }
  return watchHeartRate(store, profileId, now) === null ? null : 'watch';
}

function inclineOf(
  live: TreadmillReading,
  scale: InclineScale,
): Pick<
  TreadmillLiveFrame['belt'],
  'inclinePercent' | 'inclineTarget' | 'inclineGrade' | 'inclineScale'
> {
  return {
    inclinePercent: live.inclinePercent ?? null,
    inclineTarget: live.targetInclinePercent ?? null,
    inclineGrade: live.inclinePercent === undefined ? null : gradeOf(live.inclinePercent, scale),
    inclineScale: scale,
  };
}

function beltOf(state: LiveState, scale: InclineScale): TreadmillLiveFrame['belt'] {
  const { machine, pad, controlLost } = state.runtime;
  const live = machine.live;
  return {
    state: shownState(machine.state, state.runtime),
    mode: live.mode ?? null,
    speedKmh: live.speedKmh ?? 0,
    targetSpeedKmh: live.targetSpeedKmh ?? null,
    timeS: live.timeS ?? 0,
    distanceM: live.distanceM ?? 0,
    steps: live.steps ?? null,
    cadence: state.cadence,
    ...inclineOf(live, scale),
    button: live.button ?? null,
    childLock: pad.childLock ?? null,
    controlLost,
    link: state.link.phase,
  };
}

function sessionOf(summary: SessionSummary | null, climbM: number): TreadmillLiveFrame['session'] {
  return summary === null
    ? null
    : {
        startedAt: summary.startedAt,
        activeSeconds: summary.activeSeconds,
        pausedSeconds: summary.pausedSeconds,
        zones: summary.zones,
        maxKmh: summary.maxKmh,
        splits: summary.splits,
        climbM,
      };
}

function positive(value: number | undefined): number | null {
  return value !== undefined && value > 0 ? value : null;
}

function heartOf(
  live: TreadmillReading,
  watchRate: number | null,
): Pick<NonNullable<TreadmillLiveFrame['body']>, 'heartRate' | 'heartRateSource'> {
  const grips = positive(live.heartRate);
  if (grips !== null) {
    return { heartRate: grips, heartRateSource: 'grips' };
  }
  return { heartRate: watchRate, heartRateSource: watchRate === null ? null : 'watch' };
}

function bodyOf(
  summary: SessionSummary | null,
  walker: WalkerFacts,
  state: LiveState,
  watchRate: number | null,
): TreadmillLiveFrame['body'] {
  const live = state.runtime.machine.live;
  const figures = state.keeper.figures();
  const belt = positive(live.energyKcal);
  const kcal = belt ?? figures.kcal;
  if (summary === null) {
    return null;
  }
  return {
    kcal: kcal ?? 0,
    kcalNet: figures.kcalNet ?? 0,
    met:
      kcal === null || walker.weightKg === null
        ? null
        : metOf(kcal, walker.weightKg, summary.activeSeconds),
    weightKg: walker.weightKg,
    kcalSource: kcal === null ? null : belt === null ? figures.kcalSource : 'belt',
    ...heartOf(live, watchRate),
  };
}

export function liveFrameOf(facts: FrameFacts, bodyVisible: boolean): TreadmillLiveFrame {
  const summary = openSummary(facts.state.runtime.machine, facts.at);
  return {
    at: facts.at,
    belt: beltOf(facts.state, facts.scale),
    session: sessionOf(summary, facts.state.keeper.figures().climbM),
    body: bodyVisible ? bodyOf(summary, facts.walker, facts.state, facts.heartRate) : null,
  };
}

export function noticeOf(
  device: Pick<DeviceRow, 'id'>,
  frame: TreadmillLiveFrame,
): TreadmillLiveNotice {
  return { type: 'treadmill_live', deviceId: device.id, frame };
}
