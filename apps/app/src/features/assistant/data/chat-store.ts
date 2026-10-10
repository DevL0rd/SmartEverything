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
import { sameStatusDock, statusDockOf, type StatusDockView } from '../model/status-dock';
import type { PluginNames } from '../model/chat-source';
import { liveTurnOf, type Turn, type Turns } from '../../../store/chat-turns';
import { callPreviewOf } from './call-transcript';

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

export function useChatMessages(chatId: string): readonly AssistantMessageRow[] {
  return useStoreSelector(
    (state) => state.tables.assistant_messages.rows.filter((row) => row.chat_id === chatId),
    sameRows,
    [chatId],
  );
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
      return chat === undefined
        ? null
        : footerFacts(
            chat,
            state.tables.assistant_messages.rows.filter((row) => row.chat_id === chatId),
          );
    },
    sameFacts,
    [chatId],
  );
}

export function useThrottledTurnText(chatId: string, intervalMs: number): string {
  const store = useEntityStore();
  const [text, setText] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let flushedAt = 0;
    const flush = (): void => {
      timer = null;
      flushedAt = Date.now();
      setText(liveTurnOf(store.get().turns, chatId)?.text ?? '');
    };
    flush();
    const unsubscribe = store.subscribe(() => {
      timer ??= setTimeout(flush, Math.max(0, flushedAt + intervalMs - Date.now()));
    });
    return (): void => {
      unsubscribe();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [store, chatId, intervalMs]);
  return text;
}

export function useChatTurnField<T>(chatId: string, pick: (turn: Turn) => T): T | null {
  return useStoreSelector((state) => {
    const turn = liveTurnOf(state.turns, chatId);
    return turn === null ? null : pick(turn);
  });
}

export function useStatusDock(chatId: string): StatusDockView | null {
  return useStoreSelector((state) => statusDockOf(state.turns, chatId), sameStatusDock, [chatId]);
}

export function useChatWorking(chatId: string): boolean {
  return useStoreSelector((state) => {
    const turn = liveTurnOf(state.turns, chatId);
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

function stepOf(turn: Turn): string | null {
  const running = turn.tools.findLast((tool) => tool.state === 'running');
  return running?.title ?? turn.steps.at(-1) ?? null;
}

function workingOf(turns: Turns): ReadonlyMap<string, ChatWork> {
  const working = new Map<string, ChatWork>();
  for (const turn of Object.values(turns)) {
    if (turn.state !== 'idle' && turn.state !== 'failed') {
      working.set(turn.chatId, { step: stepOf(turn) });
    }
  }
  return working;
}

const workingOfState = memoOnInputs(
  (state: StoreState) => [state.turns],
  (state) => workingOf(state.turns),
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
