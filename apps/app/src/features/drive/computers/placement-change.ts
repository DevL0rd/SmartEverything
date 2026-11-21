import type { DrivePlacementSet } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { removeDrivePlacement, setComputerMount, setDrivePlacement } from '../../../api/drive';
import type { EntityStore } from '../../../store/entity-store';
import { useMutationState } from '../../../store/mutation';
import { writeOptimistically, type Edit } from '../../../store/optimistic';
import { useEntityStore } from '../../../store/store-context';
import { mountShown, placementRemoveShown, placementSetShown } from '../data/row-shown';

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

function shownSend(
  store: EntityStore,
  event: string,
  edits: readonly Edit[],
  send: () => Promise<void>,
): () => Promise<void> {
  return () => writeOptimistically(store, { event, edits, send });
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

function setEdits(
  store: EntityStore,
  bodies: readonly DrivePlacementSet[],
): readonly Edit[] | null {
  const state = store.get();
  const edits: Edit[] = [];
  for (const body of bodies) {
    const edit = placementSetShown(state, body);
    if (edit === null) return null;
    edits.push(edit);
  }
  return edits;
}

interface PlacementRun {
  readonly label: string;
  readonly failure: string;
  readonly edits: readonly Edit[] | null;
  readonly send: () => Promise<void>;
  readonly onDone?: (() => void) | undefined;
}

function present(edit: Edit | null): readonly Edit[] | null {
  return edit === null ? null : [edit];
}

export function usePlacementWrites(): PlacementWrites {
  const mutation = useMutationState();
  const store = useEntityStore();
  const run = ({ label, failure, edits, send, onDone }: PlacementRun): void => {
    mutation.run(edits === null ? send : shownSend(store, label, edits, send), {
      failure,
      label,
      inline: edits === null,
      ...(onDone === undefined || edits !== null ? {} : { onDone }),
    });
    if (edits !== null) onDone?.();
  };
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    set: (bodies, failure, onDone): void => {
      run({
        label: 'drive.placement.set',
        failure,
        edits: setEdits(store, bodies),
        send: () => setAll(bodies),
        onDone,
      });
    },
    remove: (placementId, onDone): void => {
      const edits = present(placementRemoveShown(store.get(), placementId));
      const failure = 'The folder was not removed from this computer';
      run({
        label: 'drive.placement.remove',
        failure,
        edits,
        send: () => removeOne(placementId),
        onDone,
      });
    },
    mount: (deviceId, enabled): void => {
      const edits = present(mountShown(store.get(), deviceId, enabled));
      const failure = enabled ? 'The drive was not mounted' : 'The drive was not unmounted';
      run({
        label: 'drive.placement.mount',
        failure,
        edits,
        send: () => turnMount(deviceId, enabled),
      });
    },
  };
}
