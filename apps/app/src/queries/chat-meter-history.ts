import type { QueryClient, QueryFilters } from '@tanstack/react-query';
import type { AiChatRow, AiUsageRow, LiveChange, LiveWireChange } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { CHAT_METER_HISTORY_PREFIX } from './keys';

const CACHE_METER_COLUMNS: readonly string[] = ['chat_id', 'at', 'tokens_in', 'tokens_cached'];

function cacheChatId(row: AiUsageRow): string | null {
  return row.tokens_in > 0 ? row.chat_id : null;
}

function meterScopeChanged(before: AiChatRow, after: AiChatRow): boolean {
  if (before.engine.kind === 'dsh' && after.engine.kind === 'dsh')
    return before.engine.model_route_id !== after.engine.model_route_id;
  if (before.engine.kind === 'dsh' || after.engine.kind === 'dsh') return true;
  return (
    before.engine.kind !== after.engine.kind || before.engine.device_id !== after.engine.device_id
  );
}

function chatMeterChanged(before: AiChatRow | null, after: AiChatRow): boolean {
  return (
    (after.context_percent !== null && after.context_percent !== before?.context_percent) ||
    (before !== null && meterScopeChanged(before, after))
  );
}

interface ChangedMeters {
  readonly chats: ReadonlySet<string>;
  readonly every: boolean;
}

function usageMeterMoved(frame: LiveWireChange & { readonly operation: 'UPDATE' }): boolean {
  const moved = [...Object.keys(frame.set), ...(frame.cleared ?? [])];
  return moved.some((column) => CACHE_METER_COLUMNS.includes(column));
}

function changedChats(changes: readonly LiveChange[]): Set<string> {
  const chats = new Set<string>();
  for (const change of changes) {
    if (change.table === 'ai_chats') {
      const { record, oldRecord } = change;
      if (record !== null && chatMeterChanged(oldRecord, record)) chats.add(record.id);
    }
  }
  return chats;
}

function changedChatMeters(
  changes: readonly LiveChange[],
  frames: readonly LiveWireChange[],
): ChangedMeters {
  const chats = changedChats(changes);
  let every = false;
  for (const frame of frames) {
    if (frame.table !== 'ai_usage') continue;
    if (frame.operation === 'UPDATE') {
      every ||= usageMeterMoved(frame);
      continue;
    }
    const chat = cacheChatId(frame.operation === 'INSERT' ? frame.record : frame.oldRecord);
    if (chat !== null) chats.add(chat);
  }
  return { chats, every };
}

export function refreshSubscriptionMeterHistory(client: QueryClient): void {
  refreshMatchingHistory(client, () => true);
}

function refreshMatchingHistory(client: QueryClient, matches: (chatId: string) => boolean): void {
  const filters: QueryFilters = {
    queryKey: CHAT_METER_HISTORY_PREFIX,
    predicate: (query) => matches(String(query.queryKey[2])),
  };
  background(client.cancelQueries(filters), 'queries.cancel_failed');
  background(client.invalidateQueries(filters), 'queries.invalidate_failed');
}

export function invalidateChatMeterHistory(
  client: QueryClient,
  changes: readonly LiveChange[],
  frames: readonly LiveWireChange[],
): void {
  const { chats, every } = changedChatMeters(changes, frames);
  if (!every && chats.size === 0) return;
  refreshMatchingHistory(client, (chatId) => every || chats.has(chatId));
}

export function refreshChatMeterHistory(
  client: QueryClient,
  replayed: readonly LiveChange[],
  frames: readonly LiveWireChange[],
): void {
  const { chats, every } = changedChatMeters(replayed, frames);
  if (every) return;
  refreshMatchingHistory(client, (chatId) => !chats.has(chatId));
}
