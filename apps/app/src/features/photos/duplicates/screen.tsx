import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DuplicateGroup, DuplicateStats } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListLoader } from '../../../components/list-loader';
import type { HeaderAction } from '../../../components/page-header';
import { useAreaWidth } from '../../../design/size-class';
import { count } from '../../../format/number';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { flattenPages } from '../../nas/data';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoDuplicates, usePhotoDuplicateStats, usePhotoInsights } from '../data';
import { DuplicateGroupCard, type GroupHandlers } from './duplicate-group';
import { DuplicateStatsRow, DuplicatesLoading, KeepBestRule } from './duplicate-stats';
import { KEEP_ALL_LABEL, sourceLabelsOf, summaryOf } from './model';
import { useDuplicateActions, type DuplicateActions } from './use-duplicate-actions';

const SUBTITLE = 'Exact copies, matched by content';

const NO_ACTIONS: readonly HeaderAction[] = [];

const OFFLINE_BODY = 'Keep best and Not duplicates need your home hub.';

function MemberState(): ReactNode {
  return (
    <EmptyState
      icon="lock"
      title="Duplicates are for the owner"
      body="The owner of this home cleans up copies. Your photos and backup stay as they are."
      action={<Button label="Open Photos" variant="tonal" href="/photos" />}
    />
  );
}

function NoDuplicates(): ReactNode {
  return (
    <EmptyState
      icon="circleCheck"
      title="No duplicates"
      body="Every photo and video is stored once. New copies are found as they arrive."
      action={<Button label="Open Timeline" variant="tonal" href="/photos" />}
    />
  );
}

interface ListProps {
  readonly groups: readonly DuplicateGroup[];
  readonly stats: DuplicateStats;
  readonly libraryBytes: number | undefined;
  readonly actions: DuplicateActions;
  readonly connected: boolean;
  readonly compact: boolean;
  readonly more: ReactNode;
}

function DuplicateList({
  groups,
  stats,
  libraryBytes,
  actions,
  connected,
  compact,
  more,
}: ListProps): ReactNode {
  const labels = sourceLabelsOf(stats);
  const handlers: GroupHandlers = {
    onKeepBest: actions.keepBest,
    onNotDuplicates: actions.notDuplicates,
    disabled: actions.busy || !connected,
  };
  return (
    <View className="gap-4">
      <DuplicateStatsRow stats={stats} libraryBytes={libraryBytes} compact={compact} />
      {compact ? (
        <Button
          label={KEEP_ALL_LABEL}
          icon="check"
          variant="filled"
          grow
          loading={actions.busy}
          disabled={!connected}
          onPress={() => {
            actions.keepBestInAll(stats);
          }}
        />
      ) : null}
      <KeepBestRule />
      <View className="gap-3">
        {groups.map((group) => (
          <DuplicateGroupCard
            key={group.sha256}
            group={group}
            labels={labels}
            handlers={handlers}
            compact={compact}
          />
        ))}
      </View>
      {more}
    </View>
  );
}

function headerActionsOf(
  stats: DuplicateStats | undefined,
  actions: DuplicateActions,
  enabled: boolean,
): readonly HeaderAction[] {
  if (stats === undefined || stats.groups === 0 || !enabled) return NO_ACTIONS;
  return [
    {
      icon: 'check',
      label: KEEP_ALL_LABEL,
      primary: true,
      onPress: (): void => {
        actions.keepBestInAll(stats);
      },
    },
  ];
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
}

function useDuplicatesData(): DuplicatesData {
  const pages = usePhotoDuplicates();
  const stats = usePhotoDuplicateStats();
  const library = usePhotoInsights('all_time').data;
  return {
    pages,
    stats,
    groups: flattenPages(pages.data, (page) => page.items),
    libraryBytes: library?.bytes,
  };
}

function failedOf(data: DuplicatesData): boolean {
  return (
    (data.pages.isError && data.pages.data === undefined) ||
    (data.stats.isError && data.stats.data === undefined)
  );
}

function DuplicatesBody({
  data,
  actions,
  connected,
  compact,
}: {
  readonly data: DuplicatesData;
  readonly actions: DuplicateActions;
  readonly connected: boolean;
  readonly compact: boolean;
}): ReactNode {
  const stats = data.stats.data;
  if (failedOf(data)) {
    const retry = (): void => {
      background(data.pages.refetch(), 'duplicates.retry_failed');
      background(data.stats.refetch(), 'duplicates.retry_failed');
    };
    return <ErrorState page error={data.pages.error ?? data.stats.error} retry={retry} />;
  }
  if (stats === undefined || data.pages.data === undefined) {
    return <DuplicatesLoading compact={compact} />;
  }
  if (stats.groups === 0 && data.groups.length === 0) {
    return <NoDuplicates />;
  }
  return (
    <DuplicateList
      groups={data.groups}
      stats={stats}
      libraryBytes={data.libraryBytes}
      actions={actions}
      connected={connected}
      compact={compact}
      more={<MoreGroups pages={data.pages} left={Math.max(0, stats.groups - data.groups.length)} />}
    />
  );
}

function subtitleOf(stats: DuplicateStats | undefined): string {
  return stats === undefined || stats.groups === 0 ? SUBTITLE : summaryOf(stats);
}

function OwnerDuplicates(): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const connected = useSyncStatus().status === 'live';
  const data = useDuplicatesData();
  const actions = useDuplicateActions();
  const stats = data.stats.data;
  return (
    <PhotosFrame
      active="duplicates"
      subtitle={subtitleOf(stats)}
      actions={compact ? NO_ACTIONS : headerActionsOf(stats, actions, connected && !actions.busy)}
      banner={
        connected ? null : (
          <Banner
            tone="info"
            title="Offline · showing the last snapshot"
            body={OFFLINE_BODY}
            wrapBody
          />
        )
      }
    >
      <DuplicatesBody data={data} actions={actions} connected={connected} compact={compact} />
    </PhotosFrame>
  );
}

export function DuplicatesScreen(): ReactNode {
  const owner = useIsOwner();
  if (owner) return <OwnerDuplicates />;
  return (
    <PhotosFrame active="duplicates">
      <MemberState />
    </PhotosFrame>
  );
}
