import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { REPO, SCRATCH, TMP, files } from './paths.ts';
import { isMissing } from './errors.ts';
import { isolatedServiceEnvironment } from './isolation.ts';
import { alive, run, startDetached, waitFor } from './processes.ts';

const GO2RTC = join(REPO, 'tooling', 'go2rtc', 'out', 'go2rtc-linux-amd64');
const LOOPBACK = '127.0.0.1';
const LOG_TAIL_LINES = 30;
const START_TIMEOUT_MS = 120_000;

export interface HubPorts {
  readonly http: number;
  readonly lan: number;
  readonly go2rtcApi: number;
  readonly webrtc: number;
}

export async function prepareData(): Promise<void> {
  const rootId = randomUUID();
  await mkdir(files.pointer, { recursive: true, mode: 0o700 });
  await mkdir(join(files.data, 'system', 'config'), { recursive: true, mode: 0o700 });
  await writeFile(
    join(files.pointer, 'location.json'),
    `${JSON.stringify({ root: files.data, rootId, state: 'active' }, null, 2)}\n`,
  );
  const marker = { version: 1, rootId, createdAt: new Date().toISOString(), state: 'active' };
  await writeFile(join(files.data, 'layout.json'), `${JSON.stringify(marker, null, 2)}\n`);
}

export async function writeServiceConfig(ports: HubPorts): Promise<void> {
  const config = {
    port: ports.http,
    host: LOOPBACK,
    lan: { port: ports.lan, host: LOOPBACK, advertise: false },
    go2rtcBinary: GO2RTC,
    go2rtcApiPort: ports.go2rtcApi,
    webrtcPort: ports.webrtc,
    logLevel: 'info',
  };
  const file = join(files.data, 'system', 'config', 'service.json');
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function buildService(): Promise<void> {
  await run('node', ['--import', 'tsx', 'tooling/build-service.ts', '--out', files.service], {
    cwd: REPO,
    env: { TMPDIR: TMP },
  });
}

export function startHub(): Promise<number> {
  return startDetached({
    command: 'node',
    args: [join(files.service, 'service.mjs')],
    log: join(files.logs, 'hub.log'),
    env: { ...isolatedServiceEnvironment(), SMARTEVERYTHING_HUB_HOME: files.pointer, TMPDIR: TMP },
    cwd: SCRATCH,
  });
}

async function hubReady(pid: number): Promise<true | undefined> {
  try {
    await readFile(files.ready, 'utf8');
    return true;
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
  }
  if (alive(pid)) return undefined;
  const log = await readFile(join(files.logs, 'hub.log'), 'utf8');
  throw new Error(
    `The test Hub exited while starting:\n${log.split('\n').slice(-LOG_TAIL_LINES).join('\n')}`,
  );
}

export async function waitForHub(pid: number): Promise<void> {
  await waitFor('the test Hub to report ready', () => hubReady(pid), START_TIMEOUT_MS, 250);
}

export async function ownerToken(): Promise<string> {
  return (await readFile(files.ownerToken, 'utf8')).trim();
}
