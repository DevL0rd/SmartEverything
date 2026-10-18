import { useMemo, useState } from 'react';
import type { AssistantMessageRow, ImageOperationReceipt } from '@smarteverything/domain';
import { useMinute } from '../../../store/clock';
import { usePendingKeys } from '../../../components/deferred-action';
import { useRow } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { timed } from '../../../perf/probe-kit';
import { mergedRows, useOlderComplete, useOlderRows } from '../data/history';
import { usePendingMessages, type PendingMessage } from '../data/outbox';
import { isFooter, threadOf, type MessageItem } from '../data/thread';
import { imageTimelineIds } from '../model/reply-timeline';
import { useImageOperations } from '../images/data/image-queries';
import {
  withImageOperations,
  resultMessageId,
  type ImageOperationItem,
} from '../images/model/image-thread';

interface OutboxItem {
  readonly type: 'outbox';
  readonly key: string;
  readonly message: PendingMessage;
}

export type ThreadRow = MessageItem | ImageOperationItem | OutboxItem;

export interface ThreadRows {
  readonly data: readonly ThreadRow[];
  readonly all: readonly AssistantMessageRow[];
  readonly readAt: string | null;
  readonly complete: boolean;
}

function outboxOf(pending: readonly PendingMessage[]): readonly OutboxItem[] {
  return [...pending]
    .reverse()
    .map((message): OutboxItem => ({ type: 'outbox', key: `outbox-${message.id}`, message }));
}

function withOutbox(
  items: readonly (MessageItem | ImageOperationItem)[],
  outbox: readonly OutboxItem[],
): readonly ThreadRow[] {
  const footer = items.findIndex((item) => item.type !== 'message' || !isFooter(item));
  const at = footer === -1 ? items.length : footer;
  return [...items.slice(0, at), ...outbox, ...items.slice(at)];
}

function withoutBoundResults(
  items: readonly MessageItem[],
  receipts: readonly ImageOperationReceipt[],
  boundImages: ReadonlySet<string>,
): readonly MessageItem[] {
  const bound = new Set(
    receipts.filter((receipt) => boundImages.has(receipt.id)).map(resultMessageId),
  );
  return bound.size === 0 ? items : items.filter((item) => !bound.has(item.row.id));
}

export function useThreadRows(
  historyKey: string,
  rows: readonly AssistantMessageRow[],
): ThreadRows {
  const olderRows = useOlderRows(historyKey);
  const complete = useOlderComplete(historyKey);
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const chat = useRow('ai_chats', historyKey);
  const [opened] = useState(() => ({ at: Date.now(), readAt: chat?.read_at ?? null }));
  const hidden = usePendingKeys();
  const pending = usePendingMessages(historyKey);
  const operations = useImageOperations(historyKey);
  const all = useMemo(() => mergedRows(rows, olderRows), [rows, olderRows]);
  const boundImages = useMemo(() => imageTimelineIds(all), [all]);
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
    () =>
      withOutbox(
        withImageOperations(
          withoutBoundResults(items, operations.data ?? [], boundImages),
          (operations.data ?? []).filter(
            (receipt) =>
              !boundImages.has(receipt.id) && !hidden.has(resultMessageId(receipt) ?? receipt.id),
          ),
        ),
        outboxOf(pending),
      ),
    [pending, items, operations.data, hidden, boundImages],
  );
  return { data, all, readAt: opened.readAt, complete };
}
