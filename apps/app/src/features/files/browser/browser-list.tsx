import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Badge } from '../../../components/badge';
import { EntryRow } from '../../../components/files/entry-row';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { captionOf, markListOf } from '../source/node';
import type { FileNode, SortField } from '../source/types';
import type { FileBrowserHandle } from './browser-types';
import type { BrowserColumn } from './column-model';
import { useRowMenu } from './context-menu';
import { isDraggable, useFolderDrop, useRowDrag, type DragSession } from './drop-zone';
import { HIT_CHIP, hitLineOf, snippetPartsOf, type ContentHit } from './filter-model';
import { RowLeading } from './node-glyph';
import { columnSort, sortLabelOf } from './sort-model';
import { ENTRY_ROW_HEIGHT, useRevealer } from './use-browser-keys';

const COLUMN_CLASS: Readonly<Record<SortField, string>> = {
  name: 'min-w-0 flex-1 pl-11',
  by: 'w-28',
  size: 'w-21 justify-end',
  modifiedAt: 'w-22 justify-end',
};

function ColumnButton<O>({
  column,
  browser,
}: {
  readonly column: BrowserColumn;
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  const { sort } = browser;
  const active = sort.field === column.field;
  const className = cn('min-h-touch-min flex-row items-center gap-1', COLUMN_CLASS[column.field]);
  if (!column.sortable) {
    return (
      <View className={className}>
        <Text variant="label" tone="variant" numberOfLines={1}>
          {column.label}
        </Text>
      </View>
    );
  }
  return (
    <Interactive
      label={`Sort by ${column.label}`}
      {...(active ? { hint: sortLabelOf(sort) } : {})}
      selected={active}
      onPress={() => {
        browser.dispatch({ kind: 'sort', sort: columnSort(sort, column.field) });
      }}
      className={cn(className, 'rounded-xs')}
      layerClassName="rounded-xs"
    >
      <Text variant="label" tone={active ? 'primary' : 'variant'} numberOfLines={1}>
        {column.label}
      </Text>
      {active ? (
        <Icon name={sort.direction === 'asc' ? 'arrowUp' : 'arrowDown'} size={16} tone="primary" />
      ) : null}
    </Interactive>
  );
}

export function ColumnHeader<O>({
  browser,
}: {
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  return (
    <View className="flex-row items-center border-b border-outline-variant bg-surface-2 pl-4 pr-1">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {browser.columns.map((column) => (
          <ColumnButton key={column.field} column={column} browser={browser} />
        ))}
      </View>
      <View aria-hidden className="size-touch-min" />
    </View>
  );
}

export function HitLine({ hit }: { readonly hit: ContentHit }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Badge label={HIT_CHIP[hit.where]} icon={hit.where === 'text' ? 'fileText' : 'image'} />
      {hit.snippet === null ? null : (
        <Text
          variant="caption"
          tone="variant"
          numberOfLines={1}
          className="min-w-0 flex-1"
          accessibilityLabel={`${hitLineOf(hit)}: ${hit.snippet}`}
        >
          {snippetPartsOf(hit.snippet, hit.ranges).map((part, index) =>
            part.marked ? (
              <Text
                key={String(index)}
                variant="caption"
                tone="primary"
                className="font-sans-medium"
              >
                {part.text}
              </Text>
            ) : (
              part.text
            ),
          )}
        </Text>
      )}
    </View>
  );
}

function openLabelOf(node: FileNode): string {
  return `${node.kind === 'folder' ? 'Open folder' : 'Open'} ${node.name}`;
}

export interface NodeViewProps<O> {
  readonly node: FileNode<O>;
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
}

export function useNodeDrag<O>({ node, browser, session }: NodeViewProps<O>): {
  readonly ref: RefObject<View | null>;
  readonly hovering: boolean;
} {
  const ref = useRef<View>(null);
  const [hovering, setHovering] = useState(false);
  const into = browser.source.openTargetOf?.(node) ?? node;
  useRowDrag(ref, session, () => browser.drag.payloadOf(node), isDraggable(browser, node));
  useFolderDrop(
    ref,
    {
      browser,
      session,
      target: browser.drag.targetOf(
        { place: browser.location.place, folder: into.key },
        into.key,
        into.writable,
      ),
      name: node.name,
      enabled: node.kind === 'folder' && !browser.inTrash,
    },
    setHovering,
  );
  return { ref, hovering };
}

export interface FileRowLook {
  readonly caption?: string | null;
  readonly trailing?: ReactNode;
}

export function FileRowBody<O>({
  node,
  browser,
  wide,
  look = {},
}: {
  readonly node: FileNode<O>;
  readonly browser: FileBrowserHandle<O>;
  readonly wide: boolean;
  readonly look?: FileRowLook;
}): ReactNode {
  const menu = useRowMenu(browser, node);
  const selected = browser.state.selection.keys.has(node.key);
  const hit = browser.filter.hits.get(node.key);
  const by = browser.columns.some((column) => column.field === 'by');
  return (
    <>
      <EntryRow
        name={node.name}
        kind={node.kind === 'folder' ? 'folder' : 'file'}
        caption={look.caption === undefined ? captionOf(node) : look.caption}
        size={node.size}
        modifiedAt={node.modifiedAt}
        wide={wide}
        selecting={browser.picked.length > 0}
        selected={selected}
        marks={markListOf(node.marks)}
        openLabel={openLabelOf(node)}
        menu={menu.items}
        menuOptions={menu.options}
        thumbnail={<RowLeading node={node} source={browser.source} abilities={browser.abilities} />}
        nameHighlight={browser.filter.highlight(node.name)}
        {...(by ? { by: browser.host.byName?.(node.byProfileId) ?? null } : {})}
        {...(hit === undefined ? {} : { below: <HitLine hit={hit} /> })}
        {...(look.trailing === undefined ? {} : { trailing: look.trailing })}
        onContextMenu={menu.context.onContextMenu}
        onOpen={() => {
          browser.commands.press(node);
        }}
        onSelect={() => {
          browser.commands.pick(node);
        }}
      />
      {menu.host}
    </>
  );
}

export function FileRow<O>(props: {
  readonly node: FileNode<O>;
  readonly browser: FileBrowserHandle<O>;
  readonly wide: boolean;
  readonly look?: FileRowLook;
}): ReactNode {
  const selected = props.browser.state.selection.keys.has(props.node.key);
  return (
    <View className={cn(selected && 'bg-primary/10')}>
      <FileRowBody {...props} />
    </View>
  );
}

export function detailsFocusOf<O>(browser: FileBrowserHandle<O>, node: FileNode<O>): boolean {
  const { panels } = browser.state;
  const open = panels.has('details') || panels.has('quickLook');
  return open && browser.focused?.key === node.key;
}

function BrowserRow<O>(props: NodeViewProps<O> & { readonly wide: boolean }): ReactNode {
  const { node, browser, wide } = props;
  const { ref, hovering } = useNodeDrag(props);
  const selected = browser.state.selection.keys.has(node.key) || detailsFocusOf(browser, node);
  return (
    <View
      ref={ref}
      collapsable={false}
      className={cn(selected && 'bg-primary/10', hovering && 'bg-primary/20')}
    >
      <FileRowBody node={node} browser={browser} wide={wide} />
    </View>
  );
}

export function MoreLoading({ more }: { readonly more: boolean }): ReactNode {
  return more ? <Skeleton shape="line" className="m-4 h-8" /> : null;
}

export interface BrowserListProps<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
  readonly wide: boolean;
  readonly header: ReactNode;
  readonly footer: ReactNode;
}

export function BrowserList<O>({
  browser,
  session,
  wide,
  header,
  footer,
}: BrowserListProps<O>): ReactNode {
  const list = useRef<FlashListRef<FileNode<O>>>(null);
  const onScroll = useRevealer(browser.reveal, list, 1, ENTRY_ROW_HEIGHT);
  const { listing } = browser;
  const topped = header !== null;
  const columns = wide ? <ColumnHeader browser={browser} /> : null;
  return (
    <>
      {topped ? null : columns}
      <View className="min-h-0 flex-1">
        <FlashList
          ref={list}
          data={browser.visible}
          extraData={browser.state}
          onScroll={onScroll}
          scrollEventThrottle={64}
          keyExtractor={(node) => node.key}
          onEndReachedThreshold={1}
          onEndReached={() => {
            listing.more?.();
          }}
          ListHeaderComponent={
            topped ? (
              <>
                {header}
                {columns}
              </>
            ) : null
          }
          ListFooterComponent={
            <>
              <MoreLoading more={listing.more !== null} />
              {footer}
            </>
          }
          renderItem={({ item }) => (
            <BrowserRow node={item} browser={browser} session={session} wide={wide} />
          )}
        />
      </View>
    </>
  );
}
