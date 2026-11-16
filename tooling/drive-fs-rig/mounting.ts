import { mkdir } from 'node:fs/promises';
import { awaitMounted, routeUrl, sendControl, startHelper } from './helper.ts';
import {
  files,
  type ComputerName,
  type ComputerState,
  type RigState,
  type RouteChoice,
} from './paths.ts';
import { alive, stopProcess } from './processes.ts';

const UUID = /^[0-9a-f-]{36}$/u;
const HELPER_STOP_MS = 15_000;
const HOLDER_STOP_MS = 5_000;

export interface MountRequest {
  readonly placement: string;
  readonly folder: string | null;
  readonly route: RouteChoice;
}

export function routeLine(state: RigState, name: ComputerName, route: RouteChoice): object {
  if (route === 'none') return { op: 'route' };
  return {
    op: 'route',
    url: routeUrl(state.computers[name], route),
    server: state.serverName,
    pin: state.pin,
  };
}

export function rootFor(state: RigState, placement: string): string {
  if (placement === 'test') return state.ownerRoot;
  if (placement === 'scratch')
    throw new Error(
      'The scratch drive belongs to its own rig computer; only xfstests mounts it, through mount.fuse.smarteverything.',
    );
  if (UUID.test(placement)) return placement;
  throw new Error(`The placement must be test or a drive root id, got ${placement}.`);
}

export function placementFor(state: RigState, name: ComputerName, root: string): string {
  if (root === state.ownerRoot) return state.computers[name].placement;
  throw new Error(
    `Computer ${name} mounts only the owner's My Drive (${state.ownerRoot}), not ${root}.`,
  );
}

export function isId(value: string): boolean {
  return UUID.test(value);
}

export async function mountComputer(
  state: RigState,
  name: ComputerName,
  request: MountRequest,
): Promise<ComputerState> {
  const computer = state.computers[name];
  if (computer.helperPid !== null && alive(computer.helperPid))
    throw new Error(`${name} already has a running helper; run "rig unmount ${name}" first.`);
  const root = rootFor(state, request.placement);
  const id = placementFor(state, name, root);
  const point = files.mountPoint(name);
  await mkdir(point, { recursive: true, mode: 0o755 });
  const { holderPid, helperPid } = await startHelper(state, name);
  await sendControl(name, routeLine(state, name, request.route));
  await sendControl(name, {
    op: 'mount',
    mount: id,
    root,
    ...(request.folder === null ? {} : { folder: request.folder }),
    point,
  });
  await awaitMounted(name, id);
  const mount = {
    id,
    root,
    folder: request.folder,
    placement: request.placement,
    point,
    route: request.route,
  };
  return { ...computer, holderPid, helperPid, mount };
}

export async function unmountComputer(computer: ComputerState): Promise<ComputerState> {
  if (computer.helperPid !== null) await stopProcess(computer.helperPid, HELPER_STOP_MS);
  if (computer.holderPid !== null) await stopProcess(computer.holderPid, HOLDER_STOP_MS);
  return { ...computer, helperPid: null, holderPid: null, mount: null };
}
