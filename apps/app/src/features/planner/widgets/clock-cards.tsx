import type { PlannerRingRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSettings } from '../../../store/selectors';
import { TimerCard, ringWindowOf, timerViewsOf, useHubOffline } from '../../clock';
import { AlarmList } from '../clock/alarm-card';
import { ringsQuery, usePlannerAlarms, usePlannerPreferences, usePlannerTimers } from '../data';
import { QueryBody } from '../frame/query-body';

const NO_RINGS: readonly PlannerRingRow[] = [];

export function PlannerAlarmWidget({ id }: { readonly id: string }): ReactNode {
  const alarm = usePlannerAlarms(null).find((value) => value.id === id);
  const query = usePlannerPreferences(null);
  const offline = useHubOffline();
  const timeZone = useSettings().time_zone;
  if (alarm === undefined)
    return (
      <EmptyState
        compact
        icon="alarmClock"
        title="This alarm is gone"
        body="It was deleted, or it belongs to someone else."
      />
    );
  return (
    <QueryBody query={query}>
      {(prefs) => (
        <AlarmList
          person={null}
          alarms={[alarm]}
          timeZone={timeZone}
          weekStart={prefs.general.week_start}
          layout="compact"
          offline={offline}
        />
      )}
    </QueryBody>
  );
}

export function PlannerTimerWidget({ id }: { readonly id: string }): ReactNode {
  const timer = usePlannerTimers(null).find((value) => value.id === id);
  const timers = timer === undefined ? [] : [timer];
  const span = ringWindowOf(timers);
  const query = useScreenQuery({
    ...ringsQuery(null, span?.from ?? '', span?.to ?? ''),
    enabled: span !== null,
  });
  if (timer === undefined)
    return (
      <EmptyState
        compact
        icon="timer"
        title="This timer is gone"
        body="It was deleted, or it belongs to someone else."
      />
    );
  const shown = (rings: readonly PlannerRingRow[]): ReactNode => {
    const view = timerViewsOf(timers, rings)[0];
    return view === undefined ? (
      <ListRow
        icon="timer"
        title={timer.label ?? 'Timer'}
        subtitle={timer.state === 'cancelled' ? 'Cancelled' : 'Finished'}
      />
    ) : (
      <TimerCard view={view} />
    );
  };
  return span === null ? shown(NO_RINGS) : <QueryBody query={query}>{shown}</QueryBody>;
}
