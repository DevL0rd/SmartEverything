import type { PlannerDay, PlannerOccurrenceView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { clock, dayLabel, zonedStartOfDay } from '../../../format/time';

export type DayContext = Pick<PlannerDay, 'date' | 'time_zone' | 'now'>;

function otherDayOf(moment: string | number, day: DayContext, leading: boolean): string | null {
  const label = dayLabel(moment, Date.parse(day.now), day.time_zone);
  if (label === 'Today') return null;
  return label === 'Yesterday' && !leading ? 'yesterday' : label;
}

export function momentWhenOf(moment: string, day: DayContext, leading: boolean): string {
  const time = clock(moment, day.time_zone);
  const other = otherDayOf(moment, day, leading);
  return other === null ? time : `${other} ${time}`;
}

function dueDateOf(dueDate: string, day: DayContext): string {
  if (dueDate === day.date) return 'Due today';
  const other = otherDayOf(zonedStartOfDay(dueDate, day.time_zone), day, false);
  return other === null ? 'Due today' : `Due ${other}`;
}

export function occurrenceWhenOf(occurrence: PlannerOccurrenceView, day: DayContext): string {
  if (occurrence.all_day) return 'All day';
  if (occurrence.start !== null) return momentWhenOf(occurrence.start, day, true);
  if (occurrence.due_at !== null) return `Due ${momentWhenOf(occurrence.due_at, day, false)}`;
  return occurrence.due_date === null ? 'Any time' : dueDateOf(occurrence.due_date, day);
}

export function OccurrenceList({
  title,
  occurrences,
  day,
}: {
  readonly title: string;
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly day: DayContext;
}): ReactNode {
  if (occurrences.length === 0) return null;
  return (
    <List title={title}>
      {occurrences.map((occurrence) => (
        <ListRow
          key={`${occurrence.item_id}:${occurrence.occurrence_key}`}
          icon={occurrence.kind === 'event' ? 'calendar' : 'circleCheck'}
          title={occurrence.title}
          subtitle={occurrenceWhenOf(occurrence, day)}
          href={href.planner.item(occurrence.item_id, occurrence.occurrence_key)}
          chevron
        />
      ))}
    </List>
  );
}
