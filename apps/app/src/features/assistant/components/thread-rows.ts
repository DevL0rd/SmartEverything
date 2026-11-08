import { useMemo, useState } from 'react';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { useMinute } from '../../../store/clock';
import { usePendingKeys } from '../../../components/deferred-action';
import { useRow } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { timed } from '../../../perf/probe-kit';
import { mergedRows, useOlderComplete, useOlderRows } from '../data/history';
import { useAssistantName, useAssistantStatus } from '../data/assistant-data';
import { usePendingMessages, type PendingMessage } from '../data/outbox';
import { isFooter, threadOf, type MessageItem } from '../data/thread';
import { castOf, type Cast } from '../model/participant';
import { imageTimelineIds, steeredMessageIds } from '../model/reply-timeline';
import { useImageOperations } from '../images/data/image-queries';
import { attachImageOperations, type ImageOperationItem } from '../images/model/image-thread';

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

function withoutSteered(
  items: readonly MessageItem[],
  steered: ReadonlySet<string>,
): readonly MessageItem[] {
  return steered.size === 0 ? items : items.filter((item) => !steered.has(item.row.id));
}

function useCast(historyKey: string, chat: AiChatRow | null): Cast {
  const assistantName = useAssistantName();
  const kind = chat?.kind ?? null;
  const helperName = chat?.helper_name ?? null;
  return useMemo(
    () =>
      castOf(
        assistantName,
        kind === null ? null : { id: historyKey, kind, helper_name: helperName },
      ),
    [assistantName, historyKey, kind, helperName],
  );
}

export function useThreadRows(
  historyKey: string,
  rows: readonly AssistantMessageRow[],
): ThreadRows {
  const olderRows = useOlderRows(historyKey);
  const complete = useOlderComplete(historyKey);
  const now = useMinute();
  const showSteps = useAssistantStatus()?.settings.activity_steps !== false;
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const chat = useRow('ai_chats', historyKey);
  const cast = useCast(historyKey, chat);
  const [opened] = useState(() => ({ at: Date.now(), readAt: chat?.read_at ?? null }));
  const hidden = usePendingKeys();
  const pending = usePendingMessages(historyKey);
  const operations = useImageOperations(historyKey);
  const all = useMemo(() => mergedRows(rows, olderRows), [rows, olderRows]);
  const boundImages = useMemo(() => imageTimelineIds(all), [all]);
  const steered = useMemo(() => steeredMessageIds(all), [all]);
  const items = useMemo(
    () =>
      timed('items', () =>
        threadOf(all, {
          cast,
          showSteps,
          now,
          timeZone,
          unreadAfter: opened.readAt,
          openedAt: opened.at,
          hidden,
        }),
      ),
    [all, cast, showSteps, now, timeZone, opened, hidden],
  );
  const data = useMemo<readonly ThreadRow[]>(
    () =>
      withOutbox(
        attachImageOperations(withoutSteered(items, steered), operations.data ?? [], {
          boundImages,
          hidden,
          replyStartedAt: items.find(isFooter)?.row.created_at ?? null,
        }),
        outboxOf(pending),
      ),
    [pending, items, operations.data, hidden, boundImages, steered],
  );
  return { data, all, readAt: opened.readAt, complete };
}
