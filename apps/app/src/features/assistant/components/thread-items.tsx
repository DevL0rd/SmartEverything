import type { ReactElement, ReactNode, RefObject } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, View, type ListRenderItem } from 'react-native';
import { useValue } from '../../../design/external-store';
import { useOlderLoading } from '../data/history';
import {
  RowScope,
  useRowTracking,
  type RowVisibility,
} from '../../../components/virtual-list-visibility';
import { OlderHistoryLine } from './chat-states';
import { FloatingDay, JumpPill, jumpOf, type Jump } from './jump-pill';
import { MessageBubble } from './message-bubble';
import { PendingBubble } from './pending-bubble';
import { useListProbe } from '../../../perf/list-probe';
import { PerfProbe } from '../../../perf/probe-kit';
import { sameMessage, startsMessage, type MessageItem } from '../data/thread';
import { isAssistantParticipant, isAssistantReply } from '../model/speaker';
import { initialRowCount, type RowShape } from '../model/initial-rows';
import type { ThreadRow } from './thread-rows';
import { ImageOperationBubble } from '../images/components/image-receipts';
import { useFocusedMessage } from './use-focused-message';
import { entryLedger, RowEntry, type EntryLedger } from './rise';
import { ROW_GAP_CLASS, entryOf, rowGapOf } from './thread-rhythm';
import {
  AWAY_PX,
  WINDOW_SIZE,
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

function sameOptionalMessage(left: MessageItem | null, right: MessageItem | null): boolean {
  return left === null || right === null ? left === right : sameMessage(left, right);
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
        left.group === right.group &&
        sameOptionalMessage(left.message, right.message)
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
    return {
      key: outbox.key,
      at: outbox.message.queuedAt,
      streaming: false,
      reply: false,
      unread: false,
      mine: true,
    };
  }
  const row = rows.find((candidate) => candidate.type !== 'outbox');
  if (row?.type === 'image-operation') return newestImageOf(row, readAt);
  if (row?.type !== 'message') {
    return null;
  }
  return newestMessageOf(row, readAt);
}

function newestReplyOf(rows: readonly ThreadRow[], readAt: string | null): Newest | null {
  for (const row of rows) {
    if (row.type === 'image-operation') return newestImageOf(row, readAt);
    if (row.type === 'message' && isAssistantReply(row.row)) return newestMessageOf(row, readAt);
  }
  return null;
}

function useScrollTail(
  rows: readonly ThreadRow[],
  readAt: string | null,
): Parameters<typeof useThreadScroll>[1] {
  return useMemo(() => {
    const newest = newestOf(rows, readAt);
    return { newest, reply: newest?.reply === true ? newest : newestReplyOf(rows, readAt) };
  }, [rows, readAt]);
}

function newestMessageOf(row: MessageItem, readAt: string | null): Newest {
  const ai = isAssistantParticipant(row.row);
  return {
    key: row.row.id,
    at: row.row.created_at,
    streaming: row.row.state === 'working' && ai,
    reply: isAssistantReply(row.row),
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
    at: row.receipt.created_at,
    streaming: false,
    reply: true,
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
  readonly jump: Jump | null;
  readonly dayOf: ReadonlyMap<string, string>;
  readonly ledger: EntryLedger;
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
  const scroll = useThreadScroll(list, useScrollTail(rows, readAt));
  const scroller = useIndexScroller(list);
  const topKeys = useTopKey();
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  const jump = useMemo(
    () => (scroll.away ? jumpOf(rows, scroll.anchor) : null),
    [rows, scroll.away, scroll.anchor],
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
  const [ledger] = useState(() => entryLedger(Date.now()));
  return {
    scroll,
    newestKey: rows.find((row) => row.type !== 'outbox')?.key ?? null,
    scroller,
    topKeys,
    flashed,
    jump,
    dayOf,
    ledger,
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

function useRenderRow(
  model: ItemsModel,
  rows: readonly ThreadRow[],
  visibility: RowVisibility,
): ListRenderItem<ThreadRow> {
  const { onNewestLayout } = model.scroll;
  const { newestKey, flashed, ledger } = model;
  return useCallback(
    ({ item, index }) => (
      <View
        {...(item.key === newestKey ? { onLayout: onNewestLayout } : {})}
        className={`w-full ${ROW_GAP_CLASS[rowGapOf(item, rows[index + 1])]}`}
      >
        <RowEntry ledger={ledger} {...entryOf(item)}>
          <RowScope rows={visibility} rowKey={item.key}>
            <PerfProbe id="row">
              <RowView row={item} flash={flashes(item, flashed)} />
            </PerfProbe>
          </RowScope>
        </RowEntry>
      </View>
    ),
    [newestKey, flashed, onNewestLayout, visibility, ledger, rows],
  );
}

export function ThreadItems(props: ThreadItemsProps): ReactNode {
  const { rows, historyKey, intro, onOlder, footer = null } = props;
  const list = useRef<FlatList<ThreadRow>>(null);
  const model = useItemsModel(props, list);
  const { scroll } = model;
  const tracking = useRowTracking(model.topKeys.onViewableItemsChanged);
  const renderItem = useRenderRow(model, rows, tracking.rows);
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
          onScrollBeginDrag={scroll.onScrollBeginDrag}
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
      {model.jump === null ? null : <JumpPill jump={model.jump} onPress={scroll.toBottom} />}
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
      <OlderHistoryLine loading={loading} />
      {intro}
    </>
  );
}
