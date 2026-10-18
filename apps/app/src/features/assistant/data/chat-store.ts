import {
  messagesTable,
  rawState,
  turnsOfChat,
  turnsSlice,
  workingTurns,
} from '../../../store/subscriptions';
import { useEffect, useMemo, useState } from 'react';
import { isChatActivity, type AiChatRow, type AssistantMessageRow } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { useRow, useRows } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { entryOf, type ChatPreview, type ChatWork } from '../chats/entries';
import type { ChatEntry } from '../chats/chat-entry';
import { footerFacts, type FooterFacts } from '../model/chat-footer';
import { previewTextOf, failureReasonOf } from '../model/chat-preview';
import type { PluginNames } from '../model/chat-source';
import { isWorking, liveTurnOf, stepOf, type Turns } from '../../../store/chat-turns';
import { callPreviewOf } from './call-transcript';
import { StreamParser, type StreamView } from '../model/stream-view';
import { useScreenPaused } from '../../../design/screen-pause';

const SELF_SOURCES: ReadonlySet<string> = new Set(['app', 'voice']);

export function useAiChats(): readonly AiChatRow[] {
  return useRows('ai_chats');
}

export function useAiChat(chatId: string | null): AiChatRow | null {
  return useRow('ai_chats', chatId);
}

function sameRows(
  left: readonly AssistantMessageRow[],
  right: readonly AssistantMessageRow[],
): boolean {
  return left.length === right.length && left.every((row, index) => row === right[index]);
}

const groupedMessages = memoOnInputs(
  (state: StoreState) => [rawState(state).tables.assistant_messages],
  (state): ReadonlyMap<string, readonly AssistantMessageRow[]> => {
    const grouped = new Map<string, AssistantMessageRow[]>();
    for (const row of rawState(state).tables.assistant_messages.rows) {
      const rows = grouped.get(row.chat_id);
      if (rows === undefined) grouped.set(row.chat_id, [row]);
      else rows.push(row);
    }
    return grouped;
  },
);

const NO_MESSAGES: readonly AssistantMessageRow[] = [];

function messagesOfChat(state: StoreState, chatId: string): readonly AssistantMessageRow[] {
  messagesTable(state, chatId);
  return groupedMessages(state).get(chatId) ?? NO_MESSAGES;
}

export function useChatMessages(chatId: string): readonly AssistantMessageRow[] {
  return useStoreSelector((state) => messagesOfChat(state, chatId), sameRows, [chatId]);
}

function sameFacts(left: FooterFacts | null, right: FooterFacts | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.costMicros === right.costMicros &&
    left.context === right.context &&
    left.replies === right.replies &&
    left.files === right.files
  );
}

export function useFooterFacts(chatId: string): FooterFacts | null {
  return useStoreSelector(
    (state) => {
      const chat = state.tables.ai_chats.byId[chatId];
      return chat === undefined ? null : footerFacts(chat, messagesOfChat(state, chatId));
    },
    sameFacts,
    [chatId],
  );
}

export interface LiveTurnView {
  readonly text: string;
  readonly working: boolean;
  readonly view: StreamView;
  readonly at: number | null;
}

const NO_TURN: LiveTurnView = {
  text: '',
  working: false,
  view: { settled: [], tail: '', pending: null },
  at: null,
};

function liveViewOf(parser: StreamParser): (turns: Turns, chatId: string) => LiveTurnView {
  let last = NO_TURN;
  return (turns, chatId) => {
    const turn = liveTurnOf(turns, chatId);
    if (turn === null) return NO_TURN;
    const working = turn.state !== 'failed';
    if (turn.text === last.text) {
      if (working !== last.working) last = { ...last, working };
      return last;
    }
    last = { text: turn.text, working, view: parser.view(turn.text), at: Date.now() };
    return last;
  };
}

const LONG_TAIL = 2048;
const LONG_TAIL_MS = 250;

