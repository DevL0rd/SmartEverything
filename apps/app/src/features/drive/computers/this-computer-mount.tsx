import type { ReactNode } from 'react';
import { useSyncStatus } from '../../../store/selectors';
import { useDrivePlacementRows, useMyDrive } from '../data';
import { MountToggle } from './mount-toggle';
import { mountOn } from './placement-model';
import { useThisComputer } from './this-computer';

export function ThisComputerMount(): ReactNode {
  const here = useThisComputer();
  const placements = useDrivePlacementRows();
  const myDrive = useMyDrive();
  const live = useSyncStatus().status === 'live';
  if (here === null) return null;
  return (
    <MountToggle
      deviceId={here.deviceId}
      computer="this computer"
      mount={mountOn(here.deviceId, placements, myDrive === null ? null : myDrive.id)}
      detail="full"
      live={live}
    />
  );
}
