import type { ReactElement, ReactNode } from 'react';
import { useEffect, useEffectEvent } from 'react';
import { ScrollView, View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { useRow } from '../../../store/selectors';
import {
  historyRevision,
  historySessionKey,
  loadOlderMessages,
  ownOlderMessages,
  type OlderLoader,
} from '../data/history';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { useScreenPaused } from '../../../design/screen-pause';
import { useValue } from '../../../design/external-store';
import { ChatIntro } from './chat-intro';
import { ThreadItems } from './thread-items';
import { useThreadRows } from './thread-rows';
import { ThreadSkeleton } from './thread-skeleton';
import { useFocusParam } from './use-focused-message';
import { TurnFeedback } from './turn-feedback';
import { background } from '@smarteverything/logging';

const FIRST_PAGE = 20;

function useFillFirstPage(
  historyKey: string,
  rows: readonly AssistantMessageRow[],
  loadOlder: OlderLoader,
): void {
  const short = rows.length < FIRST_PAGE;
  const store = useEntityStore();
  const session = useStoreSelector(historySessionKey);
  const revision = useValue(historyRevision);
  const paused = useScreenPaused();
  const fetchOlder = useEffectEvent(loadOlder);
  const load = useEffectEvent(() => {
    background(loadOlderMessages(historyKey, rows, loadOlder), 'older_messages.load_failed');
  });
  useEffect(() => {
    if (paused || session === null) return undefined;
    return ownOlderMessages(historyKey, fetchOlder, store);
  }, [historyKey, store, session, revision, paused]);
  useEffect(() => {
    if (short && !paused && session !== null) load();
  }, [historyKey, short, store, session, revision, paused]);
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

function emptyThread(model: {
  readonly data: readonly unknown[];
  readonly complete: boolean;
}): boolean {
  return model.complete && model.data.length === 0;
}

export function ThreadList({
  rows,
  empty,
  historyKey,
  loadOlder,
  intro = null,
  footer = null,
}: {
  readonly rows: readonly AssistantMessageRow[];
  readonly empty: ReactElement;
  readonly historyKey: string;
  readonly loadOlder: OlderLoader;
  readonly intro?: ReactElement | null;
  readonly footer?: ReactElement | null;
}): ReactNode {
  const model = useThreadRows(historyKey, rows);
  const chat = useRow('ai_chats', historyKey);
  const { focus, clearFocus } = useFocusParam();
  const progress = (
    <>
      {chat === null ? null : <TurnFeedback chat={chat} rows={model.all} />}
      {footer}
    </>
  );
  useFillFirstPage(historyKey, model.all, loadOlder);
  if (model.data.length === 0) {
    return emptyThread(model) ? (
      <EmptyThread empty={empty} footer={progress} />
    ) : (
      <LoadingThread footer={progress} />
    );
  }
  return (
    <ThreadItems
      footer={progress}
      rows={model.data}
      historyKey={historyKey}
      readAt={model.readAt}
      intro={model.complete ? (intro ?? (chat === null ? null : <ChatIntro chat={chat} />)) : null}
      focusId={focus}
      exhausted={model.complete}
      onFocused={clearFocus}
      onOlder={() => {
        background(loadOlderMessages(historyKey, model.all, loadOlder), 'older.load_failed');
      }}
      announced={latestResponder(model.all)}
    />
  );
}

function EmptyThread({
  empty,
  footer,
}: {
  readonly empty: ReactElement;
  readonly footer: ReactElement | null;
}): ReactNode {
  if (footer === null) return <View className="flex-1 justify-center py-section-gap">{empty}</View>;
  return (
    <ScrollView className="flex-1" contentContainerClassName="grow">
      <View className="flex-1 justify-center py-section-gap">{empty}</View>
      <View className="px-gutter">{footer}</View>
    </ScrollView>
  );
}

function LoadingThread({ footer }: { readonly footer: ReactElement }): ReactNode {
  return (
    <View className="flex-1">
      <ThreadSkeleton />
      <View className="px-gutter">{footer}</View>
    </View>
  );
}
