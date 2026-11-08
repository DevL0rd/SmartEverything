import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type {
  DiskSnapshot,
  DrivePlacement,
  DriveRoot,
  DriveSyncClient,
  DriveRootSync,
} from '@smarteverything/domain';
import { parseIgnore } from '@smarteverything/domain/drive-sync';
import { updateDriveSyncClient } from '../../../api/drive';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { DemandRegion } from '../../../store/demand-region';
import { useMutationState } from '../../../store/mutation';
import { sameJson } from '../../../store/same-json';
import { useDevice, useRows, useSyncStatus } from '../../../store/selectors';
import { desktopBridge } from '../../../design/platform';
import { useComputerSelect } from '../../computers/data/computer-metrics';
import { useDriveSyncClients } from '../../nas/data';
import { ThisComputerOnly, type ThisComputer } from '../mount/this-computer';
import {
  EVERYTHING,
  SelectiveTree,
  isUnder,
  openPathsOf,
  sameSelection,
  selectionFromWire,
  selectionToWire,
  withListing,
  type TreeEntry,
  type TreeFacts,
} from './selective-tree';

export const KEEPS_TITLE = 'This computer keeps';

export const UNTICKED_NOTE = 'Folders you untick stay on the hub and on the mounted drive.';

export const NOTHING_TICKED =
  'Tick at least one folder. To keep nothing here, turn off sync for this computer.';

const DISK_TOPICS = ['disks'] as const;

export interface DiskRoom {
  readonly usedBytes: number;
  readonly totalBytes: number;
}

export interface WillDownload {
  readonly download: number;
  readonly freed: number;
  readonly freeAfter: number | null;
  readonly segments: readonly BarSegment[];
  readonly total: number | undefined;
}

export type Sizes = ReadonlyMap<string, number>;

export function sizesOf(
  listings: ReadonlyMap<string, readonly TreeEntry[]>,
  rootBytes: number,
): Sizes {
  const sizes = new Map<string, number>([[EVERYTHING, rootBytes]]);
  for (const entries of listings.values()) {
    for (const entry of entries) sizes.set(entry.path, entry.bytes);
  }
  return sizes;
}

export function keptBytesOf(selection: readonly string[], sizes: Sizes): number | null {
  let sum = 0;
  for (const path of selection) {
    const size = sizes.get(path);
    if (size === undefined) return null;
    sum += size;
  }
  return sum;
}

function newBytesOf(path: string, current: readonly string[], sizes: Sizes): number | null {
  if (current.some((entry) => isUnder(path, entry))) return 0;
  const whole = sizes.get(path);
  const had = keptBytesOf(
    current.filter((entry) => isUnder(entry, path)),
    sizes,
  );
  return whole === undefined || had === null ? null : Math.max(0, whole - had);
}

export function downloadBytesOf(
  next: readonly string[],
  current: readonly string[],
  sizes: Sizes,
): number | null {
  let sum = 0;
  for (const path of next) {
    const size = newBytesOf(path, current, sizes);
    if (size === null) return null;
    sum += size;
  }
  return sum;
}

export function willDownloadOf(
  next: readonly string[],
  current: readonly string[],
  sizes: Sizes,
  disk: DiskRoom | null,
): WillDownload | null {
  const download = downloadBytesOf(next, current, sizes);
  const keptNow = keptBytesOf(current, sizes);
  const keptNext = keptBytesOf(next, sizes);
  if (download === null || keptNow === null || keptNext === null) return null;
  const kept = { label: 'Kept here', value: keptNext - download, colour: 'primary' } as const;
  const fresh = { label: 'To download', value: download, colour: 'info' } as const;
  const freed = Math.max(0, keptNow - (keptNext - download));
  if (disk === null)
    return { download, freed, freeAfter: null, segments: [kept, fresh], total: undefined };
  const other = Math.max(0, disk.usedBytes - keptNow);
  return {
    download,
    freed,
    freeAfter: disk.totalBytes - other - keptNext,
    segments: [{ label: 'Other files', value: other, colour: 'track' }, kept, fresh],
    total: disk.totalBytes,
  };
}

