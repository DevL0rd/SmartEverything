import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hubIdentity, pairComputer, mountDrive, driveRoots, type DriveRoots } from '../hub-api.ts';
import {
  buildService,
  ownerToken,
  prepareData,
  waitForHub,
  writeServiceConfig,
} from '../hub-setup.ts';
import { isolatedServiceEnvironment } from '../isolation.ts';
import { rememberHub } from '../lifecycle.ts';
import { SCRATCH, files } from '../paths.ts';
import { freePorts, startDetached, waitFor } from '../processes.ts';
import { bench } from './paths.ts';
import type { Production } from './production.ts';

export const probeRoot = join(SCRATCH, 'probe');
export const hubProbe = join(probeRoot, 'hub');

export interface LocalHub {
  readonly pid: number;
  readonly production: Production;
  readonly roots: DriveRoots;
  readonly http: number;
}

export async function startLocalHub(reuseService: boolean): Promise<LocalHub> {
  for (const folder of [files.logs, files.run, files.keys, files.bin, hubProbe])
    await mkdir(folder, { recursive: true, mode: 0o700 });
  const [http, lan, go2rtcApi, webrtc] = await freePorts(4);
  if (http === undefined || lan === undefined || go2rtcApi === undefined || webrtc === undefined)
    throw new Error('Not enough free ports.');
  await prepareData();
  await writeServiceConfig({ http, lan, go2rtcApi, webrtc });
  if (!reuseService) await buildService();
  const pid = await startHubWithProbe();
  await rememberHub(pid);
  await waitForHub(pid);
  const key = await ownerToken();
  const identity = await hubIdentity(http);
  const roots = await driveRoots(http, key);
  const paired = await pairComputer(http, key, 'A');
  await writeFile(bench.token, `${paired.token}\n`, { mode: 0o600 });
  const placementId = await mountDrive(http, key, paired.deviceId);
  return {
    pid,
    http,
    roots,
    production: {
      rootId: roots.owner,
      deviceId: paired.deviceId,
      placementId,
      laneUrl: `https://127.0.0.1:${String(lan)}`,
      serverName: identity.serverName,
      pin: identity.pin,
    },
  };
}

async function startHubWithProbe(): Promise<number> {
  return startDetached({
    command: 'node',
    args: [join(files.service, 'service.mjs')],
    log: join(files.logs, 'hub.log'),
    env: {
      ...isolatedServiceEnvironment(),
      SMARTEVERYTHING_HUB_HOME: files.pointer,
      TMPDIR: '/var/tmp/claude-agents',
      SMARTEVERYTHING_MOUNT_BENCH: hubProbe,
    },
    cwd: SCRATCH,
  });
}

export interface Segment {
  readonly directory: string;
  readonly prefix: string;
  readonly segment: number;
  readonly files: readonly string[];
}

export interface Harvest extends Segment {
  readonly pid: number;
  readonly signal: 'SIGUSR1' | 'SIGUSR2';
}

function segmentFile(of: Segment, name: string): string {
  return join(of.directory, `${of.prefix}-${String(of.segment)}${name}`);
}

export async function harvest(request: Harvest): Promise<void> {
  process.kill(request.pid, request.signal);
  await waitFor(
    `${request.prefix} segment ${String(request.segment)}`,
    async () => {
      const present = new Set(await readdir(request.directory));
      return request.files.every((name) =>
        present.has(`${request.prefix}-${String(request.segment)}${name}`),
      )
        ? true
        : undefined;
    },
    120_000,
    100,
  );
}

export async function keepSegment(of: Segment, destination: string, label: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const name of of.files) {
    await copyFile(segmentFile(of, name), join(destination, `${label}.${of.prefix}${name}`));
    await rm(segmentFile(of, name));
  }
}

export async function dropSegment(of: Segment): Promise<void> {
  for (const name of of.files) await rm(segmentFile(of, name), { force: true });
}
