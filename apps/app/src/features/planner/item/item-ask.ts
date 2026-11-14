import { PLANNER_OCCURRENCE_SINGLE, type PlannerItemRow } from '@smarteverything/domain';
import { askAssistantWith } from '../../assistant';

export function askPromptOf(item: PlannerItemRow, occurrenceKey: string | null): string {
  const noun = item.kind === 'event' ? 'event' : 'task';
  const which =
    occurrenceKey === null || occurrenceKey === PLANNER_OCCURRENCE_SINGLE
      ? ''
      : `, occurrence ${occurrenceKey}`;
  return `About my ${noun} “${item.title}” (planner item ${item.id}${which}): `;
}

export function askAboutItem(item: PlannerItemRow, occurrenceKey: string | null): void {
  askAssistantWith(askPromptOf(item, occurrenceKey));
}
