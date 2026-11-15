import type { DrivePlacementSet } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { removeDrivePlacement, setComputerMount, setDrivePlacement } from '../../../api/drive';
import { useMutationState } from '../../../store/mutation';

const log = new Logger('app.drive');

export interface PlacementWrites {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly set: (
    bodies: readonly DrivePlacementSet[],
    failure: string,
    onDone?: () => void,
  ) => void;
  readonly remove: (placementId: string, onDone?: () => void) => void;
  readonly mount: (deviceId: string, enabled: boolean) => void;
}

async function setAll(bodies: readonly DrivePlacementSet[]): Promise<void> {
  await Promise.all(bodies.map((body) => setDrivePlacement(body)));
  log.info('placement.set', { placements: bodies.length });
}

async function turnMount(deviceId: string, enabled: boolean): Promise<void> {
  await setComputerMount({ deviceId, enabled });
  log.info('placement.mount_turned', { deviceId, enabled });
}

async function removeOne(placementId: string): Promise<void> {
  await removeDrivePlacement(placementId);
  log.info('placement.removed', { placementId });
}

export function usePlacementWrites(): PlacementWrites {
  const mutation = useMutationState();
  const finish = (onDone: (() => void) | undefined): { readonly onDone?: () => void } =>
    onDone === undefined ? {} : { onDone };
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    set: (bodies, failure, onDone): void => {
      mutation.run(() => setAll(bodies), {
        failure,
        label: 'drive.placement.set',
        inline: true,
        ...finish(onDone),
      });
    },
    remove: (placementId, onDone): void => {
      mutation.run(() => removeOne(placementId), {
        failure: 'The folder was not removed from this computer',
        label: 'drive.placement.remove',
        inline: true,
        ...finish(onDone),
      });
    },
    mount: (deviceId, enabled): void => {
      mutation.run(() => turnMount(deviceId, enabled), {
        failure: enabled ? 'The drive was not mounted' : 'The drive was not unmounted',
        label: 'drive.placement.mount',
        inline: true,
      });
    },
  };
}
