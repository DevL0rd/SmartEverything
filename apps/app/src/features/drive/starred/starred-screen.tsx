import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { FilterChip } from '../../../components/filter-chip';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { useSectionParam } from '../../../components/use-section-param';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveRoots, useDriveSearch } from '../../nas/data';
import { ChipRow } from '../../nas/frame';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { DriveFrame } from '../components/drive-frame';
import { runChange } from '../folder/folder-footer';
import { whereOf } from '../recent/recent-model';
import { recentStale } from '../recent/recent-states';
import { useSaveSmartFolder } from './save-smart-folder';
import { SectionHead, StarredColumns } from './section-head';
import { useSmartFolders } from './smart-data';
import { SmartFolderScreen } from './smart-folder-screen';
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
  readonly compact: boolean;
}

function ListTop({ folders, onRename, chip, counts, onChip, compact }: TopProps): ReactNode {
  return (
    <View>
      <View className="gap-4 px-gutter pb-2">
        <SmartFolders folders={folders} onRename={onRename} />
        <View className="gap-2">
          <SectionHead title="Starred" note={STAR_NOTE} />
          <StarredChips chip={chip} counts={counts} onChip={onChip} />
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
  roots: ReadonlyMap<string, string>,
  wide: boolean,
  live: boolean,
): (item: DriveItem) => ReactElement {
  return function RenderedStarred(item: DriveItem): ReactElement {
    return (
      <StarredRow
        item={item}
        where={whereOf(item, roots.get(item.rootId) ?? null)}
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
  readonly top: ReactElement;
  readonly chip: StarredChip;
  readonly compact: boolean;
  readonly live: boolean;
}

function StarredList({ feed, top, chip, compact, live }: ListProps): ReactNode {
  const roots = new Map(useDriveRoots().map((root) => [root.id, root.label]));
  return (
    <View className="-mx-gutter flex-1">
      <VirtualList
        sections={
          feed.items.length === 0 ? [] : [{ key: 'starred', title: null, data: feed.items }]
        }
        keyOf={(item) => item.id}
        renderItem={renderItem(roots, !compact, live)}
        header={top}
        empty={<StarredEmpty pages={feed.pages} chip={chip} live={live} />}
        footer={<StarredFooter pages={feed.pages} />}
        onEndReached={() => {
          loadMoreStarred(feed.pages);
        }}
        probe="drive-starred"
      />
    </View>
  );
}

function StarredHome(): ReactNode {
  const [chip, setChip] = useState<StarredChip>('all');
  const feed = useStarredFeed(chip);
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
        live={live}
        top={
          <ListTop
            folders={folders}
            onRename={saver.rename}
            chip={chip}
            counts={feed.counts}
            onChip={setChip}
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

export function StarredScreen(): ReactNode {
  const [smart] = useSectionParam('smart');
  return smart === null ? <StarredHome /> : <SmartFolderScreen key={smart} albumId={smart} />;
}
