import type { ReactNode, Ref } from 'react';
import { memo, useRef } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { DriveItem } from '@smarteverything/domain';
import { rowsOfCards } from '../../../components/card-grid';
import { FileGlyph } from '../../../components/files/file-glyph';
import { useGridLayout } from '../../../components/grid';
import { Highlighted } from '../../../components/highlighted';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { OverflowButton, useContextMenu } from '../../../components/menu';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useRevealer, type FolderReveal } from './folder-keys';
import { DriveThumb, entryKindOf, menuItemsOf, type FolderRowHandlers } from './folder-list';
import { captionOf } from './folder-model';

const TILE_MIN_WIDTH = 240;

const ALL_COLUMNS = Number.MAX_SAFE_INTEGER;

const GRID_ROW_HEIGHT = 184;

function tileCaption(item: DriveItem): string {
  return joinParts([item.kind === 'folder' ? null : bytes(item.bytes), captionOf(item)]);
}

function TileArt({ item }: { readonly item: DriveItem }): ReactNode {
  if (item.kind !== 'folder' && item.thumb.state === 'ready') {
    return <DriveThumb item={item} className="h-28 rounded-md" />;
  }
  return (
    <View className="h-28 items-center justify-center rounded-md bg-surface-2">
      <FileGlyph kind={entryKindOf(item)} name={item.name} well="l" />
    </View>
  );
}

function TileMark({
  selecting,
  selected,
}: {
  readonly selecting: boolean;
  readonly selected: boolean;
}): ReactNode {
  if (!selecting) return null;
  return (
    <View className="absolute left-2 top-2 rounded-full bg-surface-1">
      <Icon
        name={selected ? 'circleCheck' : 'circle'}
        size={20}
        tone={selected ? 'primary' : 'faint'}
      />
    </View>
  );
}

interface TileProps {
  readonly item: DriveItem;
  readonly selecting: boolean;
  readonly selected: boolean;
  readonly handlers: FolderRowHandlers;
}

const FolderTile = memo(function FolderTile({
  item,
  selecting,
  selected,
  handlers,
}: TileProps): ReactNode {
  const menu = menuItemsOf(item, handlers);
  const context = useContextMenu(menu, `${item.name} actions`);
  return (
    <View
      className={cn(
        'h-44 flex-row rounded-lg border p-2',
        selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
    >
      <Interactive
        label={selecting ? `Select ${item.name}` : `Open ${item.name}`}
        selected={selecting ? selected : undefined}
        onPress={() => {
          if (selecting) handlers.onPick(item);
          else handlers.onPress(item);
        }}
        onLongPress={() => {
          handlers.onPick(item);
        }}
        onContextMenu={context.onContextMenu}
        className="min-w-0 flex-1 gap-2"
        layerClassName="rounded-md"
      >
        <TileArt item={item} />
        <TileMark selecting={selecting} selected={selected} />
        <View className="min-w-0 flex-row items-center gap-1 px-1">
          <Text variant="callout" numberOfLines={1} className="min-w-0 shrink">
            <Highlighted text={item.name} range={handlers.highlight(item.name)} />
          </Text>
          {item.starred ? <Icon name="star" size={16} tone="warning" /> : null}
        </View>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular px-1">
          {tileCaption(item)}
        </Text>
      </Interactive>
      <OverflowButton items={menu} label={`Actions for ${item.name}`} />
      {context.host}
    </View>
  );
});

function GridRow({
  row,
  columns,
  selection,
  handlers,
}: {
  readonly row: readonly DriveItem[];
  readonly columns: number;
  readonly selection: ReadonlySet<string>;
  readonly handlers: FolderRowHandlers;
}): ReactNode {
  const empty = Array.from({ length: columns - row.length }, (_, slot) => `empty-${String(slot)}`);
  return (
    <View className="flex-row gap-2 pb-2">
      {row.map((item) => (
        <View key={item.id} className="min-w-0 flex-1">
          <FolderTile
            item={item}
            selecting={selection.size > 0}
            selected={selection.has(item.id)}
            handlers={handlers}
          />
        </View>
      ))}
      {empty.map((key) => (
        <View key={key} className="min-w-0 flex-1" />
      ))}
    </View>
  );
}

export interface FolderGridProps {
  readonly items: readonly DriveItem[];
  readonly selection: ReadonlySet<string>;
  readonly handlers: FolderRowHandlers;
  readonly loadingMore: boolean;
  readonly stale: boolean;
  readonly footer: ReactNode;
  readonly onMore: () => void;
  readonly ref?: Ref<FolderReveal>;
}

export function FolderGrid({ ref, ...props }: FolderGridProps): ReactNode {
  const { items, selection, handlers, loadingMore, stale, footer } = props;
  const measured = useMeasuredWidth();
  const { columns } = useGridLayout(measured.width, TILE_MIN_WIDTH, 'tight', ALL_COLUMNS);
  const rows = rowsOfCards(items, columns);
  const list = useRef<FlashListRef<readonly DriveItem[]>>(null);
  const onScroll = useRevealer(ref, list, columns, GRID_ROW_HEIGHT);
  return (
    <View onLayout={measured.onLayout} className={cn('min-h-0 flex-1 p-2', stale && 'opacity-60')}>
      {measured.width === 0 ? null : (
        <FlashList
          ref={list}
          data={rows}
          extraData={selection}
          onScroll={onScroll}
          scrollEventThrottle={64}
          keyExtractor={(row) => row.map((item) => item.id).join()}
          onEndReachedThreshold={1}
          onEndReached={props.onMore}
          ListFooterComponent={
            <>
              {loadingMore ? <Skeleton shape="line" className="m-2 h-8" /> : null}
              {footer}
            </>
          }
          renderItem={({ item: row }) => (
            <GridRow row={row} columns={columns} selection={selection} handlers={handlers} />
          )}
        />
      )}
    </View>
  );
}
