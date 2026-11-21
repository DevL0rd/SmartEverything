import { useState, type ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
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
import { useSyncStatus } from '../../../store/selectors';
import { useSizeClass } from '../../../design/size-class';
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
import { useMyDrive } from '../data';
import { cardActionsOf, placementCountOf } from './card-model';
import { seenTextOf } from './computers-model';
import { MountToggle, type MountToggleDetail } from './mount-toggle';
import { mountOn } from './placement-model';
import { PlacementRow, type PlacementReach } from './placement-row';
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
        ticking={false}
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

export function presenceOf(
  online: boolean,
  live: boolean,
): { readonly label: string; readonly tone: 'positive' | 'neutral' } {
  if (!online) return { label: 'Offline', tone: 'neutral' };
  return live
    ? { label: 'Online', tone: 'positive' }
    : { label: 'Last seen online', tone: 'neutral' };
}

function Head({
  device,
  here,
  live,
}: {
  readonly device: Device;
  readonly here: boolean;
  readonly live: boolean;
}): ReactNode {
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
      <Badge {...presenceOf(device.online, live)} />
    </View>
  );
}

function Mount({
  device,
  placements,
  detail,
  live,
}: {
  readonly device: Device;
  readonly placements: readonly DrivePlacement[];
  readonly detail: MountToggleDetail;
  readonly live: boolean;
}): ReactNode {
  const myDrive = useMyDrive();
  const mount = mountOn(device.id, placements, myDrive === null ? null : myDrive.id);
  const toggle = (
    <View className="-mx-4">
      <MountToggle
        deviceId={device.id}
        computer={device.label}
        mount={mount}
        detail={detail}
        live={live}
      />
    </View>
  );
  if (mount?.enabled !== true || !device.online) return toggle;
  return (
    <DemandRegion deviceId={device.id} topics={MOUNT_TOPICS}>
      {toggle}
    </DemandRegion>
  );
}

function Placements({
  device,
  placements,
  live,
}: {
  readonly device: Device;
  readonly placements: readonly DrivePlacement[];
  readonly live: boolean;
}): ReactNode {
  const reach: PlacementReach = { online: device.online, live };
  const synced = placements.filter((placement) => placement.mode === 'synced');
  if (synced.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        {`No folders are synced to ${device.label} yet.`}
      </Text>
    );
  }
  return (
    <View>
      {synced.map((placement, index) => (
        <PlacementRow key={placement.id} placement={placement} reach={reach} divided={index > 0} />
      ))}
    </View>
  );
}

function Actions({
  device,
  onOpen,
  browse,
  live,
}: {
  readonly device: Device;
  readonly onOpen: () => void;
  readonly browse: boolean;
  readonly live: boolean;
}): ReactNode {
  const scope = useReach(device.id).scope;
  const phone = useSizeClass().width === 'compact';
  const actions = cardActionsOf(browse ? scope : false);
  return (
    <View className={cn('flex-row flex-wrap gap-2', !phone && 'justify-end')}>
      {actions.map((action) => (
        <Button
          key={action.id}
          label={action.label}
          icon={action.icon}
          variant={action.variant}
          grow={phone}
          {...(action.id === 'browse'
            ? { href: href.driveComputer(device.id) }
            : { onPress: onOpen, disabled: !live })}
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
  live,
  onClose,
  onOpen,
}: {
  readonly open: boolean;
  readonly card: CardProps;
  readonly live: boolean;
  readonly onClose: () => void;
  readonly onOpen: () => void;
}): ReactNode {
  const { device, placements } = card;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Folders on ${device.label}`}
      detents={['fit']}
      wide
    >
      <View className="gap-4 pb-4">
        {card.children}
        <Placements device={device} placements={placements} live={live} />
        <Actions
          device={device}
          browse={false}
          live={live}
          onOpen={() => {
            onClose();
            onOpen();
          }}
        />
      </View>
    </Sheet>
  );
}

function CompactPlacements({
  card,
  live,
  onOpen,
}: {
  readonly card: CardProps;
  readonly live: boolean;
  readonly onOpen: () => void;
}): ReactNode {
  const [managing, setManaging] = useState(false);
  const { device, placements } = card;
  const counted = placementCountOf(device.label, placements);
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Icon name="folderSync" size={20} tone={counted.tone} />
      <Text
        variant="footnote"
        tone={counted.tone}
        numberOfLines={2}
        className="min-w-0 flex-1 basis-40"
      >
        {counted.line}
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
        live={live}
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
  const live = useSyncStatus().status === 'live';
  const open = (): void => {
    setSheet({ deviceId: device.id, computer: device.label });
  };
  return (
    <Card>
      <Head device={device} here={here} live={live} />
      <DiskBar device={device} />
      {compact ? null : <OfflineLine device={device} />}
      <Mount
        device={device}
        placements={placements}
        detail={!compact && props.children !== undefined ? 'chip' : 'full'}
        live={live}
      />
      {compact ? (
        <CompactPlacements card={props} live={live} onOpen={open} />
      ) : (
        <>
          {props.children}
          <Placements device={device} placements={placements} live={live} />
          <Actions device={device} browse live={live} onOpen={open} />
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
