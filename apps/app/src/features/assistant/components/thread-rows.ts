import { useMemo, useState } from 'react';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { useDayNow } from '../../../store/clock';
import { usePendingKeys } from '../../../components/deferred-action';
import { useRow } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { timed } from '../../../perf/probe-kit';
import { compareText } from '../../../format/text';
import { mergedRows, useOlderComplete, useOlderRows } from '../data/history';
import { useAssistantName, useAssistantStatus } from '../data/assistant-data';
import { usePendingMessages } from '../data/outbox';
import { useOutgoingMessages, type UnsentMessage } from '../data/outgoing';
import type { PendingMessage } from '../data/ai-drafts';
import { isFooter, threadOf, type MessageItem } from '../data/thread';
import { castOf, type Cast } from '../model/participant';
import { imageTimelineIds } from '../model/reply-timeline';
import { useImageOperations } from '../images/data/image-queries';
import { attachImageOperations, type ImageOperationItem } from '../images/model/image-thread';

interface OutboxItem {
  readonly type: 'outbox';
  readonly key: string;
  readonly message: UnsentMessage;
}

export type ThreadRow = MessageItem | ImageOperationItem | OutboxItem;

export interface ThreadRows {
  readonly data: readonly ThreadRow[];
  readonly all: readonly AssistantMessageRow[];
  readonly readAt: string | null;
  readonly complete: boolean;
}

function storedClientIds(rows: readonly AssistantMessageRow[]): ReadonlySet<string> {
  return new Set(
    rows.flatMap((row) => (row.client_message_id === null ? [] : [row.client_message_id])),
  );
}

export function unsentOf(
  queued: readonly PendingMessage[],
  outgoing: readonly UnsentMessage[],
  stored: readonly AssistantMessageRow[],
): readonly UnsentMessage[] {
  const known = storedClientIds(stored);
  const tracked = new Set(outgoing.map((message) => message.id));
  const waiting = queued
    .filter((message) => !tracked.has(message.id))
    .map((message): UnsentMessage => ({ ...message, phase: 'queued' }));
  return [...outgoing, ...waiting]
    .filter((message) => !known.has(message.id))
    .sort((left, right) => compareText(left.queuedAt, right.queuedAt));
}

function outboxOf(unsent: readonly UnsentMessage[]): readonly OutboxItem[] {
  return [...unsent]
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
  const showSteps = useAssistantStatus()?.settings.activity_steps !== false;
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const now = useDayNow(timeZone);
  const chat = useRow('ai_chats', historyKey);
  const cast = useCast(historyKey, chat);
  const [opened] = useState(() => ({ at: Date.now(), readAt: chat?.read_at ?? null }));
  const hidden = usePendingKeys();
  const queued = usePendingMessages(historyKey);
  const outgoing = useOutgoingMessages(historyKey);
  const operations = useImageOperations(historyKey);
  const all = useMemo(() => mergedRows(rows, olderRows), [rows, olderRows]);
  const boundImages = useMemo(() => imageTimelineIds(all), [all]);
  const unsent = useMemo(() => unsentOf(queued, outgoing, all), [queued, outgoing, all]);
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
        attachImageOperations(items, operations.data ?? [], {
          boundImages,
          hidden,
          replyStartedAt: items.find(isFooter)?.row.created_at ?? null,
        }),
        outboxOf(unsent),
      ),
    [unsent, items, operations.data, hidden, boundImages],
  );
  return { data, all, readAt: opened.readAt, complete };
}
