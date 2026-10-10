import { useMemo, useState } from 'react';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { useMinute } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { timed } from '../../../perf/probe-kit';
import { mergedRows, useOlderMessages } from '../data/history';
import { usePendingMessages, type PendingMessage } from '../data/outbox';
import { usePendingDeletes } from '../data/pending-deletes';
import { isFooter, threadOf, type MessageItem } from '../data/thread';

interface OutboxItem {
  readonly type: 'outbox';
  readonly key: string;
  readonly message: PendingMessage;
}

export type ThreadRow = MessageItem | OutboxItem;

export interface ThreadRows {
  readonly data: readonly ThreadRow[];
  readonly all: readonly AssistantMessageRow[];
  readonly readAt: string | null;
  readonly loading: boolean;
  readonly complete: boolean;
}

function outboxOf(pending: readonly PendingMessage[]): readonly OutboxItem[] {
  return [...pending]
    .reverse()
    .map((message): OutboxItem => ({ type: 'outbox', key: `outbox-${message.id}`, message }));
}

function withOutbox(
  items: readonly MessageItem[],
  outbox: readonly OutboxItem[],
): readonly ThreadRow[] {
  const footer = items.findIndex((item) => !isFooter(item));
  const at = footer === -1 ? items.length : footer;
  return [...items.slice(0, at), ...outbox, ...items.slice(at)];
}

export function useThreadRows(
  historyKey: string,
  rows: readonly AssistantMessageRow[],
): ThreadRows {
  const older = useOlderMessages(historyKey);
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const chat = useRow('ai_chats', historyKey);
  const [opened] = useState(() => ({ at: Date.now(), readAt: chat?.read_at ?? null }));
  const hidden = usePendingDeletes();
  const pending = usePendingMessages(historyKey);
  const all = useMemo(() => mergedRows(rows, older.rows), [rows, older.rows]);
  const items = useMemo(
    () =>
      timed('items', () =>
        threadOf(all, {
          now,
          timeZone,
          unreadAfter: opened.readAt,
          openedAt: opened.at,
          hidden,
        }),
      ),
    [all, now, timeZone, opened, hidden],
  );
  const data = useMemo<readonly ThreadRow[]>(
    () => withOutbox(items, outboxOf(pending)),
    [pending, items],
  );
  return { data, all, readAt: opened.readAt, loading: older.loading, complete: older.complete };
}
