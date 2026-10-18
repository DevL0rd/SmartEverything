import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FileEntry, FileList } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
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

function glyph(entry: FileEntry): 'folder' | 'fileText' | 'link' {
  if (entry.kind === 'folder') return 'folder';
  return entry.kind === 'link' ? 'link' : 'fileText';
}

function Separator(): ReactNode {
  return <View className="ml-16 h-hairline bg-outline-variant" />;
}

function Loading(): ReactNode {
  return (
    <View className="gap-3 px-4 py-3" accessibilityLabel="Reading this folder">
      {[0, 1, 2, 3, 4, 5].map((slot) => (
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

function Rows({
  list,
  entries,
  mode,
  stale,
  picked,
  onOpen,
}: {
  readonly list: FileList;
  readonly entries: readonly FileEntry[];
  readonly mode: PickerMode;
  readonly stale: boolean;
  readonly picked: string | null;
  readonly onOpen: (entry: FileEntry) => void;
}): ReactNode {
  return (
    <View className={cn('min-h-0 flex-1', stale && 'opacity-60')}>
      <FlashList
        data={entries}
        keyExtractor={(entry) => entry.path}
        ItemSeparatorComponent={Separator}
        ListFooterComponent={<Footnote list={list} />}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={entryLine(item)}
            icon={glyph(item)}
            chevron={item.kind === 'folder'}
            selected={picked === item.path}
            disabled={!entryEnabled(mode, item)}
            onPress={() => {
              onOpen(item);
            }}
          />
        )}
      />
    </View>
  );
}

function Message({ view }: { readonly view: Exclude<FolderView, { kind: 'ready' }> }): ReactNode {
  if (view.kind === 'blocked') {
    return <EmptyState icon={view.icon} title={view.title} body={view.body} />;
  }
  if (view.kind === 'loading') return <Loading />;
  return (
    <View className="px-4 py-3">
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
}: {
  readonly view: FolderView;
  readonly mode: PickerMode;
  readonly showHidden: boolean;
  readonly picked: string | null;
  readonly onOpen: (entry: FileEntry) => void;
}): ReactNode {
  if (view.kind !== 'ready') return <Message view={view} />;
  const entries = orderEntries(view.list.entries, showHidden);
  if (entries.length === 0) {
    return (
      <EmptyState
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
    />
  );
}
