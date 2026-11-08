import type { PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { useDayKey } from '../../../store/clock';
import { usePlannerDay, usePlannerItems, usePlannerOccurrences } from '../data';
import { OccurrenceList } from '../frame/occurrence-list';
import { QueryBody } from '../frame/query-body';
import { itemIn } from '../item';
import { TaskCard } from '../tasks/task-card';
import { taskEntriesOf } from '../tasks/task-grouping';
import { DayStripCard } from '../today/day-strip';
import { isOpenDay } from '../today/today-states';

function DayCards({ day }: { readonly day: PlannerDay }): ReactNode {
  return (
    <View className="gap-3">
      <DayStripCard day={day} compact />
      {isOpenDay(day) ? (
        <EmptyState
          compact
          icon="calendar"
          title="An open day"
          body="There are no tasks or events for this day."
        />
      ) : null}
      <OccurrenceList title="Missed" occurrences={day.missed} timeZone={day.time_zone} />
      <OccurrenceList title="Now" occurrences={day.current} timeZone={day.time_zone} />
      <OccurrenceList title="Next" occurrences={day.upcoming} timeZone={day.time_zone} />
      <OccurrenceList title="Done" occurrences={day.done} timeZone={day.time_zone} />
    </View>
  );
}

export function PlannerDayWidget({ day }: { readonly day?: string }): ReactNode {
  const today = useDayKey();
  const query = usePlannerDay(null, day ?? today);
  return <QueryBody query={query}>{(value) => <DayCards day={value} />}</QueryBody>;
}

export function PlannerItemWidget({ id }: { readonly id: string }): ReactNode {
  const items = usePlannerItems(null);
  const occurrences = usePlannerOccurrences(null);
  const today = useDayKey();
  const query = usePlannerDay(null, today);
  const item = itemIn(items, id);
  if (item === null)
    return (
      <EmptyState
        compact
        icon="calendar"
        title="This item is gone"
        body="It was deleted, or it belongs to someone else."
      />
    );
  const entry = taskEntriesOf({ items, occurrences, day: query.data }).find(
    (value) => value.item.id === id,
  );
  return entry === undefined ? (
    <ListRow
      title={item.title}
      subtitle={item.notes}
      icon={item.kind === 'event' ? 'calendar' : 'circleCheck'}
      href={href.planner.item(id)}
      chevron
    />
  ) : (
    <TaskCard entry={entry} today={today} />
  );
}
