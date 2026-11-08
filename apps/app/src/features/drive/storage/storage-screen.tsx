import type { DriveHealth, DriveRoot, DriveStats } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { startDriveScrub } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { twoFrameColumnsAt } from '../../../components/frame-layout';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import type { HeaderAction } from '../../../components/page-header';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Skeleton } from '../../../components/skeleton';
import { notify } from '../../../components/toast-store';
import { percent } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDriveHealth, useDriveRoots, useDriveStats, useDriveVolumes } from '../../nas/data';
import { DriveFrame, storageSummaryOf } from '../components/drive-frame';
import { driveSettingsSection } from '../settings/sections';
import { ByRoot } from './by-root';
import { StorageHero } from './storage-hero';
import { VolumeList, volumeNamesOf, type VolumeMount } from './volume-list';

type Scrub = DriveHealth['scrub'];

export interface StorageSlots {
  readonly main?: ReactNode;
  readonly side?: ReactNode;
}

const NO_ACTIONS: readonly HeaderAction[] = [];
const NO_MOUNTS: readonly VolumeMount[] = [];
const MAIN_COLUMN = { flexGrow: 3, flexBasis: 0 } as const;
const SIDE_COLUMN = { flexGrow: 2, flexBasis: 0 } as const;

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
      body="Storage comes back when the hub reconnects. Your files stay on their disks as they are."
    />
  );
}

function StaleBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Showing the last storage numbers"
      body="The hub is offline. These numbers update when it is back."
    />
  );
}

function StorageEmpty({ owner }: { readonly owner: boolean }): ReactNode {
  return (
    <EmptyState
      icon="hardDrive"
      title="Nothing stored yet"
      body={
        owner
          ? 'Storage shows how your disks fill up by kind and folder. Add a folder or drive to start.'
          : 'Storage shows how the home disks fill up. The owner adds the folders and drives.'
      }
      {...(owner
        ? {
            action: (
              <Button
                label="Add a folder or drive"
                variant="tonal"
                icon="plus"
                href={href.settings.focus('drive', driveSettingsSection('roots').settingId)}
              />
            ),
          }
        : {})}
    />
  );
}

interface LoadedProps {
  readonly stats: DriveStats;
  readonly roots: readonly DriveRoot[];
  readonly mounts: readonly VolumeMount[];
  readonly slots: StorageSlots;
}

function StorageColumns({ stats, roots, mounts, slots }: LoadedProps): ReactNode {
  const wide = twoFrameColumnsAt(useFrameBodyWidth());
  const names = volumeNamesOf(stats, roots);
  const main = (
    <>
      <StorageHero stats={stats} names={names} wide={wide} />
      <VolumeList stats={stats} roots={roots} mounts={mounts} />
      {slots.main}
    </>
  );
  const side = (
    <>
      <ByRoot stats={stats} roots={roots} />
      {slots.side}
    </>
  );
  if (!wide) {
    return (
      <View className="gap-4">
        {main}
        {side}
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-4">
      <View style={MAIN_COLUMN} className="min-w-0 gap-4">
        {main}
      </View>
      <View style={SIDE_COLUMN} className="min-w-0 gap-4">
        {side}
      </View>
    </View>
  );
}

interface BodyProps {
  readonly query: ReturnType<typeof useDriveStats>;
  readonly owner: boolean;
  readonly live: boolean;
  readonly slots: StorageSlots;
}

function StorageBody({ query, owner, live, slots }: BodyProps): ReactNode {
  const roots = useDriveRoots();
  const mounts = useDriveVolumes(owner).data ?? NO_MOUNTS;
  const stats = query.data;
  if (stats !== undefined) {
    if (stats.items === 0 && roots.length === 0) return <StorageEmpty owner={owner} />;
    return <StorageColumns stats={stats} roots={roots} mounts={mounts} slots={slots} />;
  }
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

export function StorageScreen({ slots = {} }: { readonly slots?: StorageSlots }): ReactNode {
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
      <StorageBody query={query} owner={owner} live={live} slots={slots} />
    </DriveFrame>
  );
}
