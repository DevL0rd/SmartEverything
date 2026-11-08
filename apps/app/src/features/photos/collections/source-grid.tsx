import { memo, useMemo, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { PhotoSource } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { dayText } from '../../../components/media-grid/day-text';
import { rowHeight, TILE_GAP } from '../../../components/media-grid/justify';
import {
  dayActionText,
  dayMark,
  type MediaSelection,
} from '../../../components/media-grid/selection';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { DRAW_DISTANCE } from '../../../components/virtual-list';
import { useIdiom } from '../../../design/platform';
import {
  SOURCE_ASPECT,
  sourceDayDetail,
  sourceRowsOf,
  type SourceDay,
  type SourceHeadRow,
  type SourceRow,
  type SourceTilesRow,
} from './source-model';
import { SourceTileView, type SourceTileHandlers } from './source-tile';

export interface SourceGridProps extends SourceTileHandlers {
  readonly source: PhotoSource;
  readonly days: readonly SourceDay[];
  readonly names: ReadonlyMap<string, string>;
  readonly today: string;
  readonly selection: MediaSelection;
  readonly onSelectDay: (ids: readonly string[]) => void;
  readonly onEnd: () => void;
  readonly header: ReactElement;
  readonly footer: ReactElement;
}

interface RowContext extends SourceTileHandlers {
  readonly source: PhotoSource;
  readonly names: ReadonlyMap<string, string>;
  readonly today: string;
  readonly selection: MediaSelection;
  readonly onSelectDay: (ids: readonly string[]) => void;
}

function dayActionLabel(selection: MediaSelection, ids: readonly string[]): string {
  return dayActionText(selection.active ? dayMark(selection, ids) : 'none');
}

function Head({
  row,
  context,
}: {
  readonly row: SourceHeadRow;
  readonly context: RowContext;
}): ReactNode {
  const title = dayText(row.day, row.ids.length, context.today).title;
  const action = dayActionLabel(context.selection, row.ids);
  return (
    <View className="flex-row items-center gap-2 pb-2 pt-4">
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text variant="title-3" accessibilityRole="header" numberOfLines={1} className="shrink-0">
          {title}
        </Text>
        <Text variant="callout" tone="variant" numberOfLines={1} className="shrink tabular-nums">
          {sourceDayDetail(context.source, row.tiles, context.names)}
        </Text>
      </View>
      <Button
        label={action}
        spoken={`${action} ${title}`}
        variant="text"
        onPress={() => {
          context.onSelectDay(row.ids);
        }}
      />
    </View>
  );
}

function Tiles({
  row,
  context,
}: {
  readonly row: SourceTilesRow;
  readonly context: RowContext;
}): ReactNode {
  return (
    <View className="flex-row gap-0.75 pb-0.75">
      {row.tiles.map((tile) => (
        <SourceTileView
          key={tile.id}
          source={context.source}
          tile={tile}
          width={row.tileWidth}
          height={row.height}
          selecting={context.selection.active}
          picked={context.selection.ids.has(tile.id)}
          onPress={context.onPress}
          onLongPress={context.onLongPress}
        />
      ))}
    </View>
  );
}

function Row({
  row,
  context,
}: {
  readonly row: SourceRow;
  readonly context: RowContext;
}): ReactNode {
  return row.kind === 'head' ? (
    <Head row={row} context={context} />
  ) : (
    <Tiles row={row} context={context} />
  );
}

const GridRow = memo(Row);

function rowKeyOf(row: SourceRow): string {
  return row.key;
}

function rowTypeOf(row: SourceRow): string {
  return row.kind;
}

export function SourceGrid(props: SourceGridProps): ReactNode {
  const { source, days, names, today, selection, onPress, onLongPress, onSelectDay } = props;
  const measured = useMeasuredWidth();
  const target = rowHeight('days', useIdiom());
  const rows = useMemo(
    () =>
      sourceRowsOf(days, { width: measured.width, target, gap: TILE_GAP }, SOURCE_ASPECT[source]),
    [days, measured.width, target, source],
  );
  const context = useMemo(
    (): RowContext => ({ source, names, today, selection, onPress, onLongPress, onSelectDay }),
    [source, names, today, selection, onPress, onLongPress, onSelectDay],
  );
  const renderRow: ListRenderItem<SourceRow> = ({ item }) => (
    <GridRow row={item} context={context} />
  );
  return (
    <View className="flex-1">
      <View pointerEvents="none" onLayout={measured.onLayout} />
      <FlashList<SourceRow>
        data={rows}
        extraData={context}
        keyExtractor={rowKeyOf}
        getItemType={rowTypeOf}
        renderItem={renderRow}
        drawDistance={DRAW_DISTANCE}
        ListHeaderComponent={props.header}
        ListFooterComponent={<View className="pb-section-gap pt-3">{props.footer}</View>}
        onEndReached={props.onEnd}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}
