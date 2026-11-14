import type { DrivePlacementSet } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { removeDrivePlacement, setDrivePlacement } from '../../../api/drive';
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
}

async function setAll(bodies: readonly DrivePlacementSet[]): Promise<void> {
  await Promise.all(bodies.map((body) => setDrivePlacement(body)));
  log.info('placement.set', { placements: bodies.length, mode: bodies[0]?.mode });
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
  };
}
