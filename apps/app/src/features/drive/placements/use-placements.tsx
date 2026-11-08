import { useState } from 'react';
import {
  API_ENDPOINTS as E,
  type DrivePlacement,
  type DrivePlacementMode,
  type DrivePlacementSet,
  type DriveSyncClient,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import type { IconName } from '../../../components/icon';
import { compareText } from '../../../format/text';
import { useMutationState } from '../../../store/mutation';
import { sameJson } from '../../../store/same-json';
import { useLoaded, useRows, useSyncStatus } from '../../../store/selectors';
import { rowsOf, type Device, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { computerGlyph, isHub } from '../../computers/data/computer-device';
import { useDriveSyncClients } from '../../nas/data';

const log = new Logger('app.drive');

export interface PlacementTarget {
  readonly rootId: string;
  readonly folderItemId: string | null;
  readonly name: string;
  readonly bytes: number | null;
}

export interface PlacementComputer {
  readonly deviceId: string;
  readonly name: string;
  readonly glyph: IconName;
  readonly online: boolean;
}

export interface ComputerPlacement {
  readonly computer: PlacementComputer;
  readonly placement: DrivePlacement | null;
  readonly needBytes: number;
}

export type PlacementChoice = DrivePlacementMode | 'off';

export interface PlacementsView {
  readonly loading: boolean;
  readonly live: boolean;
  readonly rows: readonly ComputerPlacement[];
}

export function placementComputersOf(devices: readonly Device[]): readonly PlacementComputer[] {
  return devices
    .filter((device) => device.kind === 'computer' && !isHub(device))
    .map((device) => ({
      deviceId: device.id,
      name: device.label,
      glyph: computerGlyph(device),
      online: device.online,
    }))
    .sort((left, right) => compareText(left.name, right.name));
}

function selectComputers(state: StoreState): readonly PlacementComputer[] {
  return placementComputersOf(rowsOf(state.tables.devices));
}

export function isPlacementOf(placement: DrivePlacement, target: PlacementTarget): boolean {
  return placement.rootId === target.rootId && placement.folderItemId === target.folderItemId;
}

function needOf(
  clients: readonly DriveSyncClient[],
  deviceId: string,
  placement: DrivePlacement | null,
): number {
  if (placement?.mode !== 'synced') return 0;
  return clients
    .filter((client) => client.deviceId === deviceId && client.rootId === placement.rootId)
    .reduce((all, client) => all + client.needBytes, 0);
}

export function computerPlacementsOf(
  computers: readonly PlacementComputer[],
  placements: readonly DrivePlacement[],
  clients: readonly DriveSyncClient[],
  target: PlacementTarget,
): readonly ComputerPlacement[] {
  const mine = placements.filter((placement) => isPlacementOf(placement, target));
  return computers.map((computer) => {
    const placement = mine.find((row) => row.deviceId === computer.deviceId) ?? null;
    return { computer, placement, needBytes: needOf(clients, computer.deviceId, placement) };
  });
}

export function choiceOf(placement: DrivePlacement | null): PlacementChoice {
  return placement === null ? 'off' : placement.mode;
}

export function childPath(parent: string, name: string): string {
  const separator = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  const base = parent.endsWith(separator) ? parent.slice(0, -1) : parent;
  return `${base}${separator}${name}`;
}

export function parentPath(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (cut < 0) return path;
  const parent = path.slice(0, cut);
  return parent === '' || parent.endsWith(':') ? path.slice(0, cut + 1) : parent;
}

export function localCopyPath(path: string): string {
  return `${path} (local copy)`;
}

export function placementBodyOf(
  deviceId: string,
  target: PlacementTarget,
  mode: DrivePlacementMode,
  localPath: string,
): DrivePlacementSet {
  return {
    deviceId,
    rootId: target.rootId,
    folderItemId: target.folderItemId,
    mode,
    localPath,
    enabled: true,
  };
}

export function usePlacements(target: PlacementTarget): PlacementsView {
  const loaded = useLoaded();
  const live = useSyncStatus().status === 'live';
  const computers = useStoreSelector(selectComputers, sameJson);
  const placements = useRows('drive_placements');
  const clients = useDriveSyncClients();
  return {
    loading: !loaded,
    live,
    rows: computerPlacementsOf(computers, placements, clients, target),
  };
}

type PlacementWork =
  | { readonly kind: 'set'; readonly body: DrivePlacementSet }
  | { readonly kind: 'stop'; readonly placementId: string };

async function perform(work: PlacementWork): Promise<void> {
  if (work.kind === 'set') {
    const placement = await api().call(E.setPlacement, { body: work.body });
    log.info('placement.set', { placementId: placement.id, mode: placement.mode });
    return;
  }
  await api().call(E.removePlacement, { params: { placementId: work.placementId } });
  log.info('placement.stopped', { placementId: work.placementId });
}

const FAILURE: Readonly<Record<PlacementWork['kind'], string>> = {
  set: 'The folder was not changed on this computer',
  stop: 'The folder was not stopped on this computer',
};

export interface PlacementChange {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly set: (body: DrivePlacementSet, onDone?: () => void) => void;
  readonly stop: (placementId: string, onDone?: () => void) => void;
  readonly retry: (() => void) | null;
}

export function usePlacementChange(): PlacementChange {
  const mutation = useMutationState();
  const [last, setLast] = useState<PlacementWork | null>(null);
  const run = (work: PlacementWork, onDone?: () => void): void => {
    setLast(work);
    mutation.run(() => perform(work), {
      failure: FAILURE[work.kind],
      label: `drive.placement.${work.kind}`,
      inline: true,
      onDone: () => {
        setLast(null);
        onDone?.();
      },
    });
  };
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    set: (body, onDone): void => {
      run({ kind: 'set', body }, onDone);
    },
    stop: (placementId, onDone): void => {
      run({ kind: 'stop', placementId }, onDone);
    },
    retry:
      last === null || mutation.problem === null
        ? null
        : (): void => {
            run(last);
          },
  };
}
