import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { SHELL_BREAKPOINTS } from '../../../components/page-shell/layout';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { joinParts } from '../../../format/text';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveAlbumItems, useDriveChips } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { folderTrailOf, type DriveChipOf } from '../model/drive-chip';
import { usePlaceOf } from './rule-chip-view';
import { ruleSummary } from './rule-labels';
import { StarredColumns } from './section-head';
import { useSmartFolder, windowOf, type AlbumPages } from './smart-data';
import { matchesText, type SmartFolder } from './smart-model';
import { StarredFileRow } from './starred-look';
import type { FileBrowserHandle } from '../../files';
import { DriveListFrame, useDriveItemList } from '../source/drive-lists';
import { itemOf, type DriveNode, type DriveOrigin } from '../source/drive-node';

const NO_PLACES: ReadonlyMap<string, string> = new Map();

const LOADING_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

function EveryMatch({ pages }: { readonly pages: AlbumPages }): ReactElement {
  if (pages.data === undefined || pages.hasNextPage) return <View />;
  return (
    <Text variant="caption" tone="variant" align="center" className="py-4">
      That’s every match.
    </Text>
  );
}

function Loading(): ReactNode {
  return (
    <View aria-busy aria-label="Finding the matching files" className="gap-2 p-4">
      {LOADING_ROWS.map((key) => (
        <Skeleton key={key} className="h-row-h" />
      ))}
    </View>
  );
}

function rowOf(
  browser: FileBrowserHandle<DriveOrigin>,
  chipOf: DriveChipOf,
  wide: boolean,
): (node: DriveNode) => ReactElement {
  return function SmartMatch(node: DriveNode): ReactElement {
    const item = itemOf(node);
    const chip = chipOf(item?.rootId ?? '');
    return (
      <StarredFileRow
        node={node}
        browser={browser}
        chip={chip}
        where={folderTrailOf(chip, item?.relPath ?? '')}
        wide={wide}
      />
    );
  };
}

function Matches({ pages }: { readonly pages: AlbumPages }): ReactNode {
  const chipOf = useDriveChips();
  const wide = useAreaWidth() >= SHELL_BREAKPOINTS.compactMax;
  const { items } = windowOf(pages);
  const { browser, nodes } = useDriveItemList('smart-folder', items);
  if (pages.data === undefined) return <Loading />;
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
    <DriveListFrame browser={browser}>
      <View className="-mx-gutter flex-1">
        <VirtualList
          sections={[{ key: 'matches', title: null, data: nodes }]}
          keyOf={(node) => node.key}
          renderItem={rowOf(browser, chipOf, wide)}
          {...(wide ? { header: <StarredColumns /> } : {})}
          footer={<EveryMatch pages={pages} />}
          onEndReached={() => {
            if (!pages.hasNextPage || pages.isFetchingNextPage) return;
            pages.fetchNextPage().catch(notifyFailure('More matching files could not be read.'));
          }}
          probe="drive-smart-folder"
        />
      </View>
    </DriveListFrame>
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
      <Body pages={pages} online={online} />
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

export function SmartFolderRouteScreen(): ReactNode {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  return <SmartFolderScreen key={albumId} albumId={albumId} />;
}
