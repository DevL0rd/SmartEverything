import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DuplicateGroup, DuplicateStats } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListLoader } from '../../../components/list-loader';
import type { HeaderAction } from '../../../components/page-header';
import { isNative } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { count, percent } from '../../../format/number';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveRoots, useDriveSettings, useViewerId } from '../../drive';
import { PHOTOS_DUPLICATES_PAGE } from '../settings';
import { usePhotoDuplicates, usePhotoDuplicateStats, usePhotoInsights } from '../data';
import { DuplicateGroupCard, type GroupHandlers } from './duplicate-group';
import { DuplicateStatsRow, DuplicatesLoading, KeepBestRule } from './duplicate-stats';
import { KEEP_ALL_LABEL, hashedShareOf, type SourceLabels } from './model';
import { useDriveLabels } from './use-drive-labels';
import { useDuplicateActions, type DuplicateActions } from './use-duplicate-actions';

const OPEN_PHOTOS: readonly HeaderAction[] = [
  { icon: 'image', label: 'Open Photos', href: href.photos() },
];

const OFFLINE_BODY = 'Keep best and Not duplicates need your home hub.';

const INDEXING_HREF = href.settings.focus('drive', 'drive.indexing');

function NoDuplicates(): ReactNode {
  return (
    <Card>
      <EmptyState
        icon="circleCheck"
        title="No duplicates"
        body="Every photo and video you can open is stored once. New copies are found as they arrive."
        action={<Button label="Open Library" variant="tonal" href={href.photos()} />}
      />
    </Card>
  );
}

function HashingOff(): ReactNode {
  const owner = useIsOwner();
  return (
    <Card>
      <EmptyState
        icon="copy"
        title="Duplicate detection is off"
        body={
          owner
            ? 'Copies are found by their content. Turn on hashing in Drive indexing to find them.'
            : 'Copies are found by their content. The owner of this home can turn it on in Drive indexing.'
        }
        {...(owner
          ? { action: <Button label="Open Drive indexing" variant="filled" href={INDEXING_HREF} /> }
          : {})}
      />
    </Card>
  );
}

function ScanningBanner({ share }: { readonly share: number }): ReactNode {
  return (
    <Banner
      tone="info"
      title={`Still checking files · ${percent(share)} done`}
      body="More copies may show up as the hub finishes reading your drives."
      wrapBody
    />
  );
}

interface StatsCardProps {
  readonly stats: DuplicateStats;
  readonly libraryBytes: number | undefined;
  readonly labels: SourceLabels;
  readonly actions: DuplicateActions;
  readonly connected: boolean;
  readonly compact: boolean;
}

