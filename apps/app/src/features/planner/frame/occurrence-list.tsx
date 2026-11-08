import type { PlannerOccurrenceView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { clock } from '../../../format/time';

export function occurrenceWhenOf(occurrence: PlannerOccurrenceView, timeZone: string): string {
  if (occurrence.all_day) return 'All day';
  if (occurrence.start !== null) return clock(occurrence.start, timeZone);
  if (occurrence.due_at !== null) return `Due ${clock(occurrence.due_at, timeZone)}`;
  return occurrence.due_date === null ? 'Any time' : 'Due today';
}

export function OccurrenceList({
  title,
  occurrences,
  timeZone,
}: {
  readonly title: string;
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly timeZone: string;
}): ReactNode {
  if (occurrences.length === 0) return null;
  return (
    <List title={title}>
      {occurrences.map((occurrence) => (
        <ListRow
          key={`${occurrence.item_id}:${occurrence.occurrence_key}`}
          icon={occurrence.kind === 'event' ? 'calendar' : 'circleCheck'}
          title={occurrence.title}
          subtitle={occurrenceWhenOf(occurrence, timeZone)}
          href={href.planner.item(occurrence.item_id)}
          chevron
        />
      ))}
    </List>
  );
}
