import { identifiedAutomationV2 } from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { changeDraft, type Draft, type DraftChange } from './editor-state';
import { editHistory, type EditHistory } from './edit-history';

export type DraftHistory = EditHistory<Draft>;
export type HistoryChange = DraftChange | { readonly type: 'undo' } | { readonly type: 'redo' };

export function identifiedDraft(draft: Draft): Draft {
  return { ...draft, automation: identifiedAutomationV2(draft.automation, randomUUID, false) };
}

export function changeHistory(state: DraftHistory, change: HistoryChange): DraftHistory {
  return change.type === 'undo' || change.type === 'redo'
    ? editHistory(state, change)
    : editHistory(state, { type: 'set', value: changeDraft(state.present, change) });
}
