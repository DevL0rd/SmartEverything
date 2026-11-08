import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRecentFilter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { VirtualList } from '../../../components/virtual-list';
import { useAreaWidth } from '../../../design/size-class';
import { useDevices, useRows, useSession, useSyncStatus } from '../../../store/selectors';
import { useDriveRoots } from '../../nas/data';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { DriveFrame } from '../components/drive-frame';
import { RecentBars } from './recent-bars';
import { howOf, type RecentNames } from './recent-how';
import {
  chartShown,
  sectionsOf,
  timeOf,
  weekBarsOf,
  whereOf,
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

function useRootLabels(): ReadonlyMap<string, string> {
  return new Map(useDriveRoots().map((root) => [root.id, root.label]));
}

interface ListTopProps {
  readonly filter: DriveRecentFilter;
  readonly onFilter: (filter: DriveRecentFilter) => void;
  readonly feed: RecentFeed;
  readonly wide: boolean;
}

function ListTop({ filter, onFilter, feed, wide }: ListTopProps): ReactNode {
  const loaded = feed.pages.data !== undefined && feed.lines.length > 0;
  return (
    <View className="gap-3 px-gutter pb-3">
      <View className={wide ? 'self-start' : 'w-full'}>
        <Segmented options={FILTERS} value={filter} onChange={onFilter} label="Show" fill={!wide} />
      </View>
      {loaded && chartShown(filter) ? (
        <RecentBars filter={filter} days={weekBarsOf(feed.lines, feed.days)} />
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
  readonly roots: ReadonlyMap<string, string>;
  readonly days: RecentDays;
  readonly wide: boolean;
}

function renderLine({
  names,
  roots,
  days,
  wide,
}: RowRenderInput): (line: RecentLine) => ReactElement {
  return function RenderedLine(line: RecentLine): ReactElement {
    const { item } = line.entry;
    return (
      <RecentRow
        line={line}
        how={howOf(line.entry, names)}
        where={whereOf(item, roots.get(item.rootId) ?? null)}
        time={timeOf(line, days.timeZone)}
        wide={wide}
      />
    );
  };
}

export function RecentScreen(): ReactNode {
  const [filter, setFilter] = useState<DriveRecentFilter>('everything');
  const feed = useRecentFeed(filter);
  const wide = libraryLayoutOf(useAreaWidth()) !== 'compact';
  const names = useNames();
  const roots = useRootLabels();
  const live = useSyncStatus().status === 'live';
  useRecentLog(filter, feed.lines.length);
  return (
    <DriveFrame
      section="recent"
      title="Recent"
      subtitle="What you opened, added or changed, newest first"
      scroll={false}
      {...(recentStale(feed.pages.data !== undefined, live)
        ? { banner: <RecentStaleBanner /> }
        : {})}
    >
      <View className="-mx-gutter flex-1">
        <VirtualList
          sections={sectionsOf(feed.lines)}
          keyOf={(line) => line.key}
          renderItem={renderLine({ names, roots, days: feed.days, wide })}
          header={<ListTop filter={filter} onFilter={setFilter} feed={feed} wide={wide} />}
          empty={<RecentEmpty pages={feed.pages} filter={filter} live={live} />}
          footer={<RecentFooter pages={feed.pages} />}
          onEndReached={() => {
            loadMore(feed.pages);
          }}
          probe="drive-recent"
        />
      </View>
    </DriveFrame>
  );
}
