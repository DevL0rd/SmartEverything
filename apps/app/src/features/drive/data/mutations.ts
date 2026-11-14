import type {
  DriveGrantSet,
  DrivePlacementSet,
  DriveRootChange,
  DriveSettingsUpdate,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  removeDriveGrant,
  removeDrivePlacement,
  scanDriveRoot,
  setDriveGrant,
  setDrivePlacement,
  updateDriveRoot,
  updateDriveSettings,
} from '../../../api/drive';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';

const log = new Logger('app.drive');

export interface DriveMutation<Args extends readonly unknown[]> {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly run: (...args: Args) => void;
}

interface DriveMutationCopy {
  readonly label: string;
  readonly failure: string;
  readonly saved?: string;
}

function useDriveMutation<Args extends readonly unknown[]>(
  { label, failure, saved }: DriveMutationCopy,
  perform: (...args: Args) => Promise<unknown>,
): DriveMutation<Args> {
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    run: (...args: Args): void => {
      mutation.run(
        async () => {
          await perform(...args);
          log.info(label);
          if (saved !== undefined) notify({ message: saved, tone: 'positive' });
        },
        { failure, label, inline: true },
      );
    },
  };
}

export function useGrantSet(): DriveMutation<[body: DriveGrantSet]> {
  return useDriveMutation(
    { label: 'drive.grant.set', failure: 'Sharing was not changed', saved: 'Sharing saved' },
    setDriveGrant,
  );
}

export function useGrantRemove(): DriveMutation<[grantId: string]> {
  return useDriveMutation(
    { label: 'drive.grant.remove', failure: 'Sharing was not stopped', saved: 'Sharing stopped' },
    removeDriveGrant,
  );
}

export function usePlacementSet(): DriveMutation<[body: DrivePlacementSet]> {
  return useDriveMutation(
    { label: 'drive.placement.set', failure: 'The folder was not changed on this computer' },
    setDrivePlacement,
  );
}

export function usePlacementRemove(): DriveMutation<[placementId: string]> {
  return useDriveMutation(
    { label: 'drive.placement.remove', failure: 'The folder was not stopped on this computer' },
    removeDrivePlacement,
  );
}

export function useDriveSettingsUpdate(): DriveMutation<[body: DriveSettingsUpdate]> {
  return useDriveMutation(
    { label: 'drive.settings.update', failure: 'The settings were not saved' },
    updateDriveSettings,
  );
}

export function useDriveRootUpdate(): DriveMutation<[rootId: string, body: DriveRootChange]> {
  return useDriveMutation(
    { label: 'drive.root.update', failure: 'The drive was not changed' },
    updateDriveRoot,
  );
}

export function useDriveRescan(): DriveMutation<[rootId: string]> {
  return useDriveMutation(
    { label: 'drive.root.scan', failure: 'The drive was not rescanned' },
    scanDriveRoot,
  );
}
