import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type {
  DrivePlacement,
  DrivePlacementMode,
  DriveRoot,
  DriveSyncClient,
} from '@smarteverything/domain';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { moment } from '../../../format/time';
import { compareText, joinParts, sentenceCase } from '../../../format/text';
import { useMinuteOf } from '../../../store/clock';
import { DemandRegion } from '../../../store/demand-region';
import { useLoaded, useRows, useSyncStatus } from '../../../store/selectors';
import { useDriveItem, useDriveRoots, useDriveSyncClients } from '../../nas/data';
import { CacheBar } from './cache-bar';
import { isStale, lineToneOf } from './placement-row';
import { MODE_WORD, PlacementNotes, placementWordsOf } from './placement-status';
import { PlacementSwitchSheet } from './placement-switch-sheet';
import {
  computerPlacementsOf,
  usePlacementChange,
  type ComputerPlacement,
  type PlacementComputer,
  type PlacementTarget,
} from './use-placements';

const MOUNT_TOPICS = ['drive_mounts'] as const;

export const MODE_ICON: Readonly<Record<DrivePlacementMode, IconName>> = {
  synced: 'folderSync',
  mounted: 'folder',
};

export const MODE_TONE: Readonly<Record<DrivePlacementMode, BadgeTone>> = {
  synced: 'primary',
  mounted: 'neutral',
};

const UNKNOWN_FOLDER = 'Folder not found';

export function isActivePlacement(placement: DrivePlacement): boolean {
  return placement.hold === null && placement.enabled;
}

function computersWith(placements: readonly DrivePlacement[], mode: DrivePlacementMode): number {
  return new Set(placements.filter((row) => row.mode === mode).map((row) => row.deviceId)).size;
}

export function placementCountWordsOf(
  placements: readonly DrivePlacement[],
  rootId: string,
): string | null {
  const active = placements.filter((row) => row.rootId === rootId && isActivePlacement(row));
  const synced = computersWith(active, 'synced');
  const mounted = computersWith(active, 'mounted');
  if (synced + mounted === 0) return null;
  return sentenceCase(
    joinParts([
      synced === 0 ? null : `synced on ${String(synced)}`,
      mounted === 0 ? null : `mounted on ${String(mounted)}`,
    ]),
  );
}

function targetOf(placement: DrivePlacement): PlacementTarget {
  return {
    rootId: placement.rootId,
    folderItemId: placement.folderItemId,
    name: '',
    bytes: null,
  };
}

export function placementRowsOn(
  computer: PlacementComputer,
  placements: readonly DrivePlacement[],
  clients: readonly DriveSyncClient[],
): readonly ComputerPlacement[] {
  return placements
    .filter((placement) => placement.deviceId === computer.deviceId)
    .sort((left, right) => compareText(left.localPath, right.localPath))
    .flatMap((placement) =>
      computerPlacementsOf([computer], [placement], clients, targetOf(placement)),
    );
}

export interface PlacementTitle {
  readonly title: string | null;
  readonly overline: string | null;
}

export function placementTitleOf(
  placement: DrivePlacement,
  roots: readonly DriveRoot[],
  folderName: string | null,
): PlacementTitle {
  const root = roots.find((entry) => entry.id === placement.rootId)?.label ?? null;
  if (placement.folderItemId === null) return { title: root, overline: null };
  return { title: folderName, overline: root };
}

export function showsCache(placement: DrivePlacement): boolean {
  return placement.mode === 'mounted' && placement.status.basicLimits === null;
}

function usePlacementTitle(placement: DrivePlacement): PlacementTitle | 'loading' {
  const roots = useDriveRoots();
  const item = useDriveItem(placement.folderItemId, placement.rootId);
  if (placement.folderItemId !== null && item.isPending) return 'loading';
  const folderName = item.data?.name ?? (item.isError ? UNKNOWN_FOLDER : null);
  return placementTitleOf(placement, roots, folderName);
}

function useStaleCaption(at: string): string {
  return useMinuteOf((now) => `Last known ${moment(at, now)}`);
}

