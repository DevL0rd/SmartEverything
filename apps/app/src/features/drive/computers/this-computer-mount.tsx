import type { ReactNode } from 'react';
import type { DesktopDriveState, DrivePlacement } from '@smarteverything/domain';
import { useSyncStatus } from '../../../store/selectors';
import { useDrivePlacementRows, useMyDrive } from '../data';
import { MountToggle, type LocalMount } from './mount-toggle';
import { mountOn } from './placement-model';
import { useThisComputer } from './this-computer';

export function localMountOf(
  state: Pick<DesktopDriveState, 'fuse' | 'mount'>,
  mount: DrivePlacement | null,
): LocalMount {
  if (!state.fuse.available) {
    return {
      blocked: true,
      words: { subtitle: 'Cannot mount until FUSE is installed on this computer', tone: 'warning' },
    };
  }
  if (mount?.enabled !== true || state.mount?.mounted === true) {
    return { blocked: false, words: null };
  }
  return {
    blocked: false,
    words: {
      subtitle:
        state.mount === null
          ? 'Not mounted here yet · the computer service has not started the mount'
          : `Not mounted here · ${state.mount.status}`,
      tone: 'warning',
    },
  };
}

export function ThisComputerMount({
  state,
}: {
  readonly state: Pick<DesktopDriveState, 'fuse' | 'mount'>;
}): ReactNode {
  const here = useThisComputer();
  const placements = useDrivePlacementRows();
  const myDrive = useMyDrive();
  const live = useSyncStatus().status === 'live';
  if (here === null) return null;
  const mount = mountOn(here.deviceId, placements, myDrive === null ? null : myDrive.id);
  return (
    <MountToggle
      deviceId={here.deviceId}
      computer="this computer"
      mount={mount}
      detail="full"
      live={live}
      local={localMountOf(state, mount)}
    />
  );
}
