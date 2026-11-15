import { useState, type ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { View } from 'react-native';
import type { DrivePlacement } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Sheet } from '../../../components/sheet';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { DemandRegion } from '../../../store/demand-region';
import { sameJson } from '../../../store/same-json';
import type { Device } from '../../../store/state';
import {
  Ident,
  homeUsageOf,
  osLineOf,
  usePlacesData,
  useReach,
  useComputerSelect,
} from '../../computers';
import { useLastSeen } from '../../devices';
import { cardActionsOf, placementCountOf } from './card-model';
import { seenTextOf } from './computers-model';
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
  const home = usePlacesData(device.id, device.online).data?.home;
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

function Actions({
  device,
  onOpen,
  browse,
}: {
  readonly device: Device;
  readonly onOpen: (mode: 'synced' | 'mounted') => void;
  readonly browse: boolean;
}): ReactNode {
  const scope = useReach(device.id).scope;
  const actions = cardActionsOf(browse ? scope : false);
  return (
    <View className="flex-row flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.id}
          label={action.label}
          icon={action.icon}
          variant={action.variant}
          grow
          {...(action.id === 'browse'
            ? { href: href.driveComputer(device.id) }
            : {
                onPress: (): void => {
                  onOpen(action.id === 'synced' ? 'synced' : 'mounted');
                },
              })}
        />
      ))}
    </View>
  );
}

interface CardProps {
  readonly device: Device;
  readonly placements: readonly DrivePlacement[];
  readonly here?: boolean;
  readonly compact?: boolean;
  readonly children?: ReactNode;
}

function OfflineLine({ device }: { readonly device: Device }): ReactNode {
  if (device.online) return null;
  return (
    <Text variant="footnote" tone="variant">
      Offline. These are the last states it reported.
    </Text>
  );
}

function ManageSheet({
  open,
  card,
  onClose,
  onOpen,
}: {
  readonly open: boolean;
  readonly card: CardProps;
  readonly onClose: () => void;
  readonly onOpen: (mode: 'synced' | 'mounted') => void;
}): ReactNode {
  const { device, placements } = card;
  return (
    <Sheet open={open} onClose={onClose} title={`Folders on ${device.label}`} wide>
      <View className="gap-4 px-4 pb-6">
        {card.children}
        <Placements device={device} placements={placements} />
        <Actions
          device={device}
          browse={false}
          onOpen={(mode) => {
            onClose();
            onOpen(mode);
          }}
        />
      </View>
    </Sheet>
  );
}

function CompactPlacements({
  card,
  onOpen,
}: {
  readonly card: CardProps;
  readonly onOpen: (mode: 'synced' | 'mounted') => void;
}): ReactNode {
  const [managing, setManaging] = useState(false);
  const { device, placements } = card;
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Icon name="folderSync" size={20} tone="variant" />
      <Text variant="footnote" tone="variant" numberOfLines={2} className="min-w-0 flex-1 basis-40">
        {placementCountOf(device.label, placements)}
      </Text>
      <Button
        label="Manage"
        variant="tonal"
        onPress={() => {
          setManaging(true);
        }}
      />
      <ManageSheet
        open={managing}
        card={card}
        onOpen={onOpen}
        onClose={() => {
          setManaging(false);
        }}
      />
    </View>
  );
}

export function ComputerCard(props: CardProps): ReactNode {
  const { device, placements, here = false, compact = false } = props;
  const [sheet, setSheet] = useState<PlacementSheetTarget | null>(null);
  const open = (mode: 'synced' | 'mounted'): void => {
    setSheet({ deviceId: device.id, computer: device.label, mode });
  };
  return (
    <Card>
      <Head device={device} here={here} />
      <DiskBar device={device} />
      <OfflineLine device={device} />
      {compact ? (
        <CompactPlacements card={props} onOpen={open} />
      ) : (
        <>
          {props.children}
          <Placements device={device} placements={placements} />
          <Actions device={device} browse onOpen={open} />
        </>
      )}
      <PlacementSheet
        target={sheet}
        onClose={() => {
          setSheet(null);
        }}
      />
    </Card>
  );
}
