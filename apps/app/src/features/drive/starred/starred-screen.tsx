import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { FilterChip } from '../../../components/filter-chip';
import {
  usePrimaryActionPlacement,
  type PrimaryActionProps,
} from '../../../components/primary-action';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveChips, useDriveSearch } from '../data';
import { ChipRow } from '../../../components/chip-row';
import { SHELL_BREAKPOINTS } from '../../../components/page-shell/layout';
import { DriveFilterRow } from '../components/drive-chip';
import { DriveColumnHead } from '../components/drive-columns';
import { placeColumns } from '../model/drive-columns';
import { DriveFrame } from '../components/drive-frame';
import type { FileBrowserHandle } from '../../files';
import { DriveListFrame, useDriveItemList, type DriveItemList } from '../source/drive-lists';
import { itemOf, type DriveNode, type DriveOrigin } from '../source/drive-node';
import {
  driveFilterCounts,
  folderTrailOf,
  inDrive,
  type DriveChipOf,
  type DriveFilter,
} from '../model/drive-chip';
import { useSaveSmartFolder } from './save-smart-folder';
import { SectionHead } from './section-head';
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
import { StarredFileRow, starredColumnsOf, type StarredColumns } from './starred-look';
import { StarredEmpty, StarredFooter, loadMoreStarred, type StarredPages } from './starred-states';

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
  readonly columns: StarredColumns;
  readonly rows: number;
}

function ListTop(props: TopProps): ReactNode {
  const { folders, onRename, chip, counts, onChip, items, scope, compact, columns, rows } = props;
  const driveCounts = driveFilterCounts(items, (item) => scope.chipOf(item.rootId));
  return (
    <View>
      <View className="gap-4 px-gutter pb-2">
        <SmartFolders folders={folders} onRename={onRename} compact={compact} />
        <View className="gap-2">
          <SectionHead title="Starred" note={STAR_NOTE} />
          {chip === 'all' && items.length === 0 ? null : (
            <StarredChips chip={chip} counts={counts} onChip={onChip} />
          )}
          {items.length === 0 ? null : (
            <DriveFilterRow
              label="Starred files by drive"
              value={scope.drive}
              counts={driveCounts}
              onChange={scope.onDrive}
            />
          )}
        </View>
      </View>
      {columns === null || rows === 0 ? null : <DriveColumnHead columns={columns} />}
    </View>
  );
}

function whereOf(chipOf: DriveChipOf, node: DriveNode): string {
  const item = itemOf(node);
  return folderTrailOf(chipOf(item?.rootId ?? ''), item?.relPath ?? '');
}

function renderNode(
  browser: FileBrowserHandle<DriveOrigin>,
  chipOf: DriveChipOf,
  columns: StarredColumns,
): (node: DriveNode) => ReactElement {
  return function RenderedStarred(node: DriveNode): ReactElement {
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
  readonly list: DriveItemList;
  readonly scope: DriveScope;
  readonly top: (columns: StarredColumns) => ReactElement;
  readonly chip: StarredChip;
  readonly live: boolean;
}

function FabRoom(): ReactNode {
  return usePrimaryActionPlacement() === 'fab' ? <View className="h-18" /> : null;
}

function StarredList({ feed, list, scope, top, chip, live }: ListProps): ReactNode {
  const { browser, nodes } = list;
  const row = useMeasuredWidth();
  const trails = nodes.some((node) => whereOf(scope.chipOf, node) !== '');
  const columns = placeColumns(row.width, starredColumnsOf(trails));
  return (
    <DriveListFrame browser={browser}>
      <View className="-mx-gutter flex-1" onLayout={row.onLayout}>
        <VirtualList
          sections={nodes.length === 0 ? [] : [{ key: 'starred', title: null, data: nodes }]}
          keyOf={(node) => node.key}
          renderItem={renderNode(browser, scope.chipOf, columns)}
          header={top(columns)}
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
          footer={
            <View>
              <StarredFooter pages={feed.pages} />
              <FabRoom />
            </View>
          }
          onEndReached={() => {
            loadMoreStarred(feed.pages);
          }}
          probe="drive-starred"
        />
      </View>
    </DriveListFrame>
  );
}

export function StarredScreen(): ReactNode {
  const [chip, setChip] = useState<StarredChip>('all');
  const [drive, setDrive] = useState<DriveFilter>('all');
  const feed = useStarredFeed(chip);
  const chipOf = useDriveChips();
  const scope: DriveScope = { drive, onDrive: setDrive, chipOf };
  const items = inDrive(feed.items, drive, (item) => chipOf(item.rootId));
  const list = useDriveItemList('starred', items);
  const folders = useSmartFolders();
  const saver = useSaveSmartFolder();
  const compact = useAreaWidth() < SHELL_BREAKPOINTS.compactMax;
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
    >
      <StarredList
        feed={feed}
        list={list}
        scope={scope}
        live={live}
        top={(columns) => (
          <ListTop
            folders={folders}
            onRename={saver.rename}
            chip={chip}
            counts={feed.counts}
            onChip={setChip}
            items={feed.items}
            scope={scope}
            compact={compact}
            columns={columns}
            rows={list.nodes.length}
          />
        )}
        chip={chip}
      />
      {saver.host}
    </DriveFrame>
  );
}
