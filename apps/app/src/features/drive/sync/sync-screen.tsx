import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { DriveRoot, DriveSyncClient } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { twoFrameColumnsAt } from '../../../components/frame-layout';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { useDayKey, useMinute } from '../../../store/clock';
import { sameJson } from '../../../store/same-json';
import { useIsOwner, useLoaded, useSyncStatus } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import {
  flattenPages,
  useDriveConflicts,
  useDriveRecent,
  useDriveRoots,
  useDriveSyncClients,
} from '../../nas/data';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { DriveFrame } from '../components/drive-frame';
import { useDriveSyncSummary } from '../components/sync-pill';
import { loadMore } from '../recent/use-recent-feed';
import type { SyncComputer } from '../roots/root-card-model';
import { computersIn } from '../roots/sync-status-line';
import { ComputersCard, folderClientViewsOf, type SyncFacts } from './sync-client-row';
import { MAKE_SYNCED, MakeSyncedSheet, SyncFolderCard } from './sync-folder-card';
import {
  changeBarsOf,
  changeWindowCovered,
  lastHourOf,
  movedTodayOf,
  syncChangesOf,
  syncSubtitleOf,
  syncedRootsOf,
  type SyncChange,
} from './sync-model';
import {
  SyncStats,
  computerFactsOf,
  conflictFactOf,
  type OpenConflicts,
  type SyncComputerFact,
} from './sync-stats';
import { SyncthingCard } from './syncthing-folder-row';

export interface SyncSlots {
  readonly conflicts?: ReactNode;
  readonly thisComputer?: ReactNode;
}

const MAIN_COLUMN = { flexGrow: 3, flexBasis: 0 } as const;
const SIDE_COLUMN = { flexGrow: 2, flexBasis: 0 } as const;
const NO_CHANGES: readonly SyncChange[] = [];

interface Refetchable {
  readonly failed: boolean;
  readonly refetch: () => Promise<unknown>;
}

interface SyncChanges extends Refetchable {
  readonly changes: readonly SyncChange[];
  readonly loaded: boolean;
}

function useSyncChanges(today: string): SyncChanges {
  const pages = useDriveRecent('everything');
  const entries = flattenPages(pages.data, (page) => page.entries);
  const pending = pages.hasNextPage && !changeWindowCovered(entries, today);
  useEffect(() => {
    if (pending) loadMore(pages);
  }, [pending, pages]);
  return {
    changes: pages.data === undefined ? NO_CHANGES : syncChangesOf(entries),
    loaded: pages.data !== undefined,
    failed: pages.isError,
    refetch: pages.refetch,
  };
}

function useComputers(clients: readonly DriveSyncClient[]): ReadonlyMap<string, SyncComputer> {
  const deviceIds = [...new Set(clients.map((client) => client.deviceId))];
  const computers = useStoreSelector((state) => computersIn(state, deviceIds), sameJson, [
    deviceIds.join('\n'),
  ]);
  return new Map(computers.map((computer) => [computer.deviceId, computer]));
}

interface ConflictPages extends OpenConflicts, Refetchable {}

function useOpenConflicts(): ConflictPages {
  const pages = useDriveConflicts(null);
  return {
    failed: pages.isError,
    refetch: pages.refetch,
    items: flattenPages(pages.data, (page) => page.items).filter(
      (conflict) => conflict.resolvedAt === null,
    ),
    more: pages.hasNextPage,
  };
}

interface BodyProps {
  readonly synced: readonly DriveRoot[];
  readonly roots: readonly DriveRoot[];
  readonly facts: SyncFacts;
  readonly today: string;
  readonly owner: boolean;
  readonly slots: SyncSlots;
}

function FolderCards({
  synced,
  facts,
  today,
}: Omit<BodyProps, 'roots' | 'owner' | 'slots'>): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  return synced.map((root) => (
    <SyncFolderCard
      key={root.id}
      root={root}
      clients={folderClientViewsOf(root, facts)}
      bars={changeBarsOf(facts.changes, root.id, today)}
      compact={compact}
    />
  ));
}

