import type { ReactElement, ReactNode, RefObject } from 'react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { loadOlderMessages, mergedRows, useOlderMessages, type OlderLoader } from '../data/history';
import { threadOf, type ThreadItem } from '../data/thread';
import { MessageBubble } from './message-bubble';
import { RequestStatus } from './request-status';

function DayLabel({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="items-center pb-3">
      <Text variant="caption" tone="faint">
        {label}
      </Text>
    </View>
  );
}

export interface LiveStatus {
  readonly requestId: string;
  readonly node: ReactNode;
}

function Item({
  item,
  live,
}: {
  readonly item: ThreadItem;
  readonly live: LiveStatus | null;
}): ReactNode {
  switch (item.type) {
    case 'message':
      return (
        <>
          {item.day === null ? null : <DayLabel label={item.day} />}
          <MessageBubble row={item.row} />
        </>
      );
    case 'status':
      return (
        <View>
          {live?.requestId === item.request.id ? (
            live.node
          ) : (
            <RequestStatus request={item.request} />
          )}
        </View>
      );
  }
}

function spacing(item: ThreadItem): string {
  if (item.type === 'message' && (item.turnStart || item.day !== null)) {
    return 'pt-6';
  }
  return 'pt-1';
}

function Loader({ loading }: { readonly loading: boolean }): ReactNode {
  const tint = useColour('primary');
  return loading ? (
    <View className="items-center py-4">
      <ActivityIndicator color={tint} />
    </View>
  ) : null;
}

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

const AWAY_PX = 160;

function JumpToLatest({
  list,
}: {
  readonly list: RefObject<FlatList<ThreadItem> | null>;
}): ReactNode {
  return (
    <View className="absolute bottom-4 right-4">
      <IconButton
        icon="chevronDown"
        label="Jump to latest"
        variant="tonal"
        onPress={() => {
          list.current?.scrollToOffset({ offset: 0, animated: true });
        }}
      />
    </View>
  );
}

function Items({
  items,
  live,
  loading,
  onOlder,
}: {
  readonly items: readonly ThreadItem[];
  readonly live: LiveStatus | null;
  readonly loading: boolean;
  readonly onOlder: () => void;
}): ReactNode {
  const list = useRef<FlatList<ThreadItem>>(null);
  const [away, setAway] = useState(false);
  return (
    <View className="flex-1">
      <FlatList
        ref={list}
        inverted
        data={items}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: AWAY_PX,
        }}
        onScroll={(event) => {
          setAway(event.nativeEvent.contentOffset.y > AWAY_PX);
        }}
        scrollEventThrottle={100}
        onEndReached={onOlder}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<Loader loading={loading} />}
        contentContainerClassName="px-gutter pb-4"
        renderItem={({ item }) => (
          <View className={`w-full max-w-reading self-center ${spacing(item)}`}>
            <Item item={item} live={live} />
          </View>
        )}
      />
      {away ? <JumpToLatest list={list} /> : null}
    </View>
  );
}

export function ThreadList({
  rows,
  empty,
  historyKey,
  loadOlder,
  live = null,
}: {
  readonly rows: readonly AssistantMessageRow[];
  readonly empty: ReactElement;
  readonly historyKey: string;
  readonly loadOlder: OlderLoader;
  readonly live?: LiveStatus | null;
}): ReactNode {
  const older = useOlderMessages(historyKey);
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const all = useMemo(() => mergedRows(rows, older.rows), [rows, older.rows]);
  const items = useMemo(() => threadOf(all, now, timeZone), [all, now, timeZone]);
  useFillFirstPage(historyKey, all, loadOlder);
  if (items.length === 0 && !older.complete) {
    return <Loader loading />;
  }
  if (items.length === 0) {
    return <View className="flex-1 justify-center py-section-gap">{empty}</View>;
  }
  return (
    <Items
      items={items}
      live={live}
      loading={older.loading}
      onOlder={() => {
        void loadOlderMessages(historyKey, all, loadOlder);
      }}
    />
  );
}
