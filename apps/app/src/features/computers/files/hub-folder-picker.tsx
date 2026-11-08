import { useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { DriveHostFolders } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { FolderBar } from './folder-bar';
import { FolderFooter, type FolderExtra } from './folder-footer';
import { FolderMessage } from './folder-list';
import {
  HUB_NAME,
  hubCrumbs,
  hubFolderView,
  useHubFolderBrowse,
  type HubFolderBrowse,
  type HubFolderView,
} from './hub-folder-browse';

type HostFolder = DriveHostFolders['folders'][number];

export interface HubFolderPickerProps {
  readonly start?: string | null;
  readonly onChoose: (path: string) => void;
  readonly onCancel: () => void;
  readonly compact: boolean;
}

function Separator(): ReactNode {
  return <View className="ml-16 h-hairline bg-outline-variant" />;
}

function HostRows({
  listing,
  folders,
  stale,
  onGo,
  compact,
}: {
  readonly listing: DriveHostFolders;
  readonly folders: readonly HostFolder[];
  readonly stale: boolean;
  readonly onGo: (path: string) => void;
  readonly compact: boolean;
}): ReactNode {
  const disks = listing.path === null;
  const renderItem = ({ item }: { readonly item: HostFolder }): ReactElement => (
    <ListRow
      compact={compact}
      title={disks ? item.path : item.name}
      subtitle={disks ? 'Disk' : 'Folder'}
      icon={disks ? 'hardDrive' : 'folder'}
      chevron
      onPress={() => {
        onGo(item.path);
      }}
    />
  );
  const rows = {
    data: folders,
    keyExtractor: (folder: HostFolder): string => folder.path,
    renderItem,
  };
  if (compact) {
    return (
      <FlatList
        key={listing.path ?? ''}
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

export function HostFolderList({
  view,
  showHidden,
  onGo,
  compact,
}: {
  readonly view: HubFolderView;
  readonly showHidden: boolean;
  readonly onGo: (path: string) => void;
  readonly compact: boolean;
}): ReactNode {
  if (view.kind !== 'ready') return <FolderMessage view={view} compact={compact} />;
  const { listing } = view;
  const folders = showHidden ? listing.folders : listing.folders.filter((folder) => !folder.hidden);
  if (folders.length > 0) {
    return (
      <HostRows
        listing={listing}
        folders={folders}
        stale={view.stale}
        onGo={onGo}
        compact={compact}
      />
    );
  }
  return listing.path === null ? (
    <EmptyState
      compact={compact}
      icon="hardDrive"
      title="No disks on the hub"
      body="Connect a disk to the hub to add it."
    />
  ) : (
    <EmptyState
      compact={compact}
      icon="folder"
      title="This folder is empty"
      body="Choose it anyway or open another folder."
    />
  );
}

function DisksFooter({
  onCancel,
  compact,
}: {
  readonly onCancel: () => void;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'flex-row flex-wrap items-center justify-between gap-2 border-t border-outline-variant',
        compact ? 'px-1.5 pb-1 pt-2' : 'px-4 pb-3 pt-2.5',
      )}
    >
      <Text variant="footnote" tone="variant" className="min-w-0 shrink">
        Open a disk to choose a folder on it.
      </Text>
      <Button label="Cancel" variant="text" onPress={onCancel} />
    </View>
  );
}

function HostFolderBrowser({
  browse,
  view,
  compact,
}: {
  readonly browse: HubFolderBrowse;
  readonly view: HubFolderView;
  readonly compact: boolean;
}): ReactNode {
  return (
    <>
      <FolderBar
        crumbs={hubCrumbs(browse.here, browse.roots)}
        machine={HUB_NAME}
        online={browse.online}
        showHidden={browse.showHidden}
        onHidden={browse.setShowHidden}
        onGo={browse.go}
        compact={compact}
      />
      <View
        className={cn('min-h-0 border-t border-outline-variant', compact ? 'shrink' : 'flex-1')}
      >
        <HostFolderList
          view={view}
          showHidden={browse.showHidden}
          onGo={browse.go}
          compact={compact}
        />
      </View>
    </>
  );
}

export function HubFolderPicker({
  start = null,
  onChoose,
  onCancel,
  compact,
}: HubFolderPickerProps): ReactNode {
  const browse = useHubFolderBrowse(start);
  const view = hubFolderView(browse.online, browse.folder);
  const [extra, setExtra] = useState<FolderExtra>('none');
  const atDisks = view.kind === 'ready' && view.listing.path === null;
  const footer = atDisks ? (
    <DisksFooter onCancel={onCancel} compact={compact} />
  ) : (
    <FolderFooter
      mode="folder"
      machine={HUB_NAME}
      folder={browse.here}
      picked={null}
      usable={view.kind === 'ready'}
      canCreate={false}
      onChoose={(): void => {
        if (browse.here !== null) onChoose(browse.here);
      }}
      onGo={browse.go}
      onCreate={() => undefined}
      onCancel={onCancel}
      compact={compact}
      extra={extra}
      onExtra={setExtra}
    />
  );
  if (compact && extra !== 'none') {
    return (
      <ScrollView className="min-h-0 grow-0 shrink" keyboardShouldPersistTaps="handled">
        {footer}
      </ScrollView>
    );
  }
  return (
    <View className={cn('min-h-0', compact ? 'shrink' : 'flex-1')}>
      <HostFolderBrowser browse={browse} view={view} compact={compact} />
      {footer}
    </View>
  );
}
