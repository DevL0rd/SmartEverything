import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, statSync } from 'node:fs';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { files, SCRATCH, type ComputerName, type ComputerState, type RigState } from '../paths.ts';
import { alive, sleep } from '../processes.ts';
import { isMissing } from '../errors.ts';
import { compare, ok, summary, type Entry } from '../manifest.ts';
import { inside, mustSucceed, walkMounted } from './recovery-inside.ts';
import { hubReport, hubSnapshot, settle } from './recovery-settle.ts';
import { countFiles } from './recovery-probe.ts';

export const COMMAND_IDLE_MS = 900_000;
export const SETTLE_IDLE_MS = 180_000;
export const SETTLE_GRACE_MS = 3000;
export const SETTLE_POLL_MS = 500;
const TAIL_BYTES = 6000;
const WATCH_POLL_MS = 500;

export interface Finished {
  readonly code: number;
  readonly output: string;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly idleMs?: number;
}

function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

export async function readTail(file: string): Promise<string> {
  const text = await readFile(file, 'utf8');
  return text.length > TAIL_BYTES ? text.slice(-TAIL_BYTES) : text;
}

interface Launched {
  readonly child: ChildProcess;
  readonly exited: Promise<number>;
  readonly state: { done: boolean };
}

function launch(
  pid: number,
  command: readonly string[],
  cwd: string | undefined,
  descriptor: number,
): Launched {
  const child = spawn(
    'nsenter',
    [
      '--target',
      String(pid),
      '--user',
      '--mount',
      '--pid',
      ...(cwd === undefined ? [] : [`--wd=${cwd}`]),
      '--',
      ...command,
    ],
    { stdio: ['ignore', descriptor, descriptor] },
  );
  const state = { done: false };
  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      state.done = true;
      resolve(code ?? (signal === null ? 1 : 128));
    });
  });
  return { child, exited, state };
}

async function watch(launched: Launched, log: string, what: string, idleMs: number): Promise<void> {
  let size = -1;
  let changedAt = Date.now();
  for (;;) {
    await Promise.race([launched.exited, sleep(WATCH_POLL_MS)]);
    if (launched.state.done) return;
    const now = statSync(log).size;
    if (now !== size) {
      size = now;
      changedAt = Date.now();
    } else if (Date.now() - changedAt > idleMs) {
      launched.child.kill('SIGKILL');
      await launched.exited;
      throw new Error(
        `${what} printed nothing for ${String(idleMs)} ms and was stopped.\n${await readTail(log)}`,
      );
    }
  }
}

export async function runInside(
  computer: ComputerState,
  what: string,
  command: readonly string[],
  options: RunOptions = {},
): Promise<Finished> {
  const pid = computer.helperPid;
  if (pid === null || !alive(pid))
    throw new Error('The helper is not running, so there is no namespace to enter.');
  await mkdir(files.logs, { recursive: true });
  const log = join(files.logs, `workloads-${String(Date.now())}-${slug(what)}.log`);
  const descriptor = openSync(log, 'a');
  try {
    const launched = launch(pid, command, options.cwd, descriptor);
    await watch(launched, log, what, options.idleMs ?? COMMAND_IDLE_MS);
    return { code: await launched.exited, output: await readTail(log) };
  } finally {
    closeSync(descriptor);
  }
}

export async function mustRun(
  computer: ComputerState,
  what: string,
  command: readonly string[],
  options: RunOptions = {},
): Promise<Finished> {
  const finished = await runInside(computer, what, command, options);
  if (finished.code !== 0)
    throw new Error(`${what} exited ${String(finished.code)}:\n${finished.output}`);
  return finished;
}

export async function capture(
  computer: ComputerState,
  what: string,
  command: readonly string[],
): Promise<string> {
  return (await mustSucceed(what, inside(computer, command))).stdout;
}

export function computerOf(state: RigState, name: ComputerName): ComputerState {
  return state.computers[name];
}

export function mountPath(name: ComputerName, ...parts: readonly string[]): string {
  return join(files.mountPoint(name), ...parts);
}

export function hubPath(state: RigState, ...parts: readonly string[]): string {
  return join(state.driveFolders.test, ...parts);
}

