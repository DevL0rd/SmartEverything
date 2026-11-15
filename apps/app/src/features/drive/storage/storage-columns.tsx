import type { DriveStats, DriveUsage } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { useProfiles } from '../../../store/people';
import { useDriveQuotas, useDriveUsage, useSharedDrive, useViewerId } from '../data';
import { ByDrive } from './by-drive';
import { StorageDuplicates } from './duplicate-group-row';
import { HealthCard } from './health-card';
import { LargestFiles } from './largest-files';
import { PeopleCard } from './people-card';
import { PurgeBars } from './purge-bars';
import { StorageCardState, type CardQuery } from './storage-card-state';
import { KindsCard, StorageHero } from './storage-hero';
import {
  QUOTA_UNKNOWN,
  diskViewOf,
  othersHaveData,
  peopleUsageOf,
  quotaOf,
  sharedDriveUsageOf,
  type PersonUsage,
  type QuotaState,
} from './usage-model';

const MAIN_COLUMN = { flexGrow: 3, flexBasis: 0 } as const;
const SIDE_COLUMN = { flexGrow: 2, flexBasis: 0 } as const;
const NO_PEOPLE: readonly PersonUsage[] = [];

export const STORAGE_TWO_COLUMNS_BODY = 1000;

export function storageTwoColumnsAt(bodyWidth: number): boolean {
  return bodyWidth >= STORAGE_TWO_COLUMNS_BODY;
}

export interface UsageReady {
  readonly ready: true;
  readonly mine: DriveUsage | null;
  readonly quota: QuotaState;
  readonly shared: DriveUsage | null;
  readonly people: readonly PersonUsage[];
}

export type StorageUsage = UsageReady | { readonly ready: false; readonly query: CardQuery };

export function useStorageUsage(owner: boolean): StorageUsage {
  const query = useDriveUsage();
  const quotas = useDriveQuotas(owner).data ?? null;
  const me = useViewerId();
  const people = useProfiles();
  const sharedRoot = useSharedDrive();
  const usage = query.data;
  if (usage === undefined) return { ready: false, query };
  return {
    ready: true,
    mine: usage.find((entry) => entry.profileId === me) ?? null,
    quota: owner ? quotaOf(quotas, me) : QUOTA_UNKNOWN,
    shared: sharedDriveUsageOf(usage, sharedRoot),
    people: owner ? peopleUsageOf({ usage, quotas, people, me }) : NO_PEOPLE,
  };
}

function StorageEmpty(): ReactNode {
  return (
    <Card>
      <EmptyState
        icon="hardDrive"
        title="Nothing stored yet"
        body="Storage shows how your drives fill the data folder disk. Files you add to My Drive or the Shared Drive show here."
        action={
          <Button label="Open My Drive" variant="tonal" icon="hardDrive" href={href.drive()} />
        }
      />
    </Card>
  );
}

export interface StorageColumnsProps {
  readonly stats: DriveStats;
  readonly owner: boolean;
}

const USAGE_FAILURE = 'drive.storage.usage_refetch_failed';

function DrivesPart({
  usage,
  owner,
  freeBytes,
}: {
  readonly usage: StorageUsage;
  readonly owner: boolean;
  readonly freeBytes: number;
}): ReactNode {
  if (!usage.ready) {
    return (
      <StorageCardState
        title="Your drives"
        icon="hardDrive"
        query={usage.query}
        failure={USAGE_FAILURE}
      />
    );
  }
  return (
    <ByDrive
      mine={usage.mine}
      quota={usage.quota}
      shared={usage.shared}
      owner={owner}
      freeBytes={freeBytes}
    />
  );
}

function PeoplePart({
  usage,
  freeBytes,
}: {
  readonly usage: StorageUsage;
  readonly freeBytes: number;
}): ReactNode {
  if (!usage.ready) {
    return (
      <StorageCardState title="People" icon="users" query={usage.query} failure={USAGE_FAILURE} />
    );
  }
  if (!othersHaveData(usage.people)) return null;
  return <PeopleCard people={usage.people.filter((entry) => !entry.you)} freeBytes={freeBytes} />;
}

interface Parts {
  readonly hero: ReactNode;
  readonly main: ReactNode;
  readonly extras: ReactNode;
  readonly empty: boolean;
}

function usePartsOf({ stats, owner }: StorageColumnsProps): Parts {
  const usage = useStorageUsage(owner);
  const freeBytes = stats.space.freeBytes;
  const hero = <StorageHero stats={stats} disk={diskViewOf(stats)} />;
  const people = owner ? <PeoplePart usage={usage} freeBytes={freeBytes} /> : null;
  if (stats.items === 0) {
    return {
      hero,
      main: (
        <>
          <StorageEmpty />
          {people}
        </>
      ),
      extras: null,
      empty: true,
    };
  }
  return {
    hero,
    main: (
      <>
        <DrivesPart usage={usage} owner={owner} freeBytes={freeBytes} />
        {people}
        <KindsCard stats={stats} />
        <PurgeBars purges={stats.purges} />
      </>
    ),
    extras: (
      <>
        <StorageDuplicates keepers={null} />
        <LargestFiles />
      </>
    ),
    empty: false,
  };
}

export function StorageColumns(props: StorageColumnsProps): ReactNode {
  const wide = storageTwoColumnsAt(useFrameBodyWidth());
  const { hero, main, extras, empty } = usePartsOf(props);
  if (!wide) {
    return (
      <View className="gap-4">
        {hero}
        {empty ? main : <HealthCard />}
        {empty ? <HealthCard /> : main}
        {extras}
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-4">
      <View style={MAIN_COLUMN} className="min-w-0 gap-4">
        {hero}
        {main}
      </View>
      <View style={SIDE_COLUMN} className="min-w-0 gap-4">
        <HealthCard />
        {extras}
      </View>
    </View>
  );
}