export function headlineOf(sum: WillDownload): string {
  if (sum.download > 0) return `Will download ${bytes(sum.download)}`;
  if (sum.freed > 0) return `Frees ${bytes(sum.freed)} here`;
  return 'Nothing new to download';
}

export function freeLineOf(sum: WillDownload): string | null {
  if (sum.freeAfter === null) return null;
  if (sum.freeAfter < 0) return `Needs ${bytes(-sum.freeAfter)} more space`;
  return `${bytes(sum.freeAfter)} free after`;
}

export function saveLabelOf(sum: WillDownload | null): string {
  return sum === null || sum.download === 0 ? 'Save' : `Save and download ${bytes(sum.download)}`;
}

function comparable(path: string, platform: ThisComputer['platform']): string {
  const forward = path.replaceAll('\\', '/');
  const trimmed = forward.length > 1 && forward.endsWith('/') ? forward.slice(0, -1) : forward;
  return platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

export function diskRoomOf(
  disks: readonly DiskSnapshot[],
  localPath: string,
  platform: ThisComputer['platform'],
): DiskRoom | null {
  const path = comparable(localPath, platform);
  const holding = disks.filter((disk) => {
    const mount = comparable(disk.mount, platform);
    return mount === '/' || path === mount || path.startsWith(`${mount}/`);
  });
  const best = holding.reduce<DiskSnapshot | null>(
    (found, disk) => (found === null || disk.mount.length > found.mount.length ? disk : found),
    null,
  );
  return best === null ? null : { usedBytes: best.usedBytes, totalBytes: best.totalBytes };
}

export function skippedOf(patterns: readonly string[]): (path: string) => boolean {
  const parsed = parseIgnore(patterns.join('\n'), false);
  return parsed.ok ? parsed.matcher.isIgnored : (): boolean => false;
}

export function SelectiveSum({ sum }: { readonly sum: WillDownload | null }): ReactNode {
  if (sum === null) return <Skeleton shape="block" className="h-20" />;
  const free = freeLineOf(sum);
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="body-strong" className="tabular">
          {headlineOf(sum)}
        </Text>
        {free === null ? null : (
          <Text
            variant="footnote"
            tone={sum.freeAfter !== null && sum.freeAfter < 0 ? 'critical' : 'variant'}
            className="tabular"
          >
            {free}
          </Text>
        )}
      </View>
      <SegmentBar
        segments={sum.segments}
        {...(sum.total === undefined ? {} : { total: sum.total })}
        label={joinParts(['This computer’s disk', headlineOf(sum), free])}
        format={bytes}
      />
      <Text variant="footnote" tone="variant">
        {UNTICKED_NOTE}
      </Text>
    </View>
  );
}

export const HUB_OFFLINE_NOTE = 'The hub is offline. Save when it is back.';

export function noteOf(ticked: boolean, live: boolean, problem: string | null): string | null {
  if (!ticked) return NOTHING_TICKED;
  return live ? problem : HUB_OFFLINE_NOTE;
}

type SyncRoot = Extract<DriveRoot, { readonly sync: DriveRootSync }>;

interface EditorProps {
  readonly root: SyncRoot;
  readonly computer: ThisComputer;
  readonly client: DriveSyncClient;
  readonly placement: DrivePlacement;
}

function useDiskRoom({ computer, placement }: EditorProps): DiskRoom | null {
  return useComputerSelect(
    computer.deviceId,
    (parts) =>
      parts.disks === undefined
        ? null
        : diskRoomOf(parts.disks.disks, placement.localPath, computer.platform),
    sameJson,
  );
}

interface SelectionSave {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly save: (selected: readonly string[]) => void;
}

function useSelectionSave(client: DriveSyncClient): SelectionSave {
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    save: (selected): void => {
      const { clientId, rootId, enabled } = client;
      mutation.run(() => updateDriveSyncClient({ clientId, rootId, enabled, selected }), {
        failure: 'The folder choice was not saved',
        label: 'drive.selective.save',
        inline: true,
      });
    },
  };
}

