import type { DriveRoot, DriveStats, DriveVolume } from '@smarteverything/domain';
import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Card } from '../../../components/card';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { diskSeverity } from '../../computers/model/computer-view';
import { usedShare } from '../../computers/storage/storage-model';
import type { VolumeName } from './storage-hero';

type StatsVolume = DriveStats['volumes'][number];

export interface VolumeMount {
  readonly mountId: string;
  readonly mountPoint: string;
}

export interface VolumeBadge {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
}

export interface VolumeRow {
  readonly key: string;
  readonly name: string;
  readonly caption: string;
  readonly icon: IconName;
  readonly used: string;
  readonly segments: readonly BarSegment[];
  readonly total: number;
  readonly badges: readonly VolumeBadge[];
}

const UNNAMED_VOLUME = 'Disk';

function rootsOn(volume: StatsVolume, roots: readonly DriveRoot[]): readonly DriveRoot[] {
  return roots.filter((root) => volume.rootIds.includes(root.id));
}

function physicalVolumeOf(roots: readonly DriveRoot[]): DriveVolume | null {
  for (const root of roots) {
    if ('volume' in root && root.volume !== null) return root.volume;
  }
  return null;
}

export function volumeNameOf(volume: StatsVolume, roots: readonly DriveRoot[]): string {
  const labels = rootsOn(volume, roots).map((root) => root.label);
  return labels.length === 0 ? UNNAMED_VOLUME : labels.join(', ');
}

export function volumeNamesOf(
  stats: DriveStats,
  roots: readonly DriveRoot[],
): readonly VolumeName[] {
  return stats.volumes.map((volume) => ({
    mountId: volume.mountId,
    name: volumeNameOf(volume, roots),
  }));
}

function diskOf(volume: StatsVolume): { readonly usedBytes: number; readonly totalBytes: number } {
  return { usedBytes: volume.totalBytes - volume.freeBytes, totalBytes: volume.totalBytes };
}

function fullBadgeOf(volume: StatsVolume): readonly VolumeBadge[] {
  const severity = diskSeverity(usedShare(diskOf(volume)));
  if (severity.word === null || severity.tone === null) return [];
  return [{ label: severity.word, tone: severity.tone, icon: 'warning' }];
}

function stateBadgeOf(on: readonly DriveRoot[]): readonly VolumeBadge[] {
  if (on.some((root) => root.state === 'offline')) {
    return [{ label: 'Offline', tone: 'critical', icon: 'wifiOff' }];
  }
  if (on.some((root) => root.state === 'unresponsive')) {
    return [{ label: 'Not answering', tone: 'warning', icon: 'warning' }];
  }
  return [];
}

function volumeBadgesOf(
  volume: StatsVolume,
  physical: DriveVolume | null,
  on: readonly DriveRoot[],
): readonly VolumeBadge[] {
  const readOnly = on.length > 0 && on.every((root) => root.readOnly);
  return [
    ...(physical?.network === true
      ? [{ label: 'Network', tone: 'neutral', icon: 'network' } as const]
      : []),
    ...(readOnly ? [{ label: 'Read only', tone: 'neutral', icon: 'eye' } as const] : []),
    ...fullBadgeOf(volume),
    ...stateBadgeOf(on),
  ];
}

function segmentsOf(volume: StatsVolume, on: readonly DriveRoot[]): readonly BarSegment[] {
  const drive = on.reduce((all, root) => all + root.bytes, 0);
  const used = volume.totalBytes - volume.freeBytes;
  return [
    { label: 'Drive files', value: drive, colour: 'primary' },
    { label: 'Other files', value: Math.max(0, used - drive), colour: 'track' },
  ];
}

export function volumeRowOf(
  volume: StatsVolume,
  roots: readonly DriveRoot[],
  mounts: readonly VolumeMount[],
): VolumeRow {
  const on = rootsOn(volume, roots);
  const physical = physicalVolumeOf(on);
  const mount = mounts.find((entry) => entry.mountId === volume.mountId);
  return {
    key: volume.mountId,
    name: volumeNameOf(volume, roots),
    caption: joinParts([physical?.fsType, mount?.mountPoint]),
    icon: physical?.network === true ? 'server' : 'hardDrive',
    used: `${bytes(volume.totalBytes - volume.freeBytes)} of ${bytes(volume.totalBytes)}`,
    segments: segmentsOf(volume, on),
    total: volume.totalBytes,
    badges: volumeBadgesOf(volume, physical, on),
  };
}

function Badges({ badges }: { readonly badges: readonly VolumeBadge[] }): ReactNode {
  if (badges.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {badges.map((badge) => (
        <Badge key={badge.label} label={badge.label} tone={badge.tone} icon={badge.icon} />
      ))}
    </View>
  );
}

function Row({ row }: { readonly row: VolumeRow }): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <Icon name={row.icon} size={20} tone="variant" />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {row.name}
          </Text>
          {row.caption === '' ? null : (
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {row.caption}
            </Text>
          )}
        </View>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
          {row.used}
        </Text>
      </View>
      <SegmentBar
        segments={row.segments}
        total={row.total}
        label={`${row.name} used`}
        format={bytes}
      />
      <Badges badges={row.badges} />
    </View>
  );
}

export interface VolumeListProps {
  readonly stats: DriveStats;
  readonly roots: readonly DriveRoot[];
  readonly mounts: readonly VolumeMount[];
}

export function VolumeList({ stats, roots, mounts }: VolumeListProps): ReactNode {
  if (stats.volumes.length === 0) return null;
  return (
    <Card title="Volumes">
      {stats.volumes.map((volume, index) => (
        <Fragment key={volume.mountId}>
          {index === 0 ? null : <View className="h-hairline bg-outline-variant" />}
          <Row row={volumeRowOf(volume, roots, mounts)} />
        </Fragment>
      ))}
    </Card>
  );
}
