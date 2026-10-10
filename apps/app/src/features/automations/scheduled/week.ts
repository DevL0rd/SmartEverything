import type { ScheduleRow } from '@smarteverything/domain';
import type { Window } from '../model/schedule';
import { titleOf, upcomingOf } from './view';

export interface OneOff {
  readonly key: string;
  readonly scheduleId: string;
  readonly title: string;
  readonly at: Date;
}

function timesOf(row: ScheduleRow): readonly string[] {
  if (row.state === 'waiting') {
    return row.next_at === null ? [] : [row.next_at];
  }
  return row.occurrences.slice(row.occurrence);
}

export function oneOffRuns(rows: readonly ScheduleRow[], window: Window): OneOff[] {
  return upcomingOf(rows)
    .flatMap((row) =>
      timesOf(row).map((at) => ({
        key: `${row.id}:${at}`,
        scheduleId: row.id,
        title: titleOf(row),
        at: new Date(at),
      })),
    )
    .filter((run) => run.at >= window.start && run.at < window.end)
    .sort((left, right) => left.at.getTime() - right.at.getTime());
}
