import { memo, useMemo, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Button } from '../../../components/button';
import { dayText } from '../../../components/media-grid/day-text';
import {
  dayActionText,
  dayMark,
  type MediaSelection,
} from '../../../components/media-grid/selection';
import { rowHeight, TILE_GAP } from '../../../components/media-grid/justify';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { DRAW_DISTANCE } from '../../../components/virtual-list';
import { useIdiom } from '../../../design/platform';
import { DeletedTile, type TileHandlers } from './deleted-tile';
import type { DeletedDay } from './model';
import { deletedRowsOf, type DeletedHeadRow, type DeletedRow, type DeletedTilesRow } from './rows';

export interface DeletedGridProps extends TileHandlers {
  readonly days: readonly DeletedDay[];
  readonly today: string;
  readonly selection: MediaSelection;
  readonly onSelectDay: (ids: readonly string[]) => void;
  readonly header: ReactElement;
  readonly footer: ReactElement;
}

interface RowContext extends TileHandlers {
  readonly today: string;
  readonly selection: MediaSelection;
  readonly pointer: boolean;
  readonly onSelectDay: (ids: readonly string[]) => void;
}

function dayActionLabel(selection: MediaSelection, ids: readonly string[]): string {
  return dayActionText(selection.active ? dayMark(selection, ids) : 'none');
}

function Head({
  row,
  context,
}: {
  readonly row: DeletedHeadRow;
  readonly context: RowContext;
}): ReactNode {
  const text = dayText(row.day, row.ids.length, context.today);
  return (
    <View className="flex-row items-center gap-2 pb-2 pt-4">
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text variant="title-3" accessibilityRole="header" numberOfLines={1} className="shrink-0">
          {text.title}
        </Text>
        <Text variant="callout" tone="variant" numberOfLines={1} className="shrink tabular-nums">
          {text.detail}
        </Text>
      </View>
      <Button
        label={dayActionLabel(context.selection, row.ids)}
        spoken={`${dayActionLabel(context.selection, row.ids)} ${text.title}`}
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
  readonly row: DeletedTilesRow;
  readonly context: RowContext;
}): ReactNode {
  return (
    <View className="flex-row gap-0.75 pb-0.75">
      {row.items.map((item) => (
        <DeletedTile
          key={item.id}
          item={item}
          width={row.tileWidth}
          height={row.height}
          selecting={context.selection.active}
          picked={context.selection.ids.has(item.id)}
          pointer={context.pointer}
          onPress={context.onPress}
          onRestore={context.onRestore}
          onDeleteNow={context.onDeleteNow}
          disabled={context.disabled}
        />
      ))}
    </View>
  );
}

function Row({
  row,
  context,
}: {
  readonly row: DeletedRow;
  readonly context: RowContext;
}): ReactNode {
  return row.kind === 'head' ? (
    <Head row={row} context={context} />
  ) : (
    <Tiles row={row} context={context} />
  );
}

const GridRow = memo(Row);

function rowKeyOf(row: DeletedRow): string {
  return row.key;
}

function rowTypeOf(row: DeletedRow): string {
  return row.kind;
}

export function DeletedGrid(props: DeletedGridProps): ReactNode {
  const { days, today, selection, onPress, onRestore, onDeleteNow, disabled, onSelectDay } = props;
  const measured = useMeasuredWidth();
  const idiom = useIdiom();
  const target = rowHeight('days', idiom);
  const rows = useMemo(
    () => deletedRowsOf(days, { width: measured.width, target, gap: TILE_GAP }),
    [days, measured.width, target],
  );
  const context = useMemo(
    (): RowContext => ({
      today,
      selection,
      pointer: idiom === 'pointer',
      onPress,
      onRestore,
      onDeleteNow,
      disabled,
      onSelectDay,
    }),
    [today, selection, idiom, onPress, onRestore, onDeleteNow, disabled, onSelectDay],
  );
  const renderRow: ListRenderItem<DeletedRow> = ({ item }) => (
    <GridRow row={item} context={context} />
  );
  return (
    <View className="flex-1">
      <View pointerEvents="none" onLayout={measured.onLayout} />
      <FlashList<DeletedRow>
        data={rows}
        extraData={context}
        keyExtractor={rowKeyOf}
        getItemType={rowTypeOf}
        renderItem={renderRow}
        drawDistance={DRAW_DISTANCE}
        ListHeaderComponent={props.header}
        ListFooterComponent={<View className="pb-section-gap pt-3">{props.footer}</View>}
      />
    </View>
  );
}
