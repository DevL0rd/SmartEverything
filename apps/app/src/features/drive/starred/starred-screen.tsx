import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { FilterChip } from '../../../components/filter-chip';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveChips, useDriveSearch } from '../data';
import { ChipRow } from '../../../components/library-frame';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { DriveFilterChips } from '../components/drive-chip';
import { DriveFrame } from '../components/drive-frame';
import { runChange } from '../folder/folder-footer';
import {
  driveFilterCounts,
  folderTrailOf,
  inDrive,
  type DriveChipOf,
  type DriveFilter,
} from '../model/drive-chip';
import { recentStale } from '../recent/recent-states';
import { useSaveSmartFolder } from './save-smart-folder';
import { SectionHead, StarredColumns } from './section-head';
import { useSmartFolders } from './smart-data';
import { SmartFolders, type RenameSmartFolder } from './smart-folders';
import type { SmartFolder } from './smart-model';
import {
  STAR_NOTE,
  STARRED_CHIPS,
  chipCountsOf,
  starredQueryOf,
  starredSubtitleOf,
  type ChipCounts,
  type StarredChip,
} from './starred-model';
import { StarredRow } from './starred-row';
import {
  StarredEmpty,
  StarredFooter,
  StarredStaleBanner,
  loadMoreStarred,
  type StarredPages,
} from './starred-states';

const log = new Logger('app.drive');

interface Listed {
  readonly items: readonly DriveItem[];
  readonly complete: boolean;
}

function listedOf(pages: StarredPages): Listed {
  return {
    items: flattenPages(pages.data, (page) => page.items),
    complete: pages.data !== undefined && !pages.hasNextPage,
  };
}

interface StarredFeed {
  readonly pages: StarredPages;
  readonly items: readonly DriveItem[];
  readonly counts: ChipCounts;
}

function useStarredFeed(chip: StarredChip): StarredFeed {
  const allPages = useDriveSearch(starredQueryOf('all'), true);
  const chipPages = useDriveSearch(starredQueryOf(chip), chip !== 'all');
  const pages = chip === 'all' ? allPages : chipPages;
  const shown = listedOf(pages);
  const counts = chipCountsOf({ chip, all: listedOf(allPages), shown });
  return { pages, items: shown.items, counts };
}

interface DriveScope {
  readonly drive: DriveFilter;
  readonly onDrive: (drive: DriveFilter) => void;
  readonly chipOf: DriveChipOf;
}

function StarredChips({
  chip,
  counts,
  onChip,
}: {
  readonly chip: StarredChip;
  readonly counts: ChipCounts;
  readonly onChip: (chip: StarredChip) => void;
}): ReactNode {
  return (
    <ChipRow label="Kinds of starred files">
      {STARRED_CHIPS.map((entry) => {
        const shown = counts[entry.chip];
        return (
          <FilterChip
            key={entry.chip}
            label="Show"
            value={entry.label}
            {...(shown === null ? {} : { count: shown })}
            active={entry.chip === chip}
            singleChoice
            onPress={() => {
              onChip(entry.chip);
            }}
          />
        );
      })}
    </ChipRow>
  );
}

interface TopProps {
  readonly folders: readonly SmartFolder[];
  readonly onRename: RenameSmartFolder;
  readonly chip: StarredChip;
  readonly counts: ChipCounts;
  readonly onChip: (chip: StarredChip) => void;
  readonly items: readonly DriveItem[];
  readonly scope: DriveScope;
  readonly compact: boolean;
}

function ListTop(props: TopProps): ReactNode {
  const { folders, onRename, chip, counts, onChip, items, scope, compact } = props;
  const driveCounts = driveFilterCounts(items, (item) => scope.chipOf(item.rootId));
  return (
    <View>
      <View className="gap-4 px-gutter pb-2">
        <SmartFolders folders={folders} onRename={onRename} />
        <View className="gap-2">
          <SectionHead title="Starred" note={STAR_NOTE} />
          <StarredChips chip={chip} counts={counts} onChip={onChip} />
          {items.length === 0 ? null : (
            <ChipRow label="Starred files by drive">
              <DriveFilterChips value={scope.drive} counts={driveCounts} onChange={scope.onDrive} />
            </ChipRow>
          )}
        </View>
      </View>
      {compact ? null : <StarredColumns />}
    </View>
  );
}

