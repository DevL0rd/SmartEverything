import type { ReactElement, ReactNode } from 'react';
import { memo, useMemo, useState, type RefObject } from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  FlashList,
  type FlashListProps,
  type FlashListRef,
  type ListRenderItem,
} from '@shopify/flash-list';
import { useIdiom } from '../../design/platform';
import { useListProbe } from '../../perf/list-probe';
import { useMeasuredWidth } from '../use-measured-width';
import { DRAW_DISTANCE } from '../virtual-list';
import { RowScope, useRowTracking, type RowVisibility } from '../virtual-list-visibility';
import { DayHead } from './day-head';
import { useMonthFocus, type MonthFocus } from './month-focus';
import { dayText, type DayText } from './day-text';
import {
  headIndices,
  layoutGrid,
  reuseGridRows,
  rowHeight,
  TILE_GAP,
  type MediaGridRow,
  type MediaZoomStep,
  type PackedDay,
  type PlacedTile,
  type TileRow,
} from './justify';
import { dayMark, type DayMark, type MediaSelection } from './selection';
import { MediaTileView, type TileActions } from './tile';
import { useThumbnailWindow } from './thumbnail-window';
import { useContentAnchor } from './content-anchor';
import { groupTiles, type MediaDay, type MediaGrouping, type MediaTile } from './tiles';

export interface DayDecor {
  readonly placeOf: (day: MediaDay) => string | null;
  readonly textOf?: (day: MediaDay) => DayText;
}

export type { MonthFocus } from './month-focus';

export interface MediaGridProps extends TileActions {
  readonly tiles: readonly MediaTile[];
  readonly step: MediaZoomStep;
  readonly today: string;
  readonly grouping?: MediaGrouping;
  readonly decor?: DayDecor;
  readonly header?: ReactElement;
  readonly empty?: ReactElement;
  readonly footer?: ReactElement;
  readonly onEndReached?: () => void;
  readonly probe?: string;
  readonly onPrefetchTiles?: (tiles: readonly MediaTile[]) => void;
  readonly selection?: MediaSelection;
  readonly onDay?: (ids: readonly string[]) => void;
  readonly focus?: MonthFocus | null;
}

interface Picking {
  readonly selection: MediaSelection | undefined;
  readonly onDay: ((ids: readonly string[]) => void) | undefined;
}

interface RowProps {
  readonly row: MediaGridRow;
  readonly rows: RowVisibility;
  readonly today: string;
  readonly decor: DayDecor | undefined;
  readonly actions: TileActions;
  readonly picking: Picking;
}

function TileLine({
  tiles,
  height,
  actions,
  selection,
}: {
  readonly tiles: readonly PlacedTile[];
  readonly height: number;
  readonly actions: TileActions;
  readonly selection: MediaSelection | undefined;
}): ReactNode {
  const picked = selection?.active === true ? selection.ids : null;
  return (
    <View className="flex-row gap-0.75">
      {tiles.map((placed, slot) => (
        <MediaTileView
          key={slot}
          tile={placed.tile}
          width={placed.width}
          height={height}
          selecting={picked !== null}
          selected={picked?.has(placed.tile.id) === true}
          {...actions}
        />
      ))}
    </View>
  );
}

function markOf(day: MediaDay, picking: Picking): DayMark | null {
  if (picking.selection?.active !== true || picking.onDay === undefined) return null;
  return dayMark(
    picking.selection,
    day.tiles.map((tile) => tile.id),
  );
}

function Head({
  day,
  today,
  decor,
  picking,
  packed,
}: {
  readonly day: MediaDay;
  readonly today: string;
  readonly decor: DayDecor | undefined;
  readonly picking: Picking;
  readonly packed: boolean;
}): ReactNode {
  const text = decor?.textOf?.(day) ?? dayText(day.key, day.tiles.length, today);
  const { onDay } = picking;
  return (
    <DayHead
      title={text.title}
      detail={text.detail}
      place={decor?.placeOf(day) ?? null}
      mark={markOf(day, picking)}
      packed={packed}
      onMark={() => {
        onDay?.(day.tiles.map((tile) => tile.id));
      }}
    />
  );
}

function widthOf(width: number): ViewStyle {
  return { width };
}

function Packed({
  row,
  days,
  today,
  decor,
  actions,
  picking,
}: Omit<RowProps, 'rows' | 'row'> & {
  readonly row: TileRow;
  readonly days: readonly PackedDay[];
}): ReactNode {
  return (
    <View className="flex-row gap-3 px-gutter pb-0.75">
      {days.map((packed) => (
        <View key={packed.day.key} style={widthOf(packed.width)}>
          <Head day={packed.day} today={today} decor={decor} picking={picking} packed />
          <TileLine
            tiles={packed.tiles}
            height={row.height}
            actions={actions}
            selection={picking.selection}
          />
        </View>
      ))}
    </View>
  );
}

function Row({ row, rows, today, decor, actions, picking }: RowProps): ReactNode {
  if (row.kind === 'head') {
    return <Head day={row.day} today={today} decor={decor} picking={picking} packed={false} />;
  }
  return (
    <RowScope rows={rows} rowKey={row.key}>
      {row.days === undefined ? (
        <View className="px-gutter pb-0.75">
          <TileLine
            tiles={row.tiles}
            height={row.height}
            actions={actions}
            selection={picking.selection}
          />
        </View>
      ) : (
        <Packed
          row={row}
          days={row.days}
          today={today}
          decor={decor}
          actions={actions}
          picking={picking}
        />
      )}
    </RowScope>
  );
}

const GridRow = memo(Row);

function rowKeyOf(row: MediaGridRow): string {
  return row.key;
}

