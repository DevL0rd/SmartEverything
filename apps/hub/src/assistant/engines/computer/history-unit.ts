import type { AssistantMessageRow } from '@smarteverything/domain';
import type { StoredAttachment } from '../../../store/repositories/assistant-chat';
import type { HostStore } from '../../../store/host/host-store';
import { storeUnit } from '../../../store/host/unit';

export interface ProviderHistoryRow {
  readonly row: AssistantMessageRow;
  readonly attachments: readonly StoredAttachment[];
}

function providerHistory(
  store: HostStore,
  chatId: string,
  messageId: string | null,
  resumed: boolean,
): AssistantMessageRow[] {
  if (resumed) return messageId === null ? [] : [store.assistantChat.message(messageId)];
  return messageId === null
    ? store.assistantChat.since(chatId, null)
    : causalProviderHistory(store.assistantChat.since(chatId, null), messageId);
}

function causalProviderHistory(
  rows: readonly AssistantMessageRow[],
  id: string,
): AssistantMessageRow[] {
  const position = rows.findIndex((row) => row.id === id);
  const current = rows[position];
  if (current === undefined) return [];
  const earlier = new Set(rows.slice(0, position).map((row) => row.id));
  return [...rows.filter((row) => providerPredecessor(row, id, earlier)), current];
}

function providerPredecessor(
  row: AssistantMessageRow,
  current: string,
  earlier: ReadonlySet<string>,
): boolean {
  if (row.id === current) return false;
  if (row.role === 'person') return earlier.has(row.id);
  return row.reply_to === null || earlier.has(row.reply_to);
}

export const PROVIDER_HISTORY_UNIT = storeUnit(
  (
    store,
    input: {
      readonly chatId: string;
      readonly messageId: string | null;
      readonly resumed: boolean;
    },
  ): ProviderHistoryRow[] =>
    providerHistory(store, input.chatId, input.messageId, input.resumed).map((row) => ({
      row,
      attachments: store.assistantChat.attachmentsOf(row.id),
    })),
);
