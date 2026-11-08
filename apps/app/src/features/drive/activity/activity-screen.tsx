import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { DRAW_DISTANCE } from '../../../components/virtual-list';
import { useScreenPaused } from '../../../design/screen-pause';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { localDayKey } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useDevices, useSession, useSettings, useSyncStatus } from '../../../store/selectors';
import { useDriveActivity, useDriveRoots } from '../../nas/data';
import { flattenPages } from '../../nas/data/pages';
import { DriveFrame } from '../components/drive-frame';
import { ActivityChart } from './activity-chart';
import {
  ActivityFilters,
  NO_FILTER,
  activityItemOf,
  feedRowsOf,
  emptyCopyOf,
  onlyOutside,
  scopedItems,
  showsOnlyOutside,
  subtitleOf,
  toggledFolder,
  viewOf,
  yearStartOf,
  type ActivityFilter,
  type ActivityItem,
  type ActivityNames,
  type ActivityView,
  type FeedRow,
} from './activity-filters';
import { ActivityRow } from './activity-row';
import { MostChanged } from './most-changed';
import { OutsideCallout } from './outside-callout';
import {
  ACTIVITY_RANGES,
  RANGE_LOOK,
  activityColumns,
  folderCounts,
  outsideOf,
  peopleLabel,
  type ActivityRange,
  type FolderCount,
} from './via-model';

interface Viewer {
  readonly me: string | null;
  readonly zone: string | null;
  readonly now: number;
  readonly today: string;
}

function useViewer(): Viewer {
  const me = useSession().client.profile_id;
  const zone = useSettings().time_zone;
  const now = useMinuteOf(
    (minute) => minute,
    (held, next) => localDayKey(held, zone) === localDayKey(next, zone),
  );
  return { me, zone, now, today: localDayKey(now, zone) };
}

function useNames(): ActivityNames {
  const roots = useDriveRoots();
  const profiles = useProfiles();
  const devices = useDevices({ includeHidden: true });
  return useMemo(
    () => ({
      roots: new Map(roots.map((root) => [root.id, root.label])),
      people: new Map(profiles.map((profile) => [profile.id, profile.name])),
      devices: new Map(devices.map((device) => [device.id, device.name])),
    }),
    [roots, profiles, devices],
  );
}

type FeedQuery = ReturnType<typeof useDriveActivity>;

function useWholeFeed(query: FeedQuery): void {
  const paused = useScreenPaused();
  const due = !paused && query.hasNextPage && !query.isFetchingNextPage && !query.isError;
  const { fetchNextPage } = query;
  useEffect(() => {
    if (due) background(fetchNextPage({ cancelRefetch: false }), 'drive.activity.page_failed');
  }, [due, fetchNextPage]);
}

interface Loaded {
  readonly status: 'loading' | 'error' | 'ready';
  readonly error: unknown;
  readonly retry: () => void;
  readonly items: readonly ActivityItem[];
}

function statusOf(query: FeedQuery): Loaded['status'] {
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}

function useActivityItems(viewer: Viewer): Loaded {
  const query = useDriveActivity(yearStartOf(viewer.now, viewer.zone));
  useWholeFeed(query);
  const names = useNames();
  const { data } = query;
  const items = flattenPages(data, (page) => page.items).map((feed) => activityItemOf(feed, names));
  return {
    status: statusOf(query),
    error: query.error,
    retry: (): void => {
      background(query.refetch(), 'drive.activity.retry_failed');
    },
    items,
  };
}

function openFolder(folder: FolderCount): void {
  router.push(
    href.driveRoot(folder.rootId, folder.folderId === null ? {} : { folder: folder.folderId }),
  );
}

interface Parts {
  readonly view: ActivityView;
  readonly viewer: Viewer;
  readonly compact: boolean;
  readonly setRange: (range: ActivityRange) => void;
  readonly setFilter: (filter: ActivityFilter) => void;
}

const RANGE_OPTIONS = ACTIVITY_RANGES.map((range) => ({
  value: range,
  label: RANGE_LOOK[range].label,
}));

function Overview({ view, viewer, setFilter }: Parts): ReactNode {
  const { range, filter } = view;
  const outside = outsideOf(scopedItems(view.ranged, filter).map((item) => item.entry));
  return (
    <View className="gap-4 large:flex-row large:items-start">
      <View className="min-w-0 large:flex-3">
        <ActivityChart
          columns={activityColumns(view.shown, range, viewer)}
          range={range}
          peopleName={peopleLabel(view.shown, viewer.me)}
        />
      </View>
      {outside.count === 0 ? null : (
        <View className="min-w-0 large:flex-2">
          <OutsideCallout
            summary={outside}
            range={range}
            showingOnly={showsOnlyOutside(filter)}
            folderKey={filter.folderKey}
            onShowOnly={() => {
              setFilter(onlyOutside(filter));
            }}
            onFolder={(folder) => {
              setFilter(toggledFolder(filter, folder.key));
            }}
          />
        </View>
      )}
    </View>
  );
}

function Controls(parts: Parts): ReactNode {
  const roots = useDriveRoots();
  const profiles = useProfiles();
  const { view, compact } = parts;
  return (
    <View className="gap-4">
      <Segmented
        options={RANGE_OPTIONS}
        value={view.range}
        onChange={parts.setRange}
        label="Range"
        fill={compact}
      />
      <Overview {...parts} />
      <ActivityFilters
        filter={view.filter}
        onChange={parts.setFilter}
        people={profiles.map((profile) => ({ id: profile.id, name: profile.name }))}
        me={parts.viewer.me}
        roots={roots.map((root) => ({ id: root.id, name: root.label }))}
        compact={compact}
      />
    </View>
  );
}

