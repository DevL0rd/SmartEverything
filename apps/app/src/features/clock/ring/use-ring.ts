import type { PlannerColourKey, PlannerDay, PlannerRingRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import { useMemo, useState } from 'react';
import { href } from '../../../app-shell/hrefs';
import { notifyFailure } from '../../../components/toast-store';
import { MINUTE_MS, dayKeyOf } from '../../../format/time';
import { plannerKeys } from '../../../queries/keys';
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
} from '../../planner/data';
import { dueWindowOf, useShownRing } from '../../planner/data/ring';
import { useHubOffline } from '../frame/hub-status';
import {
  ringDueOf,
  ringStateOf,
  ringSubjectOf,
  type RingState,
  type RingSubject,
} from './ring-model';

export interface RingDay {
  readonly day: PlannerDay | undefined;
  readonly colours: ReadonlyMap<string, PlannerColourKey>;
  readonly today: string;
}

export interface RingActions {
  readonly busy: boolean;
  readonly offline: boolean;
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

export function useRingState(
  ringId: string,
  day: PlannerDay | undefined,
  dayFailed: boolean,
): RingState {
  const now = useMinute();
  const due = ringDueOf(ringId, useIncomingPlannerRing(), day?.rings);
  const { rows, failed } = useRingRows(due);
  useShownRing(ringId, useIsFocused());
  return ringStateOf({
    ringId,
    due,
    rows,
    failed: failed || (due === undefined && dayFailed),
    now,
  });
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

export function useRingSubject(ring: PlannerRingRow): RingSubject {
  const alarms = usePlannerAlarms(null);
  const timers = usePlannerTimers(null);
  const items = usePlannerItems(null);
  return ringSubjectOf(ring, { alarms, timers, items });
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

export function useRingActions(ring: PlannerRingRow, subject: RingSubject): RingActions {
  const writes = usePlannerClockWrites(null);
  const client = useQueryClient();
  const offline = useHubOffline();
  const [busy, setBusy] = useState(false);
  const run = (work: () => Promise<unknown>, failure: string, event: string): void => {
    setBusy(true);
    background(
      work()
        .then(async () => {
          clearPlannerRing(ring.id);
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
    offline,
    stop: (): void => {
      run(() => stopWork(writes, ring), 'Couldn’t stop it', 'clock.ring_stop_failed');
    },
    snooze: (): void => {
      run(
        () => snoozeWork(writes, ring, subject),
        'Couldn’t snooze it',
        'clock.ring_snooze_failed',
      );
    },
  };
}
