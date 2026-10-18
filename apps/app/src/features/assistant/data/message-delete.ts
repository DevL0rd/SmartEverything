import type { AssistantMessageRow } from '@smarteverything/domain';
import { removeAssistantMessage } from '../../../api/assistant';
import { deferAction } from '../../../components/deferred-action';

export function deleteMessageWithUndo(row: AssistantMessageRow): void {
  deferAction({
    key: row.id,
    message: 'Message deleted',
    failure: 'Message not deleted',
    commit: () => removeAssistantMessage(row.id),
  });
}
