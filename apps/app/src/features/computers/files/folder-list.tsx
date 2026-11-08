import type { ReactElement, ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FileEntry, FileList } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { glyphOf } from '../../../components/files/file-kind';
import { ListRow } from '../../../components/list-row';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { entryEnabled, entryLine, orderEntries, type PickerMode } from './path-model';

export type FolderView =
  | {
      readonly kind: 'blocked';
      readonly icon: 'lock' | 'wifiOff';
      readonly title: string;
      readonly body: string;
    }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: unknown; readonly retry: () => void }
  | { readonly kind: 'ready'; readonly list: FileList; readonly stale: boolean };

function Separator(): ReactNode {
  return <View className="ml-16 h-hairline bg-outline-variant" />;
}

function Loading({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <View
      className={cn('gap-3 py-3', compact ? 'px-2' : 'px-4')}
      accessibilityLabel="Reading this folder"
    >
      {(compact ? [0, 1] : [0, 1, 2, 3, 4, 5]).map((slot) => (
        <Skeleton key={slot} shape="line" className="h-10" />
      ))}
    </View>
  );
}

function Footnote({ list }: { readonly list: FileList }): ReactNode {
  if (list.total <= list.entries.length) return <View className="h-2" />;
  return (
    <Text variant="footnote" tone="variant" className="px-4 py-3">
      {`Showing ${count(list.entries.length)} of ${count(list.total)} items in this folder.`}
    </Text>
  );
}

interface FolderRowsProps {
  readonly list: FileList;
  readonly entries: readonly FileEntry[];
  readonly mode: PickerMode;
  readonly stale: boolean;
  readonly picked: string | null;
  readonly onOpen: (entry: FileEntry) => void;
  readonly compact: boolean;
}

function Rows({ list, entries, mode, stale, picked, onOpen, compact }: FolderRowsProps): ReactNode {
  const renderItem = ({ item }: { readonly item: FileEntry }): ReactElement => (
    <ListRow
      compact={compact}
      title={item.name}
      subtitle={entryLine(item)}
      icon={glyphOf(item)}
      chevron={item.kind === 'folder'}
      selected={picked === item.path}
      disabled={!entryEnabled(mode, item)}
      onPress={() => {
        onOpen(item);
      }}
    />
  );
  const rows = {
    data: entries,
    keyExtractor: (entry: FileEntry): string => entry.path,
    ListFooterComponent: <Footnote list={list} />,
    renderItem,
  };
  if (compact) {
    return (
      <FlatList
        key={list.path}
        {...rows}
        className={cn('min-h-0 grow-0 shrink', stale && 'opacity-60')}
        contentContainerClassName="px-1.5"
      />
    );
  }
  return (
    <View className={cn('min-h-0 flex-1', stale && 'opacity-60')}>
      <FlashList {...rows} ItemSeparatorComponent={Separator} />
    </View>
  );
}

export function FolderMessage({
  view,
  compact,
}: {
  readonly view: Exclude<FolderView, { kind: 'ready' }>;
  readonly compact: boolean;
}): ReactNode {
  if (view.kind === 'blocked') {
    return <EmptyState compact={compact} icon={view.icon} title={view.title} body={view.body} />;
  }
  if (view.kind === 'loading') return <Loading compact={compact} />;
  return (
    <View className={cn('py-3', compact ? 'px-2' : 'px-4')}>
      <ErrorState error={view.error} retry={view.retry} />
    </View>
  );
}

export function FolderList({
  view,
  mode,
  showHidden,
  picked,
  onOpen,
  compact,
}: {
  readonly view: FolderView;
  readonly mode: PickerMode;
  readonly showHidden: boolean;
  readonly picked: string | null;
  readonly onOpen: (entry: FileEntry) => void;
  readonly compact: boolean;
}): ReactNode {
  if (view.kind !== 'ready') return <FolderMessage view={view} compact={compact} />;
  const entries = orderEntries(view.list.entries, showHidden);
  if (entries.length === 0) {
    return (
      <EmptyState
        compact={compact}
        icon="folder"
        title="This folder is empty"
        body={
          mode === 'folder'
            ? 'Choose it anyway or create a folder inside it.'
            : 'There are no files here.'
        }
      />
    );
  }
  return (
    <Rows
      list={view.list}
      entries={entries}
      mode={mode}
      stale={view.stale}
      picked={picked}
      onOpen={onOpen}
      compact={compact}
    />
  );
}
