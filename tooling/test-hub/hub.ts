import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env as processEnvironment } from 'node:process';
import { assertLoopback, REPO, SENTINEL, type ScratchPaths } from './guard.ts';
import { databaseFolderOf } from './layout.ts';

const execute = promisify(execFile);
const LOOPBACK = '127.0.0.1';
const GO2RTC = join(REPO, 'tooling', 'go2rtc', 'out', 'go2rtc-linux-amd64');
export const SERVICE_BUILD = join(REPO, 'tmp', 'test-hub', '.service');
const SERVICE_ENTRY = join(SERVICE_BUILD, 'service.mjs');
const START_TIMEOUT_MS = 180_000;
const STOP_GRACE_MS = 20_000;
const BUILD_STAGE = '/var/tmp/claude-agents';

export interface Ports {
  readonly http: number;
  readonly lan: number;
  readonly go2rtcApi: number;
  readonly webrtc: number;
}

export interface RunningHub {
  readonly pid: number;
  readonly url: string;
  readonly token: string;
  readonly stop: () => Promise<void>;
}

function listening(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      resolve(server);
    });
  });
}

function closing(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No port was assigned.');
  return address.port;
}

export async function freePorts(): Promise<Ports> {
  const servers = await Promise.all([listening(), listening(), listening(), listening()]);
  const [http, lan, go2rtcApi, webrtc] = servers.map(portOf);
  await Promise.all(servers.map(closing));
  if (http === undefined || lan === undefined || go2rtcApi === undefined || webrtc === undefined)
    throw new Error('Not enough free ports.');
  return { http, lan, go2rtcApi, webrtc };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return isPermission(cause);
  }
}

function isPermission(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'EPERM';
}

function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

export async function prepareFolders(paths: ScratchPaths): Promise<void> {
  const rootId = randomUUID();
  for (const folder of [paths.data, paths.pointer, paths.home, paths.logs, paths.tmp])
    await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(join(paths.base, SENTINEL), `${JSON.stringify({ rootId })}\n`);
  await writeFile(
    join(paths.pointer, 'location.json'),
    `${JSON.stringify({ root: paths.data, rootId, state: 'active' }, null, 2)}\n`,
  );
  await writeFile(
    join(paths.data, 'layout.json'),
    `${JSON.stringify({ version: 1, rootId, createdAt: new Date().toISOString(), state: 'active' }, null, 2)}\n`,
  );
}

export async function writeServiceConfig(paths: ScratchPaths, ports: Ports): Promise<void> {
  assertLoopback(LOOPBACK);
  const file = join(paths.data, 'system', 'config', 'service.json');
  const database = databaseFolderOf(paths);
  await mkdir(join(paths.data, 'system', 'config'), { recursive: true, mode: 0o700 });
  await mkdir(database, { recursive: true, mode: 0o700 });
  await writeFile(
    file,
    `${JSON.stringify(
      {
        database,
        port: ports.http,
        host: LOOPBACK,
        lan: { port: ports.lan, host: LOOPBACK, advertise: false },
        go2rtcBinary: GO2RTC,
        go2rtcApiPort: ports.go2rtcApi,
        webrtcPort: ports.webrtc,
        logLevel: 'info',
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

function childEnvironment(paths: ScratchPaths): Record<string, string> {
  const path = processEnvironment['PATH'];
  return {
    ...(path === undefined ? {} : { PATH: path }),
    HOME: paths.home,
    XDG_CONFIG_HOME: join(paths.home, '.config'),
    SMARTEVERYTHING_HUB_HOME: paths.pointer,
    TMPDIR: paths.tmp,
  };
}

async function readyOf(paths: ScratchPaths, pid: number, log: string): Promise<boolean> {
  try {
    await readFile(join(paths.data, 'system', 'run', 'service-ready.json'), 'utf8');
    return true;
  } catch (cause) {
    if (!missing(cause)) throw cause;
  }
  if (alive(pid)) return false;
  const text = await readFile(log, 'utf8');
  throw new Error(
    `The scratch Hub exited while starting:\n${text.split('\n').slice(-30).join('\n')}`,
  );
}

async function waitForExit(pid: number, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (alive(pid) && Date.now() < deadline) await sleep(100);
}

async function stopPid(pid: number): Promise<void> {
  if (!alive(pid)) return;
  process.kill(pid, 'SIGTERM');
  await waitForExit(pid, STOP_GRACE_MS);
  if (alive(pid)) {
    process.kill(pid, 'SIGKILL');
    await waitForExit(pid, 5_000);
  }
}

export async function startHub(paths: ScratchPaths, ports: Ports): Promise<RunningHub> {
  const log = join(paths.logs, 'hub.log');
  const out = openSync(log, 'a');
  const child = spawn('node', [SERVICE_ENTRY], {
    cwd: REPO,
    detached: true,
    stdio: ['ignore', out, out],
    env: childEnvironment(paths),
  });
  closeSync(out);
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error('The scratch Hub did not start.');
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!(await readyOf(paths, pid, log))) {
    if (Date.now() > deadline) {
      await stopPid(pid);
      throw new Error('Timed out waiting for the scratch Hub to report ready.');
    }
    await sleep(250);
  }
  const token = (await readFile(join(paths.data, 'system', 'keys', 'owner-token'), 'utf8')).trim();
  return {
    pid,
    url: `http://${LOOPBACK}:${String(ports.http)}`,
    token,
    stop: () => stopPid(pid),
  };
}

export async function removeScratch(paths: ScratchPaths): Promise<void> {
  await rm(paths.base, { recursive: true, force: true });
}

export async function buildService(): Promise<void> {
  await mkdir(BUILD_STAGE, { recursive: true, mode: 0o700 });
  await rm(SERVICE_BUILD, { recursive: true, force: true });
  await execute('node', ['--import', 'tsx', 'tooling/build-service.ts', '--out', SERVICE_BUILD], {
    cwd: REPO,
    env: { ...processEnvironment, TMPDIR: BUILD_STAGE },
    maxBuffer: 64 << 20,
  });
}

export async function removeServiceBuild(): Promise<void> {
  await rm(SERVICE_BUILD, { recursive: true, force: true });
}
