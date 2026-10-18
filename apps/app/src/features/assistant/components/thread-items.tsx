import type { ReactElement, ReactNode, RefObject } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, View, type ListRenderItem } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { ListLoader } from '../../../components/list-loader';
import { useValue } from '../../../design/external-store';
import { useOlderLoading } from '../data/history';
import {
  RowScope,
  useRowTracking,
  type RowVisibility,
} from '../../../components/virtual-list-visibility';
import { FloatingDay, JumpPill } from './jump-pill';
import { MessageBubble } from './message-bubble';
import { PendingBubble } from './pending-bubble';
import { useListProbe } from '../../../perf/list-probe';
import { PerfProbe } from '../../../perf/probe-kit';
import { StatusAnnouncer } from './status-announcer';
import { startsMessage, type MessageItem } from '../data/thread';
import { initialRowCount, type RowShape } from '../model/initial-rows';
import type { ThreadRow } from './thread-rows';
import { ImageOperationBubble } from '../images/components/image-receipts';
import { useFocusedMessage } from './use-focused-message';
import {
  AWAY_PX,
  WINDOW_SIZE,
  unseenOf,
  useIndexScroller,
  useThreadScroll,
  useTopKey,
  type Newest,
  type TopKey,
  type ThreadScroll,
} from './use-thread-scroll';

export interface ThreadItemsProps {
  readonly rows: readonly ThreadRow[];
  readonly historyKey: string;
  readonly readAt: string | null;
  readonly intro: ReactElement | null;
  readonly focusId: string | null;
  readonly exhausted: boolean;
  readonly onFocused: () => void;
  readonly onOlder: () => void;
  readonly announced: AssistantMessageRow | null;
  readonly footer?: ReactElement | null;
}

const TOP_THIRD = 0.33;

const BATCH = 8;

const HEAVY_BATCH = 3;

const PREFETCH_SCREENS = 2;

function shapeOf(row: ThreadRow): RowShape {
  if (row.type === 'image-operation')
    return { text: row.receipt.request.prompt, attachments: 1, embeds: 0 };
  return row.type === 'message'
    ? { text: row.row.text, attachments: row.row.attachments.length, embeds: row.row.embeds.length }
    : { text: row.message.text, attachments: row.message.attachments.length, embeds: 0 };
}

function hasSegments(rows: readonly ThreadRow[]): boolean {
  return rows.some((row) => row.type === 'message' && row.segment !== null);
}

function useListWindow(rows: readonly ThreadRow[]): {
  readonly initialNumToRender: number;
  readonly windowSize: number;
  readonly maxToRenderPerBatch: number;
} {
  const [initialNumToRender] = useState(() =>
    initialRowCount(rows.slice(0, 10).map(shapeOf), Dimensions.get('window').height),
  );
  return {
    initialNumToRender,
    windowSize: WINDOW_SIZE,
    maxToRenderPerBatch: hasSegments(rows) ? HEAVY_BATCH : BATCH,
  };
}

function spacingOf(row: ThreadRow): string {
  if (row.type !== 'message') {
    return 'pt-2';
  }
  if (!startsMessage(row)) return 'pt-2.5';
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
    left.replied === right.replied &&
    left.segment === right.segment
  );
}

function sameRow(left: ThreadRow, right: ThreadRow): boolean {
  switch (left.type) {
    case 'message':
      return right.type === 'message' && sameMessage(left, right);
    case 'outbox':
      return right.type === 'outbox' && left.message === right.message;
    case 'image-operation':
      return (
        right.type === 'image-operation' &&
        left.receipt === right.receipt &&
        (left.message === null || right.message === null
          ? left.message === right.message
          : sameMessage(left.message, right.message))
      );
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
    case 'image-operation':
      return <ImageOperationBubble item={row} flash={flash} renderMessage={renderImageMessage} />;
  }
}

function renderImageMessage(item: MessageItem, flash: boolean): ReactNode {
  return <MessageBubble item={item} flash={flash} hideText />;
}

function newestOf(rows: readonly ThreadRow[], readAt: string | null): Newest | null {
  const outbox = rows.find((candidate) => candidate.type === 'outbox');
  if (outbox !== undefined) {
    return { key: outbox.key, streaming: false, unread: false, mine: true };
  }
  const row = rows.find((candidate) => candidate.type !== 'outbox');
  if (row?.type === 'image-operation') return newestImageOf(row, readAt);
  if (row?.type !== 'message') {
    return null;
  }
  return newestMessageOf(row, readAt);
}

function newestMessageOf(row: MessageItem, readAt: string | null): Newest {
  const ai = row.speaker.kind === 'ai';
  return {
    key: row.row.id,
    streaming: row.row.state === 'working' && ai,
    unread: ai && readAt !== null && row.row.created_at > readAt,
    mine: row.speaker.kind === 'me' && row.row.origin?.source === 'app',
  };
}

function newestImageOf(
  row: Extract<ThreadRow, { readonly type: 'image-operation' }>,
  readAt: string | null,
): Newest {
  return {
    key: row.key,
    streaming: false,
    unread: readAt !== null && row.receipt.created_at > readAt,
    mine: false,
  };
}

