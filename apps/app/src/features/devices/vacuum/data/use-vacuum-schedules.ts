import { useMemo } from 'react';
import { dayLabel } from '../../../../format/time';
import { useMinute } from '../../../../store/clock';
import { sameJson } from '../../../../store/same-json';
import { useSettings } from '../../../../store/selectors';
import { rowsOf } from '../../../../store/state';
import { useStoreSelector } from '../../../../store/store-context';
import {
  automationRowsOf,
  kindsOfState,
  nextVacuumRun,
  vacuumSchedulesOf,
  type VacuumScheduleEntry,
} from '../../../automations';

export function useVacuumSchedules(deviceId: string): readonly VacuumScheduleEntry[] {
  return useStoreSelector(
    (state) =>
      vacuumSchedulesOf(
        automationRowsOf(rowsOf(state.tables.automations), kindsOfState(state)).rows,
        deviceId,
      ),
    sameJson,
    [deviceId],
  );
}

export function useNextRunDays(
  entries: readonly VacuumScheduleEntry[],
): ReadonlyMap<string, { readonly at: number; readonly day: string }> {
  const now = useMinute();
  const timeZone = useSettings().time_zone;
  return useMemo(() => {
    const runs = entries.flatMap((entry) => {
      const next = nextVacuumRun(entry, new Date(now), timeZone);
      return next === null
        ? []
        : [
            [
              entry.automationId,
              { at: next.getTime(), day: dayLabel(next, now, timeZone) },
            ] as const,
          ];
    });
    return new Map(runs);
  }, [entries, now, timeZone]);
}

export function useNextCleanDay(deviceId: string): string | null {
  const runs = useNextRunDays(useVacuumSchedules(deviceId));
  const soonest = [...runs.values()].reduce<{ readonly at: number; readonly day: string } | null>(
    (first, run) => (first === null || run.at < first.at ? run : first),
    null,
  );
  return soonest?.day ?? null;
}
