import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Banner } from '../../../components/banner';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { VirtualList } from '../../../components/virtual-list';
import { joinParts } from '../../../format/text';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveAlbumItems, useDriveChips } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { DriveColumnHead } from '../components/drive-columns';
import { folderTrailOf, type DriveChipOf } from '../model/drive-chip';
import { placeColumns } from '../model/drive-columns';
import { DriveRowsSkeleton, recentStale } from '../recent/recent-states';
import { RuleBadges, usePlaceOf } from './rule-chip-view';
import { ruleSummary } from './rule-labels';
import { useSaveSmartFolder } from './save-smart-folder';
import { useSmartFolder, windowOf, type AlbumPages } from './smart-data';
import { smartFolderMenu } from './smart-folders';
import { matchesText, type SmartFolder } from './smart-model';
import { StarredFileRow, starredColumnsOf, type StarredColumns } from './starred-look';
import type { FileBrowserHandle } from '../../files';
import { DriveListFrame, useDriveItemList } from '../source/drive-lists';
import { itemOf, type DriveNode, type DriveOrigin } from '../source/drive-node';

const NO_PLACES: ReadonlyMap<string, string> = new Map();

function EveryMatch({ pages }: { readonly pages: AlbumPages }): ReactElement {
  if (pages.data === undefined || pages.hasNextPage) return <View />;
  return (
    <Text variant="caption" tone="variant" align="center" className="py-4">
      That’s every match.
    </Text>
  );
}

function whereOf(chipOf: DriveChipOf, node: DriveNode): string {
  const item = itemOf(node);
  return folderTrailOf(chipOf(item?.rootId ?? ''), item?.relPath ?? '');
}

function rowOf(
  browser: FileBrowserHandle<DriveOrigin>,
  chipOf: DriveChipOf,
  columns: StarredColumns,
): (node: DriveNode) => ReactElement {
  return function SmartMatch(node: DriveNode): ReactElement {
    const item = itemOf(node);
    return (
      <StarredFileRow
        node={node}
        browser={browser}
        chip={chipOf(item?.rootId ?? '')}
        where={whereOf(chipOf, node)}
        columns={columns}
      />
    );
  };
}

function Matches({ pages }: { readonly pages: AlbumPages }): ReactNode {
  const chipOf = useDriveChips();
  const row = useMeasuredWidth();
  const { items } = windowOf(pages);
  const { browser, nodes } = useDriveItemList('smart-folder', items);
  const trails = nodes.some((node) => whereOf(chipOf, node) !== '');
  const columns = placeColumns(row.width, starredColumnsOf(trails));
  if (pages.data === undefined) {
    return (
      <View className="-mx-gutter">
        <DriveRowsSkeleton label="Finding the matching files" />
      </View>
    );
  }
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
      <View className="-mx-gutter flex-1" onLayout={row.onLayout}>
        <VirtualList
          sections={[{ key: 'matches', title: null, data: nodes }]}
          keyOf={(node) => node.key}
          renderItem={rowOf(browser, chipOf, columns)}
          {...(columns === null ? {} : { header: <DriveColumnHead columns={columns} /> })}
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
        page
        retry={() => {
          background(pages.refetch(), 'drive.smart_folder_retry_failed');
        }}
      />
    );
  }
  return <Matches pages={pages} />;
}

function SmartStaleBanner(): ReactNode {
  return (
    <Banner
      wrapBody
      tone="info"
      title="Offline · showing the last matches"
      body="New matching files appear when the hub is back."
    />
  );
}

function Opened({ folder }: { readonly folder: SmartFolder }): ReactNode {
  const pages = useDriveAlbumItems(folder.id);
  const online = useSyncStatus().status === 'live';
  const placeOf = usePlaceOf(NO_PLACES);
  const saver = useSaveSmartFolder();
  const router = useRouter();
  return (
    <DriveFrame
      section="starred"
      title={folder.title}
      subtitle={joinParts([matchesText(folder.itemCount), ruleSummary(folder.rule, placeOf)])}
      breadcrumbs={[{ label: 'Starred', href: href.drivePage('starred') }, { label: folder.title }]}
      back
      overflow={smartFolderMenu(
        folder,
        () => {
          saver.rename(folder);
        },
        () => {
          router.replace(href.drivePage('starred'));
        },
      )}
      scroll={false}
      {...(recentStale(pages.data !== undefined, online) ? { banner: <SmartStaleBanner /> } : {})}
    >
      <View className="pb-3">
        <RuleBadges rule={folder.rule} />
      </View>
      <Body pages={pages} online={online} />
      {saver.host}
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
