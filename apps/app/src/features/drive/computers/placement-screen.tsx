import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DrivePlacement } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { Crumb } from '../../../components/breadcrumbs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Arc, SegmentBar } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useDevices, useLoaded } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDrivePlacementRows } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { usePlacementWrites } from './placement-change';
import { removePlacement, usePlacedFolder, type PlacedFolder } from './placement-row';
import { SelectiveSync, SyncRules } from './placement-sync';
import {
  basicLimitsOf,
  placementWordsOf,
  sentenceOf,
  syncedShareOf,
  type PlacementWords,
} from './placement-words';
import { ComputersSkeleton } from './computers-screen';

const COMPUTERS_CRUMB = { label: 'Computers', href: href.drivePage('computers') } as const;
const RING_SIZE = 96;
const TILE_COLUMNS = { compact: 2, medium: 4, expanded: 4 } as const;

function crumbsOf(device: Device | undefined, title: string): readonly Crumb[] {
  if (device === undefined) return [COMPUTERS_CRUMB, { label: title }];
  return [
    COMPUTERS_CRUMB,
    { label: device.label, href: href.driveComputer(device.id) },
    { label: title },
  ];
}

export function ringShareOf(placement: DrivePlacement, size: number | null): number {
  if (placement.mode === 'mounted') return placement.status.state === 'mounted' ? 1 : 0;
  if (placement.status.state === 'up_to_date') return 1;
  return syncedShareOf(placement.status.needBytes, size) ?? 0;
}

function modeTilesOf(placement: DrivePlacement, now: number): readonly MetricItem[] {
  const { status } = placement;
  if (placement.mode === 'mounted') {
    return [
      { key: 'waiting', label: 'Waiting to upload', value: count(status.pendingUploads) },
      { key: 'open', label: 'Open now', value: count(status.openFiles) },
    ];
  }
  return [
    { key: 'waiting', label: 'Left to sync', value: bytes(status.needBytes) },
    {
      key: 'synced',
      label: 'Last synced',
      value: status.lastSyncedAt === null ? 'Not yet' : moment(status.lastSyncedAt, now),
    },
  ];
}

export function heroTilesOf(
  placement: DrivePlacement,
  placed: PlacedFolder,
  now: number,
): readonly MetricItem[] {
  return [
    { key: 'size', label: 'Size', value: placed.bytes === null ? 'Unknown' : bytes(placed.bytes) },
    ...modeTilesOf(placement, now),
    { key: 'errors', label: 'Problems', value: count(placement.status.errors.length) },
  ];
}

function Hero({
  placement,
  placed,
  words,
}: {
  readonly placement: DrivePlacement;
  readonly placed: PlacedFolder;
  readonly words: PlacementWords;
}): ReactNode {
  const now = useMinute();
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-4">
        <View accessible accessibilityLabel={words.chip.label} className="size-24">
          <Arc
            value={ringShareOf(placement, placed.bytes)}
            size={RING_SIZE}
            thickness={10}
            colour={words.tone ?? 'track'}
          />
        </View>
        <View className="min-w-48 flex-1 gap-1">
          <Text variant="title-2" numberOfLines={2}>
            {words.chip.label}
          </Text>
          <Text variant="callout" tone="variant" numberOfLines={3}>
            {sentenceOf(placement.mode, words)}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1} className="font-mono">
            {placement.localPath}
          </Text>
        </View>
      </View>
      <MetricStrip items={heroTilesOf(placement, placed, now)} columns={TILE_COLUMNS} />
      {words.notes.map((note) => (
        <Text key={note} variant="footnote" tone="variant">
          {note}
        </Text>
      ))}
    </Card>
  );
}

function MountCache({ placement }: { readonly placement: DrivePlacement }): ReactNode {
  const { status } = placement;
  if (placement.mode !== 'mounted') return null;
  return (
    <Card title="Cache and tier" icon="hardDrive">
      <Text variant="footnote" tone="variant">
        {status.basicLimits === null
          ? 'Full drive: programs open files in place and big files stream. What you read stays in the cache for an hour.'
          : basicLimitsOf(status.basicLimits)}
      </Text>
      <SegmentBar
        label="Mount cache"
        segments={[
          { label: 'Cached', value: status.cacheBytes - status.pinnedBytes, colour: 'primary' },
          { label: 'Kept offline', value: status.pinnedBytes, colour: 'viz-4' },
        ]}
        legend
        format={bytes}
      />
    </Card>
  );
}

