import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { rowsOfCards } from '../../../components/card-grid';
import { useGridLayout } from '../../../components/grid';
import { Highlighted } from '../../../components/highlighted';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { OverflowButton } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { shortDate } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { captionOf, markListOf } from '../source/node';
import type { FileNode } from '../source/types';
import type { FileBrowserHandle } from './browser-types';
import {
  HitLine,
  MoreLoading,
  detailsFocusOf,
  useNodeDrag,
  type NodeViewProps,
} from './browser-list';
import { useRowMenu } from './context-menu';
import type { DragSession } from './drop-zone';
import { NodeGlyph, NodeThumb, thumbWanted } from './node-glyph';
import { useRevealer } from './use-browser-keys';

const TILE_MIN_WIDTH = 160;

const COMPACT_TILE_MIN_WIDTH = 128;

const ALL_COLUMNS = Number.MAX_SAFE_INTEGER;

const GRID_ROW_HEIGHT = 192;

function tileCaption(node: FileNode): string {
  return joinParts([captionOf(node), node.modifiedAt === null ? null : shortDate(node.modifiedAt)]);
}

function TileArt<O>({ node, browser }: Omit<NodeViewProps<O>, 'session'>): ReactNode {
  if (thumbWanted(node, browser.abilities)) {
    return <NodeThumb node={node} source={browser.source} className="h-28" />;
  }
  return (
    <View className="h-28 items-center justify-center bg-surface-2">
      <NodeGlyph node={node} source={browser.source} well="l" />
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

function TileText<O>({ node, browser }: Omit<NodeViewProps<O>, 'session'>): ReactNode {
  const hit = browser.filter.hits.get(node.key);
  return (
    <>
      <View className="min-w-0 flex-row items-center gap-1 px-3">
        <Text variant="callout" numberOfLines={1} className="min-w-0 shrink">
          <Highlighted text={node.name} range={browser.filter.highlight(node.name)} />
        </Text>
        {markListOf(node.marks).map((mark) => (
          <Icon key={mark.key} name={mark.icon} size={16} tone={mark.tone} />
        ))}
      </View>
      <View className="px-3">
        {hit === undefined ? (
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {tileCaption(node)}
          </Text>
        ) : (
          <HitLine hit={hit} />
        )}
      </View>
    </>
  );
}

function Tile<O>(props: NodeViewProps<O>): ReactNode {
  const { node, browser } = props;
  const menu = useRowMenu(browser, node);
  const { ref, hovering } = useNodeDrag(props);
  const selecting = browser.picked.length > 0;
  const selected = browser.state.selection.keys.has(node.key);
  const focused = detailsFocusOf(browser, node);
  return (
    <View
      ref={ref}
      collapsable={false}
      className={cn(
        'h-46 overflow-hidden rounded-lg border',
        selected || hovering
          ? 'border-primary bg-primary-container'
          : 'border-outline-variant bg-surface-1',
        focused && !selected && !hovering && 'border-primary bg-primary/10',
      )}
    >
      <Interactive
        label={selecting ? `Select ${node.name}` : `Open ${node.name}`}
        selected={selecting ? selected : undefined}
        onPress={() => {
          browser.commands.press(node);
        }}
        onLongPress={() => {
          browser.commands.pick(node);
        }}
        onContextMenu={menu.context.onContextMenu}
        focusInset
        className="min-w-0 flex-1 gap-2"
      >
        <TileArt node={node} browser={browser} />
        <TileMark selecting={selecting} selected={selected} />
        <TileText node={node} browser={browser} />
      </Interactive>
      <View className="absolute right-1 top-1 rounded-full bg-surface-1/90">
        <OverflowButton
          items={menu.items}
          label={`Actions for ${node.name}`}
          options={menu.options}
        />
      </View>
      {menu.host}
    </View>
  );
}

function GridRow<O>({
  row,
  columns,
  browser,
  session,
}: {
  readonly row: readonly FileNode<O>[];
  readonly columns: number;
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
}): ReactNode {
  const empty = Array.from({ length: columns - row.length }, (_, slot) => `empty-${String(slot)}`);
  return (
    <View className="flex-row gap-2 px-2 pb-2">
      {row.map((node) => (
        <View key={node.key} className="min-w-0 flex-1">
          <Tile node={node} browser={browser} session={session} />
        </View>
      ))}
      {empty.map((key) => (
        <View key={key} className="min-w-0 flex-1" />
      ))}
    </View>
  );
}

function useTileColumns(width: number): number {
  const compact = useSizeClass().width === 'compact';
  const minWidth = compact ? COMPACT_TILE_MIN_WIDTH : TILE_MIN_WIDTH;
  return useGridLayout(width, minWidth, 'tight', ALL_COLUMNS).columns;
}

export interface BrowserGridProps<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
  readonly header: ReactNode;
  readonly footer: ReactNode;
}

export function BrowserGrid<O>({
  browser,
  session,
  header,
  footer,
}: BrowserGridProps<O>): ReactNode {
  const measured = useMeasuredWidth();
  const columns = useTileColumns(measured.width);
  const rows = rowsOfCards(browser.visible, columns);
  const list = useRef<FlashListRef<readonly FileNode<O>[]>>(null);
  const onScroll = useRevealer(browser.reveal, list, columns, GRID_ROW_HEIGHT);
  const { listing } = browser;
  return (
    <View onLayout={measured.onLayout} className="min-h-0 flex-1">
      {measured.width === 0 ? null : (
        <FlashList
          ref={list}
          data={rows}
          extraData={browser.state}
          onScroll={onScroll}
          scrollEventThrottle={64}
          keyExtractor={(row) => row.map((node) => node.key).join('\n')}
          onEndReachedThreshold={1}
          onEndReached={() => {
            listing.more?.();
          }}
          ListHeaderComponent={
            header === null ? (
              <View className="h-2" />
            ) : (
              <View className="pb-grid-gap">{header}</View>
            )
          }
          ListFooterComponent={
            <>
              <MoreLoading more={listing.more !== null} />
              {footer}
            </>
          }
          renderItem={({ item: row }) => (
            <GridRow row={row} columns={columns} browser={browser} session={session} />
          )}
        />
      )}
    </View>
  );
}