function Head({ row }: { readonly row: Extract<FeedRow, { kind: 'head' }> }): ReactNode {
  return (
    <View className="h-12 flex-row items-end justify-between gap-3 px-4 pb-2">
      <Text variant="footnote" tone="variant" accessibilityRole="header" numberOfLines={1}>
        {row.title}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
        {row.detail}
      </Text>
    </View>
  );
}

function Feed({
  parts,
  header,
  footer,
}: {
  readonly parts: Parts;
  readonly header?: ReactElement;
  readonly footer?: ReactElement;
}): ReactNode {
  const { view, viewer } = parts;
  const rows = feedRowsOf(view.shown, viewer.zone, viewer.today);
  const renderRow: ListRenderItem<FeedRow> = ({ item }) =>
    item.kind === 'head' ? <Head row={item} /> : <ActivityRow entry={item.entry} me={viewer.me} />;
  return (
    <FlashList<FeedRow>
      data={rows}
      extraData={viewer.me}
      keyExtractor={(row) => row.key}
      getItemType={(row) => row.kind}
      renderItem={renderRow}
      drawDistance={DRAW_DISTANCE}
      {...(header === undefined ? {} : { ListHeaderComponent: header })}
      {...(footer === undefined ? {} : { ListFooterComponent: footer })}
      ListEmptyComponent={<NothingInRange parts={parts} />}
    />
  );
}

function NothingInRange({ parts }: { readonly parts: Parts }): ReactNode {
  const copy = emptyCopyOf(parts.view.filter, parts.view.range);
  const press = (): void => {
    if (copy.action === 'clear') parts.setFilter(NO_FILTER);
    else parts.setRange('year');
  };
  return (
    <View className="py-section-gap">
      <EmptyState
        compact
        icon="activity"
        title={copy.title}
        body={copy.body}
        action={
          copy.action === null ? undefined : (
            <Button label={copy.label} variant="tonal" onPress={press} />
          )
        }
      />
    </View>
  );
}

function WideBody(parts: Parts): ReactNode {
  return (
    <View className="flex-1 gap-4 pb-section-gap">
      <Controls {...parts} />
      <View className="min-h-0 flex-1 flex-row items-stretch gap-4">
        <Card padding="none" className="min-w-0 flex-3 overflow-hidden">
          <View className="flex-1">
            <Feed parts={parts} />
          </View>
        </Card>
        <ScrollView className="min-w-0 flex-2">
          <MostChanged folders={folderCounts(parts.view.shown)} onOpen={openFolder} />
        </ScrollView>
      </View>
    </View>
  );
}

function NarrowBody(parts: Parts): ReactNode {
  return (
    <View className="flex-1">
      <Feed
        parts={parts}
        header={
          <View className="pb-2">
            <Controls {...parts} />
          </View>
        }
        footer={
          <View className="pb-section-gap pt-4">
            <MostChanged folders={folderCounts(parts.view.shown)} onOpen={openFolder} />
          </View>
        }
      />
    </View>
  );
}

function Loading(): ReactNode {
  return (
    <View aria-busy className="gap-4" accessibilityLabel="Loading Activity">
      <Skeleton shape="block" className="h-10" />
      <Skeleton shape="tile" className="h-56" />
      <Skeleton shape="text" className="w-48" />
      <Skeleton shape="block" className="h-72" />
    </View>
  );
}

function Unloaded({
  loaded,
  live,
}: {
  readonly loaded: Loaded;
  readonly live: boolean;
}): ReactNode {
  if (loaded.status === 'loading') return <Loading />;
  if (live) return <ErrorState page error={loaded.error} retry={loaded.retry} />;
  return (
    <EmptyState
      icon="wifiOff"
      title="The hub is offline"
      body="Activity comes back when the hub reconnects. Your files stay on the hub as they are."
    />
  );
}

function NoActivity(): ReactNode {
  return (
    <View className="flex-1 justify-center">
      <EmptyState
        icon="activity"
        title="No activity yet"
        body="Every change to your files shows here: who or what made it, and from where."
        action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
      />
    </View>
  );
}

function StaleBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing the last activity"
      body="New changes appear when the hub is back."
    />
  );
}

function Body({
  loaded,
  live,
  wide,
  parts,
}: {
  readonly loaded: Loaded;
  readonly live: boolean;
  readonly wide: boolean;
  readonly parts: Parts;
}): ReactNode {
  if (loaded.status !== 'ready') return <Unloaded loaded={loaded} live={live} />;
  if (loaded.items.length === 0) return <NoActivity />;
  return wide ? <WideBody {...parts} /> : <NarrowBody {...parts} />;
}

export function ActivityScreen(): ReactNode {
  const viewer = useViewer();
  const loaded = useActivityItems(viewer);
  const live = useSyncStatus().status === 'live';
  const width = useSizeClass().width;
  const [range, setRange] = useState<ActivityRange>('month');
  const [filter, setFilter] = useState<ActivityFilter>(NO_FILTER);
  const view = viewOf(loaded.items, { range, filter }, viewer);
  const parts: Parts = { view, viewer, compact: width === 'compact', setRange, setFilter };
  const ready = loaded.status === 'ready';
  return (
    <DriveFrame
      section="activity"
      title="Activity"
      scroll={false}
      {...(ready ? { subtitle: subtitleOf(view.ranged, range) } : {})}
      {...(ready && !live ? { banner: <StaleBanner /> } : {})}
    >
      <Body loaded={loaded} live={live} wide={atLeast(width, 'large')} parts={parts} />
    </DriveFrame>
  );
}
