import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';
import { isMissing } from './errors.ts';

export const REPO = join(import.meta.dirname, '..', '..');
export const RIG = import.meta.dirname;
export const TMP = '/var/tmp/claude-agents';

export function scratchFor(instance: string | undefined): string {
  if (instance === undefined || instance === '') return join(TMP, 'drive-fs');
  if (!/^[a-z][a-z0-9-]{0,30}$/u.test(instance))
    throw new Error(`The instance name ${instance} must be lowercase letters, digits and dashes.`);
  return join(TMP, `rig-${instance}`);
}

export const SCRATCH = scratchFor(env['DRIVE_RIG_INSTANCE']);

export const COMPUTER_NAMES = ['A', 'B'] as const;
export const ROUTE_NAMES = ['lan', 'public'] as const;
export const PLACEMENTS = ['test', 'scratch'] as const;

const COMPUTER_NAME = z.enum(COMPUTER_NAMES);
const ROUTE_NAME = z.enum(ROUTE_NAMES);
const ROUTE_CHOICE = z.enum([...ROUTE_NAMES, 'none']);

export type ComputerName = z.infer<typeof COMPUTER_NAME>;
export type RouteName = z.infer<typeof ROUTE_NAME>;
export type RouteChoice = z.infer<typeof ROUTE_CHOICE>;

const PORT = z.int().min(1).max(65535);

const MOUNT = z.strictObject({
  id: z.string().min(1),
  root: z.uuid(),
  folder: z.uuid().nullable(),
  placement: z.string().min(1),
  point: z.string().min(1),
  route: ROUTE_CHOICE,
});

const COMPUTER = z.strictObject({
  deviceId: z.uuid(),
  machineId: z.string().regex(/^[0-9a-f]{32}$/u),
  placements: z.strictObject({ owner: z.uuid(), home: z.uuid() }),
  tokenFile: z.string().min(1),
  listenLan: PORT,
  listenPublic: PORT,
  helperPid: z.int().positive().nullable(),
  holderPid: z.int().positive().nullable(),
  mount: MOUNT.nullable(),
});

export const STATE = z.strictObject({
  startedAt: z.iso.datetime(),
  http: PORT,
  lan: PORT,
  hubPid: z.int().positive(),
  netcutPid: z.int().positive(),
  serverName: z.string().min(1),
  pin: z.string().regex(/^[0-9a-f]{64}$/u),
  ownerRoot: z.uuid(),
  homeRoot: z.uuid(),
  memberProfile: z.uuid(),
  driveFolders: z.strictObject({ test: z.string().min(1), scratch: z.string().min(1) }),
  computers: z.strictObject({ A: COMPUTER, B: COMPUTER }),
});

export type RigState = z.infer<typeof STATE>;
export type ComputerState = z.infer<typeof COMPUTER>;
export type MountState = z.infer<typeof MOUNT>;

export const files = {
  state: join(SCRATCH, 'state.json'),
  pointer: join(SCRATCH, 'pointer'),
  data: join(SCRATCH, 'data'),
  service: join(SCRATCH, 'service'),
  bin: join(SCRATCH, 'bin'),
  keys: join(SCRATCH, 'keys'),
  logs: join(SCRATCH, 'logs'),
  run: join(SCRATCH, 'run'),
  manifests: join(SCRATCH, 'manifests'),
  pids: join(SCRATCH, 'run', 'pids.json'),
  env: join(SCRATCH, 'rig.env'),
  netcutSocket: join(SCRATCH, 'run', 'netcut.sock'),
  helperBinary: join(SCRATCH, 'bin', 'se-drive-mount'),
  netcutBinary: join(SCRATCH, 'bin', 'netcut'),
  passwd: join(SCRATCH, 'passwd'),
  group: join(SCRATCH, 'group'),
  computer: (name: ComputerName): string => join(SCRATCH, 'computers', name),
  mountPoint: (name: ComputerName): string => join(SCRATCH, 'mnt', name),
  control: (name: ComputerName): string => join(SCRATCH, 'computers', name, 'control'),
  status: (name: ComputerName): string => join(SCRATCH, 'computers', name, 'status.log'),
  helperLog: (name: ComputerName): string => join(SCRATCH, 'computers', name, 'helper.log'),
  ownerToken: join(SCRATCH, 'data', 'system', 'keys', 'owner-token'),
  ready: join(SCRATCH, 'data', 'system', 'run', 'service-ready.json'),
};

export class RigNotUpError extends Error {
  override readonly name = 'RigNotUpError';

  constructor() {
    super(`The rig is not up: ${files.state} does not exist. Run "rig up".`);
  }
}

export async function loadState(): Promise<RigState> {
  try {
    return STATE.parse(JSON.parse(await readFile(files.state, 'utf8')));
  } catch (cause) {
    if (isMissing(cause)) throw new RigNotUpError();
    throw cause;
  }
}

export async function saveState(state: RigState): Promise<void> {
  const parsed = STATE.parse(state);
  await mkdir(SCRATCH, { recursive: true, mode: 0o700 });
  const staged = `${files.state}.tmp`;
  await writeFile(staged, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  await rename(staged, files.state);
}

export function computerName(value: string | undefined): ComputerName {
  return COMPUTER_NAME.parse(value);
}

export function routeName(value: string | undefined): RouteName {
  return ROUTE_NAME.parse(value);
}

export function routeChoice(value: string | undefined): RouteChoice {
  return ROUTE_CHOICE.parse(value);
}
