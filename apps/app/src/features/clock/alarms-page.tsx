import type { PlannerAlarmRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { compareText } from '../../format/text';
import { usePlannerAlarms } from '../planner/data';
import { ClockFrame } from './frame/clock-frame';

function byTime(left: PlannerAlarmRow, right: PlannerAlarmRow): number {
  return compareText(left.time, right.time);
}

export function AlarmsPage(): ReactNode {
  const alarms = [...usePlannerAlarms(null)].sort(byTime);
  return (
    <ClockFrame section="index">
      {alarms.length === 0 ? (
        <EmptyState
          icon="alarmClock"
          title="No alarms yet"
          body="Your alarms show here, with when each one rings next."
        />
      ) : (
        <List>
          {alarms.map((alarm) => (
            <ListRow
              key={alarm.id}
              icon="alarmClock"
              title={alarm.time}
              subtitle={alarm.label ?? 'Alarm'}
              value={alarm.enabled ? 'On' : 'Off'}
            />
          ))}
        </List>
      )}
    </ClockFrame>
  );
}
