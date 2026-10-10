import type { AiRetryFrom, AssistantMessageRow } from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';

function latestPersonId(state: StoreState, chatId: string): string | null {
  const latest = rowsOf(state.tables.assistant_messages).find(
    (row) => row.chat_id === chatId && row.role === 'person' && row.kind === 'text',
  );
  return latest?.id ?? null;
}

function copiedIntoBranch(state: StoreState, row: AssistantMessageRow): boolean {
  const chat = state.tables.ai_chats.byId[row.chat_id];
  return chat !== undefined && chat.branch_message_id !== null && row.created_at < chat.created_at;
}

function retryFromOf(state: StoreState, request: AssistantMessageRow | null): AiRetryFrom | null {
  if (request === null || (request.state !== 'failed' && request.state !== 'answered')) {
    return null;
  }
  if (copiedIntoBranch(state, request)) {
    return null;
  }
  return latestPersonId(state, request.chat_id) === request.id ? request.state : null;
}

export function useRetryFrom(request: AssistantMessageRow | null): AiRetryFrom | null {
  return useStoreSelector((state) => retryFromOf(state, request), Object.is, [request]);
}

function writtenInApp(row: AssistantMessageRow): boolean {
  return row.origin === null || row.origin.source === 'app';
}

function editableOf(state: StoreState, row: AssistantMessageRow): boolean {
  const settled = row.state === 'answered' || row.state === 'failed';
  return (
    row.role === 'person' &&
    row.kind === 'text' &&
    writtenInApp(row) &&
    settled &&
    !copiedIntoBranch(state, row) &&
    latestPersonId(state, row.chat_id) === row.id
  );
}

export function useCanEdit(row: AssistantMessageRow): boolean {
  return useStoreSelector((state) => editableOf(state, row), Object.is, [row]);
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
