import {
  UNSET_FITNESS_GOALS,
  WATCH_STATE,
  effectiveFitnessGoals,
  type HealthMetric,
  type WatchPhase,
} from '@smarteverything/domain';
import type { PhoneWatchStatus } from '../../../modules/health-connect';
import { useDayKey } from '../../store/clock';
import { useActiveProfile } from '../../store/people';
import { rowsOf, type Device, type StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import {
  useTodayFigure,
  useTodaySteps,
  type LiveMetric,
  type StepsReading,
  type TodaySteps,
  type WatchLive,
} from '../device-visuals';
import { latestDaily } from './daily-index';
import { usePhoneWatch } from './watch-link';
import { isLocalWatch } from './watch-status';

export function useMyWatch(): Device | null {
  const profileId = useActiveProfile()?.id ?? null;
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.devices).find(
        (device) => isLocalWatch(device) && device.details['profileId'] === profileId,
      ) ?? null,
    Object.is,
    [profileId],
  );
}

interface DayFigure {
  readonly day: string;
  readonly value: number;
}

export interface WatchGlance {
  readonly steps: TodaySteps | null;
  readonly stepsGoal: number;
  readonly heartRate: number | null;
  readonly resting: DayFigure | null;
  readonly sleep: DayFigure | null;
  readonly distance: number | null;
  readonly energy: number | null;
  readonly battery: number | null;
  readonly charging: boolean;
  readonly worn: boolean | null;
  readonly phase: WatchPhase | null;
  readonly syncing: boolean;
  readonly syncedAt: string | null;
  readonly onThisPhone: boolean;
  readonly today: string;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

interface Status {
  readonly battery: number | null;
  readonly charging: boolean;
  readonly worn: boolean | null;
  readonly phase: WatchPhase | null;
  readonly heartRate: number | null;
  readonly syncing: boolean;
  readonly syncedAt: string | null;
}

function reportedStatus(watch: Device): Status {
  const details = watch.details;
  const phase = WATCH_STATE.shape.phase.safeParse(details['phase']);
  return {
    battery: numberOf(details['battery']),
    charging: details['charging'] === true,
    worn: typeof details['worn'] === 'boolean' ? details['worn'] : null,
    phase: phase.success ? phase.data : null,
    heartRate: null,
    syncing: false,
    syncedAt: textOf(details['lastSyncAt']),
  };
}

function phoneStatus(phone: PhoneWatchStatus): Status {
  const worn = phone.worn;
  return {
    battery: phone.battery,
    charging: phone.charging === true,
    worn,
    phase: phone.phase,
    heartRate:
      worn === true && phone.heartRate !== null && phone.heartRate > 0 ? phone.heartRate : null,
    syncing: phone.syncing,
    syncedAt: phone.lastSyncAt,
  };
}

interface DailyFacts {
  readonly resting: DayFigure | null;
  readonly sleep: DayFigure | null;
}

function latestOf(
  state: StoreState,
  metric: HealthMetric,
  profileId: string | null,
): DayFigure | null {
  const row = latestDaily(state, metric, profileId);
  return row === null ? null : { day: row.day, value: row.value };
}

function sameFigure(left: DayFigure | null, right: DayFigure | null): boolean {
  return left?.day === right?.day && left?.value === right?.value;
}

function sameFacts(left: DailyFacts, right: DailyFacts): boolean {
  return sameFigure(left.resting, right.resting) && sameFigure(left.sleep, right.sleep);
}

function todayValue(
  state: StoreState,
  metric: HealthMetric,
  profileId: string | null,
  today: string,
): number | null {
  const latest = latestOf(state, metric, profileId);
  return latest?.day === today ? latest.value : null;
}

function useDailyFacts(profileId: string | null): DailyFacts {
  return useStoreSelector(
    (state) => ({
      resting: latestOf(state, 'resting_heart_rate', profileId),
      sleep: latestOf(state, 'sleep', profileId),
    }),
    sameFacts,
  );
}

export function phoneSteps(phone: PhoneWatchStatus | null): StepsReading | null {
  return phone?.steps === null || phone?.steps === undefined || phone.phase !== 'connected'
    ? null
    : { value: phone.steps, at: phone.updatedAt };
}

export interface LiveToday {
  readonly metric: LiveMetric;
  readonly value: number;
}

export function useMyLiveToday(): readonly LiveToday[] {
  const watch = useMyWatch();
  const phone = usePhoneWatch(watch?.id ?? '');
  const figures = [
    { metric: 'steps' as const, figure: useTodayFigure(watch, 'steps', phoneSteps(phone)) },
    { metric: 'active_energy' as const, figure: useTodayFigure(watch, 'active_energy') },
  ];
  return figures.flatMap(({ metric, figure }) =>
    figure?.live === true ? [{ metric, value: figure.value }] : [],
  );
}

function liveOf(phone: PhoneWatchStatus | null, status: Status): WatchLive {
  return {
    steps: phoneSteps(phone),
    heartRate: status.heartRate,
    battery: status.battery,
    syncing: status.syncing,
  };
}

export function useWatchGlance(watch: Device): {
  readonly glance: WatchGlance;
  readonly live: WatchLive;
  readonly phone: PhoneWatchStatus | null;
} {
  const today = useDayKey();
  const phone = usePhoneWatch(watch.id);
  const status = phone === null ? reportedStatus(watch) : phoneStatus(phone);
  const live = liveOf(phone, status);
  const steps = useTodaySteps(watch, live.steps);
  const profile = useActiveProfile();
  const facts = useDailyFacts(textOf(watch.details['profileId']));
  const distance = useStoreSelector((state) =>
    todayValue(state, 'distance', textOf(watch.details['profileId']), today),
  );
  const energy = useTodayFigure(watch, 'active_energy')?.value ?? null;
  const goal = effectiveFitnessGoals(profile?.fitness_goals ?? UNSET_FITNESS_GOALS).steps;
  return {
    live,
    phone,
    glance: {
      ...facts,
      distance,
      energy,
      ...status,
      steps,
      stepsGoal: goal,
      onThisPhone: phone !== null,
      today,
    },
  };
}
