import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { DRAW_DISTANCE } from '../../../components/virtual-list';
import { useScreenPaused } from '../../../design/screen-pause';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { localDayKey } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useDeviceNames, useSession, useSettings, useSyncStatus } from '../../../store/selectors';
import { useDriveActivity, useDriveChips, useDriveRoots } from '../data';
import { driveLocationHref } from '../model/section-routes';
import { flattenPages } from '../data/pages';
import { DriveFrame } from '../components/drive-frame';
import { GroupFrame } from '../shared/group-frame';
import { ActivityChart } from './activity-chart';
import { ActivityLoading } from './activity-loading';
import {
  ActivityFilters,
  NO_FILTER,
  activityItemOf,
  calloutItems,
  feedRowsOf,
  emptyCopyOf,
  isFiltered,
  onlyOutside,
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
  const chipOf = useDriveChips();
  const profiles = useProfiles();
  const devices = useDeviceNames('name');
  return useMemo(
    () => ({
      chipOf,
      people: new Map(profiles.map((profile) => [profile.id, profile.name])),
      devices,
    }),
    [chipOf, profiles, devices],
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

function useOpenFolder(): (folder: FolderCount) => void {
  const roots = useDriveRoots();
  return (folder) => {
    router.push(driveLocationHref(roots, { rootId: folder.rootId, folderId: folder.folderId }));
  };
}

interface Parts {
  readonly view: ActivityView;
  readonly viewer: Viewer;
  readonly compact: boolean;
  readonly wide: boolean;
  readonly setRange: (range: ActivityRange) => void;
  readonly setFilter: (filter: ActivityFilter) => void;
}

const RANGE_OPTIONS = ACTIVITY_RANGES.map((range) => ({
  value: range,
  label: RANGE_LOOK[range].label,
}));

function Overview({ view, viewer, wide, setFilter }: Parts): ReactNode {
  const { range, filter } = view;
  const openFolder = useOpenFolder();
  const outside = outsideOf(calloutItems(view.ranged, filter, viewer.me).map((item) => item.entry));
  return (
    <View className="gap-4 large:flex-row large:items-stretch">
      <View className="min-w-0 large:flex-3">
        <ActivityChart
          columns={activityColumns(view.shown, range, viewer)}
          range={range}
          peopleName={peopleLabel(view.shown, viewer.me)}
          filtered={isFiltered(filter)}
        />
      </View>
      <View className="min-w-0 gap-4 large:flex-2">
        {outside.count === 0 ? null : (
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
        )}
        {wide ? <MostChanged card folders={folderCounts(view.shown)} onOpen={openFolder} /> : null}
      </View>
    </View>
  );
}

function Controls(parts: Parts): ReactNode {
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
        compact={!parts.wide}
      />
    </View>
  );
}

function Head({ row }: { readonly row: Extract<FeedRow, { kind: 'head' }> }): ReactNode {
  return (
    <View className="flex-row items-baseline justify-between gap-3 px-4 pb-1 pt-4">
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
  const line = (item: FeedRow): ReactElement =>
    item.kind === 'head' ? <Head row={item} /> : <ActivityRow entry={item.entry} me={viewer.me} />;
  const renderRow: ListRenderItem<FeedRow> = ({ item }) =>
    parts.wide && item.kind === 'line' ? (
      <GroupFrame edge={item.edge}>{line(item)}</GroupFrame>
    ) : (
      line(item)
    );
  return (
    <FlashList<FeedRow>
      data={rows}
      extraData={[viewer.me, parts.wide, rows.length]}
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

function ActivityBody(parts: Parts): ReactNode {
  const openFolder = useOpenFolder();
  return (
    <View className="flex-1">
      <Feed
        parts={parts}
        header={
          <View className={parts.wide ? 'pb-4' : 'pb-2'}>
            <Controls {...parts} />
          </View>
        }
        footer={
          parts.wide ? (
            <View className="pb-section-gap" />
          ) : (
            <View className="pb-section-gap pt-4">
              <MostChanged
                card={false}
                folders={folderCounts(parts.view.shown)}
                onOpen={openFolder}
              />
            </View>
          )
        }
      />
    </View>
  );
}

function Unloaded({
  loaded,
  live,
  parts,
}: {
  readonly loaded: Loaded;
  readonly live: boolean;
  readonly parts: Parts;
}): ReactNode {
  if (!live) {
    return (
      <View className="flex-1 justify-center">
        <EmptyState
          icon="wifiOff"
          title="The hub is offline"
          body="Activity comes back when the hub reconnects. Your files stay on the hub as they are."
        />
      </View>
    );
  }
  if (loaded.status === 'loading')
    return <ActivityLoading compact={parts.compact} wide={parts.wide} />;
  return (
    <View className="flex-1 justify-center">
      <ErrorState page title="Activity could not load" error={loaded.error} retry={loaded.retry} />
    </View>
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
      wrapBody
      tone="info"
      title="Offline · showing the last activity"
      body="New changes appear when the hub is back."
    />
  );
}

function Body({
  loaded,
  live,
  parts,
}: {
  readonly loaded: Loaded;
  readonly live: boolean;
  readonly parts: Parts;
}): ReactNode {
  if (loaded.status !== 'ready') return <Unloaded loaded={loaded} live={live} parts={parts} />;
  if (loaded.items.length === 0) return <NoActivity />;
  return <ActivityBody {...parts} />;
}

export function ActivityScreen(): ReactNode {
  const viewer = useViewer();
  const loaded = useActivityItems(viewer);
  const live = useSyncStatus().status === 'live';
  const width = useSizeClass().width;
  const [range, setRange] = useState<ActivityRange>('month');
  const [filter, setFilter] = useState<ActivityFilter>(NO_FILTER);
  const view = viewOf(loaded.items, { range, filter }, viewer);
  const parts: Parts = {
    view,
    viewer,
    compact: width === 'compact',
    wide: atLeast(width, 'large'),
    setRange,
    setFilter,
  };
  const ready = loaded.status === 'ready';
  return (
    <DriveFrame
      section="activity"
      title="Activity"
      scroll={false}
      {...(ready && loaded.items.length > 0 ? { subtitle: subtitleOf(view.ranged, range) } : {})}
      {...(ready && !live ? { banner: <StaleBanner /> } : {})}
    >
      <Body loaded={loaded} live={live} parts={parts} />
    </DriveFrame>
  );
}
