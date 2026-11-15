import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { CardGrid } from '../../../components/card-grid';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { count } from '../../../format/number';
import { useSyncStatus } from '../../../store/selectors';
import { PHOTOS_BACKUP_SETTINGS_HREF, PhotosFrame } from '../components/photos-frame';
import { localMediaSource } from '../local/source';
import { useLocalLibrary } from '../local/use-local-library';
import { useFolderBackup, type FolderBackup } from './backup';
import { useHiddenFolderKeys, usePhotoFolders } from './data';
import { FolderCard } from './folder-card';
import { backupIdsOf, folderGroupsOf, hiddenCountOf, type FolderGroup } from './model';

const WIDE_COLUMNS_FROM = 1200;

const LOADING_TILES = ['a', 'b', 'c', 'd'] as const;

export function foldersNoteOf(local: boolean): string {
  return local
    ? 'Choose which folders on this device back up to the hub and which show in Photos. Hidden folders stay out of the Library, search, people and places, and their backup keeps its setting.'
    : 'Choose which folders show in Photos. Hidden folders stay out of the Library, search, people and places.';
}

function columnsOf(area: number): number {
  if (shellLayoutOf(area) === 'compact') return 1;
  return area >= WIDE_COLUMNS_FROM ? 3 : 2;
}

export function hereOf(): string {
  if (localMediaSource() === null) return 'This device';
  return isNative() ? 'This phone' : 'This computer';
}

export function foldersLineOf(groups: readonly FolderGroup[]): string | null {
  const total = groups.reduce((sum, group) => sum + group.folders.length, 0);
  if (total === 0) return null;
  const hidden = hiddenCountOf(groups);
  const folders = total === 1 ? '1 folder' : `${count(total)} folders`;
  return hidden === 0 ? folders : `${folders} · ${count(hidden)} hidden`;
}

function GroupSection({
  group,
  columns,
  backup,
}: {
  readonly group: FolderGroup;
  readonly columns: number;
  readonly backup: FolderBackup;
}): ReactNode {
  return (
    <View className="gap-3">
      <View className="flex-row items-baseline gap-2">
        <Text variant="title-3">{group.title}</Text>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {count(group.folders.length)}
        </Text>
      </View>
      <CardGrid
        items={group.folders}
        columns={columns}
        keyOf={(folder) => folder.key}
        render={(folder) => <FolderCard folder={folder} backup={backup} />}
      />
    </View>
  );
}

function FoldersLoading({ columns }: { readonly columns: number }): ReactNode {
  return (
    <View aria-busy className="gap-3">
      <Skeleton shape="line" className="h-6 w-40" />
      <CardGrid
        items={LOADING_TILES}
        columns={columns}
        keyOf={(tile) => tile}
        render={() => <Skeleton shape="block" className="h-36 rounded-lg" />}
      />
    </View>
  );
}

function FoldersBody({ groups }: { readonly groups: readonly FolderGroup[] | null }): ReactNode {
  const columns = columnsOf(useAreaWidth());
  const backup = useFolderBackup(groups === null ? [] : backupIdsOf(groups));
  if (groups === null) return <FoldersLoading columns={columns} />;
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="folder"
        title="No folders yet"
        body="Folders appear here once photos are backed up or found on this device."
        action={<Button label="Open Backup" variant="tonal" href={PHOTOS_BACKUP_SETTINGS_HREF} />}
      />
    );
  }
  return groups.map((group) => (
    <GroupSection key={group.id} group={group} columns={columns} backup={backup} />
  ));
}

function useFolderGroups(): {
  readonly groups: readonly FolderGroup[] | null;
  readonly error: Error | null;
  readonly retry: () => void;
} {
  const folders = usePhotoFolders();
  const local = useLocalLibrary();
  const hidden = useHiddenFolderKeys();
  const localReady = local.state !== 'loading' || local.items.length > 0;
  const groups =
    folders.data === undefined || !localReady
      ? null
      : folderGroupsOf({ hub: folders.data.folders, local: local.items, hidden, here: hereOf() });
  return {
    groups,
    error: folders.isError ? folders.error : null,
    retry: (): void => {
      background(folders.refetch(), 'photos.folders.refetch_failed');
    },
  };
}

export function FoldersScreen(): ReactNode {
  const { groups, error, retry } = useFolderGroups();
  const live = useSyncStatus().status === 'live';
  const line = groups === null ? null : foldersLineOf(groups);
  return (
    <PhotosFrame
      active="folders"
      {...(line === null ? {} : { subtitle: line })}
      banner={
        live ? null : (
          <Banner
            tone="info"
            title="Showing folders from the last sync"
            body="The hub is offline. Hiding and showing folders works again when it is back."
          />
        )
      }
    >
      <View className="gap-section-gap">
        {error === null && groups !== null && groups.length > 0 ? (
          <Text variant="footnote" tone="variant">
            {foldersNoteOf(localMediaSource() !== null)}
          </Text>
        ) : null}
        {error === null ? (
          <FoldersBody groups={groups} />
        ) : (
          <ErrorState page error={error} retry={retry} />
        )}
      </View>
    </PhotosFrame>
  );
}