export function useLiveTurn(chatId: string, intervalMs: number, enabled: boolean): LiveTurnView {
  const store = useEntityStore();
  const paused = useScreenPaused();
  const [view, setView] = useState(NO_TURN);
  useEffect(() => {
    if (!enabled || paused) {
      return undefined;
    }
    const read = liveViewOf(new StreamParser());
    let timer: ReturnType<typeof setTimeout> | null = null;
    let flushedAt = 0;
    let gap = intervalMs;
    const flush = (): void => {
      timer = null;
      flushedAt = Date.now();
      const next = read(store.get().turns, chatId);
      gap = next.view.tail.length > LONG_TAIL ? Math.max(intervalMs, LONG_TAIL_MS) : intervalMs;
      setView(next);
    };
    flush();
    const unsubscribe = store.subscriptions.add({
      reads: new Set([turnsSlice(chatId)]),
      wake: () => {
        timer ??= setTimeout(flush, Math.max(0, flushedAt + gap - Date.now()));
      },
    });
    return (): void => {
      unsubscribe();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [store, chatId, intervalMs, enabled, paused]);
  return enabled ? view : NO_TURN;
}

export function useChatWorking(chatId: string): boolean {
  return useStoreSelector((state) => {
    const turn = liveTurnOf(turnsOfChat(state, chatId), chatId);
    return turn !== null && turn.state !== 'failed';
  });
}

function speakerOf(row: AssistantMessageRow): string | null {
  if (row.role !== 'person') {
    return null;
  }
  return row.origin === null || SELF_SOURCES.has(row.origin.source) ? 'You' : row.author;
}

function failureOf(row: AssistantMessageRow): ChatPreview['failure'] {
  if (row.state !== 'failed') {
    return null;
  }
  const reason = failureReasonOf(row.reason_code);
  return reason === null ? null : { sent: row.role !== 'person', reason };
}

function previewOf(row: AssistantMessageRow): ChatPreview {
  return {
    text: row.kind === 'call' ? callPreviewOf(row) : previewTextOf(row.text),
    at: row.created_at,
    speaker: row.kind === 'call' ? null : speakerOf(row),
    failure: failureOf(row),
  };
}

const previewsOfState = memoOnInputs(
  (state: StoreState) => [state.tables.assistant_messages],
  (state): ReadonlyMap<string, ChatPreview> => {
    const previews = new Map<string, ChatPreview>();
    for (const row of state.tables.assistant_messages.rows) {
      if (!previews.has(row.chat_id) && row.text.trim() !== '' && isChatActivity(row)) {
        previews.set(row.chat_id, previewOf(row));
      }
    }
    return previews;
  },
);

function samePreview(left: ChatPreview, right: ChatPreview): boolean {
  return (
    left.text === right.text &&
    left.at === right.at &&
    left.speaker === right.speaker &&
    left.failure?.reason === right.failure?.reason &&
    left.failure?.sent === right.failure?.sent
  );
}

function sameMap<T>(
  left: ReadonlyMap<string, T>,
  right: ReadonlyMap<string, T>,
  same: (a: T, b: T) => boolean,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    const other = right.get(key);
    if (other === undefined || !same(value, other)) {
      return false;
    }
  }
  return true;
}

function workingOf(turns: Turns): ReadonlyMap<string, ChatWork> {
  const working = new Map<string, ChatWork>();
  for (const turn of Object.values(turns)) {
    if (isWorking(turn)) {
      working.set(turn.chatId, { step: stepOf(turn) });
    }
  }
  return working;
}

const workingOfState = memoOnInputs(
  (state: StoreState) => [workingTurns(state)],
  (state) => workingOf(workingTurns(state)),
);

const pluginNamesOf = memoOnInputs(
  (state: StoreState) => [state.tables.plugins],
  (state): PluginNames =>
    new Map(state.tables.plugins.rows.map((row) => [row.id, row.manifest.name])),
);

function usePluginNames(): PluginNames {
  return useStoreSelector(pluginNamesOf, (left, right) => sameMap(left, right, (a, b) => a === b));
}

export function useChatEntrySources(): {
  readonly previews: ReadonlyMap<string, ChatPreview>;
  readonly working: ReadonlyMap<string, ChatWork>;
  readonly plugins: PluginNames;
} {
  return {
    previews: useStoreSelector(previewsOfState, (left, right) => sameMap(left, right, samePreview)),
    working: useStoreSelector(workingOfState, (left, right) =>
      sameMap(left, right, (a, b) => a.step === b.step),
    ),
    plugins: usePluginNames(),
  };
}

export function useChatEntries(): readonly ChatEntry[] {
  const chats = useAiChats();
  const { previews, working, plugins } = useChatEntrySources();
  return useMemo(
    () =>
      chats
        .filter((chat) => chat.archived_at === null)
        .map((chat) => entryOf(chat, { previews, working, plugins })),
    [chats, previews, working, plugins],
  );
}

export function useLatestChatId(): string | null {
  const chats = useAiChats();
  return chats.find((chat) => chat.archived_at === null && chat.kind !== 'subagent')?.id ?? null;
}

const unreadCountOf = memoOnInputs(
  (state: StoreState) => [state.tables.ai_chats],
  (state): number =>
    state.tables.ai_chats.rows.filter((chat) => chat.archived_at === null && chat.unread_count > 0)
      .length,
);

export function useUnreadChatCount(): number {
  return useStoreSelector(unreadCountOf);
}
