import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRecentFilter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useDeviceNames, useRows, useSession, useSyncStatus } from '../../../store/selectors';
import { SHELL_BREAKPOINTS } from '../../../components/page-shell/layout';
import { useDriveChips } from '../data';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { DriveFilterRow } from '../components/drive-chip';
import { DriveColumnHead } from '../components/drive-columns';
import { placeColumns } from '../model/drive-columns';
import { DriveFrame } from '../components/drive-frame';
import {
  driveFilterCounts,
  folderTrailOf,
  inDrive,
  type DriveChip,
  type DriveChipOf,
  type DriveFilter,
} from '../model/drive-chip';
import { RecentBars } from './recent-bars';
import { howOf, type RecentNames } from './recent-how';
import {
  chartShown,
  relPathOf,
  rootIdOf,
  sectionsOf,
  timeOf,
  weekBarsOf,
  type RecentDays,
  type RecentLine,
} from './recent-model';
import { RECENT_COLUMNS, RecentRow, type RecentColumns } from './recent-row';
import type { FileBrowserHandle } from '../../files';
import { DriveListFrame, useDriveNodeList } from '../source/drive-lists';
import {
  driveNodeOf,
  shortcutNodeOf,
  type DriveNode,
  type DriveNodeContext,
  type DriveOrigin,
} from '../source/drive-node';
import { RecentEmpty, RecentFooter, RecentStaleBanner, recentStale } from './recent-states';
import { loadMore, useRecentFeed, type RecentFeed } from './use-recent-feed';

const log = new Logger('app.drive');

const FILTERS: readonly SegmentedOption<DriveRecentFilter>[] = [
  { value: 'everything', label: 'Everything' },
  { value: 'opened', label: 'Opened' },
  { value: 'added', label: 'Added' },
  { value: 'changed', label: 'Changed' },
];

function useNames(): RecentNames {
  const me = useSession().client.profile_id;
  const people = new Map(useRows('profiles').map((person) => [person.id, person.name]));
  const devices = useDeviceNames('name');
  return {
    me,
    personOf: (id) => people.get(id) ?? null,
    deviceOf: (id) => devices.get(id) ?? null,
  };
}

interface DriveScope {
  readonly drive: DriveFilter;
  readonly onDrive: (drive: DriveFilter) => void;
  readonly chipOf: DriveChipOf;
}

interface ListTopProps {
  readonly filter: DriveRecentFilter;
  readonly onFilter: (filter: DriveRecentFilter) => void;
  readonly feed: RecentFeed;
  readonly lines: readonly RecentLine[];
  readonly scope: DriveScope;
  readonly wide: boolean;
  readonly columns: RecentColumns;
}

function chipOfLine(chipOf: DriveChipOf): (line: RecentLine) => DriveChip {
  return (line) => chipOf(rootIdOf(line.entry));
}

function ListTop(props: ListTopProps): ReactNode {
  const { filter, onFilter, feed, lines, scope, wide, columns } = props;
  const loaded = feed.pages.data !== undefined && lines.length > 0;
  const counts = driveFilterCounts(feed.lines, chipOfLine(scope.chipOf));
  return (
    <View>
      <View className="gap-3 px-gutter pb-3">
        <View className={wide ? 'self-start' : 'w-full'}>
          <Segmented
            options={FILTERS}
            value={filter}
            onChange={onFilter}
            label="Show"
            fill={!wide}
          />
        </View>
        {feed.lines.length > 0 ? (
          <DriveFilterRow
            label="Show from drive"
            value={scope.drive}
            counts={counts}
            onChange={scope.onDrive}
          />
        ) : null}
        {loaded && chartShown(filter) ? (
          <RecentBars filter={filter} days={weekBarsOf(lines, feed.days)} />
        ) : null}
      </View>
      {columns === null || lines.length === 0 ? null : <DriveColumnHead columns={columns} />}
    </View>
  );
}

function useRecentLog(filter: DriveRecentFilter, lines: number): void {
  useLifecycleLog(log, 'drive_recent_screen');
  useEffect(() => {
    log.debug('drive_recent.shown', { filter, lines });
  }, [filter, lines]);
}

