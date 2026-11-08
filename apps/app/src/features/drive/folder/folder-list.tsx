import type { ReactNode, Ref } from 'react';
import { memo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { ApiError, type DriveItem, type DriveRoot } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { EntryRow } from '../../../components/files/entry-row';
import type { EntryKind } from '../../../components/files/file-kind';
import type { TextRange } from '../../../components/highlighted';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useContextMenu, type MenuItem } from '../../../components/menu';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { flattenPages, useDriveFolderPages, useDriveLink, useDriveRoots } from '../../nas/data';
import { ENTRY_ROW_HEIGHT, useRevealer, type FolderReveal } from './folder-keys';
import {
  captionOf,
  sortLabelOf,
  type ByName,
  type FolderAction,
  type FolderSort,
  type FolderSortKey,
  type KindFilter,
} from './folder-model';

export interface ActionSpec {
  readonly label: string;
  readonly icon: IconName;
  readonly shortcut?: string;
  readonly destructive?: boolean;
}

export const ACTION_SPECS: Readonly<Record<FolderAction, ActionSpec>> = {
  open: { label: 'Open', icon: 'externalLink', shortcut: 'Enter' },
  details: { label: 'Details', icon: 'info', shortcut: 'I' },
  star: { label: 'Star', icon: 'star' },
  unstar: { label: 'Remove star', icon: 'star' },
  download: { label: 'Download', icon: 'download' },
  rename: { label: 'Rename', icon: 'pencil', shortcut: 'F2' },
  trash: { label: 'Move to trash', icon: 'trash', shortcut: 'Del', destructive: true },
};

const QUICK: ReadonlySet<FolderAction> = new Set(['star', 'unstar', 'download']);

export interface FolderRowHandlers {
  readonly byName: ByName;
  readonly actionsOf: (item: DriveItem) => readonly FolderAction[];
  readonly onAction: (action: FolderAction, item: DriveItem) => void;
  readonly onPick: (item: DriveItem) => void;
  readonly onPress: (item: DriveItem) => void;
  readonly highlight: (name: string) => TextRange | null;
}

export function menuItemsOf(
  item: DriveItem,
  handlers: FolderRowHandlers,
  only: (action: FolderAction) => boolean = () => true,
): readonly MenuItem[] {
  return handlers
    .actionsOf(item)
    .filter(only)
    .map((action) => {
      const spec = ACTION_SPECS[action];
      return {
        id: action,
        label: spec.label,
        icon: spec.icon,
        ...(spec.shortcut === undefined ? {} : { shortcut: spec.shortcut }),
        ...(spec.destructive === true ? { destructive: true } : {}),
        onPress: (): void => {
          handlers.onAction(action, item);
        },
      };
    });
}

export function entryKindOf(item: DriveItem): EntryKind {
  return item.kind === 'folder' ? 'folder' : 'file';
}

function thumbReady(item: DriveItem): boolean {
  return item.kind !== 'folder' && item.thumb.state === 'ready';
}

