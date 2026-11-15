import type {
  PlannerColourKey,
  PlannerDay,
  PlannerRingRow,
  PlannerSleep,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import type { RingStatus } from '../../../../modules/health-connect';
import { readPlannerSleep } from '../../../api/planner';
import { href } from '../../../app-shell/hrefs';
import { notifyFailure } from '../../../components/toast-store';
import { DAY_MS, MINUTE_MS, dayKeyOf } from '../../../format/time';
import { PLANNER_PREFIX, plannerKeys } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useMinute, useMinuteOf } from '../../../store/clock';
import {
  clearPlannerRing,
  ringsQuery,
  useIncomingPlannerRing,
  usePlannerAlarms,
  usePlannerClockWrites,
  usePlannerCollections,
  usePlannerDay,
  usePlannerItems,
  usePlannerTimers,
  dueWindowOf,
  useShownRing,
} from '../../planner';
import { useHubOffline } from '../frame/hub-status';
import { snoozeOnPhone, stopOnPhone, usePhoneRing } from './ring-device';
import { phoneRingKeyOf, refKeyOf, ringIdOf, ringRefOf, type RingRef } from './ring-keys';
import {
  ringDueOf,
  ringStateOf,
  ringSubjectOf,
  type LocalRing,
  type RingState,
  type RingSubject,
  type RingSubjectRef,
} from './ring-model';

export interface RingDay {
  readonly day: PlannerDay | undefined;
  readonly colours: ReadonlyMap<string, PlannerColourKey>;
  readonly today: string;
}

export interface RingLive {
  readonly state: RingState;
  readonly phoneKey: string | null;
  readonly phone: RingStatus | null;
}

export interface RingTarget {
  readonly hubRing: PlannerRingRow | null;
  readonly phoneKey: string | null;
  readonly phone: RingStatus | null;
}

const SLEEP_LOOKBACK_DAYS = 8;

export type RingRoute = 'hub' | 'phone' | 'none';

export interface RingActions {
  readonly busy: boolean;
  readonly route: RingRoute;
  readonly stop: () => void;
  readonly snooze: () => void;
}

const NO_ROWS: readonly PlannerRingRow[] = [];

function useRingRows(due: string | null | undefined): {
  readonly rows: readonly PlannerRingRow[] | undefined;
  readonly failed: boolean;
} {
  const window = typeof due === 'string' ? dueWindowOf(due) : null;
  const query = useScreenQuery({
    ...ringsQuery(null, window?.from ?? '', window?.to ?? ''),
    enabled: window !== null,
  });
  return { rows: window === null ? NO_ROWS : query.data, failed: query.isError };
}

function localOf(
  ref: RingRef,
  hubRow: PlannerRingRow | undefined,
  key: string | null,
  phone: RingStatus | null,
): LocalRing | null {
  if (key === null || phone?.ringing !== true) return null;
  if (ref.kind === 'key') return { key, kind: ref.ring, refId: ref.refId };
  if (hubRow === undefined || hubRow.kind === 'reminder') return null;
  return { key, kind: hubRow.kind, refId: hubRow.ref_id };
}

export function useRingLive(
  param: string,
  day: PlannerDay | undefined,
  dayFailed: boolean,
): RingLive {
  const now = useMinute();
  const ref = ringRefOf(param);
  const incoming = useIncomingPlannerRing();
  const ringId = ringIdOf(ref, incoming, day?.rings);
  const due = typeof ringId === 'string' ? ringDueOf(ringId, incoming, day?.rings) : ringId;
  const { rows, failed } = useRingRows(due);
  const hubRow = rows?.find((row) => row.id === ringId);
  const phoneKey =
    refKeyOf(ref) ?? (hubRow === undefined ? null : phoneRingKeyOf(hubRow.kind, hubRow.ref_id));
  const phone = usePhoneRing(phoneKey);
  useShownRing(typeof ringId === 'string' ? ringId : param, useIsFocused());
  const state = ringStateOf({
    ringId,
    due,
    rows,
    failed: failed || (due === undefined && dayFailed),
    now,
    local: localOf(ref, hubRow, phoneKey, phone),
  });
  return { state, phoneKey, phone };
}

function readRecentSleep(): Promise<PlannerSleep> {
  const to = Date.now();
  const from = to - SLEEP_LOOKBACK_DAYS * DAY_MS;
  return readPlannerSleep(undefined, new Date(from).toISOString(), new Date(to).toISOString());
}

export function useRingSleep(today: string, wanted: boolean): PlannerSleep | undefined {
  return useScreenQuery({
    queryKey: [...PLANNER_PREFIX, 'sleep', null, today],
    queryFn: readRecentSleep,
    enabled: wanted,
  }).data;
}

