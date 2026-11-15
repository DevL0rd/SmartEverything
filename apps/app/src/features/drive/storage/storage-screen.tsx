import type { DriveHealth, DriveStats } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { startDriveScrub } from '../../../api/drive';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Skeleton } from '../../../components/skeleton';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { notify } from '../../../components/toast-store';
import { bytes } from '../../../format/number';
import { useMutationState } from '../../../store/mutation';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDriveHealth, useDriveStats } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { StorageColumns, storageTwoColumnsAt } from './storage-columns';

type Scrub = DriveHealth['scrub'];

const NO_ACTIONS: readonly ShellAction[] = [];

export function storageSubtitleOf(stats: DriveStats | undefined): string | undefined {
  if (stats === undefined || stats.items === 0) return undefined;
  return `${bytes(stats.bytes)} in your drives · ${bytes(stats.space.freeBytes)} free`;
}

export function scrubActionsOf(
  owner: boolean,
  scrub: Scrub | undefined,
  start: () => void,
): readonly ShellAction[] {
  if (!owner || scrub === undefined || scrub.state === 'running') return NO_ACTIONS;
  return [{ icon: 'shield', label: 'Scrub now', onPress: start }];
}

function useScrubActions(owner: boolean): readonly ShellAction[] {
  const health = useDriveHealth();
  const mutation = useMutationState();
  const scrub = health.data?.scrub;
  const start = (): void => {
    mutation.run(startDriveScrub, {
      failure: 'The scrub did not start',
      label: 'drive.storage.scrub',
      onDone: () => {
        notify({ message: 'Scrub started · reading every file back from the disk' });
        background(health.refetch(), 'drive.storage.health_refetch_failed');
      },
    });
  };
  return mutation.busy ? NO_ACTIONS : scrubActionsOf(owner, scrub, start);
}

const MAIN_COLUMN = { flexGrow: 3, flexBasis: 0 } as const;
const SIDE_COLUMN = { flexGrow: 2, flexBasis: 0 } as const;

function MainTiles(): ReactNode {
  return (
    <>
      <Skeleton shape="tile" className="h-64" />
      <Skeleton shape="tile" className="h-60" />
      <Skeleton shape="tile" className="h-48" />
    </>
  );
}

function SideTiles(): ReactNode {
  return (
    <>
      <Skeleton shape="tile" className="h-88" />
      <Skeleton shape="tile" className="h-60" />
    </>
  );
}

export function StorageSkeleton(): ReactNode {
  const wide = storageTwoColumnsAt(useFrameBodyWidth());
  if (!wide) {
    return (
      <View aria-busy className="gap-4">
        <Skeleton shape="tile" className="h-64" />
        <Skeleton shape="tile" className="h-88" />
        <Skeleton shape="tile" className="h-60" />
      </View>
    );
  }
  return (
    <View aria-busy className="flex-row items-start gap-4">
      <View style={MAIN_COLUMN} className="min-w-0 gap-4">
        <MainTiles />
      </View>
      <View style={SIDE_COLUMN} className="min-w-0 gap-4">
        <SideTiles />
      </View>
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
  const query = useDriveStats();
  const actions = useScrubActions(owner);
  const stale = query.data !== undefined && (query.isError || !live);
  const subtitle = storageSubtitleOf(query.data);
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
