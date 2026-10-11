import type { ReactElement, ReactNode, RefObject } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { useColour } from '../../../design/colour';
import { FloatingDay, JumpPill } from './jump-pill';
import { MessageBubble } from './message-bubble';
import { PendingBubble } from './pending-bubble';
import { useListProbe } from '../../../perf/list-probe';
import { PerfProbe } from '../../../perf/probe-kit';
import { StatusAnnouncer } from './status-announcer';
import type { MessageItem } from '../data/thread';
import { initialRowCount, type RowShape } from '../model/initial-rows';
import type { ThreadRow } from './thread-rows';
import { useFocusedMessage } from './use-focused-message';
import {
  AWAY_PX,
  unseenOf,
  useIndexScroller,
  useThreadScroll,
  useTopKey,
  type Newest,
  type ThreadScroll,
} from './use-thread-scroll';

export interface ThreadItemsProps {
  readonly rows: readonly ThreadRow[];
  readonly loading: boolean;
  readonly readAt: string | null;
  readonly intro: ReactElement | null;
  readonly focusId: string | null;
  readonly exhausted: boolean;
  readonly onFocused: () => void;
  readonly onOlder: () => void;
  readonly announced: AssistantMessageRow | null;
}

const TOP_THIRD = 0.33;

const BATCH = 6;

const OPEN_WINDOW = 3;

const WARM_MS = 700;

function shapeOf(row: ThreadRow): RowShape {
  return row.type === 'message'
    ? { text: row.row.text, attachments: row.row.attachments.length, embeds: row.row.embeds.length }
    : { text: row.message.text, attachments: row.message.attachments.length, embeds: 0 };
}

function useWindowSize(wanted: number): number {
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setWarm(true);
    }, WARM_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, []);
  return warm ? wanted : Math.min(wanted, OPEN_WINDOW);
}

function useListWindow(
  rows: readonly ThreadRow[],
  wanted: number,
): { readonly initialNumToRender: number; readonly windowSize: number } {
  const { height } = useWindowDimensions();
  const [initialNumToRender] = useState(() =>
    initialRowCount(rows.slice(0, 10).map(shapeOf), height),
  );
  return { initialNumToRender, windowSize: useWindowSize(wanted) };
}

function Loader({ loading }: { readonly loading: boolean }): ReactNode {
  const tint = useColour('primary');
  return loading ? (
    <View className="items-center py-4">
      <ActivityIndicator color={tint} />
    </View>
  ) : null;
}

function spacingOf(row: ThreadRow): string {
  if (row.type !== 'message') {
    return 'pt-2';
  }
  const startOfRun = row.position === 'first' || row.position === 'only';
  return startOfRun || row.day !== null ? 'pt-6' : 'pt-0.5';
}

function sameMessage(left: MessageItem, right: MessageItem): boolean {
  return (
    left.row === right.row &&
    left.position === right.position &&
    left.day === right.day &&
    left.gap === right.gap &&
    left.divider === right.divider &&
    left.latestReply === right.latestReply &&
    left.multiParty === right.multiParty &&
    left.waiting === right.waiting &&
    left.replied === right.replied
  );
}

function sameRow(left: ThreadRow, right: ThreadRow): boolean {
  switch (left.type) {
    case 'message':
      return right.type === 'message' && sameMessage(left, right);
    case 'outbox':
      return right.type === 'outbox' && left.message === right.message;
  }
}

const RowView = memo(
  RowViewBase,
  (left, right) => left.flash === right.flash && sameRow(left.row, right.row),
);

function RowViewBase({
  row,
  flash,
}: {
  readonly row: ThreadRow;
  readonly flash: boolean;
}): ReactNode {
  switch (row.type) {
    case 'message':
      return (
        <PerfProbe id="bub">
          <MessageBubble item={row} flash={flash} />
        </PerfProbe>
      );
    case 'outbox':
      return <PendingBubble message={row.message} />;
  }
}

function newestOf(rows: readonly ThreadRow[], readAt: string | null): Newest | null {
  const outbox = rows.find((candidate) => candidate.type === 'outbox');
  if (outbox !== undefined) {
    return { key: outbox.key, streaming: false, unread: false, mine: true };
  }
  const row = rows.find((candidate) => candidate.type === 'message');
  if (row?.type !== 'message') {
    return null;
  }
  const ai = row.speaker.kind === 'ai';
  return {
    key: row.key,
    streaming: row.row.state === 'working' && ai,
    unread: ai && readAt !== null && row.row.created_at > readAt,
    mine: row.speaker.kind === 'me' && row.row.origin?.source === 'app',
  };
}

