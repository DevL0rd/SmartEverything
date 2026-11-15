import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { DrivePlacement } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { joinParts } from '../../../format/text';
import { useDevices, useLoaded } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerBrowser, computersOf, type ComputerFrameSlots } from '../../computers';
import { type BrowserHeader, shellSearchOf } from '../../files';
import { useDrivePlacementRows } from '../data';
import { DriveFrame, type DriveFrameProps } from '../components/drive-frame';
import { ComputerCard } from './computer-card';
import { ComputersSkeleton, ThisComputerCard } from './computers-screen';
import { placementsOn } from './placement-model';
import { useDesktopDrive, useThisComputer } from './this-computer';

const COMPUTERS_CRUMB = { label: 'Computers', href: href.drivePage('computers') } as const;

function CompactCard({
  device,
  placements,
}: {
  readonly device: Device;
  readonly placements: readonly DrivePlacement[];
}): ReactNode {
  const here = useThisComputer();
  const drive = useDesktopDrive();
  if (here !== null && drive !== null && here.deviceId === device.id) {
    return (
      <ThisComputerCard device={device} here={here} drive={drive} placements={placements} compact />
    );
  }
  return <ComputerCard device={device} placements={placementsOn(device.id, placements)} compact />;
}

export function computerSubtitleOf(device: string, header: BrowserHeader): string | undefined {
  const line = joinParts([header.title === device ? null : header.title, header.subtitle]);
  return line === '' ? undefined : line;
}

function headerPartsOf(device: Device, header: BrowserHeader | null): Partial<DriveFrameProps> {
  if (header === null) return {};
  const subtitle = computerSubtitleOf(device.label, header);
  return {
    actions: header.actions,
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(header.primary === undefined ? {} : { primary: header.primary }),
    ...(header.search === null ? {} : { search: shellSearchOf(header.search) }),
  };
}

function PageFrame({
  device,
  slots,
  card,
}: {
  readonly device: Device;
  readonly slots: ComputerFrameSlots;
  readonly card: ReactNode;
}): ReactNode {
  const { header } = slots;
  return (
    <DriveFrame
      section="computers"
      title={device.label}
      breadcrumbs={[COMPUTERS_CRUMB, { label: device.label, href: href.driveComputer(device.id) }]}
      scroll={false}
      iconRail={slots.detailsOpen}
      overflow={slots.overflow}
      controls={slots.controls}
      {...headerPartsOf(device, header)}
    >
      <View className="min-h-0 flex-1 gap-4">
        {card}
        {slots.children}
      </View>
    </DriveFrame>
  );
}

function ComputerFilesPage({
  device,
  placements,
}: {
  readonly device: Device;
  readonly placements: readonly DrivePlacement[];
}): ReactNode {
  const card = <CompactCard device={device} placements={placements} />;
  return (
    <ComputerBrowser
      deviceId={device.id}
      hrefOf={(path) => href.driveComputer(device.id, path)}
      renderFrame={(slots) => <PageFrame device={device} slots={slots} card={card} />}
    />
  );
}

export function ComputerScreen(): ReactNode {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const loaded = useLoaded();
  const placements = useDrivePlacementRows();
  const device = computersOf(useDevices()).find((candidate) => candidate.id === deviceId);
  if (device !== undefined) return <ComputerFilesPage device={device} placements={placements} />;
  return (
    <DriveFrame section="computers" title="Computer" breadcrumbs={[COMPUTERS_CRUMB]}>
      {loaded ? (
        <EmptyState
          icon="laptop"
          title="This computer is not paired"
          body="It was removed from the home, or it belongs to someone else."
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
