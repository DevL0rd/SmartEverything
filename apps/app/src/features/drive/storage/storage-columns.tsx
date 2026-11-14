import type { DriveStats, DriveUsage } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { twoFrameColumnsAt } from '../../../components/frame-layout';
import { useFrameBodyWidth } from '../../../components/section-body';
import { useProfiles } from '../../../store/people';
import { useDriveQuotas, useDriveUsage, useSharedDrive, useViewerId } from '../data';
import { ByDrive } from './by-drive';
import { StorageDuplicates } from './duplicate-group-row';
import { HealthCard } from './health-card';
import { LargestFiles } from './largest-files';
import { PeopleCard } from './people-card';
import { PurgeBars } from './purge-bars';
import { KindsCard, StorageHero } from './storage-hero';
import {
  QUOTA_UNKNOWN,
  diskViewOf,
  peopleUsageOf,
  quotaOf,
  sharedDriveUsageOf,
  type PersonUsage,
  type QuotaState,
} from './usage-model';

const MAIN_COLUMN = { flexGrow: 3, flexBasis: 0 } as const;
const SIDE_COLUMN = { flexGrow: 2, flexBasis: 0 } as const;
const NO_PEOPLE: readonly PersonUsage[] = [];

export interface StorageUsage {
  readonly usage: readonly DriveUsage[] | null;
  readonly mine: DriveUsage | null;
  readonly quota: QuotaState;
  readonly shared: DriveUsage | null;
  readonly people: readonly PersonUsage[];
}

export function useStorageUsage(owner: boolean): StorageUsage {
  const usage = useDriveUsage().data ?? null;
  const quotas = useDriveQuotas(owner).data ?? null;
  const me = useViewerId();
  const people = useProfiles();
  const sharedRoot = useSharedDrive();
  return {
    usage,
    mine: usage?.find((entry) => entry.profileId === me) ?? null,
    quota: owner ? quotaOf(quotas, me) : QUOTA_UNKNOWN,
    shared: sharedDriveUsageOf(usage ?? [], sharedRoot),
    people: owner && usage !== null ? peopleUsageOf({ usage, quotas, people, me }) : NO_PEOPLE,
  };
}

function StorageEmpty(): ReactNode {
  return (
    <EmptyState
      icon="hardDrive"
      title="Nothing stored yet"
      body="Storage shows how your drives fill the data folder disk. Files you add to My Drive or the Shared Drive show here."
      action={<Button label="Open My Drive" variant="tonal" icon="hardDrive" href={href.drive()} />}
    />
  );
}

export interface StorageColumnsProps {
  readonly stats: DriveStats;
  readonly owner: boolean;
}

function MainColumn({
  stats,
  owner,
  wide,
}: StorageColumnsProps & { readonly wide: boolean }): ReactNode {
  const usage = useStorageUsage(owner);
  const disk = diskViewOf({ stats, usage: usage.usage, owner });
  return (
    <>
      <StorageHero stats={stats} disk={disk} wide={wide} />
      <ByDrive mine={usage.mine} quota={usage.quota} shared={usage.shared} owner={owner} />
      {owner ? <PeopleCard people={usage.people} /> : null}
      {stats.items === 0 ? <StorageEmpty /> : <KindsCard stats={stats} wide={wide} />}
      <PurgeBars purges={stats.purges} />
    </>
  );
}

function SideColumn({ stats }: { readonly stats: DriveStats }): ReactNode {
  return (
    <>
      <HealthCard />
      {stats.items === 0 ? null : (
        <>
          <StorageDuplicates keepers={null} />
          <LargestFiles />
        </>
      )}
    </>
  );
}

export function StorageColumns({ stats, owner }: StorageColumnsProps): ReactNode {
  const wide = twoFrameColumnsAt(useFrameBodyWidth());
  if (!wide) {
    return (
      <View className="gap-4">
        <MainColumn stats={stats} owner={owner} wide={false} />
        <SideColumn stats={stats} />
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-4">
      <View style={MAIN_COLUMN} className="min-w-0 gap-4">
        <MainColumn stats={stats} owner={owner} wide />
      </View>
      <View style={SIDE_COLUMN} className="min-w-0 gap-4">
        <SideColumn stats={stats} />
      </View>
    </View>
  );
}
