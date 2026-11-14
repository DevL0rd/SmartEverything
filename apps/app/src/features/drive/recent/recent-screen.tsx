import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRecentFilter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useDevices, useRows, useSession, useSyncStatus } from '../../../store/selectors';
import { ChipRow } from '../../../components/library-frame';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { useDriveChips } from '../data';
import { DriveFilterChips } from '../components/drive-chip';
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
  sectionsOf,
  timeOf,
  weekBarsOf,
  type RecentDays,
  type RecentLine,
} from './recent-model';
import { RecentRow } from './recent-row';
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
  const devices = new Map(
    useDevices({ includeHidden: true }).map((device) => [device.id, device.name]),
  );
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
}

function chipOfLine(chipOf: DriveChipOf): (line: RecentLine) => DriveChip {
  return (line) => chipOf(line.entry.item.rootId);
}

function ListTop({ filter, onFilter, feed, lines, scope, wide }: ListTopProps): ReactNode {
  const loaded = feed.pages.data !== undefined && lines.length > 0;
  const counts = driveFilterCounts(feed.lines, chipOfLine(scope.chipOf));
  return (
    <View className="gap-3 px-gutter pb-3">
      <View className={wide ? 'self-start' : 'w-full'}>
        <Segmented options={FILTERS} value={filter} onChange={onFilter} label="Show" fill={!wide} />
      </View>
      {feed.lines.length > 0 ? (
        <ChipRow label="Show from drive">
          <DriveFilterChips value={scope.drive} counts={counts} onChange={scope.onDrive} />
        </ChipRow>
      ) : null}
      {loaded && chartShown(filter) ? (
        <RecentBars filter={filter} days={weekBarsOf(lines, feed.days)} />
      ) : null}
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
  readonly wide: boolean;
}

function renderLine({
  names,
  chipOf,
  days,
  wide,
}: RowRenderInput): (line: RecentLine) => ReactElement {
  return function RenderedLine(line: RecentLine): ReactElement {
    const { item } = line.entry;
    const chip = chipOf(item.rootId);
    return (
      <RecentRow
        line={line}
        how={howOf(line.entry, names)}
        chip={chip}
        where={folderTrailOf(chip, item.relPath)}
        time={timeOf(line, days.timeZone)}
        wide={wide}
      />
    );
  };
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

function RecentList(props: RecentListProps): ReactNode {
  const { feed, lines, scope, wide } = props;
  const names = useNames();
  return (
    <VirtualList
      sections={sectionsOf(lines)}
      keyOf={(line) => line.key}
      renderItem={renderLine({ names, chipOf: scope.chipOf, days: feed.days, wide })}
      header={<ListTop {...props} />}
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
  );
}

export function RecentScreen(): ReactNode {
  const [filter, setFilter] = useState<DriveRecentFilter>('everything');
  const [drive, setDrive] = useState<DriveFilter>('all');
  const feed = useRecentFeed(filter);
  const wide = libraryLayoutOf(useAreaWidth()) !== 'compact';
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
      <View className="-mx-gutter flex-1">
        <RecentList
          filter={filter}
          onFilter={setFilter}
          feed={feed}
          lines={lines}
          scope={{ drive, onDrive: setDrive, chipOf }}
          wide={wide}
          live={live}
        />
      </View>
    </DriveFrame>
  );
}
