import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { useDevices, useLoaded } from '../../../store/selectors';
import { useDrivePlacementRows } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { ComputerCard } from './computer-card';
import { computersOf } from './computers-model';
import { ComputersSkeleton, ThisComputerCard } from './computers-screen';
import { placementsOn } from './placement-model';
import { useDesktopDrive, useThisComputer } from './this-computer';

const COMPUTERS_CRUMB = { label: 'Computers', href: href.drivePage('computers') } as const;

export function ComputerScreen(): ReactNode {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const loaded = useLoaded();
  const placements = useDrivePlacementRows();
  const here = useThisComputer();
  const drive = useDesktopDrive();
  const device = computersOf(useDevices()).find((candidate) => candidate.id === deviceId);
  if (device !== undefined) {
    return (
      <DriveFrame
        section="computers"
        title={device.label}
        breadcrumbs={[COMPUTERS_CRUMB, { label: device.label }]}
      >
        {here !== null && drive !== null && here.deviceId === device.id ? (
          <ThisComputerCard device={device} here={here} drive={drive} placements={placements} />
        ) : (
          <ComputerCard device={device} placements={placementsOn(device.id, placements)} />
        )}
      </DriveFrame>
    );
  }
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