function Errors({ placement }: { readonly placement: DrivePlacement }): ReactNode {
  const now = useMinute();
  const { errors } = placement.status;
  if (errors.length === 0) return null;
  return (
    <List title="Problems" caption={count(errors.length)}>
      {errors.map((error) => (
        <ListRow
          key={`${error.relPath ?? ''}-${error.at}`}
          title={error.relPath ?? 'The whole folder'}
          subtitle={error.message}
          subtitleTone="critical"
          caption={moment(error.at, now)}
          icon="warning"
          wrapSubtitle
        />
      ))}
    </List>
  );
}

function RemoveSection({ placement }: { readonly placement: DrivePlacement }): ReactNode {
  const router = useRouter();
  const writes = usePlacementWrites();
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        {placement.mode === 'synced'
          ? 'The files stay on this computer; they stop syncing.'
          : 'The folder is unmounted. Nothing in the drive is deleted.'}
      </Text>
      <View className="flex-row">
        <Button
          label="Remove from this computer"
          icon="trash"
          variant="destructive"
          loading={writes.busy}
          onPress={() => {
            removePlacement(placement, writes, () => {
              router.replace(href.driveComputer(placement.deviceId));
            });
          }}
        />
      </View>
      {writes.problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {writes.problem}
        </Text>
      )}
    </View>
  );
}

function SyncSections({
  placement,
  placed,
  editable,
}: {
  readonly placement: DrivePlacement;
  readonly placed: PlacedFolder;
  readonly editable: boolean;
}): ReactNode {
  if (placement.mode !== 'synced') return null;
  const located = placement.folderItemId === null || placed.folder !== null;
  return (
    <>
      {located ? (
        <SelectiveSync
          key={(placement.excluded ?? []).join('\n')}
          placement={placement}
          base={placed.folder}
          size={placed.bytes}
          editable={editable}
        />
      ) : null}
      <SyncRules placement={placement} editable={editable} />
    </>
  );
}

function offlineBannerOf(device: Device | undefined): { readonly banner?: ReactNode } {
  if (device?.online !== false) return {};
  return {
    banner: (
      <Banner
        wrapBody
        tone="info"
        title={`${device.label} is offline`}
        body="Showing the last state it reported."
      />
    ),
  };
}

function PlacedView({
  placement,
  device,
}: {
  readonly placement: DrivePlacement;
  readonly device: Device | undefined;
}): ReactNode {
  const placed = usePlacedFolder(placement);
  const words = placementWordsOf(placement, placed.bytes);
  const editable = !words.held && !placement.status.readOnly;
  return (
    <DriveFrame
      section="computers"
      title={placed.path}
      subtitle={device?.label ?? 'A computer'}
      breadcrumbs={crumbsOf(device, placed.path)}
      {...offlineBannerOf(device)}
    >
      <View className="gap-4">
        <Hero placement={placement} placed={placed} words={words} />
        <SyncSections placement={placement} placed={placed} editable={editable} />
        <MountCache placement={placement} />
        <Errors placement={placement} />
        <RemoveSection placement={placement} />
      </View>
    </DriveFrame>
  );
}

export function PlacementScreen(): ReactNode {
  const { placementId } = useLocalSearchParams<{ placementId: string }>();
  const loaded = useLoaded();
  const placement = useDrivePlacementRows().find((candidate) => candidate.id === placementId);
  const device = useDevices().find((candidate) => candidate.id === placement?.deviceId);
  if (placement !== undefined) {
    return <PlacedView placement={placement} device={device} />;
  }
  return (
    <DriveFrame section="computers" title="Folder on a computer" breadcrumbs={[COMPUTERS_CRUMB]}>
      {loaded ? (
        <EmptyState
          icon="folderSync"
          title="This folder is no longer on the computer"
          body="It was removed. The files are still in the drive."
          action={
            <Button label="Open Computers" variant="tonal" href={href.drivePage('computers')} />
          }
        />
      ) : (
        <ComputersSkeleton />
      )}
    </DriveFrame>
  );
}
