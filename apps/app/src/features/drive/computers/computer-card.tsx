import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { DemandRegion } from '../../../store/demand-region';
import { sameJson } from '../../../store/same-json';
import type { Device } from '../../../store/state';
import { Ident } from '../../computers/card/card-parts';
import { useComputerPlaces } from '../../computers/data/computer-files';
import { useComputerSelect } from '../../computers/data/computer-metrics';
import { useLastSeen } from '../../devices';
import { homeUsageOf, osLineOf, seenTextOf } from './computers-model';
import { PlacementRow } from './placement-row';
import { PlacementSheet, type PlacementSheetTarget } from './placement-sheet';

const DISKS = ['disks'] as const;
const MOUNT_TOPICS = ['drive_mounts'] as const;

function HomeBar({ device, home }: { readonly device: Device; readonly home: string }): ReactNode {
  const usage = useComputerSelect(
    device.id,
    (parts) => (parts.disks === undefined ? null : homeUsageOf(parts.disks.disks, home)),
    sameJson,
  );
  if (usage === null) return null;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
          Disk
        </Text>
        <Text
          variant="footnote"
          tone={usage.tone ?? 'variant'}
          numberOfLines={1}
          className="tabular"
        >
          {usage.line}
        </Text>
      </View>
      <ProgressBar
        progress={usage.share}
        colour={usage.tone ?? 'primary'}
        label={`Disk on ${device.label}`}
      />
    </View>
  );
}

function DiskBar({ device }: { readonly device: Device }): ReactNode {
  const home = useComputerPlaces(device.id, device.online).data?.home;
  if (home === undefined || !device.online) return null;
  return (
    <DemandRegion deviceId={device.id} topics={DISKS}>
      <HomeBar device={device} home={home} />
    </DemandRegion>
  );
}

function Head({ device, here }: { readonly device: Device; readonly here: boolean }): ReactNode {
  const now = useMinute();
  const seen = seenTextOf(device.online, useLastSeen(device.id, !device.online)?.at ?? null, now);
  const os = osLineOf(device);
  return (
    <View className="flex-row items-center gap-3">
      <Ident device={device} size="m" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {here ? `${device.label} · this computer` : device.label}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {device.online || seen === null ? os : `${os} · last seen ${seen}`}
        </Text>
      </View>
      <Badge
        label={device.online ? 'Online' : 'Offline'}
        tone={device.online ? 'positive' : 'neutral'}
      />
    </View>
  );
}

function Placements({
  device,
  placements,
}: {
  readonly device: Device;
  readonly placements: readonly DrivePlacement[];
}): ReactNode {
  if (placements.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        {`Nothing is synced or mounted on ${device.label} yet.`}
      </Text>
    );
  }
  const rows = (
    <View>
      {placements.map((placement) => (
        <PlacementRow key={placement.id} placement={placement} />
      ))}
    </View>
  );
  const mounted = placements.some((placement) => placement.mode === 'mounted');
  if (!mounted || !device.online) return rows;
  return (
    <DemandRegion deviceId={device.id} topics={MOUNT_TOPICS}>
      {rows}
    </DemandRegion>
  );
}

function Actions({ onOpen }: { readonly onOpen: (mode: 'synced' | 'mounted') => void }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Sync a folder"
        icon="folderSync"
        grow
        onPress={() => {
          onOpen('synced');
        }}
      />
      <Button
        label="Mount a folder"
        icon="cloud"
        variant="tonal"
        grow
        onPress={() => {
          onOpen('mounted');
        }}
      />
    </View>
  );
}

export function ComputerCard({
  device,
  placements,
  here = false,
  children,
}: {
  readonly device: Device;
  readonly placements: readonly DrivePlacement[];
  readonly here?: boolean;
  readonly children?: ReactNode;
}): ReactNode {
  const [sheet, setSheet] = useState<PlacementSheetTarget | null>(null);
  return (
    <Card>
      <Head device={device} here={here} />
      <DiskBar device={device} />
      {device.online ? null : (
        <Text variant="footnote" tone="variant">
          Offline. These are the last states it reported.
        </Text>
      )}
      {children}
      <Placements device={device} placements={placements} />
      <Actions
        onOpen={(mode) => {
          setSheet({ deviceId: device.id, computer: device.label, mode });
        }}
      />
      <PlacementSheet
        target={sheet}
        onClose={() => {
          setSheet(null);
        }}
      />
    </Card>
  );
}