function StatsCard(props: StatsCardProps): ReactNode {
  const { stats, actions, connected, compact } = props;
  return (
    <Card title="Copies you can clean up" icon="copy">
      <View className="gap-4">
        <DuplicateStatsRow
          stats={stats}
          libraryBytes={props.libraryBytes}
          labels={props.labels}
          compact={compact}
        />
        <View className={compact ? 'gap-3' : 'flex-row items-center gap-3'}>
          <View className={compact ? 'min-w-0' : 'min-w-0 flex-1'}>
            <KeepBestRule />
          </View>
          <View className="flex-row">
            <Button
              label={KEEP_ALL_LABEL}
              icon="check"
              variant="filled"
              grow={compact}
              loading={actions.busy}
              disabled={!connected}
              onPress={() => {
                actions.keepBestInAll(stats);
              }}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

function MoreGroups({
  pages,
  left,
}: {
  readonly pages: ReturnType<typeof usePhotoDuplicates>;
  readonly left: number;
}): ReactNode {
  if (!pages.hasNextPage) return null;
  if (pages.isFetchingNextPage) return <ListLoader loading />;
  return (
    <Button
      label={`Show more groups (${count(left)} left)`}
      variant="text"
      onPress={() => {
        background(pages.fetchNextPage(), 'duplicates.next_page_failed');
      }}
    />
  );
}

interface DuplicatesData {
  readonly pages: ReturnType<typeof usePhotoDuplicates>;
  readonly stats: ReturnType<typeof usePhotoDuplicateStats>;
  readonly groups: readonly DuplicateGroup[];
  readonly libraryBytes: number | undefined;
  readonly hashing: boolean | undefined;
  readonly hashedShare: number;
}

function useDuplicatesData(): DuplicatesData {
  const pages = usePhotoDuplicates();
  const stats = usePhotoDuplicateStats();
  const library = usePhotoInsights('all_time').data;
  const settings = useDriveSettings().data;
  const share = hashedShareOf(useDriveRoots(), useViewerId());
  return {
    pages,
    stats,
    groups: flattenPages(pages.data, (page) => page.items),
    libraryBytes: library?.bytes,
    hashing: settings?.duplicatesHashing,
    hashedShare: share,
  };
}

function failedOf(data: DuplicatesData): boolean {
  return (
    (data.pages.isError && data.pages.data === undefined) ||
    (data.stats.isError && data.stats.data === undefined)
  );
}

interface BodyProps {
  readonly data: DuplicatesData;
  readonly actions: DuplicateActions;
  readonly connected: boolean;
  readonly compact: boolean;
}

function GroupList({ data, actions, connected, compact }: BodyProps): ReactNode {
  const labels = useDriveLabels();
  const stats = data.stats.data;
  if (stats === undefined) return null;
  const handlers: GroupHandlers = {
    onKeepBest: actions.keepBest,
    onNotDuplicates: actions.notDuplicates,
    disabled: actions.busy || !connected,
  };
  return (
    <View className="gap-4">
      <StatsCard
        stats={stats}
        libraryBytes={data.libraryBytes}
        labels={labels}
        actions={actions}
        connected={connected}
        compact={compact}
      />
      <View className="gap-3">
        {data.groups.map((group) => (
          <DuplicateGroupCard
            key={group.sha256}
            group={group}
            labels={labels}
            handlers={handlers}
            compact={compact}
          />
        ))}
      </View>
      <MoreGroups pages={data.pages} left={Math.max(0, stats.groups - data.groups.length)} />
    </View>
  );
}

function DuplicatesBody(props: BodyProps): ReactNode {
  const { data, compact } = props;
  if (data.hashing === false) return <HashingOff />;
  if (failedOf(data)) {
    const retry = (): void => {
      background(data.pages.refetch(), 'duplicates.retry_failed');
      background(data.stats.refetch(), 'duplicates.retry_failed');
    };
    return <ErrorState page error={data.pages.error ?? data.stats.error} retry={retry} />;
  }
  const stats = data.stats.data;
  if (stats === undefined || data.pages.data === undefined) {
    return <DuplicatesLoading compact={compact} />;
  }
  if (stats.groups === 0 && data.groups.length === 0) return <NoDuplicates />;
  return <GroupList {...props} />;
}

function bannerOf(connected: boolean, data: DuplicatesData): ReactNode {
  if (!connected) {
    return (
      <Banner
        tone="info"
        title="Offline · showing the last snapshot"
        body={OFFLINE_BODY}
        wrapBody
      />
    );
  }
  if (data.hashing === true && data.hashedShare < 1) {
    return <ScanningBanner share={data.hashedShare} />;
  }
  return undefined;
}

export function DuplicatesSettingsScreen(): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const connected = useSyncStatus().status === 'live';
  const data = useDuplicatesData();
  const actions = useDuplicateActions();
  const banner = bannerOf(connected, data);
  return (
    <SettingsFrame
      page={PHOTOS_DUPLICATES_PAGE}
      actions={OPEN_PHOTOS}
      contentWidth={isNative() ? 'reading' : 'full'}
      {...(banner === undefined ? {} : { banner })}
    >
      <View className="gap-section-gap">
        <DuplicatesBody data={data} actions={actions} connected={connected} compact={compact} />
        <SettingsPageBody page={PHOTOS_DUPLICATES_PAGE} />
      </View>
    </SettingsFrame>
  );
}
