import type { QueryClient, QueryFilters } from '@tanstack/react-query';
import type { AiChatRow, AiUsageRow, LiveChange } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { CHAT_METER_HISTORY_PREFIX } from './keys';

function cacheMeterChanged(before: AiUsageRow | null, after: AiUsageRow | null): boolean {
  if (before === null || after === null) return before !== after;
  return (
    before.chat_id !== after.chat_id ||
    before.at !== after.at ||
    before.tokens_in !== after.tokens_in ||
    before.tokens_cached !== after.tokens_cached
  );
}

function cacheChatId(row: AiUsageRow | null): string | null {
  return row !== null && row.tokens_in > 0 ? row.chat_id : null;
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

function changedChatMeters(changes: readonly LiveChange[]): ReadonlySet<string | null> {
  const chats = new Set<string | null>();
  for (const change of changes) {
    if (change.table === 'ai_chats') {
      const { record, oldRecord } = change;
      if (record !== null && chatMeterChanged(oldRecord, record)) chats.add(record.id);
    }
    if (change.table === 'ai_usage' && cacheMeterChanged(change.oldRecord, change.record)) {
      chats.add(cacheChatId(change.record));
      chats.add(cacheChatId(change.oldRecord));
    }
  }
  chats.delete(null);
  return chats;
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
): void {
  const chats = changedChatMeters(changes);
  if (chats.size === 0) return;
  refreshMatchingHistory(client, (chatId) => chats.has(chatId));
}

export function refreshChatMeterHistory(
  client: QueryClient,
  replayed: readonly LiveChange[],
): void {
  const refreshed = changedChatMeters(replayed);
  refreshMatchingHistory(client, (chatId) => !refreshed.has(chatId));
}
