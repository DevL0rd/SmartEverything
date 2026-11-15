import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';
import { isMissing } from '../errors.ts';
import { REPO, TMP } from '../paths.ts';
import { alive, run, stopProcess, waitFor } from '../processes.ts';
import { isMounted } from './mounts.ts';
import { BENCH, bench } from './paths.ts';
import type { Production } from './production.ts';
import type { Target, Wrapped } from './target.ts';

const START_TIMEOUT_MS = 15_000;
const MOUNT_TIMEOUT_MS = 60_000;
const HELPER_STOP_MS = 20_000;
const FUSE_CONNECTIONS = '/sys/fs/fuse/connections';

const ENTRY_SCRIPT = 'exec "$1" -cache "$2" 3<"$3" <>"$4" >"$5" 2>"$6"';

const STATUS_LINE = z.looseObject({
  type: z.string(),
  mount: z.string().optional(),
  state: z.string().optional(),
});

export async function buildHelper(): Promise<string> {
  await mkdir(bench.bin, { recursive: true });
  await run('go', ['build', '-trimpath', '-o', bench.helperBinary, '.'], {
    cwd: join(REPO, 'tooling', 'drive-mount'),
    env: { CGO_ENABLED: '0', TMPDIR: TMP },
  });
  return bench.helperBinary;
}

async function statusLines(): Promise<readonly z.infer<typeof STATUS_LINE>[]> {
  let text: string;
  try {
    text = await readFile(bench.status, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
  return text
    .slice(0, text.lastIndexOf('\n') + 1)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => STATUS_LINE.parse(JSON.parse(line)));
}

async function mounted(mountId: string): Promise<true | undefined> {
  const lines = await statusLines();
  const mine = lines.filter((line) => line.type === 'status' && line.mount === mountId).at(-1);
  if (mine?.state === 'mounted') return true;
  const failure = lines.find(
    (line) => line.type === 'error' || (line.type === 'status' && line.state === 'failed'),
  );
  if (failure !== undefined)
    throw new Error(`The helper could not mount: ${JSON.stringify(failure)}`);
  return undefined;
}

function send(line: object): Promise<void> {
  return writeFile(bench.control, `${JSON.stringify(line)}\n`, { flag: 'a' });
}

export function minorOf(device: number): number {
  return (device & 0xff) | ((device >> 12) & ~0xff);
}

async function launch(binary: string, extra: Readonly<Record<string, string>>): Promise<number> {
  await rm(bench.helperDirectory, { recursive: true, force: true });
  await mkdir(bench.cacheDirectory, { recursive: true, mode: 0o700 });
  await run('mkfifo', ['-m', '600', bench.control]);
  await writeFile(bench.status, '');
  const log = openSync(bench.helperLog, 'a');
  try {
    const child = spawn(
      'sh',
      [
        '-c',
        ENTRY_SCRIPT,
        'sh',
        binary,
        bench.cacheDirectory,
        bench.token,
        bench.control,
        bench.status,
        bench.helperLog,
      ],
      { detached: true, stdio: ['ignore', log, log], env: { ...env, TMPDIR: TMP, ...extra } },
    );
    child.unref();
    if (child.pid === undefined) throw new Error('The helper did not start');
    const pid = child.pid;
    await waitFor(
      'the helper to start',
      () => {
        if (!alive(pid)) throw new Error(`The helper exited at start; see ${bench.helperLog}`);
        return true;
      },
      START_TIMEOUT_MS,
      50,
    );
    return pid;
  } finally {
    closeSync(log);
  }
}

async function tuneMaxBackground(point: string, value: number): Promise<void> {
  const { stdout } = await run('stat', ['-c', '%d', point]);
  const folder = `${FUSE_CONNECTIONS}/${String(minorOf(Number(stdout.trim())))}`;
  await run('sudo', [
    '-n',
    'sh',
    '-c',
    `echo ${String(value)} > ${folder}/max_background && echo ${String(Math.floor((value * 3) / 4))} > ${folder}/congestion_threshold`,
  ]);
  const check = await run('sudo', ['-n', 'cat', `${folder}/max_background`]);
  if (Number(check.stdout.trim()) !== value)
    throw new Error(
      `The kernel kept max_background at ${check.stdout.trim()}, not ${String(value)}.`,
    );
}

async function startMount(
  binary: string,
  production: Production,
  point: string,
  extra: Readonly<Record<string, string>>,
): Promise<number> {
  await mkdir(point, { recursive: true, mode: 0o755 });
  const pid = await launch(binary, extra);
  await send({
    op: 'route',
    url: production.laneUrl,
    server: production.serverName,
    pin: production.pin,
  });
  await send({ op: 'mount', mount: production.placementId, root: production.rootId, point });
  await waitFor(
    'the helper to report the mount',
    () => mounted(production.placementId),
    MOUNT_TIMEOUT_MS,
    200,
  );
  return pid;
}

async function stopMount(pid: number, point: string): Promise<void> {
  await stopProcess(pid, HELPER_STOP_MS);
  if (await isMounted(point)) await run('fusermount3', ['-u', '-z', point]);
}

export interface SeOptions {
  readonly kind?: string;
  readonly env?: () => Readonly<Record<string, string>>;
  readonly mounted?: (pid: number) => Promise<void>;
}

export function seTarget(
  production: Production,
  maxBackground: number | null,
  binary: string,
  options: SeOptions = {},
): Target {
  let pid: number | null = null;
  const point = bench.seMount;
  return {
    kind: options.kind ?? (maxBackground === null ? 'se' : `se-mb${String(maxBackground)}`),
    root: point,
    async mount(): Promise<void> {
      pid = await startMount(binary, production, point, options.env?.() ?? {});
      await options.mounted?.(pid);
      if (maxBackground !== null) await tuneMaxBackground(point, maxBackground);
    },
    async unmount(): Promise<void> {
      if (pid === null) return;
      const stopped = pid;
      pid = null;
      await stopMount(stopped, point);
    },
    wrap(command: string, args: readonly string[]): Wrapped {
      return {
        command: 'env',
        args: [`HOME=${BENCH}`, 'GIT_TERMINAL_PROMPT=0', command, ...args],
      };
    },
    drain(): readonly string[] {
      return ['-status-log', bench.status, '-status-mount', production.placementId];
    },
  };
}