function StopControl({ row }: { readonly row: ComputerPlacement }): ReactNode {
  const change = usePlacementChange();
  const [open, setOpen] = useState(false);
  const { placement } = row;
  if (placement === null) return null;
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <View className="flex-row">
        <Button
          label="Stop"
          variant="destructive"
          icon="square"
          onPress={() => {
            setOpen(true);
          }}
        />
      </View>
      <PlacementSwitchSheet
        facts={
          open
            ? {
                placement,
                to: 'off',
                computer: row.computer.name,
                folderBytes: null,
                needBytes: row.needBytes,
              }
            : null
        }
        busy={change.busy}
        problem={change.problem}
        onConfirm={() => {
          change.stop(placement.id, close);
        }}
        onClose={close}
      />
    </>
  );
}

function RowDetail({
  row,
  placement,
  stale,
  stoppable,
}: {
  readonly row: ComputerPlacement;
  readonly placement: DrivePlacement;
  readonly stale: boolean;
  readonly stoppable: boolean;
}): ReactNode {
  const words = placementWordsOf(placement, row.needBytes);
  return (
    <View className="gap-2 px-4 pb-3">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
        {placement.localPath}
      </Text>
      <PlacementNotes words={words} computer={row.computer.name} />
      {showsCache(placement) ? (
        <CacheBar
          facts={{
            cacheBytes: placement.status.cacheBytes,
            pinnedBytes: placement.status.pinnedBytes,
            freeBytes: null,
          }}
          name={placement.localPath}
          faded={stale}
        />
      ) : null}
      {stoppable ? <StopControl row={row} /> : null}
    </View>
  );
}

function PlacementListRow({
  row,
  placement,
  live,
  stoppable,
}: {
  readonly row: ComputerPlacement;
  readonly placement: DrivePlacement;
  readonly live: boolean;
  readonly stoppable: boolean;
}): ReactNode {
  const heading = usePlacementTitle(placement);
  const stale = isStale(row, live);
  const staleCaption = useStaleCaption(placement.status.reportedAt);
  if (heading === 'loading') return <Skeleton className="h-16" />;
  const words = placementWordsOf(placement, row.needBytes);
  return (
    <View>
      <ListRow
        title={heading.title ?? UNKNOWN_FOLDER}
        {...(heading.overline === null ? {} : { overline: heading.overline })}
        subtitle={words.line}
        subtitleTone={stale ? 'faint' : lineToneOf(words)}
        {...(stale ? { caption: staleCaption } : {})}
        icon={MODE_ICON[placement.mode]}
        trailing={<Badge label={MODE_WORD[placement.mode]} tone={MODE_TONE[placement.mode]} />}
      />
      <RowDetail row={row} placement={placement} stale={stale} stoppable={stoppable} />
    </View>
  );
}

function MountDemand({
  computer,
  rows,
  children,
}: {
  readonly computer: PlacementComputer;
  readonly rows: readonly ComputerPlacement[];
  readonly children: ReactNode;
}): ReactNode {
  const mounted = rows.some((row) => row.placement?.mode === 'mounted');
  if (!mounted || !computer.online) return children;
  return (
    <DemandRegion deviceId={computer.deviceId} topics={MOUNT_TOPICS}>
      {children}
    </DemandRegion>
  );
}

function NoPlacements({ computer }: { readonly computer: string }): ReactNode {
  return (
    <EmptyState
      compact
      icon="folder"
      title="No Drive folders here"
      body={`Open a Drive folder and choose Use on a computer to sync or mount it on ${computer}.`}
    />
  );
}

export function PlacementList({
  computer,
  title,
  stoppable = false,
}: {
  readonly computer: PlacementComputer;
  readonly title: string;
  readonly stoppable?: boolean;
}): ReactNode {
  const loaded = useLoaded();
  const live = useSyncStatus().status === 'live';
  const rows = placementRowsOn(computer, useRows('drive_placements'), useDriveSyncClients());
  if (!loaded) {
    return (
      <List title={title}>
        <Skeleton className="h-16" />
      </List>
    );
  }
  if (rows.length === 0) {
    return (
      <List title={title}>
        <NoPlacements computer={computer.name} />
      </List>
    );
  }
  return (
    <MountDemand computer={computer} rows={rows}>
      <List title={title}>
        {rows.flatMap((row) =>
          row.placement === null
            ? []
            : [
                <PlacementListRow
                  key={row.placement.id}
                  row={row}
                  placement={row.placement}
                  live={live}
                  stoppable={stoppable}
                />,
              ],
        )}
      </List>
    </MountDemand>
  );
}