export async function convergeOnHub(
  state: RigState,
  name: ComputerName,
  relative: string,
): Promise<void> {
  const entries = await walkMounted(state.computers[name], mountPath(name, relative));
  const directory = hubPath(state, relative);
  const report = await settle(
    {
      snapshot: () => hubSnapshot(directory, entries),
      verify: () => hubReport(directory, entries),
      sleep,
      now: Date.now,
    },
    { idleMs: SETTLE_IDLE_MS, graceMs: SETTLE_GRACE_MS, pollMs: SETTLE_POLL_MS },
  );
  if (!ok(report))
    throw new Error(`The Hub does not hold what ${name} shows in ${relative}:\n${summary(report)}`);
}

export async function removeAndConfirm(
  state: RigState,
  name: ComputerName,
  relative: string,
): Promise<void> {
  await mustRun(state.computers[name], `removing ${relative}`, [
    'rm',
    '-rf',
    mountPath(name, relative),
  ]);
  const directory = hubPath(state, relative);
  let remaining = await countFiles(directory);
  let changedAt = Date.now();
  while (remaining > 0 || (await exists(directory))) {
    await sleep(SETTLE_POLL_MS);
    const now = await countFiles(directory);
    if (now !== remaining) {
      remaining = now;
      changedAt = Date.now();
    }
    if (Date.now() - changedAt > SETTLE_IDLE_MS)
      throw new Error(
        `The Hub still holds ${String(remaining)} files under ${relative} after removal.`,
      );
  }
}

async function exists(directory: string): Promise<boolean> {
  try {
    await lstat(directory);
    return true;
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

export function compareTrees(
  what: string,
  expected: readonly Entry[],
  actual: readonly Entry[],
  modes: boolean,
): void {
  const report = compare(expected, actual, { modes });
  if (!ok(report)) throw new Error(`${what}:\n${summary(report)}`);
}

export const CACHE = join(SCRATCH, 'cache');

export function withDefaultRepeat(args: readonly string[]): readonly string[] {
  return args.some((argument) => argument === '--repeat' || argument.startsWith('--repeat='))
    ? args
    : ['--repeat', '1', ...args];
}

export function entryOf(path: string, content: Buffer | string): Entry {
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;
  return {
    path,
    type: 'file',
    size: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    mode: 0,
    linkTarget: null,
  };
}

export function directoryEntry(path: string): Entry {
  return { path, type: 'dir', size: 0, sha256: null, mode: 0, linkTarget: null };
}

async function reachableView(
  state: RigState,
  name: ComputerName,
  relative: string,
): Promise<readonly Entry[] | null> {
  try {
    return await walkMounted(state.computers[name], mountPath(name, relative));
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('ENETUNREACH')) return null;
    throw cause;
  }
}

export async function awaitView(
  state: RigState,
  name: ComputerName,
  relative: string,
  expected: readonly Entry[],
): Promise<void> {
  let last = '';
  let changedAt = Date.now();
  for (;;) {
    const view = await reachableView(state, name, relative);
    const report = view === null ? null : compare(expected, view, { modes: false });
    if (report !== null && ok(report)) return;
    const key = report === null ? `${name} is still reconnecting to the Hub` : summary(report);
    if (key !== last) {
      last = key;
      changedAt = Date.now();
    }
    if (Date.now() - changedAt > SETTLE_IDLE_MS)
      throw new Error(`${name} never showed the expected tree in ${relative}:\n${key}`);
    await sleep(SETTLE_POLL_MS);
  }
}

export async function awaitHub(
  state: RigState,
  relative: string,
  expected: readonly Entry[],
): Promise<void> {
  const directory = hubPath(state, relative);
  const report = await settle(
    {
      snapshot: () => hubSnapshot(directory, expected),
      verify: () => hubReport(directory, expected),
      sleep,
      now: Date.now,
    },
    { idleMs: SETTLE_IDLE_MS, graceMs: SETTLE_GRACE_MS, pollMs: SETTLE_POLL_MS },
  );
  if (!ok(report))
    throw new Error(`The Hub holds a different tree in ${relative}:\n${summary(report)}`);
}

export async function pollUntil(
  what: string,
  attempt: () => Promise<boolean>,
  limitMs: number,
): Promise<number> {
  const started = Date.now();
  while (!(await attempt())) {
    if (Date.now() - started > limitMs)
      throw new Error(`Gave up after ${String(limitMs)} ms waiting for ${what}.`);
    await sleep(SETTLE_POLL_MS);
  }
  return Date.now() - started;
}

export function sha256Of(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}