interface ItemsModel {
  readonly scroll: ThreadScroll;
  readonly newestKey: string | null;
  readonly scroller: ReturnType<typeof useIndexScroller>;
  readonly topKeys: TopKey;
  readonly flashed: string | null;
  readonly unseen: number;
  readonly dayOf: ReadonlyMap<string, string>;
}

function messageOf(row: ThreadRow): MessageItem | null {
  switch (row.type) {
    case 'message':
      return row;
    case 'image-operation':
      return row.message;
    case 'outbox':
      return null;
  }
}

function useLanding(
  rows: readonly ThreadRow[],
  scrollTo: (index: number, position: number) => void,
): void {
  const landed = useRef(false);
  const divider = rows.findIndex((row) => messageOf(row)?.divider === true);
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
    () =>
      rows.flatMap((row) =>
        row.type === 'outbox' || (row.type === 'message' && !startsMessage(row)) ? [] : [row.key],
      ),
    [rows],
  );
  const dayOf = useMemo(
    () =>
      new Map(
        rows.flatMap((row) => {
          const message = messageOf(row);
          return message === null ? [] : [[row.key, message.dayName]];
        }),
      ),
    [rows],
  );
  const focusedKey =
    rows.find(
      (row) =>
        row.key === focusId ||
        (messageOf(row)?.row.id === focusId && (row.type !== 'message' || startsMessage(row))),
    )?.key ?? focusId;
  const flashed = useFocusedMessage({
    keys,
    focusId: focusedKey,
    scroller,
    exhausted,
    loadMore: onOlder,
    onDone: onFocused,
  });
  useLanding(rows, scroller.scrollTo);
  return {
    scroll,
    newestKey: rows.find((row) => row.type !== 'outbox')?.key ?? null,
    scroller,
    topKeys,
    flashed,
    unseen: scroll.away ? unseenOf(messageKeys, scroll.anchor) : 0,
    dayOf,
  };
}

function flashes(row: ThreadRow, flashed: string | null): boolean {
  return (
    flashed !== null &&
    (row.key === flashed ||
      (row.type === 'message' && row.segment !== null && row.row.id === flashed))
  );
}

function keyOf(row: ThreadRow): string {
  return row.key;
}

function useRenderRow(model: ItemsModel, visibility: RowVisibility): ListRenderItem<ThreadRow> {
  const { onNewestLayout } = model.scroll;
  const { newestKey, flashed } = model;
  return useCallback(
    ({ item }) => (
      <View
        {...(item.key === newestKey ? { onLayout: onNewestLayout } : {})}
        className={`w-full max-w-reading self-center ${spacingOf(item)}`}
      >
        <RowScope rows={visibility} rowKey={item.key}>
          <PerfProbe id="row">
            <RowView row={item} flash={flashes(item, flashed)} />
          </PerfProbe>
        </RowScope>
      </View>
    ),
    [newestKey, flashed, onNewestLayout, visibility],
  );
}

export function ThreadItems(props: ThreadItemsProps): ReactNode {
  const { rows, historyKey, intro, onOlder, announced, footer = null } = props;
  const list = useRef<FlatList<ThreadRow>>(null);
  const model = useItemsModel(props, list);
  const { scroll } = model;
  const tracking = useRowTracking(model.topKeys.onViewableItemsChanged);
  const renderItem = useRenderRow(model, tracking.rows);
  const probe = useListProbe('chat', rows.length);
  const listWindow = useListWindow(rows);
  return (
    <View className="flex-1" onLayout={scroll.onViewportLayout}>
      <PerfProbe id="flat">
        <FlatList
          ref={list}
          inverted
          {...listWindow}
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
          onEndReachedThreshold={PREFETCH_SCREENS}
          onScrollToIndexFailed={model.scroller.onFailed}
          viewabilityConfigCallbackPairs={tracking.pairs}
          ListHeaderComponent={footer}
          ListFooterComponent={<ThreadEnd historyKey={historyKey} intro={intro} />}
          contentContainerClassName="px-gutter pb-section-gap"
          renderItem={renderItem}
        />
      </PerfProbe>
      {scroll.away ? <DayLabel model={model} /> : null}
      {scroll.away ? <JumpPill unseen={model.unseen} onPress={scroll.toBottom} /> : null}
      <StatusAnnouncer row={announced} />
    </View>
  );
}

function DayLabel({ model }: { readonly model: ItemsModel }): ReactNode {
  const active = useValue(model.scroll.activity);
  const topKey = useValue(model.topKeys.store);
  const label = active ? (model.dayOf.get(topKey ?? '') ?? null) : null;
  return label === null ? null : <FloatingDay label={label} />;
}

function ThreadEnd({
  historyKey,
  intro,
}: {
  readonly historyKey: string;
  readonly intro: ReactElement | null;
}): ReactNode {
  const loading = useOlderLoading(historyKey);
  return (
    <>
      <ListLoader loading={loading} />
      {intro}
    </>
  );
}
