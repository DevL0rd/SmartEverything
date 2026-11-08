import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { joinParts } from '../../../format/text';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveAlbumItems } from '../../nas/data';
import { DriveFrame } from '../components/drive-frame';
import { runAction, type ItemCommands } from '../folder/folder-footer';
import { WIDE_FROM } from '../folder/folder-header';
import {
  FolderList,
  FolderLoading,
  useByName,
  type FolderRowHandlers,
} from '../folder/folder-list';
import {
  DEFAULT_SORT,
  actionsOf,
  columnSort,
  sortItems,
  type ByName,
  type FolderAction,
  type FolderSort,
} from '../folder/folder-model';
import { openHrefOf } from '../recent/recent-model';
import { usePlaceOf } from './rule-chip-view';
import { ruleSummary } from './rule-labels';
import { useSmartFolder, windowOf, type AlbumPages } from './smart-data';
import { matchesText, type SmartFolder } from './smart-model';

const NO_PICKS: ReadonlySet<string> = new Set();
const NO_PLACES: ReadonlyMap<string, string> = new Map();
const READ_ONLY = { writable: false, details: false } as const;

function useHandlers(byName: ByName): FolderRowHandlers {
  const router = useRouter();
  const open = (item: DriveItem): void => {
    router.push(openHrefOf(item));
  };
  const commands: ItemCommands = { open, details: open, rename: open };
  return {
    byName,
    actionsOf: (item): readonly FolderAction[] => actionsOf(item, READ_ONLY),
    onAction: (action, item): void => {
      runAction(action, item, commands);
    },
    onPick: open,
    onPress: open,
    highlight: (): null => null,
  };
}

function EveryMatch({ pages }: { readonly pages: AlbumPages }): ReactNode {
  if (pages.data === undefined || pages.hasNextPage) return null;
  return (
    <Text variant="caption" tone="faint" align="center" className="py-4">
      That’s every match.
    </Text>
  );
}

function Matches({ pages }: { readonly pages: AlbumPages }): ReactNode {
  const [sort, setSort] = useState<FolderSort>(DEFAULT_SORT);
  const byName = useByName();
  const handlers = useHandlers(byName);
  const wide = useFrameBodyWidth() >= WIDE_FROM;
  const items = sortItems(windowOf(pages).items, sort, byName);
  if (pages.data === undefined) return <FolderLoading label="Finding the matching files" />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon="sparkles"
        title="Nothing matches yet"
        body="Files that match the rules show up here as soon as they arrive."
      />
    );
  }
  return (
    <FolderList
      items={items}
      wide={wide}
      sort={sort}
      selection={NO_PICKS}
      handlers={handlers}
      loadingMore={pages.isFetchingNextPage}
      stale={pages.isPlaceholderData}
      footer={<EveryMatch pages={pages} />}
      onSort={(key) => {
        setSort(columnSort(sort, key));
      }}
      onMore={() => {
        if (!pages.hasNextPage || pages.isFetchingNextPage) return;
        pages.fetchNextPage().catch(notifyFailure('More matching files could not be read.'));
      }}
    />
  );
}

function Body({
  pages,
  online,
}: {
  readonly pages: AlbumPages;
  readonly online: boolean;
}): ReactNode {
  if (!online && pages.data === undefined) {
    return (
      <EmptyState
        icon="wifiOff"
        title="The hub is not answering"
        body="This smart folder opens again when the hub is back."
      />
    );
  }
  if (pages.error !== null && pages.data === undefined) {
    return (
      <ErrorState
        error={pages.error}
        retry={() => {
          background(pages.refetch(), 'drive.smart_folder_retry_failed');
        }}
      />
    );
  }
  return <Matches pages={pages} />;
}

function Opened({ folder }: { readonly folder: SmartFolder }): ReactNode {
  const pages = useDriveAlbumItems(folder.id);
  const online = useSyncStatus().status === 'live';
  const placeOf = usePlaceOf(NO_PLACES);
  return (
    <DriveFrame
      section="starred"
      title={folder.title}
      subtitle={joinParts([matchesText(folder.itemCount), ruleSummary(folder.rule, placeOf)])}
      breadcrumbs={[{ label: 'Starred', href: href.drivePage('starred') }, { label: folder.title }]}
      scroll={false}
    >
      <View className="min-h-0 flex-1 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        <Body pages={pages} online={online} />
      </View>
    </DriveFrame>
  );
}

export function SmartFolderScreen({ albumId }: { readonly albumId: string }): ReactNode {
  const folder = useSmartFolder(albumId);
  if (folder !== null) return <Opened folder={folder} />;
  return (
    <DriveFrame section="starred" title="Smart folder">
      <EmptyState
        icon="sparkles"
        title="This smart folder is gone"
        body="Someone removed it, or it belongs to someone else. The files it showed are still in Drive."
        action={<Button label="Back to Starred" variant="tonal" href={href.drivePage('starred')} />}
      />
    </DriveFrame>
  );
}