export function DriveThumb({
  item,
  className,
}: {
  readonly item: DriveItem;
  readonly className: string;
}): ReactNode {
  const url = useDriveLink(thumbReady(item) ? item.id : null, item.rev, 'thumb');
  return (
    <View className={cn('overflow-hidden bg-surface-3', className)}>
      {url === null ? null : (
        <Image
          source={{ uri: url }}
          recyclingKey={`${item.id}:${String(item.rev)}`}
          contentFit="cover"
          accessibilityLabel={item.name}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

function openLabelOf(item: DriveItem): string {
  return `${item.kind === 'folder' ? 'Open folder' : 'Open'} ${item.name}`;
}

interface RowProps {
  readonly item: DriveItem;
  readonly wide: boolean;
  readonly selecting: boolean;
  readonly selected: boolean;
  readonly handlers: FolderRowHandlers;
}

const FolderRow = memo(function FolderRow({
  item,
  wide,
  selecting,
  selected,
  handlers,
}: RowProps): ReactNode {
  const menu = menuItemsOf(item, handlers);
  const context = useContextMenu(menu, `${item.name} actions`, {
    quick: menuItemsOf(item, handlers, (action) => QUICK.has(action)),
  });
  return (
    <>
      <EntryRow
        name={item.name}
        kind={entryKindOf(item)}
        caption={captionOf(item)}
        size={item.kind === 'folder' ? null : item.bytes}
        modifiedAt={item.modifiedAt}
        by={handlers.byName(item.addedByProfileId)}
        nameHighlight={handlers.highlight(item.name)}
        wide={wide}
        selecting={selecting}
        selected={selected}
        starred={item.starred}
        openLabel={openLabelOf(item)}
        menu={menu}
        {...(thumbReady(item)
          ? { thumbnail: <DriveThumb item={item} className="h-6 w-8 rounded-xs" /> }
          : {})}
        onContextMenu={context.onContextMenu}
        onOpen={() => {
          handlers.onPress(item);
        }}
        onSelect={() => {
          handlers.onPick(item);
        }}
      />
      {context.host}
    </>
  );
});

function ColumnButton({
  column,
  label,
  sort,
  onSort,
  className,
}: {
  readonly column: FolderSortKey;
  readonly label: string;
  readonly sort: FolderSort;
  readonly onSort: (key: FolderSortKey) => void;
  readonly className: string;
}): ReactNode {
  const active = sort.key === column;
  return (
    <Interactive
      label={`Sort by ${label}`}
      {...(active ? { hint: sortLabelOf(sort) } : {})}
      selected={active}
      onPress={() => {
        onSort(column);
      }}
      className={cn('min-h-10 flex-row items-center gap-1 rounded-xs', className)}
      layerClassName="rounded-xs"
    >
      <Text variant="label" tone={active ? 'primary' : 'variant'} numberOfLines={1}>
        {label}
      </Text>
      {active ? (
        <Icon name={sort.direction === 'asc' ? 'arrowUp' : 'arrowDown'} size={16} tone="primary" />
      ) : null}
    </Interactive>
  );
}

export function ColumnHeader({
  sort,
  onSort,
}: {
  readonly sort: FolderSort;
  readonly onSort: (key: FolderSortKey) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3 border-b border-outline-variant bg-surface-2 pl-4 pr-1">
      <ColumnButton
        column="name"
        label="Name"
        sort={sort}
        onSort={onSort}
        className="min-w-0 flex-1 pl-8"
      />
      <ColumnButton column="by" label="By" sort={sort} onSort={onSort} className="w-28" />
      <ColumnButton
        column="bytes"
        label="Size"
        sort={sort}
        onSort={onSort}
        className="w-21 justify-end"
      />
      <ColumnButton
        column="modifiedAt"
        label="Modified"
        sort={sort}
        onSort={onSort}
        className="w-22 justify-end"
      />
      <View className="w-10" />
    </View>
  );
}

export function FolderLoading({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="gap-3 p-4" accessibilityLabel={label}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((slot) => (
        <Skeleton key={slot} shape="line" className="h-10" />
      ))}
    </View>
  );
}

export interface FolderListProps {
  readonly items: readonly DriveItem[];
  readonly wide: boolean;
  readonly sort: FolderSort;
  readonly selection: ReadonlySet<string>;
  readonly handlers: FolderRowHandlers;
  readonly loadingMore: boolean;
  readonly stale: boolean;
  readonly footer: ReactNode;
  readonly onSort: (key: FolderSortKey) => void;
  readonly onMore: () => void;
  readonly ref?: Ref<FolderReveal>;
}

export function FolderList({ ref, ...props }: FolderListProps): ReactNode {
  const { items, wide, sort, selection, handlers, loadingMore, stale, footer } = props;
  const selecting = selection.size > 0;
  const list = useRef<FlashListRef<DriveItem>>(null);
  const onScroll = useRevealer(ref, list, 1, ENTRY_ROW_HEIGHT);
  return (
    <>
      {wide ? <ColumnHeader sort={sort} onSort={props.onSort} /> : null}
      <View className={cn('min-h-0 flex-1', stale && 'opacity-60')}>
        <FlashList
          ref={list}
          data={items}
          extraData={selection}
          onScroll={onScroll}
          scrollEventThrottle={64}
          keyExtractor={(item) => item.id}
          onEndReachedThreshold={1}
          onEndReached={props.onMore}
          ListFooterComponent={
            <>
              {loadingMore ? <Skeleton shape="line" className="m-4 h-8" /> : null}
              {footer}
            </>
          }
          renderItem={({ item }) => (
            <FolderRow
              item={item}
              wide={wide}
              selecting={selecting}
              selected={selection.has(item.id)}
              handlers={handlers}
            />
          )}
        />
      </View>
    </>
  );
}

export function emptyBodyOf(root: DriveRoot, kind: KindFilter): string {
  if (kind !== 'all') return 'Nothing of this kind is in this folder.';
  return root.readOnly
    ? 'It is read only, so nothing can be added from Drive.'
    : 'Files added on the hub or from a synced computer show up here.';
}

export function EmptyFolder({
  root,
  kind,
}: {
  readonly root: DriveRoot;
  readonly kind: KindFilter;
}): ReactNode {
  return <EmptyState icon="folder" title="Nothing here yet" body={emptyBodyOf(root, kind)} />;
}

export function isPrivateError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'forbidden' || error.code === 'not_found');
}

export interface GateState {
  readonly online: boolean;
  readonly rootKnown: boolean;
  readonly pending: boolean;
  readonly loaded: boolean;
  readonly error: unknown;
  readonly retry: () => Promise<unknown>;
}

export function FolderGateMessage({ state }: { readonly state: GateState }): ReactNode {
  if (!state.online && !state.loaded) {
    return (
      <EmptyState
        icon="wifiOff"
        title="The hub is not answering"
        body="This folder opens again when the hub is back."
      />
    );
  }
  if (state.error !== null && !isPrivateError(state.error)) {
    return (
      <ErrorState
        error={state.error}
        retry={() => {
          background(state.retry(), 'drive.folder_retry_failed');
        }}
      />
    );
  }
  if (!state.rootKnown && state.pending) return <FolderLoading label="Reading this folder" />;
  return (
    <EmptyState
      icon="lock"
      title="This folder is private"
      body="It belongs to someone else’s files. Ask them to share it with you."
      action={<Button label="Back to My Drive" variant="tonal" href={href.drive()} />}
    />
  );
}

export function useByName(): ByName {
  const names = new Map(useProfiles().map((profile) => [profile.id, profile.name] as const));
  const me = useActiveProfile()?.id ?? null;
  return (profileId) => {
    if (profileId === null) return null;
    return profileId === me ? 'You' : (names.get(profileId) ?? null);
  };
}

type FolderPages = ReturnType<typeof useDriveFolderPages>;

export interface FolderData {
  readonly root: DriveRoot | null;
  readonly folder: DriveItem | null;
  readonly loaded: readonly DriveItem[];
  readonly pages: FolderPages;
}

export function useFolderData(rootId: string, folderId: string | null): FolderData {
  const root = useDriveRoots().find((candidate) => candidate.id === rootId) ?? null;
  const pages = useDriveFolderPages(rootId, folderId, null);
  return {
    root,
    folder: pages.data?.pages[0]?.folder ?? null,
    loaded: flattenPages(pages.data, (page) => page.items),
    pages,
  };
}
