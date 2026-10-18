import type { AiRetryFrom, AssistantMessageRow } from '@smarteverything/domain';
import { useStoreSelector } from '../../../store/store-context';
import {
  editableOf,
  latestPersonId,
  retryFromOf,
  rowActionState,
  type RowActionState,
} from './retry-state';

function sameActionState(left: RowActionState, right: RowActionState): boolean {
  return (
    left.request === right.request &&
    left.retryFrom === right.retryFrom &&
    left.canEdit === right.canEdit &&
    left.readOnly === right.readOnly
  );
}

export function useRowActionState(row: AssistantMessageRow): RowActionState {
  return useStoreSelector((state) => rowActionState(state, row), sameActionState, [row]);
}

export function useRetryFrom(request: AssistantMessageRow | null): AiRetryFrom | null {
  return useStoreSelector((state) => retryFromOf(state, request), Object.is, [request]);
}

export function useLatestEditableId(chatId: string): string | null {
  return useStoreSelector(
    (state) => {
      const id = latestPersonId(state, chatId);
      const row = id === null ? undefined : state.tables.assistant_messages.byId[id];
      return row !== undefined && editableOf(state, row) ? row.id : null;
    },
    Object.is,
    [chatId],
  );
}