function unstar(item: DriveItem): void {
  runChange({ action: 'unstar', itemIds: [item.id] }, 'Could not remove the star.');
}

function renderItem(
  chipOf: DriveChipOf,
  wide: boolean,
  live: boolean,
): (item: DriveItem) => ReactElement {
  return function RenderedStarred(item: DriveItem): ReactElement {
    const chip = chipOf(item.rootId);
    return (
      <StarredRow
        item={item}
        chip={chip}
        where={folderTrailOf(chip, item.relPath)}
        wide={wide}
        live={live}
        onUnstar={unstar}
      />
    );
  };
}

function useStarredLog(chip: StarredChip, items: number, folders: number): void {
  useLifecycleLog(log, 'drive_starred_screen');
  useEffect(() => {
    log.debug('drive_starred.shown', { chip, items, folders });
  }, [chip, items, folders]);
}

function primaryOf(open: () => void): PrimaryActionProps {
  return { label: 'New smart folder', icon: 'sparkles', onPress: open };
}

interface ListProps {
  readonly feed: StarredFeed;
  readonly items: readonly DriveItem[];
  readonly scope: DriveScope;
  readonly top: ReactElement;
  readonly chip: StarredChip;
  readonly compact: boolean;
  readonly live: boolean;
}

function StarredList({ feed, items, scope, top, chip, compact, live }: ListProps): ReactNode {
  return (
    <View className="-mx-gutter flex-1">
      <VirtualList
        sections={items.length === 0 ? [] : [{ key: 'starred', title: null, data: items }]}
        keyOf={(item) => item.id}
        renderItem={renderItem(scope.chipOf, !compact, live)}
        header={top}
        empty={
          <StarredEmpty
            pages={feed.pages}
            chip={chip}
            drive={scope.drive}
            onAllDrives={() => {
              scope.onDrive('all');
            }}
            live={live}
          />
        }
        footer={<StarredFooter pages={feed.pages} />}
        onEndReached={() => {
          loadMoreStarred(feed.pages);
        }}
        probe="drive-starred"
      />
    </View>
  );
}

export function StarredScreen(): ReactNode {
  const [chip, setChip] = useState<StarredChip>('all');
  const [drive, setDrive] = useState<DriveFilter>('all');
  const feed = useStarredFeed(chip);
  const chipOf = useDriveChips();
  const scope: DriveScope = { drive, onDrive: setDrive, chipOf };
  const items = inDrive(feed.items, drive, (item) => chipOf(item.rootId));
  const folders = useSmartFolders();
  const saver = useSaveSmartFolder();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const live = useSyncStatus().status === 'live';
  useStarredLog(chip, feed.items.length, folders.length);
  return (
    <DriveFrame
      section="starred"
      title="Starred"
      subtitle={starredSubtitleOf(feed.counts.all, folders.length)}
      primary={primaryOf(() => {
        saver.open({ rule: null, title: '', matches: null });
      })}
      scroll={false}
      {...(recentStale(feed.pages.data !== undefined, live)
        ? { banner: <StarredStaleBanner /> }
        : {})}
    >
      <StarredList
        feed={feed}
        items={items}
        scope={scope}
        live={live}
        top={
          <ListTop
            folders={folders}
            onRename={saver.rename}
            chip={chip}
            counts={feed.counts}
            onChip={setChip}
            items={feed.items}
            scope={scope}
            compact={compact}
          />
        }
        chip={chip}
        compact={compact}
      />
      {saver.host}
    </DriveFrame>
  );
}