interface RowRenderInput {
  readonly names: RecentNames;
  readonly chipOf: DriveChipOf;
  readonly days: RecentDays;
  readonly columns: RecentColumns;
  readonly list: RecentList;
}

function renderLine({
  names,
  chipOf,
  days,
  columns,
  list,
}: RowRenderInput): (line: RecentLine) => ReactElement {
  return function RenderedLine(line: RecentLine): ReactElement {
    const chip = chipOf(rootIdOf(line.entry));
    const node = list.nodeOf.get(line.key);
    if (node === undefined) throw new MissingRecentNodeError(line.key);
    return (
      <RecentRow
        node={node}
        browser={list.browser}
        how={howOf(line.entry, names)}
        chip={chip}
        where={folderTrailOf(chip, relPathOf(line.entry))}
        time={timeOf(line, days.timeZone)}
        columns={columns}
      />
    );
  };
}

class MissingRecentNodeError extends Error {
  override readonly name = 'MissingRecentNodeError';
  constructor(key: string) {
    super(`The recent line ${key} has no file node.`);
  }
}

interface RecentList {
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly nodeOf: ReadonlyMap<string, DriveNode>;
}

function nodeOfEntry(entry: RecentLine['entry'], context: DriveNodeContext): DriveNode {
  return entry.kind === 'shortcut'
    ? shortcutNodeOf(entry.shortcut, context)
    : driveNodeOf(entry.item, context);
}

function useRecentList(lines: readonly RecentLine[]): RecentList {
  const keyed = new Map<string, DriveNode>();
  const { browser } = useDriveNodeList('recent', (context) =>
    lines.map((line) => {
      const node = nodeOfEntry(line.entry, context);
      keyed.set(line.key, node);
      return node;
    }),
  );
  return { browser, nodeOf: keyed };
}

interface RecentListProps {
  readonly filter: DriveRecentFilter;
  readonly onFilter: (filter: DriveRecentFilter) => void;
  readonly feed: RecentFeed;
  readonly lines: readonly RecentLine[];
  readonly scope: DriveScope;
  readonly wide: boolean;
  readonly live: boolean;
}

function RecentLines(props: RecentListProps): ReactNode {
  const { feed, lines, scope } = props;
  const names = useNames();
  const list = useRecentList(lines);
  const row = useMeasuredWidth();
  const columns = placeColumns(row.width, RECENT_COLUMNS);
  return (
    <DriveListFrame browser={list.browser}>
      <View className="-mx-gutter flex-1" onLayout={row.onLayout}>
        <VirtualList
          sections={sectionsOf(lines)}
          keyOf={(line) => line.key}
          renderItem={renderLine({ names, chipOf: scope.chipOf, days: feed.days, columns, list })}
          header={<ListTop {...props} columns={columns} />}
          empty={
            <RecentEmpty
              pages={feed.pages}
              filter={props.filter}
              drive={scope.drive}
              onAllDrives={() => {
                scope.onDrive('all');
              }}
              live={props.live}
            />
          }
          footer={<RecentFooter pages={feed.pages} />}
          onEndReached={() => {
            loadMore(feed.pages);
          }}
          probe="drive-recent"
        />
      </View>
    </DriveListFrame>
  );
}

export function RecentScreen(): ReactNode {
  const [filter, setFilter] = useState<DriveRecentFilter>('everything');
  const [drive, setDrive] = useState<DriveFilter>('all');
  const feed = useRecentFeed(filter);
  const wide = useAreaWidth() >= SHELL_BREAKPOINTS.compactMax;
  const chipOf = useDriveChips();
  const lines = inDrive(feed.lines, drive, chipOfLine(chipOf));
  const live = useSyncStatus().status === 'live';
  useRecentLog(filter, lines.length);
  return (
    <DriveFrame
      section="recent"
      title="Recent"
      subtitle="What you opened, added or changed in your drives, newest first"
      scroll={false}
      {...(recentStale(feed.pages.data !== undefined, live)
        ? { banner: <RecentStaleBanner /> }
        : {})}
    >
      <RecentLines
        filter={filter}
        onFilter={setFilter}
        feed={feed}
        lines={lines}
        scope={{ drive, onDrive: setDrive, chipOf }}
        wide={wide}
        live={live}
      />
    </DriveFrame>
  );
}
