import type { ReactElement, ReactNode } from 'react';
import { useEffect, useEffectEvent } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { useRow } from '../../../store/selectors';
import { loadOlderMessages, type OlderLoader } from '../data/history';
import { ChatIntro } from './chat-intro';
import { ThreadItems } from './thread-items';
import { useThreadRows } from './thread-rows';
import { ThreadSkeleton } from './thread-skeleton';
import { useFocusParam } from './use-focused-message';

const FIRST_PAGE = 20;

function useFillFirstPage(
  historyKey: string,
  rows: readonly AssistantMessageRow[],
  loadOlder: OlderLoader,
): void {
  const short = rows.length < FIRST_PAGE;
  const load = useEffectEvent(() => {
    void loadOlderMessages(historyKey, rows, loadOlder);
  });
  useEffect(() => {
    if (short) {
      load();
    }
  }, [historyKey, short]);
}

function latestResponder(rows: readonly AssistantMessageRow[]): AssistantMessageRow | null {
  let latest: AssistantMessageRow | null = null;
  for (const row of rows) {
    const newer = latest === null || row.created_at >= latest.created_at;
    if (row.role === 'responder' && row.kind === 'text' && newer) {
      latest = row;
    }
  }
  return latest;
}

export function ThreadList({
  rows,
  empty,
  historyKey,
  loadOlder,
  intro = null,
}: {
  readonly rows: readonly AssistantMessageRow[];
  readonly empty: ReactElement;
  readonly historyKey: string;
  readonly loadOlder: OlderLoader;
  readonly intro?: ReactElement | null;
}): ReactNode {
  const model = useThreadRows(historyKey, rows);
  const chat = useRow('ai_chats', historyKey);
  const { focus, clearFocus } = useFocusParam();
  useFillFirstPage(historyKey, model.all, loadOlder);
  if (model.data.length === 0) {
    return model.complete ? (
      <View className="flex-1 justify-center py-section-gap">{empty}</View>
    ) : (
      <ThreadSkeleton />
    );
  }
  return (
    <ThreadItems
      rows={model.data}
      loading={model.loading}
      readAt={model.readAt}
      intro={model.complete ? (intro ?? (chat === null ? null : <ChatIntro chat={chat} />)) : null}
      focusId={focus}
      exhausted={model.complete}
      onFocused={clearFocus}
      onOlder={() => {
        void loadOlderMessages(historyKey, model.all, loadOlder);
      }}
      announced={latestResponder(model.all)}
    />
  );
}
