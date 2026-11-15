import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import { CardGrid } from '../../../components/card-grid';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { count } from '../../../format/number';
import { useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { localMediaSource } from '../local/source';
import { useLocalLibrary } from '../local/use-local-library';
import { useHiddenFolderKeys, usePhotoFolders } from './data';
import { FolderCard } from './folder-card';
import { folderGroupsOf, hiddenCountOf, type FolderGroup } from './model';

const WIDE_COLUMNS_FROM = 1200;

export const FOLDERS_NOTE =
  'Hidden folders stay out of the Library, search, people and places. Their backup keeps running.';

function columnsOf(area: number): number {
  if (libraryLayoutOf(area) === 'compact') return 1;
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
}: {
  readonly group: FolderGroup;
  readonly columns: number;
}): ReactNode {
  return (
    <View className="gap-2">
      <View className="min-h-10 flex-row items-baseline gap-2">
        <Text variant="title-3">{group.title}</Text>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {count(group.folders.length)}
        </Text>
      </View>
      <CardGrid
        items={group.folders}
        columns={columns}
        keyOf={(folder) => folder.key}
        render={(folder) => <FolderCard folder={folder} />}
      />
    </View>
  );
}

function FoldersBody({ groups }: { readonly groups: readonly FolderGroup[] | null }): ReactNode {
  const columns = columnsOf(useAreaWidth());
  if (groups === null) return <Skeleton shape="block" className="h-60 w-full" />;
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="folder"
        title="No folders yet"
        body="Folders appear here once photos are backed up or found on this device."
      />
    );
  }
  return groups.map((group) => <GroupSection key={group.id} group={group} columns={columns} />);
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
        <Text variant="footnote" tone="variant">
          {FOLDERS_NOTE}
        </Text>
        {error === null ? (
          <FoldersBody groups={groups} />
        ) : (
          <ErrorState error={error} retry={retry} />
        )}
      </View>
    </PhotosFrame>
  );
}
