import { chmod, copyFile, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { buildBinaries, netcutCommand, writeEnvironment } from './helper.ts';
import {
  createMember,
  driveRoots,
  hubIdentity,
  pairComputer,
  placeDrive,
  type DriveRoots,
} from './hub-api.ts';
import {
  buildService,
  ownerToken,
  prepareData,
  startHub,
  waitForHub,
  writeServiceConfig,
  type HubPorts,
} from './hub-setup.ts';
import { rememberHub, rememberNetcut, requireNoRig, resetPids } from './lifecycle.ts';
import {
  COMPUTER_NAMES,
  RIG,
  SCRATCH,
  files,
  saveState,
  type ComputerName,
  type ComputerState,
  type RigState,
} from './paths.ts';
import { freePorts, startDetached, waitFor } from './processes.ts';

const NETCUT_TIMEOUT_MS = 10_000;
const PORT_COUNT = 8;

interface Listens {
  readonly lan: number;
  readonly public: number;
}

interface Allocation {
  readonly ports: HubPorts;
  readonly listens: Readonly<Record<ComputerName, Listens>>;
}

async function prepareScratch(): Promise<void> {
  await mkdir(SCRATCH, { recursive: true, mode: 0o700 });
  const folders = [
    files.logs,
    files.run,
    files.keys,
    files.bin,
    join(SCRATCH, 'computers'),
    join(SCRATCH, 'mnt'),
    files.manifests,
  ];
  for (const folder of folders) await mkdir(folder, { recursive: true, mode: 0o700 });
  await resetPids();
  await copyFile(join(RIG, 'passwd'), files.passwd);
  await copyFile(join(RIG, 'group'), files.group);
  await symlink(
    join(RIG, 'mount.fuse.smarteverything'),
    join(files.bin, 'mount.fuse.smarteverything'),
  );
}

async function allocate(): Promise<Allocation> {
  const ports = await freePorts(PORT_COUNT);
  const [http, lan, go2rtcApi, webrtc, aLan, aPublic, bLan, bPublic] = ports;
  if (ports.length !== PORT_COUNT) throw new Error('Not enough free ports.');
  return {
    ports: { http: http ?? 0, lan: lan ?? 0, go2rtcApi: go2rtcApi ?? 0, webrtc: webrtc ?? 0 },
    listens: {
      A: { lan: aLan ?? 0, public: aPublic ?? 0 },
      B: { lan: bLan ?? 0, public: bPublic ?? 0 },
    },
  };
}

async function startTestHub(ports: HubPorts, service: string | undefined): Promise<number> {
  await buildBinaries();
  await prepareData();
  await writeServiceConfig(ports);
  if (service === undefined) await buildService();
  else await symlink(service, files.service);
  const pid = await startHub();
  await rememberHub(pid);
  await waitForHub(pid);
  return pid;
}

async function pair(
  hub: { readonly http: number; readonly key: string; readonly roots: DriveRoots },
  name: ComputerName,
  listens: Listens,
): Promise<ComputerState> {
  const { http, key, roots } = hub;
  const paired = await pairComputer(http, key, name);
  const tokenFile = join(files.keys, `${name}.token`);
  await writeFile(tokenFile, `${paired.token}\n`, { mode: 0o600 });
  await chmod(tokenFile, 0o600);
  const owner = await placeDrive(http, key, {
    deviceId: paired.deviceId,
    rootId: roots.owner,
    mountName: `rig-${name}`,
  });
  const home = await placeDrive(http, key, {
    deviceId: paired.deviceId,
    rootId: roots.home,
    mountName: `rig-${name}-scratch`,
  });
  return {
    deviceId: paired.deviceId,
    machineId: paired.machineId,
    placements: { owner, home },
    tokenFile,
    listenLan: listens.lan,
    listenPublic: listens.public,
    helperPid: null,
    holderPid: null,
    mount: null,
  };
}

async function startNetcut(allocation: Allocation): Promise<number> {
  const target = `127.0.0.1:${String(allocation.ports.lan)}`;
  const routes = COMPUTER_NAMES.flatMap((name) => {
    const { lan, public: open } = allocation.listens[name];
    return [
      '-route',
      `${name}-lan=127.0.0.1:${String(lan)}=${target}`,
      '-route',
      `${name}-public=127.0.0.1:${String(open)}=${target}`,
    ];
  });
  const pid = await startDetached({
    command: files.netcutBinary,
    args: ['-control', files.netcutSocket, ...routes],
    log: join(files.logs, 'netcut.log'),
  });
  await rememberNetcut(pid);
  await waitFor(
    'netcut to answer',
    async () => {
      try {
        return await netcutCommand('status');
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause) return undefined;
        throw cause;
      }
    },
    NETCUT_TIMEOUT_MS,
  );
  return pid;
}

export async function up(args: readonly string[]): Promise<void> {
  const { values } = parseArgs({ args: [...args], options: { service: { type: 'string' } } });
  await requireNoRig();
  await prepareScratch();
  const allocation = await allocate();
  const hubPid = await startTestHub(allocation.ports, values.service);
  const key = await ownerToken();
  const identity = await hubIdentity(allocation.ports.http);
  const roots = await driveRoots(allocation.ports.http, key);
  const memberProfile = await createMember(allocation.ports.http, key);
  const [a, b] = await Promise.all(
    COMPUTER_NAMES.map((name) =>
      pair({ http: allocation.ports.http, key, roots }, name, allocation.listens[name]),
    ),
  );
  if (a === undefined || b === undefined) throw new Error('Pairing did not return both computers.');
  const netcutPid = await startNetcut(allocation);
  const state: RigState = {
    startedAt: new Date().toISOString(),
    http: allocation.ports.http,
    lan: allocation.ports.lan,
    hubPid,
    netcutPid,
    serverName: identity.serverName,
    pin: identity.pin,
    ownerRoot: roots.owner,
    homeRoot: roots.home,
    memberProfile,
    driveFolders: { test: roots.ownerFolder, scratch: roots.homeFolder },
    computers: { A: a, B: b },
  };
  await saveState(state);
  await writeEnvironment(state);
  const shown = {
    scratch: SCRATCH,
    hub: `http://127.0.0.1:${String(allocation.ports.http)}`,
    lan: `https://127.0.0.1:${String(allocation.ports.lan)}`,
    driveFolders: state.driveFolders,
  };
  stdout.write(`${JSON.stringify(shown, null, 2)}\n`);
}