export function useHoldBack(ringing: boolean): void {
  useEffect(() => {
    if (!ringing) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return (): void => {
      subscription.remove();
    };
  }, [ringing]);
}

export function useRingDay(): RingDay & { readonly failed: boolean } {
  const today = useMinuteOf(dayKeyOf);
  const query = usePlannerDay(null, today);
  const collections = usePlannerCollections(null);
  const colours = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection.colour])),
    [collections],
  );
  return { day: query.data, colours, today, failed: query.isError };
}

export function useRingSubject(ref: RingSubjectRef): RingSubject {
  const alarms = usePlannerAlarms(null);
  const timers = usePlannerTimers(null);
  const items = usePlannerItems(null);
  return ringSubjectOf(ref, { alarms, timers, items });
}

export interface RingRetry {
  readonly retrying: boolean;
  readonly retry: () => void;
}

export function useRingRetry(): RingRetry {
  const client = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  return {
    retrying,
    retry: (): void => {
      setRetrying(true);
      background(
        Promise.all([
          client.invalidateQueries({ queryKey: plannerKeys.prefix('rings') }),
          client.invalidateQueries({ queryKey: plannerKeys.prefix('day') }),
        ])
          .catch(notifyFailure('Couldn’t reach the hub'))
          .finally(() => {
            setRetrying(false);
          }),
        'clock.ring_retry_failed',
      );
    },
  };
}

export function leaveRing(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(href.clock.alarms());
}

function stopWork(
  writes: ReturnType<typeof usePlannerClockWrites>,
  ring: PlannerRingRow,
): Promise<unknown> {
  return ring.kind === 'timer'
    ? writes.actOnTimer(ring.ref_id, 'cancel')
    : writes.dismissAlarm(ring.ref_id, ring.id);
}

function snoozeWork(
  writes: ReturnType<typeof usePlannerClockWrites>,
  ring: PlannerRingRow,
  subject: RingSubject,
): Promise<unknown> {
  if (subject.snooze?.kind === 'alarm') {
    return writes.snoozeAlarm(ring.ref_id, { ringId: ring.id, minutes: subject.snooze.minutes });
  }
  return writes.addTimerTime(ring.ref_id, MINUTE_MS);
}

function phoneSnoozeMinutes(subject: RingSubject): number {
  return subject.snooze?.kind === 'alarm' ? subject.snooze.minutes : 1;
}

interface Work {
  readonly route: Exclude<RingRoute, 'none'>;
  readonly stop: () => Promise<unknown>;
  readonly snooze: () => Promise<unknown>;
}

function workOf(
  target: RingTarget,
  subject: RingSubject,
  writes: ReturnType<typeof usePlannerClockWrites>,
  offline: boolean,
): Work | null {
  const { hubRing, phoneKey, phone } = target;
  const onPhone = phoneKey !== null && phone?.ringing === true && (hubRing === null || offline);
  if (onPhone) {
    return {
      route: 'phone',
      stop: () => stopOnPhone(phoneKey),
      snooze: () => snoozeOnPhone(phoneKey, phoneSnoozeMinutes(subject)),
    };
  }
  if (hubRing === null || offline) return null;
  return {
    route: 'hub',
    stop: () => stopWork(writes, hubRing),
    snooze: () => snoozeWork(writes, hubRing, subject),
  };
}

export function useRingActions(target: RingTarget, subject: RingSubject): RingActions {
  const writes = usePlannerClockWrites(null);
  const client = useQueryClient();
  const offline = useHubOffline();
  const [busy, setBusy] = useState(false);
  const work = workOf(target, subject, writes, offline);
  const run = (
    task: (() => Promise<unknown>) | undefined,
    failure: string,
    event: string,
  ): void => {
    if (task === undefined) return;
    setBusy(true);
    background(
      task()
        .then(async () => {
          if (target.hubRing !== null) clearPlannerRing(target.hubRing.id);
          await client.invalidateQueries({ queryKey: plannerKeys.prefix('rings') });
          leaveRing();
        })
        .catch(notifyFailure(failure))
        .finally(() => {
          setBusy(false);
        }),
      event,
    );
  };
  return {
    busy,
    route: work?.route ?? 'none',
    stop: (): void => {
      run(work?.stop, 'Couldn’t stop it', 'clock.ring_stop_failed');
    },
    snooze: (): void => {
      run(work?.snooze, 'Couldn’t snooze it', 'clock.ring_snooze_failed');
    },
  };
}
