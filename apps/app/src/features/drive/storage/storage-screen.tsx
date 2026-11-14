import type { DriveHealth, DriveStats } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { startDriveScrub } from '../../../api/drive';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import type { HeaderAction } from '../../../components/page-header';
import { Skeleton } from '../../../components/skeleton';
import { notify } from '../../../components/toast-store';
import { percent } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDriveHealth, useDriveStats } from '../data';
import { DriveFrame, storageSummaryOf } from '../components/drive-frame';
import { StorageColumns } from './storage-columns';

type Scrub = DriveHealth['scrub'];

const NO_ACTIONS: readonly HeaderAction[] = [];

function damageText(corrupt: number): string {
  return corrupt === 0 ? 'no damage' : plural(corrupt, 'damaged file');
}

function checkedShare(checked: number, total: number): string {
  return percent(total === 0 ? 0 : checked / total);
}

export function scrubTextOf(scrub: Scrub, now: number): string {
  if (scrub.state === 'running') {
    return `Scrubbing · ${checkedShare(scrub.checked, scrub.total)} checked`;
  }
  if (scrub.state === 'stopped') {
    return `Scrub stopped at ${checkedShare(scrub.checked, scrub.total)}`;
  }
  if (scrub.lastFinishedAt === null) return 'Never scrubbed';
  return `Last scrub ${relative(scrub.lastFinishedAt, now)}, ${damageText(scrub.corrupt)}`;
}

export function storageSubtitleOf(
  stats: DriveStats | undefined,
  scrub: Scrub | undefined,
  now: number,
): string | undefined {
  if (stats === undefined || stats.items === 0) return undefined;
  const summary = storageSummaryOf(stats);
  return joinParts([
    summary.used,
    summary.caption,
    scrub === undefined ? null : scrubTextOf(scrub, now),
  ]);
}

export function scrubActionsOf(
  owner: boolean,
  scrub: Scrub | undefined,
  start: () => void,
): readonly HeaderAction[] {
  if (!owner || scrub === undefined || scrub.state === 'running') return NO_ACTIONS;
  return [{ icon: 'shield', label: 'Scrub now', onPress: start }];
}

function useScrubActions(owner: boolean): {
  readonly actions: readonly HeaderAction[];
  readonly scrub: Scrub | undefined;
} {
  const health = useDriveHealth();
  const mutation = useMutationState();
  const scrub = health.data?.scrub;
  const start = (): void => {
    mutation.run(startDriveScrub, {
      failure: 'The scrub did not start',
      label: 'drive.storage.scrub',
      onDone: () => {
        notify({ message: 'Scrub started' });
        background(health.refetch(), 'drive.storage.health_refetch_failed');
      },
    });
  };
  return { actions: mutation.busy ? NO_ACTIONS : scrubActionsOf(owner, scrub, start), scrub };
}

export function StorageSkeleton(): ReactNode {
  return (
    <View aria-busy className="gap-4">
      <Skeleton shape="tile" className="h-44" />
      <Skeleton shape="tile" className="h-40" />
      <Skeleton shape="tile" className="h-32" />
    </View>
  );
}

function StorageOffline(): ReactNode {
  return (
    <EmptyState
      icon="wifiOff"
      title="The hub is offline"
      body="Storage comes back when the hub reconnects. Your files stay in the data folder as they are."
    />
  );
}

function StaleBanner(): ReactNode {
  return (
    <Banner
      wrapBody
      tone="info"
      title="Showing the last storage numbers"
      body="The hub is offline. These numbers update when it is back."
    />
  );
}

interface BodyProps {
  readonly query: ReturnType<typeof useDriveStats>;
  readonly owner: boolean;
  readonly live: boolean;
}

function StorageBody({ query, owner, live }: BodyProps): ReactNode {
  const stats = query.data;
  if (stats !== undefined) return <StorageColumns stats={stats} owner={owner} />;
  if (query.isError) {
    return live ? (
      <ErrorState
        page
        error={query.error}
        retry={() => {
          background(query.refetch(), 'drive.storage.stats_refetch_failed');
        }}
      />
    ) : (
      <StorageOffline />
    );
  }
  return <StorageSkeleton />;
}

export function StorageScreen(): ReactNode {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const now = useMinute();
  const query = useDriveStats();
  const { actions, scrub } = useScrubActions(owner);
  const stale = query.data !== undefined && (query.isError || !live);
  const subtitle = storageSubtitleOf(query.data, scrub, now);
  return (
    <DriveFrame
      section="storage"
      title="Storage"
      actions={actions}
      banner={stale ? <StaleBanner /> : null}
      {...(subtitle === undefined ? {} : { subtitle })}
    >
      <StorageBody query={query} owner={owner} live={live} />
    </DriveFrame>
  );
}
