import { execFile, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, readlink } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { dirname } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { isMissing, isPermission } from './errors.ts';

const execute = promisify(execFile);

export interface Detached {
  readonly command: string;
  readonly args: readonly string[];
  readonly log: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

export interface Ran {
  readonly stdout: string;
  readonly stderr: string;
}

export async function run(
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>> } = {},
): Promise<Ran> {
  const { stdout, stderr } = await execute(command, [...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: { ...env, ...options.env },
    maxBuffer: 64 << 20,
  });
  return { stdout, stderr };
}

export async function startDetached(options: Detached): Promise<number> {
  await mkdir(dirname(options.log), { recursive: true });
  const out = openSync(options.log, 'a');
  try {
    const child = spawn(options.command, [...options.args], {
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...env, ...options.env },
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    });
    child.unref();
    if (child.pid === undefined) throw new Error(`${options.command} did not start`);
    return child.pid;
  } finally {
    closeSync(out);
  }
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return isPermission(cause);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor<T>(
  what: string,
  attempt: () => Promise<T | undefined> | T | undefined,
  timeoutMs: number,
  everyMs = 100,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await attempt();
    if (value !== undefined) return value;
    if (Date.now() > deadline)
      throw new Error(`Timed out after ${String(timeoutMs)} ms waiting for ${what}.`);
    await sleep(everyMs);
  }
}

async function waitUntilGone(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (alive(pid) && Date.now() < deadline) await sleep(50);
}

export async function stopProcess(pid: number, graceMs: number): Promise<void> {
  if (!alive(pid)) return;
  process.kill(pid, 'SIGTERM');
  await waitUntilGone(pid, graceMs);
  if (!alive(pid)) return;
  process.kill(pid, 'SIGKILL');
  await waitUntilGone(pid, 5000);
}

function listening(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
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

export async function freePorts(count: number): Promise<readonly number[]> {
  const servers = await Promise.all(Array.from({ length: count }, listening));
  const ports = servers.map(portOf);
  await Promise.all(servers.map(closing));
  return ports;
}

export async function childrenOf(pid: number): Promise<readonly number[]> {
  try {
    const text = await readFile(`/proc/${String(pid)}/task/${String(pid)}/children`, 'utf8');
    return text
      .split(/\s+/u)
      .filter((part) => part !== '')
      .map(Number);
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
}

async function runs(pid: number, executable: string): Promise<boolean> {
  try {
    return (await readlink(`/proc/${String(pid)}/exe`)) === executable;
  } catch (cause) {
    if (isMissing(cause) || isPermission(cause)) return false;
    throw cause;
  }
}

export async function descendantRunning(
  root: number,
  executable: string,
): Promise<number | undefined> {
  const queue = [...(await childrenOf(root))];
  for (let pid = queue.shift(); pid !== undefined; pid = queue.shift()) {
    if (await runs(pid, executable)) return pid;
    queue.push(...(await childrenOf(pid)));
  }
  return undefined;
}
