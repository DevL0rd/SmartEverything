import type { ReactElement, ReactNode } from 'react';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListProps, type ListRenderItem } from '@shopify/flash-list';
import { useIdiom } from '../../design/platform';
import { useListProbe } from '../../perf/list-probe';
import { useMeasuredWidth } from '../use-measured-width';
import { DRAW_DISTANCE } from '../virtual-list';
import { RowScope, useRowTracking, type RowVisibility } from '../virtual-list-visibility';
import { DayHead } from './day-head';
import { dayText, type DayText } from './day-text';
import {
  headIndices,
  layoutGrid,
  reuseGridRows,
  rowHeight,
  TILE_GAP,
  type MediaGridRow,
  type MediaZoomStep,
  type TileRow,
} from './justify';
import { MediaTileView, type TileActions } from './tile';
import { useThumbnailWindow } from './thumbnail-window';
import { groupTiles, type MediaDay, type MediaGrouping, type MediaTile } from './tiles';

export interface DayDecor {
  readonly placeOf: (day: MediaDay) => string | null;
  readonly actionOf: (day: MediaDay) => ReactElement | null;
  readonly textOf?: (day: MediaDay) => DayText;
}

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
}

interface RowProps {
  readonly row: MediaGridRow;
  readonly rows: RowVisibility;
  readonly today: string;
  readonly decor: DayDecor | undefined;
  readonly actions: TileActions;
}

function Tiles({
  row,
  actions,
}: {
  readonly row: TileRow;
  readonly actions: TileActions;
}): ReactNode {
  return (
    <View className="flex-row gap-0.75 px-gutter pb-0.75">
      {row.tiles.map((placed) => (
        <MediaTileView
          key={placed.tile.id}
          tile={placed.tile}
          width={placed.width}
          height={row.height}
          {...actions}
        />
      ))}
    </View>
  );
}

function Row({ row, rows, today, decor, actions }: RowProps): ReactNode {
  if (row.kind === 'head') {
    const text = decor?.textOf?.(row.day) ?? dayText(row.day.key, row.day.tiles.length, today);
    return (
      <DayHead
        title={text.title}
        detail={text.detail}
        place={decor?.placeOf(row.day) ?? null}
        action={decor?.actionOf(row.day) ?? null}
      />
    );
  }
  return (
    <RowScope rows={rows} rowKey={row.key}>
      <Tiles row={row} actions={actions} />
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

function useGridRows(
  tiles: readonly MediaTile[],
  step: MediaZoomStep,
  grouping: MediaGrouping,
  width: number,
): readonly MediaGridRow[] {
  const target = rowHeight(step, useIdiom());
  const days = useMemo(() => groupTiles(tiles, grouping), [tiles, grouping]);
  const next = useMemo(
    () => layoutGrid(days, { width, target, gap: TILE_GAP }),
    [days, width, target],
  );
  return useStableRows(next);
}

function useProbeProps(
  name: string | undefined,
  total: number,
): Partial<FlashListProps<MediaGridRow>> {
  const probe = useListProbe(name, total);
  return probe.cell === undefined
    ? {}
    : {
        onScroll: probe.scrollWith(),
        onLayout: probe.onLayout,
        onContentSizeChange: probe.onContentSizeChange,
        CellRendererComponent: probe.cell,
        scrollEventThrottle: 100,
      };
}

function ListFoot({ footer }: { readonly footer: ReactElement | undefined }): ReactNode {
  return <View className="pb-section-gap">{footer}</View>;
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
  resolveThumb,
  onOpen,
  onMenu,
}: MediaGridProps): ReactNode {
  const measured = useMeasuredWidth();
  const gridRows = useGridRows(tiles, step, grouping, measured.width);
  const { rows, pairs } = useRowTracking(useThumbnailWindow(gridRows, onPrefetchTiles));
  const sticky = useMemo(() => headIndices(gridRows), [gridRows]);
  const actions = useMemo(
    (): TileActions => ({ resolveThumb, onOpen, ...(onMenu === undefined ? {} : { onMenu }) }),
    [resolveThumb, onOpen, onMenu],
  );
  const renderRow: ListRenderItem<MediaGridRow> = ({ item }) => (
    <GridRow row={item} rows={rows} today={today} decor={decor} actions={actions} />
  );
  return (
    <View className="flex-1">
      <View pointerEvents="none" className="px-gutter">
        <View onLayout={measured.onLayout} />
      </View>
      <FlashList<MediaGridRow>
        data={gridRows}
        keyExtractor={rowKeyOf}
        getItemType={rowTypeOf}
        renderItem={renderRow}
        viewabilityConfigCallbackPairs={pairs}
        {...useProbeProps(probe, gridRows.length)}
        stickyHeaderIndices={sticky}
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