function SyncColumns(props: BodyProps): ReactNode {
  const wide = twoFrameColumnsAt(useFrameBodyWidth());
  const main = <FolderCards synced={props.synced} facts={props.facts} today={props.today} />;
  const side = (
    <>
      {props.slots.conflicts}
      {props.slots.thisComputer}
      <ComputersCard facts={props.facts} roots={props.synced} />
      <SyncthingCard roots={props.roots} owner={props.owner} />
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

export function SyncSkeleton(): ReactNode {
  return (
    <View aria-busy className="gap-4">
      <Skeleton shape="block" className="h-16" />
      <Skeleton shape="tile" className="h-56" />
      <Skeleton shape="tile" className="h-56" />
    </View>
  );
}

function SyncEmpty({
  owner,
  open,
}: {
  readonly owner: boolean;
  readonly open: () => void;
}): ReactNode {
  if (!owner) {
    return (
      <EmptyState
        icon="folderSync"
        title="No synced folders yet"
        body="When the owner syncs a library folder, the computers that keep it show here."
      />
    );
  }
  return (
    <EmptyState
      icon="folderSync"
      title="Keep folders on every computer"
      body="Make a library folder synced and each computer with the Desktop app keeps a copy that the hub keeps in step."
      action={<Button label={MAKE_SYNCED} icon="folderSync" onPress={open} />}
    />
  );
}

function SyncBanner({
  live,
  retry,
}: {
  readonly live: boolean;
  readonly retry: (() => void) | null;
}): ReactNode {
  if (!live) {
    return (
      <Banner
        tone="info"
        title="The hub is offline"
        body="Sync shows what the hub said last. Computers keep syncing with the hub when it is back."
      />
    );
  }
  if (retry === null) return null;
  return (
    <Banner
      tone="critical"
      title="Some sync details did not load"
      body="Changes and conflicts come from the hub. The folder and computer states are current."
      action={{ label: 'Try again', onPress: retry }}
    />
  );
}

interface Facts extends SyncFacts {
  readonly loaded: boolean;
  readonly open: OpenConflicts;
  readonly retry: (() => void) | null;
}

function retryOf(failed: readonly Refetchable[]): (() => void) | null {
  if (failed.length === 0) return null;
  return () => {
    for (const query of failed) background(query.refetch(), 'drive.sync.refetch_failed');
  };
}

function useSyncFacts(roots: readonly DriveRoot[], today: string): Facts {
  const clients = useDriveSyncClients().filter((client) =>
    roots.some((root) => root.id === client.rootId),
  );
  const open = useOpenConflicts();
  const feed = useSyncChanges(today);
  const failed = [feed, open].filter((query) => query.failed);
  return {
    clients,
    conflicts: open.items,
    moreConflicts: open.more,
    computers: useComputers(clients),
    changes: feed.changes,
    now: useMinute(),
    loaded: feed.loaded,
    open,
    retry: retryOf(failed),
  };
}

interface ContentProps extends BodyProps {
  readonly facts: Facts;
  readonly computers: readonly SyncComputerFact[];
  readonly live: boolean;
  readonly open: () => void;
}

function SyncContent(props: ContentProps): ReactNode {
  const { facts, today } = props;
  if (props.synced.length === 0) return <SyncEmpty owner={props.owner} open={props.open} />;
  return (
    <View className="gap-section-gap">
      <SyncStats
        synced={props.synced}
        computers={props.computers}
        today={facts.loaded ? movedTodayOf(facts.changes, today) : null}
        hour={facts.loaded ? lastHourOf(facts.changes, facts.now, null) : null}
        conflicts={conflictFactOf(facts.open)}
        now={facts.now}
        stale={!props.live}
      />
      <SyncColumns {...props} />
    </View>
  );
}

export function SyncScreen({ slots = {} }: { readonly slots?: SyncSlots }): ReactNode {
  const owner = useIsOwner();
  const loaded = useLoaded();
  const live = useSyncStatus().status === 'live';
  const today = useDayKey();
  const roots = useDriveRoots();
  const synced = syncedRootsOf(roots);
  const facts = useSyncFacts(synced, today);
  const line = useDriveSyncSummary()?.line ?? null;
  const [making, setMaking] = useState(false);
  const open = (): void => {
    setMaking(true);
  };
  const primary: PrimaryActionProps = { label: MAKE_SYNCED, icon: 'folderSync', onPress: open };
  const computers = computerFactsOf(facts);
  return (
    <DriveFrame
      section="sync"
      title="Sync"
      subtitle={syncSubtitleOf(synced.length, computers.length, line)}
      banner={<SyncBanner live={live} retry={facts.retry} />}
      {...(owner ? { primary } : {})}
    >
      {loaded ? (
        <SyncContent
          synced={synced}
          roots={roots}
          facts={facts}
          today={today}
          owner={owner}
          slots={slots}
          computers={computers}
          live={live}
          open={open}
        />
      ) : (
        <SyncSkeleton />
      )}
      {making ? (
        <MakeSyncedSheet
          roots={roots}
          close={() => {
            setMaking(false);
          }}
        />
      ) : null}
    </DriveFrame>
  );
}
