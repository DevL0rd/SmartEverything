import type { PlannerItemRow, PlannerItemScope } from '@smarteverything/domain';
import type { PlannerDeleteScope } from '../../../api/planner';

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

function questionOf(item: PlannerItemRow, scope: PlannerItemScope): string {
  const noun = nounOf(item.kind);
  if (scope === 'this') return `Only this repeat of the ${noun} goes. The others stay.`;
  if (scope === 'following') return 'This repeat and every later one go. Earlier ones stay.';
  return `Every repeat of the ${noun} goes, with its history.`;
}

function seriesChoice(
  item: PlannerItemRow,
  scope: PlannerItemScope,
  occurrenceKey: string,
): DeleteChoice {
  return {
    id: `delete-${scope}`,
    label: LABELS[scope],
    scope: scope === 'all' ? { scope } : { scope, occurrenceKey },
    question: questionOf(item, scope),
  };
}

export function deleteChoicesOf(
  item: PlannerItemRow,
  occurrenceKey: string | null,
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
        question: questionOf(item, 'all'),
      },
    ];
  }
  return (['this', 'following', 'all'] as const).map((scope) =>
    seriesChoice(item, scope, occurrenceKey),
  );
}