interface ItemsModel {
  readonly scroll: ThreadScroll;
  readonly newestKey: string | null;
  readonly scroller: ReturnType<typeof useIndexScroller>;
  readonly topKeys: ReturnType<typeof useTopKey>;
  readonly flashed: string | null;
  readonly unseen: number;
  readonly dayLabel: string | null;
}

function useLanding(
  rows: readonly ThreadRow[],
  scrollTo: (index: number, position: number) => void,
): void {
  const landed = useRef(false);
  const divider = rows.findIndex((row) => row.type === 'message' && row.divider);
  useEffect(() => {
    if (!landed.current && divider > 0) {
      landed.current = true;
      scrollTo(divider, TOP_THIRD);
    }
  }, [divider, scrollTo]);
}

function useItemsModel(props: ThreadItemsProps, list: RefObject<FlatList | null>): ItemsModel {
  const { rows, readAt, focusId, exhausted, onFocused, onOlder } = props;
  const newest = useMemo(() => newestOf(rows, readAt), [rows, readAt]);
  const scroll = useThreadScroll(list, newest);
  const scroller = useIndexScroller(list);
  const topKeys = useTopKey();
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  const messageKeys = useMemo(
    () => rows.flatMap((row) => (row.type === 'message' ? [row.key] : [])),
    [rows],
  );
  const dayOf = useMemo(
    () => new Map(rows.flatMap((row) => (row.type === 'message' ? [[row.key, row.dayName]] : []))),
    [rows],
  );
  const flashed = useFocusedMessage({
    keys,
    focusId,
    scroller,
    exhausted,
    loadMore: onOlder,
    onDone: onFocused,
  });
  useLanding(rows, scroller.scrollTo);
  const showDay = scroll.away && scroll.active;
  return {
    scroll,
    newestKey: rows.find((row) => row.type === 'message')?.key ?? null,
    scroller,
    topKeys,
    flashed,
    unseen: scroll.away ? unseenOf(messageKeys, scroll.anchor) : 0,
    dayLabel: showDay ? (dayOf.get(topKeys.topKey ?? '') ?? null) : null,
  };
}

function keyOf(row: ThreadRow): string {
  return row.key;
}

function useRenderRow(model: ItemsModel): ListRenderItem<ThreadRow> {
  const { onNewestLayout } = model.scroll;
  const { newestKey, flashed } = model;
  return useCallback(
    ({ item }) => (
      <View
        {...(item.key === newestKey ? { onLayout: onNewestLayout } : {})}
        className={`w-full max-w-reading self-center ${spacingOf(item)}`}
      >
        <PerfProbe id="row">
          <RowView row={item} flash={flashed === item.key} />
        </PerfProbe>
      </View>
    ),
    [newestKey, flashed, onNewestLayout],
  );
}

export function ThreadItems(props: ThreadItemsProps): ReactNode {
  const { rows, loading, intro, onOlder, announced } = props;
  const list = useRef<FlatList<ThreadRow>>(null);
  const model = useItemsModel(props, list);
  const { scroll } = model;
  const renderItem = useRenderRow(model);
  const probe = useListProbe('chat', rows.length);
  const listWindow = useListWindow(rows, scroll.windowSize);
  return (
    <View className="flex-1" onLayout={scroll.onViewportLayout}>
      <PerfProbe id="flat">
        <FlatList
          ref={list}
          inverted
          {...listWindow}
          maxToRenderPerBatch={BATCH}
          data={rows}
          keyExtractor={keyOf}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          maintainVisibleContentPosition={
            scroll.pinned
              ? { minIndexForVisible: 1 }
              : { minIndexForVisible: 0, autoscrollToTopThreshold: AWAY_PX }
          }
          onScroll={probe.scrollWith(scroll.onScroll)}
          onLayout={probe.onLayout}
          CellRendererComponent={probe.cell}
          onContentSizeChange={scroll.onContentSizeChange}
          scrollEventThrottle={100}
          onEndReached={onOlder}
          onEndReachedThreshold={0.4}
          onScrollToIndexFailed={model.scroller.onFailed}
          onViewableItemsChanged={model.topKeys.onViewableItemsChanged}
          ListFooterComponent={
            <>
              <Loader loading={loading} />
              {intro}
            </>
          }
          contentContainerClassName="px-gutter pb-section-gap"
          renderItem={renderItem}
        />
      </PerfProbe>
      {model.dayLabel === null ? null : <FloatingDay label={model.dayLabel} />}
      {scroll.away ? <JumpPill unseen={model.unseen} onPress={scroll.toBottom} /> : null}
      <StatusAnnouncer row={announced} />
    </View>
  );
}