function Actions({
  client,
  draft,
  sum,
  live,
  onCancel,
}: {
  readonly client: DriveSyncClient;
  readonly draft: readonly string[];
  readonly sum: WillDownload | null;
  readonly live: boolean;
  readonly onCancel: () => void;
}): ReactNode {
  const saving = useSelectionSave(client);
  const wire = selectionToWire(draft);
  const dirty = !sameSelection(draft, selectionFromWire(client.selected));
  const note = noteOf(wire !== null, live, saving.problem);
  return (
    <View className="gap-2">
      {note === null ? null : (
        <Text variant="footnote" tone={wire === null || !live ? 'variant' : 'critical'}>
          {note}
        </Text>
      )}
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button label="Cancel" variant="text" disabled={!dirty || saving.busy} onPress={onCancel} />
        <Button
          label={saveLabelOf(sum)}
          icon="download"
          loading={saving.busy}
          disabled={!dirty || !live || wire === null || sum === null}
          onPress={() => {
            if (wire !== null) saving.save(wire);
          }}
        />
      </View>
    </View>
  );
}

function Editor(props: EditorProps): ReactNode {
  const { root, client, computer } = props;
  const current = selectionFromWire(client.selected);
  const [draft, setDraft] = useState(current);
  const [listings, setListings] = useState<ReadonlyMap<string, readonly TreeEntry[]>>(new Map());
  const facts: TreeFacts = { listings, skipped: skippedOf(root.sync.ignorePatterns) };
  const disk = useDiskRoom(props);
  const sum = willDownloadOf(draft, current, sizesOf(listings, root.bytes), disk);
  const device = useDevice(computer.deviceId);
  const live = useSyncStatus().status === 'live';
  const free =
    disk === null ? null : `${bytes(Math.max(0, disk.totalBytes - disk.usedBytes))} free`;
  return (
    <Card
      title={KEEPS_TITLE}
      icon="monitor"
      metadata={
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular shrink">
          {joinParts([device?.label ?? null, free])}
        </Text>
      }
    >
      <SelectiveTree
        rootId={root.id}
        rootLabel={root.label}
        selection={draft}
        facts={facts}
        initialOpen={openPathsOf(current)}
        disabled={!live}
        onListing={(path, entries) => {
          setListings((now) => withListing(now, path, entries));
        }}
        onChange={setDraft}
      />
      <SelectiveSum sum={sum} />
      <Actions
        client={client}
        live={live}
        draft={draft}
        sum={sum}
        onCancel={() => {
          setDraft(current);
        }}
      />
    </Card>
  );
}

export function syncedHereOf(
  placements: readonly DrivePlacement[],
  deviceId: string,
  rootId: string,
): DrivePlacement | null {
  return (
    placements.find(
      (placement) =>
        placement.deviceId === deviceId &&
        placement.rootId === rootId &&
        placement.mode === 'synced',
    ) ?? null
  );
}

export function SelectiveSyncCard({
  root,
  computer,
}: {
  readonly root: SyncRoot;
  readonly computer: ThisComputer;
}): ReactNode {
  const placement = syncedHereOf(useRows('drive_placements'), computer.deviceId, root.id);
  const client = useDriveSyncClients().find(
    (row) => row.deviceId === computer.deviceId && row.rootId === root.id,
  );
  if (placement === null || client === undefined) return null;
  return (
    <DemandRegion deviceId={computer.deviceId} topics={DISK_TOPICS}>
      <Editor
        key={client.selected.join('\n')}
        root={root}
        computer={computer}
        client={client}
        placement={placement}
      />
    </DemandRegion>
  );
}

export function selectiveSlotOf(root: SyncRoot): ReactNode {
  if (desktopBridge() === null) return undefined;
  return (
    <ThisComputerOnly>
      {(computer) => <SelectiveSyncCard root={root} computer={computer} />}
    </ThisComputerOnly>
  );
}