function rowTypeOf(row: MediaGridRow): string {
  return row.kind;
}

function useStableRows(next: readonly MediaGridRow[]): readonly MediaGridRow[] {
  const [held, setHeld] = useState(next);
  const stable = reuseGridRows(held, next);
  if (stable !== held) setHeld(stable);
  return stable;
}

function packsDays(step: MediaZoomStep, grouping: MediaGrouping): boolean {
  return grouping === 'day' && step !== 'comfortable';
}

function useGridRows(
  tiles: readonly MediaTile[],
  step: MediaZoomStep,
  grouping: MediaGrouping,
  width: number,
): readonly MediaGridRow[] {
  const target = rowHeight(step, useIdiom());
  const days = useMemo(() => groupTiles(tiles, grouping), [tiles, grouping]);
  const pack = packsDays(step, grouping);
  const next = useMemo(
    () => layoutGrid(days, { width, target, gap: TILE_GAP, pack }),
    [days, width, target, pack],
  );
  return useStableRows(next);
}

function useScrollProps(
  name: string | undefined,
  total: number,
  step: MediaZoomStep,
): Partial<FlashListProps<MediaGridRow>> {
  const probe = useListProbe(name, total);
  const anchor = useContentAnchor(step);
  return probe.cell === undefined
    ? anchor
    : {
        ...anchor,
        onScroll: probe.scrollWith(anchor.onScroll),
        onLayout: probe.onLayout,
        onContentSizeChange: probe.onContentSizeChange,
        CellRendererComponent: probe.cell,
        scrollEventThrottle: 100,
      };
}

function ListFoot({ footer }: { readonly footer: ReactElement | undefined }): ReactNode {
  return <View className="pb-section-gap">{footer}</View>;
}

function useTileActions({ thumbs, onOpen, onMenu, badgeOf }: TileActions): TileActions {
  return useMemo(
    (): TileActions => ({
      thumbs,
      onOpen,
      ...(onMenu === undefined ? {} : { onMenu }),
      ...(badgeOf === undefined ? {} : { badgeOf }),
    }),
    [thumbs, onOpen, onMenu, badgeOf],
  );
}

interface LaidOut {
  readonly gridRows: readonly MediaGridRow[];
  readonly sticky: number[];
  readonly list: RefObject<FlashListRef<MediaGridRow> | null>;
}

function useLaidOut(
  props: {
    readonly tiles: readonly MediaTile[];
    readonly step: MediaZoomStep;
    readonly focus: MonthFocus | null | undefined;
  },
  grouping: MediaGrouping,
  width: number,
): LaidOut {
  const { tiles, step, focus } = props;
  const gridRows = useGridRows(tiles, step, grouping, width);
  const pack = packsDays(step, grouping);
  const sticky = useMemo(() => (pack ? [] : headIndices(gridRows)), [gridRows, pack]);
  return { gridRows, sticky, list: useMonthFocus(gridRows, focus) };
}

interface RowRendering {
  readonly rows: RowVisibility;
  readonly today: string;
  readonly decor: DayDecor | undefined;
  readonly tileActions: TileActions;
  readonly input: Picking;
}

function useRowRenderer({ rows, today, decor, tileActions, input }: RowRendering): {
  readonly renderRow: ListRenderItem<MediaGridRow>;
  readonly picking: Picking;
} {
  const actions = useTileActions(tileActions);
  const { selection, onDay } = input;
  const picking = useMemo((): Picking => ({ selection, onDay }), [selection, onDay]);
  const renderRow: ListRenderItem<MediaGridRow> = ({ item }) => (
    <GridRow
      row={item}
      rows={rows}
      today={today}
      decor={decor}
      actions={actions}
      picking={picking}
    />
  );
  return { renderRow, picking };
}

function useTracked(
  gridRows: readonly MediaGridRow[],
  onPrefetchTiles: MediaGridProps['onPrefetchTiles'],
): ReturnType<typeof useRowTracking> {
  return useRowTracking(useThumbnailWindow(gridRows, DRAW_DISTANCE, onPrefetchTiles));
}

function WidthProbe({
  onLayout,
}: {
  readonly onLayout: ReturnType<typeof useMeasuredWidth>['onLayout'];
}): ReactNode {
  return (
    <View pointerEvents="none" className="px-gutter">
      <View onLayout={onLayout} />
    </View>
  );
}

export function MediaGrid({
  tiles,
  step,
  today,
  grouping = 'day',
  decor,
  header,
  empty,
  footer,
  onEndReached,
  probe,
  onPrefetchTiles,
  selection,
  onDay,
  focus,
  ...tileActions
}: MediaGridProps): ReactNode {
  const measured = useMeasuredWidth();
  const { gridRows, sticky, list } = useLaidOut({ tiles, step, focus }, grouping, measured.width);
  const { rows, pairs } = useTracked(gridRows, onPrefetchTiles);
  const { renderRow, picking } = useRowRenderer({
    rows,
    today,
    decor,
    tileActions,
    input: { selection, onDay },
  });
  return (
    <View className="flex-1">
      <WidthProbe onLayout={measured.onLayout} />
      <FlashList<MediaGridRow>
        ref={list}
        data={gridRows}
        keyExtractor={rowKeyOf}
        getItemType={rowTypeOf}
        renderItem={renderRow}
        viewabilityConfigCallbackPairs={pairs}
        {...useScrollProps(probe, gridRows.length, step)}
        stickyHeaderIndices={sticky}
        extraData={picking}
        drawDistance={DRAW_DISTANCE}
        ListHeaderComponent={header}
        ListEmptyComponent={tiles.length === 0 ? empty : undefined}
        ListFooterComponent={<ListFoot footer={footer} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}
