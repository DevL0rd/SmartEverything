import type { PlannerItemRow, PlannerItemScope } from '@smarteverything/domain';
import type { PlannerDeleteScope } from '../../../api/planner';
import { longDate } from '../../../format/time';

export interface DeleteChoice {
  readonly id: string;
  readonly label: string;
  readonly scope: PlannerDeleteScope;
  readonly question: string;
}

const LABELS: Readonly<Record<PlannerItemScope, string>> = {
  this: 'Delete this one',
  following: 'Delete this and later',
  all: 'Delete every repeat',
};

function nounOf(kind: PlannerItemRow['kind']): string {
  return kind === 'event' ? 'event' : 'task';
}

function occurrenceTextOf(occurrenceKey: string, timeZone: string): string {
  return occurrenceKey.length === 10
    ? longDate(`${occurrenceKey}T12:00:00Z`, 'UTC')
    : longDate(occurrenceKey, timeZone);
}

function everyQuestionOf(item: PlannerItemRow): string {
  return `Every repeat of the ${nounOf(item.kind)} goes, with its history.`;
}

function questionOf(item: PlannerItemRow, scope: PlannerItemScope, day: string): string {
  const noun = nounOf(item.kind);
  if (scope === 'this') return `Only the ${noun} on ${day} goes. The other repeats stay.`;
  if (scope === 'following') {
    return `The ${noun} on ${day} and every later repeat go. Earlier ones stay.`;
  }
  return everyQuestionOf(item);
}

function seriesChoice(
  item: PlannerItemRow,
  scope: PlannerItemScope,
  occurrenceKey: string,
  timeZone: string,
): DeleteChoice {
  return {
    id: `delete-${scope}`,
    label: LABELS[scope],
    scope: scope === 'all' ? { scope } : { scope, occurrenceKey },
    question: questionOf(item, scope, occurrenceTextOf(occurrenceKey, timeZone)),
  };
}

export function deleteChoicesOf(
  item: PlannerItemRow,
  occurrenceKey: string | null,
  timeZone: string,
): readonly DeleteChoice[] {
  if (item.rrule === null) {
    return [
      {
        id: 'delete',
        label: 'Delete',
        scope: { scope: 'all' },
        question: `The ${nounOf(item.kind)} and its history go.`,
      },
    ];
  }
  if (occurrenceKey === null) {
    return [
      {
        id: 'delete-all',
        label: LABELS.all,
        scope: { scope: 'all' },
        question: everyQuestionOf(item),
      },
    ];
  }
  return (['this', 'following', 'all'] as const).map((scope) =>
    seriesChoice(item, scope, occurrenceKey, timeZone),
  );
}
